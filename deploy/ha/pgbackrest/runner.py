"""Primary-only scheduled pgBackRest backup runner for the Patroni production pair.

Runs as a sidecar next to the Patroni container, sharing PGDATA and the
PostgreSQL socket directory. Every tick it:

1. merges the local success record with what the shared repository reports
   (``pgbackrest info``), so a sidecar on the other host after a failover does
   not repeat a backup that already exists;
2. decides whether a weekly full or a daily differential is due;
3. only if this node is the primary, runs ``pgbackrest backup``;
4. persists the run only when it succeeded, and otherwise retries later.

Secrets never appear in arguments or logs: pgBackRest reads its own
configuration file, its console output is discarded, and only exit codes and
timestamps are logged. Details live in pgBackRest's own file log.
"""
import datetime
import json
import logging
import os
import pathlib
import pwd
import shutil
import signal
import subprocess
import sys
import threading

UTC = datetime.timezone.utc
LOG = logging.getLogger('pointfinder.pgbackrest')
KINDS = ('full', 'diff')


class Settings:
    """Runtime settings, all overridable through ``POINTFINDER_PGBACKREST_*``."""

    def __init__(self, env=None):
        env = os.environ if env is None else env

        def read(name, default, convert=str):
            return convert(env.get('POINTFINDER_PGBACKREST_' + name, default))

        self.stanza = read('STANZA', 'pointfinder-production')
        self.binary = read('BINARY', '/usr/bin/pgbackrest')
        self.config = pathlib.Path(read('CONFIG', '/run/pgbackrest/pgbackrest.conf'))
        self.config_source = pathlib.Path(read('CONFIG_SOURCE', '/run/secrets/pgbackrest.conf'))
        self.state_path = pathlib.Path(read('STATE', '/var/lib/pgbackrest-runner/state.json'))
        self.socket_dir = read('SOCKET_DIR', '/var/run/postgresql')
        self.pg_user = read('PG_USER', 'scout')
        self.full_weekday = read('FULL_WEEKDAY', '6', int)  # Monday=0 … Sunday=6
        self.hour = read('HOUR', '3', int)
        self.minute = read('MINUTE', '30', int)
        self.retry_seconds = read('RETRY_SECONDS', '900', int)
        self.max_retries = read('MAX_RETRIES', '6', int)
        self.poll_seconds = read('POLL_SECONDS', '60', int)
        if not 0 <= self.full_weekday <= 6 or not 0 <= self.hour <= 23 or not 0 <= self.minute <= 59:
            raise ValueError('Invalid backup schedule')
        if self.retry_seconds <= 0 or self.poll_seconds <= 0 or self.max_retries < 0:
            raise ValueError('Invalid retry or poll settings')


# --------------------------------------------------------------------------- #
# Schedule
# --------------------------------------------------------------------------- #


def latest_slot(now, hour, minute):
    """Most recent daily HH:MM (UTC) at or before ``now``."""
    slot = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
    if slot > now:
        slot -= datetime.timedelta(days=1)
    return slot


def next_slot(now, hour, minute):
    return latest_slot(now, hour, minute) + datetime.timedelta(days=1)


def latest_full_slot(now, weekday, hour, minute):
    """Most recent weekly slot on ``weekday`` at HH:MM at or before ``now``."""
    slot = latest_slot(now, hour, minute)
    return slot - datetime.timedelta(days=(slot.weekday() - weekday) % 7)


def decide(now, state, settings):
    """Return ``('full', slot)``, ``('diff', slot)`` or ``None``."""
    full_slot = latest_full_slot(now, settings.full_weekday, settings.hour, settings.minute)
    if state.last_full is None or state.last_full < full_slot:
        return 'full', full_slot
    daily_slot = latest_slot(now, settings.hour, settings.minute)
    if state.latest() < daily_slot:
        return 'diff', daily_slot
    return None


# --------------------------------------------------------------------------- #
# Success state
# --------------------------------------------------------------------------- #


def _parse_time(value):
    if value is None:
        return None
    parsed = datetime.datetime.fromisoformat(value)
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)


class State:
    """Timestamps of the last successful full and differential backups."""

    def __init__(self, last_full=None, last_diff=None):
        self.last_full = last_full
        self.last_diff = last_diff

    def latest(self):
        floor = datetime.datetime.min.replace(tzinfo=UTC)
        return max(t for t in (self.last_full, self.last_diff, floor) if t is not None)

    def merged(self, other):
        def newest(a, b):
            return max((t for t in (a, b) if t is not None), default=None)
        return State(newest(self.last_full, other.last_full), newest(self.last_diff, other.last_diff))

    def to_json(self):
        return {'last_full': self.last_full.isoformat() if self.last_full else None,
                'last_diff': self.last_diff.isoformat() if self.last_diff else None}

    @classmethod
    def load(cls, path):
        try:
            data = json.loads(pathlib.Path(path).read_text())
            return cls(_parse_time(data.get('last_full')), _parse_time(data.get('last_diff')))
        except FileNotFoundError:
            return cls()
        except (ValueError, AttributeError, OSError):
            LOG.warning('Ignoring unreadable state file %s', path)
            return cls()

    def save(self, path):
        """Atomic, fsynced replace so a crash never leaves a partial record."""
        path = pathlib.Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_name(path.name + '.tmp')
        with open(tmp, 'w') as handle:
            json.dump(self.to_json(), handle)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp, path)
        try:
            fd = os.open(path.parent, os.O_RDONLY)
            try:
                os.fsync(fd)
            finally:
                os.close(fd)
        except OSError:
            pass


def parse_info(text, stanza):
    """Extract last successful full/diff stop times from ``pgbackrest info --output=json``."""
    state = State()
    for entry in json.loads(text):
        if entry.get('name') != stanza:
            continue
        for backup in entry.get('backup', []):
            if backup.get('error'):
                continue
            kind = backup.get('type')
            stop = backup.get('timestamp', {}).get('stop')
            if kind not in KINDS or stop is None:
                continue
            when = datetime.datetime.fromtimestamp(int(stop), UTC)
            attribute = 'last_' + kind
            if getattr(state, attribute) is None or getattr(state, attribute) < when:
                setattr(state, attribute, when)
    return state


# --------------------------------------------------------------------------- #
# Runner
# --------------------------------------------------------------------------- #


class Runner:
    def __init__(self, settings, popen=subprocess.Popen, clock=None, is_primary=None, sleep=None):
        self.settings = settings
        self.popen = popen
        self.clock = clock or (lambda: datetime.datetime.now(UTC))
        self.is_primary = is_primary or self._query_primary
        self.stop = threading.Event()
        self._sleep = sleep or self.stop.wait
        self.child = None
        self.attempts = {}
        self.was_primary = None

    # -- helpers ---------------------------------------------------------- #

    def command(self, *args):
        return [self.settings.binary, '--config=' + str(self.settings.config),
                '--stanza=' + self.settings.stanza, '--log-level-console=off', *args]

    def run(self, *args):
        """Run pgBackRest, discarding its output. Returns the exit code."""
        if self.stop.is_set():
            return 143
        self.child = self.popen(self.command(*args), stdin=subprocess.DEVNULL,
                                stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
        if self.stop.is_set():
            self.request_stop()
        try:
            output, _ = self.child.communicate()
        finally:
            code = self.child.returncode
            self.child = None
        del output  # never logged: may quote paths or repository details
        return code

    def _query_primary(self):
        import psycopg2  # provided by the Patroni virtualenv
        try:
            with psycopg2.connect(host=self.settings.socket_dir, user=self.settings.pg_user,
                                  dbname='postgres', connect_timeout=5) as connection:
                with connection.cursor() as cursor:
                    cursor.execute('SELECT pg_is_in_recovery()')
                    return not cursor.fetchone()[0]
        except psycopg2.Error as error:
            LOG.warning('PostgreSQL role check failed (%s)', type(error).__name__)
            return None

    def repository_state(self):
        try:
            self.child = self.popen(self.command('--output=json', 'info'), stdin=subprocess.DEVNULL,
                                    stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
            output, _ = self.child.communicate()
            code = self.child.returncode
        finally:
            self.child = None
        if code != 0:
            LOG.warning('pgbackrest info exited %s; using local record only', code)
            return None
        try:
            return parse_info(output.decode(), self.settings.stanza)
        except (ValueError, KeyError, TypeError):
            LOG.warning('pgbackrest info returned unparseable output; using local record only')
            return None

    # -- one scheduling step ------------------------------------------------ #

    def tick(self):
        """Do at most one unit of work; return seconds until the next tick."""
        now = self.clock()
        state = State.load(self.settings.state_path)
        repository = self.repository_state()
        if repository is not None:
            state = state.merged(repository)
        due = decide(now, state, self.settings)
        if due is None:
            self.attempts.clear()
            wake = next_slot(now, self.settings.hour, self.settings.minute)
            return max(1.0, (wake - now).total_seconds())
        kind, slot = due
        # Attempts are keyed by the daily slot so a full that exhausts its retries
        # is tried again the next day, not only the next week.
        key = (kind, latest_slot(now, self.settings.hour, self.settings.minute).isoformat())
        failures, retry_at = self.attempts.get(key, (0, None))
        if failures > self.settings.max_retries:
            return self._wait_for_next_slot(now)
        if retry_at is not None and now < retry_at:
            return max(1.0, (retry_at - now).total_seconds())

        primary = self.is_primary()
        if primary is not self.was_primary:
            LOG.info('Role: %s', {True: 'primary', False: 'standby', None: 'unknown'}[primary])
            self.was_primary = primary
        if primary is not True:
            return float(self.settings.poll_seconds)

        LOG.info('Starting %s backup for slot %s', kind, slot.isoformat())
        code = self.run('--type=' + kind, 'backup')
        finished = self.clock()
        if code == 0 and not self.stop.is_set():
            setattr(state, 'last_' + kind, finished)
            state.save(self.settings.state_path)
            self.attempts.pop(key, None)
            LOG.info('Completed %s backup at %s', kind, finished.isoformat())
            return 1.0
        failures += 1
        if self.stop.is_set():
            LOG.warning('%s backup interrupted by shutdown (exit %s); not recorded', kind, code)
            return 1.0
        if failures > self.settings.max_retries:
            LOG.error('%s backup failed (exit %s) after %s attempts; giving up until the next slot. '
                      'See the pgBackRest file log.', kind, code, failures)
            self.attempts[key] = (failures, None)
            return self._wait_for_next_slot(finished)
        retry_at = finished + datetime.timedelta(seconds=self.settings.retry_seconds)
        self.attempts[key] = (failures, retry_at)
        LOG.warning('%s backup failed (exit %s), attempt %s; retrying at %s. See the pgBackRest file log.',
                    kind, code, failures, retry_at.isoformat())
        return float(self.settings.retry_seconds)

    def _wait_for_next_slot(self, now):
        wake = next_slot(now, self.settings.hour, self.settings.minute)
        return max(1.0, (wake - now).total_seconds())

    # -- lifecycle ---------------------------------------------------------- #

    def request_stop(self, *_):
        self.stop.set()
        child = self.child
        if child is not None and child.poll() is None:
            LOG.info('Forwarding termination to the running pgBackRest process')
            child.terminate()

    def loop(self):
        LOG.info('Scheduler: full backups on weekday %s, differentials daily at %02d:%02d UTC',
                 self.settings.full_weekday, self.settings.hour, self.settings.minute)
        while not self.stop.is_set():
            try:
                delay = self.tick()
            except Exception as error:  # keep the sidecar alive; details are not secrets
                LOG.error('Tick failed: %s', type(error).__name__)
                delay = float(self.settings.poll_seconds)
            self._sleep(delay)
        LOG.info('Stopped')


# --------------------------------------------------------------------------- #
# Privilege drop
# --------------------------------------------------------------------------- #


def install_config(source, destination, uid, gid, chown=os.chown):
    """Copy the root-only secret config to a postgres-owned, read-only file."""
    destination = pathlib.Path(destination)
    destination.parent.mkdir(parents=True, exist_ok=True)
    chown(destination.parent, uid, gid)
    os.chmod(destination.parent, 0o700)
    tmp = destination.with_name(destination.name + '.tmp')
    shutil.copyfile(source, tmp)
    os.chmod(tmp, 0o400)
    chown(tmp, uid, gid)
    os.replace(tmp, destination)
    return destination


def main(argv=None):
    logging.basicConfig(level=logging.INFO, stream=sys.stdout,
                        format='%(asctime)sZ %(levelname)s %(message)s')
    logging.Formatter.converter = __import__('time').gmtime
    settings = Settings()
    if os.geteuid() == 0:
        os.umask(0o077)
        account = pwd.getpwnam('postgres')
        install_config(settings.config_source, settings.config, account.pw_uid, account.pw_gid)
        for directory in (settings.state_path.parent, '/var/log/pgbackrest',
                          '/var/spool/pgbackrest', '/tmp/pgbackrest'):
            pathlib.Path(directory).mkdir(parents=True, exist_ok=True)
            os.chown(directory, account.pw_uid, account.pw_gid)
        os.execv('/usr/local/bin/gosu', ['gosu', 'postgres', sys.executable, os.path.abspath(__file__)])
    runner = Runner(settings)
    signal.signal(signal.SIGTERM, runner.request_stop)
    signal.signal(signal.SIGINT, runner.request_stop)
    runner.loop()
    return 0


if __name__ == '__main__':
    sys.exit(main())
