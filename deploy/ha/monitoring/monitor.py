"""Read-only PostgreSQL/pgBackRest monitoring sidecar for the Patroni production pair.

Runs next to a Patroni container as uid 999 (postgres) with the shared socket
directory, PGDATA mounted read-only and the postgres-readable pgBackRest
configuration mounted read-only. It never changes anything: no SQL writes, no
pgBackRest commands other than ``info``, no Patroni API calls, no remediation.

Every ``FAST_SECONDS`` (60) it checks:

* SQL connectivity over the socket and the node role (primary/standby);
* client connections versus ``max_connections``;
* free space on the PGDATA filesystem;
* bytes held in ``pg_wal``;
* on the primary: whether ``archive_command`` is *currently* failing
  (``pg_stat_archiver.last_failed_time`` newer than ``last_archived_time``;
  historical ``failed_count`` is ignored on purpose);
* on a standby: replication lag in bytes (receive LSN minus replay LSN) and
  the WAL receiver state. The replay timestamp is only compared when there is
  un-replayed WAL, so an idle standby on a quiet primary never looks lagged.

Every ``SLOW_SECONDS`` (300) it checks:

* backup freshness from ``pgbackrest info --output=json`` (newest successful
  backup must be younger than ``BACKUP_MAX_AGE_HOURS``, default 36);
* optionally, freshness of mounted Mac recovery ``last-success.json`` files
  (``MAC_RECOVERY_FILES``), default limit two hours.

Each tick writes a secret-free ``health.json`` atomically into ``/state``.
``--healthcheck`` reads that file and exits non-zero when it is missing,
unparseable, older than ``HEALTH_MAX_AGE_SECONDS`` or reports ``critical`` or
``unknown``. Invalid status and excessively future timestamps also fail.

Logging is transition-only: a check is logged when its status changes. Log
lines carry status names, counts and ages only. Raw subprocess output, SQL
exception text, connection strings and pgBackRest configuration never reach
the log or the report.
"""
import datetime
import json
import logging
import os
import pathlib
import shutil
import signal
import socket
import subprocess
import sys
import threading

UTC = datetime.timezone.utc
LOG = logging.getLogger('pointfinder.monitor')

OK, WARNING, UNKNOWN, CRITICAL = 'ok', 'warning', 'unknown', 'critical'
SEVERITY = {OK: 0, WARNING: 1, UNKNOWN: 2, CRITICAL: 3}
GIB = 1024 ** 3


class Settings:
    """Runtime settings, all overridable through ``POINTFINDER_MONITOR_*``."""

    def __init__(self, env=None):
        env = os.environ if env is None else env

        def read(name, default, convert=str):
            return convert(env.get('POINTFINDER_MONITOR_' + name, default))

        self.node_name = read('NODE_NAME', env.get('PATRONI_NAME', socket.gethostname()))
        self.socket_dir = read('SOCKET_DIR', '/var/run/postgresql')
        self.pg_user = read('PG_USER', 'scout')
        self.pg_dbname = read('PG_DBNAME', 'postgres')
        self.pgdata = pathlib.Path(read('PGDATA', '/var/lib/postgresql/data'))
        self.pgbackrest_binary = read('PGBACKREST_BINARY', '/usr/bin/pgbackrest')
        self.pgbackrest_config = pathlib.Path(read('PGBACKREST_CONFIG', '/run/pgbackrest/pgbackrest.conf'))
        self.stanza = read('STANZA', 'pointfinder-production')
        self.state_dir = pathlib.Path(read('STATE_DIR', '/state'))
        self.health_path = self.state_dir / 'health.json'
        self.fast_seconds = read('FAST_SECONDS', '60', int)
        self.slow_seconds = read('SLOW_SECONDS', '300', int)
        self.sql_timeout = read('SQL_TIMEOUT_SECONDS', '5', int)
        self.info_timeout = read('INFO_TIMEOUT_SECONDS', '60', int)
        self.connections_warn_ratio = read('CONNECTIONS_WARN_RATIO', '0.8', float)
        self.connections_critical_ratio = read('CONNECTIONS_CRITICAL_RATIO', '0.95', float)
        self.disk_warn_free_ratio = read('DISK_WARN_FREE_RATIO', '0.2', float)
        self.disk_critical_free_ratio = read('DISK_CRITICAL_FREE_RATIO', '0.1', float)
        self.disk_critical_free_bytes = read('DISK_CRITICAL_FREE_BYTES', str(2 * GIB), int)
        self.wal_warn_bytes = read('WAL_WARN_BYTES', str(2 * GIB), int)
        self.wal_critical_bytes = read('WAL_CRITICAL_BYTES', str(8 * GIB), int)
        self.lag_warn_bytes = read('LAG_WARN_BYTES', str(64 * 1024 ** 2), int)
        self.lag_critical_bytes = read('LAG_CRITICAL_BYTES', str(1 * GIB), int)
        self.lag_warn_seconds = read('LAG_WARN_SECONDS', '300', int)
        self.backup_max_age_hours = read('BACKUP_MAX_AGE_HOURS', '36', float)
        self.mac_recovery_files = parse_recovery_files(read('MAC_RECOVERY_FILES', ''))
        self.mac_recovery_max_age = read('MAC_RECOVERY_MAX_AGE_SECONDS', '7200', int)
        self.health_max_age = read('HEALTH_MAX_AGE_SECONDS', str(3 * self.fast_seconds), int)
        if self.fast_seconds <= 0 or self.slow_seconds <= 0 or self.health_max_age <= 0:
            raise ValueError('Invalid interval settings')
        if not 0 < self.connections_warn_ratio <= self.connections_critical_ratio <= 1:
            raise ValueError('Invalid connection thresholds')
        if not 0 <= self.disk_critical_free_ratio <= self.disk_warn_free_ratio < 1:
            raise ValueError('Invalid disk thresholds')


def parse_recovery_files(text):
    """``label=/path,label2=/path2`` -> ordered list of (label, Path)."""
    files = []
    for item in filter(None, (part.strip() for part in text.split(','))):
        if '=' not in item:
            raise ValueError('MAC_RECOVERY_FILES entries must be label=path')
        label, path = item.split('=', 1)
        label, path = label.strip(), path.strip()
        if not label or not path or not label.replace('-', '').replace('_', '').isalnum():
            raise ValueError('MAC_RECOVERY_FILES entries must be label=path')
        files.append((label, pathlib.Path(path)))
    return files


# --------------------------------------------------------------------------- #
# Check results
# --------------------------------------------------------------------------- #


class Check:
    """One named observation. ``details`` holds only numbers, booleans and
    short strings the monitor itself produced."""

    def __init__(self, name, status, reason, observed_at, **details):
        if status not in SEVERITY:
            raise ValueError('Unknown status')
        self.name = name
        self.status = status
        self.reason = reason
        self.observed_at = observed_at
        self.details = details

    def to_json(self):
        return {'status': self.status, 'reason': self.reason,
                'observed_at': self.observed_at.isoformat(), **self.details}


def worst(statuses):
    return max(statuses, key=lambda status: SEVERITY[status], default=OK)


def _fmt_age(seconds):
    if seconds is None:
        return 'unknown age'
    seconds = int(seconds)
    if seconds < 3600:
        return '%dm' % (seconds // 60)
    return '%dh%02dm' % (seconds // 3600, (seconds % 3600) // 60)


# --------------------------------------------------------------------------- #
# Fast checks (SQL + filesystem)
# --------------------------------------------------------------------------- #


class Database:
    """Thin psycopg2 wrapper; the tests inject a fake with the same interface."""

    def __init__(self, settings):
        self.settings = settings

    def __enter__(self):
        import psycopg2  # provided by the Patroni virtualenv
        self.errors = psycopg2.Error
        self.connection = psycopg2.connect(host=self.settings.socket_dir, user=self.settings.pg_user,
                                           dbname=self.settings.pg_dbname,
                                           connect_timeout=self.settings.sql_timeout,
                                           options='-c statement_timeout=%d000 -c default_transaction_read_only=on'
                                                   % self.settings.sql_timeout)
        self.connection.set_session(readonly=True, autocommit=True)
        return self

    def __exit__(self, *exc):
        self.connection.close()
        return False

    def one(self, sql):
        with self.connection.cursor() as cursor:
            cursor.execute(sql)
            return cursor.fetchone()


SQL_ROLE = 'SELECT pg_is_in_recovery()'
SQL_CONNECTIONS = ("SELECT (SELECT count(*) FROM pg_stat_activity WHERE backend_type = 'client backend'), "
                   "current_setting('max_connections')::int")
SQL_ARCHIVER = ("SELECT current_setting('archive_mode'), "
                "EXTRACT(EPOCH FROM now() - last_archived_time), "
                "EXTRACT(EPOCH FROM now() - last_failed_time), "
                "last_failed_time IS NOT NULL AND (last_archived_time IS NULL OR last_failed_time > last_archived_time) "
                "FROM pg_stat_archiver")
SQL_STANDBY = ("SELECT pg_wal_lsn_diff(pg_last_wal_receive_lsn(), pg_last_wal_replay_lsn()), "
               "EXTRACT(EPOCH FROM now() - pg_last_xact_replay_timestamp()), "
               "(SELECT status FROM pg_stat_wal_receiver LIMIT 1)")


def check_database(settings, database_factory, now):
    """Return the SQL-derived checks and the role ('primary', 'standby', None)."""
    checks = []
    try:
        with database_factory(settings) as db:
            in_recovery = bool(db.one(SQL_ROLE)[0])
            role = 'standby' if in_recovery else 'primary'
            checks.append(Check('sql', OK, 'reachable', now, role=role))
            used, maximum = db.one(SQL_CONNECTIONS)
            checks.append(connections_check(settings, int(used), int(maximum), now))
            if role == 'primary':
                checks.append(archiver_check(settings, db.one(SQL_ARCHIVER), now))
            else:
                checks.append(replication_check(settings, db.one(SQL_STANDBY), now))
            return checks, role
    except Exception as error:  # psycopg2.Error or an unexpected driver problem
        # Only the exception class is kept: messages can quote hosts and SQL.
        checks = [Check('sql', CRITICAL, 'unreachable: ' + type(error).__name__, now, role=None)]
        return checks, None


def connections_check(settings, used, maximum, now):
    ratio = used / maximum if maximum else 1.0
    status = OK
    if ratio >= settings.connections_critical_ratio:
        status = CRITICAL
    elif ratio >= settings.connections_warn_ratio:
        status = WARNING
    return Check('connections', status, '%d of %d client connections' % (used, maximum), now,
                 used=used, max=maximum, ratio=round(ratio, 3))


def archiver_check(settings, row, now):
    archive_mode, archived_age, failed_age, failing_now = row
    archived_age = None if archived_age is None else float(archived_age)
    failed_age = None if failed_age is None else float(failed_age)
    details = dict(archive_mode=archive_mode, last_archived_age_seconds=archived_age,
                   last_failed_age_seconds=failed_age, failing_now=bool(failing_now))
    if archive_mode != 'on':
        return Check('archiver', CRITICAL, 'archive_mode is ' + str(archive_mode), now, **details)
    if failing_now:
        return Check('archiver', CRITICAL, 'archive_command failing; last failure %s ago'
                     % _fmt_age(failed_age), now, **details)
    if archived_age is None:
        # archive_mode on, nothing archived and nothing failed yet: fresh primary or a quiet
        # instance right after restart. Not a failure; the WAL-bytes check covers growth.
        return Check('archiver', OK, 'archiving on, no segment archived yet', now, **details)
    return Check('archiver', OK, 'archiving, last success %s ago' % _fmt_age(archived_age), now, **details)


def replication_check(settings, row, now):
    lag_bytes, replay_age, receiver_status = row
    lag_bytes = None if lag_bytes is None else int(lag_bytes)
    replay_age = None if replay_age is None else float(replay_age)
    details = dict(receiver_status=receiver_status, lag_bytes=lag_bytes)
    if receiver_status != 'streaming':
        # No receiver row (or not streaming): the standby is not following the primary.
        # receive LSN is null then, so the byte lag cannot be computed either.
        return Check('replication', WARNING, 'wal receiver ' + (receiver_status or 'absent'), now, **details)
    if lag_bytes is None:
        return Check('replication', UNKNOWN, 'lag not computable', now, **details)
    # The replay timestamp only means "delayed" when there is WAL still to replay.
    # On an idle primary it simply stays at the last transaction, which is fine.
    delay = replay_age if lag_bytes > 0 else 0.0
    details['replay_delay_seconds'] = delay
    if lag_bytes >= settings.lag_critical_bytes:
        status = CRITICAL
    elif lag_bytes >= settings.lag_warn_bytes or (delay or 0) >= settings.lag_warn_seconds:
        status = WARNING
    else:
        status = OK
    return Check('replication', status, 'streaming, %d bytes behind' % lag_bytes, now, **details)


def check_disk(settings, now, disk_usage=shutil.disk_usage):
    try:
        usage = disk_usage(str(settings.pgdata))
    except OSError:
        return Check('disk', UNKNOWN, 'PGDATA filesystem not readable', now)
    free_ratio = usage.free / usage.total if usage.total else 0.0
    details = dict(total_bytes=usage.total, free_bytes=usage.free, free_ratio=round(free_ratio, 3))
    if free_ratio < settings.disk_critical_free_ratio or usage.free < settings.disk_critical_free_bytes:
        status = CRITICAL
    elif free_ratio < settings.disk_warn_free_ratio:
        status = WARNING
    else:
        status = OK
    return Check('disk', status, '%.1f%% free' % (free_ratio * 100), now, **details)


def wal_bytes(pgdata):
    """Total size of regular files directly under ``pg_wal`` (segments and
    ``archive_status`` are what grow when archiving stalls)."""
    total = 0
    def unreadable(error):
        raise error
    for root, _dirs, files in os.walk(str(pathlib.Path(pgdata) / 'pg_wal'), onerror=unreadable):
        for name in files:
            try:
                total += os.lstat(os.path.join(root, name)).st_size
            except FileNotFoundError:
                continue
    return total


def check_wal(settings, now, size=wal_bytes):
    if not (pathlib.Path(settings.pgdata) / 'pg_wal').is_dir():
        return Check('wal', UNKNOWN, 'pg_wal missing', now)
    try:
        total = size(settings.pgdata)
    except OSError:
        return Check('wal', UNKNOWN, 'pg_wal not readable', now)
    if total >= settings.wal_critical_bytes:
        status = CRITICAL
    elif total >= settings.wal_warn_bytes:
        status = WARNING
    else:
        status = OK
    return Check('wal', status, '%.2f GiB in pg_wal' % (total / GIB), now, bytes=total)


# --------------------------------------------------------------------------- #
# Slow checks (pgBackRest info, Mac recovery files)
# --------------------------------------------------------------------------- #


def newest_backup(text, stanza):
    """(stop time of the newest successful backup, stanza status code) from
    ``pgbackrest info --output=json``. Raises ValueError on malformed input."""
    newest = None
    code = None
    for entry in json.loads(text):
        if entry.get('name') != stanza:
            continue
        code = entry.get('status', {}).get('code')
        for backup in entry.get('backup', []):
            if backup.get('error'):
                continue
            stop = backup.get('timestamp', {}).get('stop')
            if stop is None:
                continue
            when = datetime.datetime.fromtimestamp(int(stop), UTC)
            if newest is None or when > newest:
                newest = when
    if code is None:
        raise ValueError('stanza not present')
    return newest, int(code)


def backup_check(settings, code, output, now):
    """Turn a ``pgbackrest info`` exit code and raw output into a check.
    ``output`` is parsed and dropped; it is never logged or stored."""
    if code != 0:
        return Check('backup', UNKNOWN, 'pgbackrest info exited %d' % code, now, info_exit=code)
    try:
        newest, status_code = newest_backup(output.decode('utf-8', 'replace'), settings.stanza)
    except (ValueError, KeyError, TypeError, AttributeError):
        return Check('backup', UNKNOWN, 'pgbackrest info unparseable', now, info_exit=code)
    if status_code != 0:
        return Check('backup', CRITICAL, 'stanza status code %d' % status_code, now,
                     stanza_status=status_code)
    if newest is None:
        return Check('backup', CRITICAL, 'no successful backup in repository', now, stanza_status=0)
    age = (now - newest).total_seconds()
    limit = settings.backup_max_age_hours * 3600
    status = CRITICAL if age > limit else OK
    return Check('backup', status, 'newest backup %s ago' % _fmt_age(age), now, stanza_status=0,
                 newest_backup_at=newest.isoformat(), age_seconds=int(age))


def recovery_file_check(label, path, max_age, now, stat=os.stat):
    name = 'mac_recovery_' + label
    try:
        mtime = stat(str(path)).st_mtime
    except OSError:
        return Check(name, WARNING, 'last-success file missing', now)
    age = now.timestamp() - mtime
    status = WARNING if age > max_age else OK
    return Check(name, status, 'last success %s ago' % _fmt_age(age), now, age_seconds=int(age))


# --------------------------------------------------------------------------- #
# Report
# --------------------------------------------------------------------------- #


def write_report(path, report):
    """Atomic, fsynced replace so the healthcheck never reads a partial file."""
    path = pathlib.Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + '.tmp')
    with open(tmp, 'w') as handle:
        json.dump(report, handle, sort_keys=True)
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(tmp, path)
    try:
        fd = os.open(str(path.parent), os.O_RDONLY)
        try:
            os.fsync(fd)
        finally:
            os.close(fd)
    except OSError:
        pass


def evaluate_report(text, now, max_age):
    """Return (healthy, reason) for a health.json body. Warnings pass; only a
    stale, missing, malformed or critical report fails the container check."""
    try:
        report = json.loads(text)
        generated = datetime.datetime.fromisoformat(report['generated_at'])
        status = report['status']
    except (ValueError, KeyError, TypeError):
        return False, 'health report unparseable'
    if generated.tzinfo is None:
        generated = generated.replace(tzinfo=UTC)
    age = (now - generated).total_seconds()
    if age < -60 or age > max_age:
        return False, 'health report stale (%ds)' % age
    if status not in SEVERITY or status in (CRITICAL, UNKNOWN):
        failing = sorted(name for name, check in report.get('checks', {}).items()
                         if check.get('status') in (CRITICAL, UNKNOWN))
        return False, 'unhealthy checks: ' + ', '.join(failing)
    return True, status


def healthcheck(settings, clock=None):
    now = (clock or (lambda: datetime.datetime.now(UTC)))()
    try:
        text = settings.health_path.read_text()
    except OSError:
        print('health report missing')
        return 1
    healthy, reason = evaluate_report(text, now, settings.health_max_age)
    print(reason)
    return 0 if healthy else 1


# --------------------------------------------------------------------------- #
# Monitor loop
# --------------------------------------------------------------------------- #


class Monitor:
    def __init__(self, settings, database_factory=Database, popen=subprocess.Popen, clock=None,
                 disk_usage=shutil.disk_usage, wal_size=wal_bytes, stat=os.stat, sleep=None):
        self.settings = settings
        self.database_factory = database_factory
        self.popen = popen
        self.clock = clock or (lambda: datetime.datetime.now(UTC))
        self.disk_usage = disk_usage
        self.wal_size = wal_size
        self.stat = stat
        self.stop = threading.Event()
        self._sleep = sleep or self.stop.wait
        self.child = None
        self.slow_checks = {}
        self.slow_due_at = None
        self.last_status = {}
        self.role = None

    # -- pgBackRest --------------------------------------------------------- #

    def info_command(self):
        s = self.settings
        return [s.pgbackrest_binary, '--config=' + str(s.pgbackrest_config), '--stanza=' + s.stanza,
                '--log-level-console=off', '--log-level-file=off', '--output=json', 'info']

    def run_info(self):
        """(exit code, stdout bytes). Output is returned for parsing only."""
        if self.stop.is_set():
            return 143, b''
        self.child = self.popen(self.info_command(), stdin=subprocess.DEVNULL,
                                stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        if self.stop.is_set():
            self.request_stop()
        try:
            try:
                output, _ = self.child.communicate(timeout=self.settings.info_timeout)
            except subprocess.TimeoutExpired:
                self.child.kill()
                self.child.communicate()
                return 124, b''
            return self.child.returncode, output or b''
        finally:
            self.child = None

    # -- ticks --------------------------------------------------------------- #

    def fast_tick(self, now):
        checks, role = check_database(self.settings, self.database_factory, now)
        if role != self.role:
            LOG.info('Role: %s', role or 'unknown')
            self.role = role
        checks.append(check_disk(self.settings, now, self.disk_usage))
        checks.append(check_wal(self.settings, now, self.wal_size))
        return checks

    def slow_tick(self, now):
        checks = []
        code, output = self.run_info()
        checks.append(backup_check(self.settings, code, output, now))
        del output  # parsed above; never logged or stored
        for label, path in self.settings.mac_recovery_files:
            checks.append(recovery_file_check(label, path, self.settings.mac_recovery_max_age, now, self.stat))
        return checks

    def tick(self):
        now = self.clock()
        checks = self.fast_tick(now)
        if self.slow_due_at is None or now >= self.slow_due_at:
            self.slow_due_at = now + datetime.timedelta(seconds=self.settings.slow_seconds)
            for check in self.slow_tick(now):
                self.slow_checks[check.name] = check
        checks.extend(self.slow_checks.values())
        self.log_transitions(checks)
        report = self.build_report(checks, now)
        write_report(self.settings.health_path, report)
        return report

    def log_transitions(self, checks):
        for check in checks:
            previous = self.last_status.get(check.name)
            if previous == check.status:
                continue
            self.last_status[check.name] = check.status
            level = {OK: logging.INFO, WARNING: logging.WARNING, UNKNOWN: logging.WARNING,
                     CRITICAL: logging.ERROR}[check.status]
            LOG.log(level, 'Check %s: %s -> %s (%s)', check.name, previous or 'new', check.status, check.reason)

    def build_report(self, checks, now):
        return {'schema': 1, 'node': self.settings.node_name, 'generated_at': now.isoformat(),
                'role': self.role, 'status': worst(check.status for check in checks),
                'checks': {check.name: check.to_json() for check in checks}}

    # -- lifecycle ---------------------------------------------------------- #

    def request_stop(self, *_):
        self.stop.set()
        child = self.child
        if child is not None and child.poll() is None:
            child.terminate()

    def loop(self):
        LOG.info('Monitoring %s every %ss (backups every %ss)', self.settings.node_name,
                 self.settings.fast_seconds, self.settings.slow_seconds)
        while not self.stop.is_set():
            try:
                self.tick()
            except Exception as error:  # keep the sidecar alive; details are not secrets
                LOG.error('Tick failed: %s', type(error).__name__)
            self._sleep(float(self.settings.fast_seconds))
        LOG.info('Stopped')


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    logging.basicConfig(level=logging.INFO, stream=sys.stdout,
                        format='%(asctime)sZ %(levelname)s %(message)s')
    logging.Formatter.converter = __import__('time').gmtime
    settings = Settings()
    if argv == ['--healthcheck']:
        return healthcheck(settings)
    if argv:
        print('usage: pointfinder-monitor [--healthcheck]')
        return 2
    monitor = Monitor(settings)
    signal.signal(signal.SIGTERM, monitor.request_stop)
    signal.signal(signal.SIGINT, monitor.request_stop)
    monitor.loop()
    return 0


if __name__ == '__main__':
    sys.exit(main())
