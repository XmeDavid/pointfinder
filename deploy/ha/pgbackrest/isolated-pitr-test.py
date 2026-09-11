#!/usr/bin/env python3
"""Isolated pgBackRest point-in-time-recovery rehearsal for the production Patroni image.

Runs as root on a database host and drives the Docker CLI only. Nothing here
touches production: every container runs with ``--network none``, every volume
is a fresh uniquely named volume created by this run, and no host path is
mounted. The image under test is the exact production image
(``pointfinder-patroni:16.15-4.1.5-production-pgbackrest-r2``), started with
the inherited official ``docker-entrypoint.sh`` instead of Patroni so a
synthetic PostgreSQL 16 cluster can be initialised with the ``scout``
superuser, just as the production pg_hba/socket layout expects.

Flow (each step is a reported stage):

  preflight        docker reachable, image present, no name collisions
  create-volumes   pgdata, encrypted local repository, restore target
  prepare-repo     write the pgBackRest config (ephemeral AES passphrase via stdin)
  start-source     initdb + postgres with archive_mode=on -> archive-push
  stanza-create    pgbackrest stanza-create, then check (forces a WAL switch)
  backup           full backup
  probe            row 'before', target timestamp, row 'after', switch WAL
  wait-archive     pg_stat_archiver confirms the switched segment was pushed
  stop-source      clean shutdown of the source cluster
  restore          pgbackrest --type=time restore into the empty restore volume
  start-restored   postgres replays to the target and promotes
  verify           exactly the 'before' row survives; 'after' is gone

The encryption passphrase and the bootstrap password are generated in memory,
passed only through stdin / container environment, never printed, and any
error text is scrubbed for them before display. Every wait is bounded and
every container carries memory, CPU and pid limits.

On failure the containers are stopped but kept, together with their volumes,
and only their names and the failing stage are printed. On success the
containers are stopped; pass ``--cleanup`` to also remove exactly the
containers and volumes this run created (by exact name, nothing else).
"""
import argparse
import json
import secrets
import subprocess
import sys
import time

DEFAULT_IMAGE = 'pointfinder-patroni:16.15-4.1.5-production-pgbackrest-r2'
STANZA = 'pitr-test'
PG_USER = 'scout'
PGDATA = '/var/lib/postgresql/data'
REPO_MOUNT = '/var/lib/pgbackrest'
CONFIG_PATH = REPO_MOUNT + '/pgbackrest.conf'
LABEL = 'pointfinder.pitr-test'
NAME_PREFIX = 'pf-pitr-test-'

# Every container this script starts gets these. Memory is generous for a
# synthetic cluster with max_connections=20 and default shared_buffers.
LIMITS = ['--network', 'none', '--memory', '512m', '--memory-swap', '512m',
          '--cpus', '1', '--pids-limit', '256', '--security-opt', 'no-new-privileges']

TIMEOUTS = {
    'docker': 60,          # any plain docker command
    'ready': 180,          # initdb + first start
    'stanza': 120,         # stanza-create / check
    'backup': 300,
    'archive': 120,        # waiting for archive-push of the switched segment
    'stop': 90,
    'restore': 300,
    'recovery': 180,       # replay to target + promote
}
POLL_SECONDS = 2.0

# Same idea as the production config, minus the S3 repository: posix repo on a
# throwaway volume, identical cipher, bundling, block incremental, compression
# and archive checks, so the option set is exercised by a real binary.
CONFIG_TEMPLATE = """[global]
repo1-type=posix
repo1-path={repo}/repo
repo1-cipher-type=aes-256-cbc
repo1-cipher-pass={passphrase}
repo1-retention-full=1
repo1-bundle=y
repo1-block=y
compress-type=zst
compress-level=3
process-max=1
start-fast=y
log-level-console=warn
log-level-file=detail
log-path=/var/log/pgbackrest
lock-path=/tmp/pgbackrest
archive-check=y
archive-header-check=y

[{stanza}]
pg1-path={pgdata}
pg1-port=5432
pg1-socket-path=/var/run/postgresql
pg1-user={user}
"""

PREPARE_SCRIPT = ('set -eu; umask 077; mkdir -p /repo/repo; cat > /repo/pgbackrest.conf; '
                  'chown -R postgres:postgres /repo; chmod 0700 /repo /repo/repo; '
                  'chmod 0400 /repo/pgbackrest.conf')


class Failure(Exception):
    def __init__(self, stage, detail):
        super().__init__(detail)
        self.stage = stage
        self.detail = detail


class Resources:
    """Names of everything a single run creates. All derived from one token."""

    def __init__(self, run_id):
        base = NAME_PREFIX + run_id
        self.run_id = run_id
        self.source = base + '-source'
        self.restore = base + '-restore'
        self.verify = base + '-verify'
        self.pgdata = base + '-pgdata'
        self.repo = base + '-repo'
        self.restored = base + '-restored'

    @property
    def containers(self):
        return [self.source, self.restore, self.verify]

    @property
    def volumes(self):
        return [self.pgdata, self.repo, self.restored]

    @property
    def label(self):
        return LABEL + '=' + self.run_id


class Docker:
    """Thin Docker CLI wrapper with bounded waits and secret scrubbing."""

    def __init__(self, runner=subprocess.run, sleep=time.sleep, clock=time.monotonic):
        self.runner = runner
        self.sleep = sleep
        self.clock = clock
        self.secrets = []

    def scrub(self, text):
        for secret in self.secrets:
            if secret:
                text = text.replace(secret, '<redacted>')
        return text

    def run(self, args, stage, stdin=None, timeout=None, check=True):
        timeout = TIMEOUTS['docker'] if timeout is None else timeout
        try:
            result = self.runner(['docker'] + list(args), input=stdin, capture_output=True,
                                 text=True, timeout=timeout)
        except subprocess.TimeoutExpired:
            raise Failure(stage, 'docker %s timed out after %ss' % (args[0], timeout))
        except OSError as error:
            raise Failure(stage, 'cannot run docker: %s' % type(error).__name__)
        if check and result.returncode != 0:
            raise Failure(stage, 'docker %s exited %s: %s'
                          % (args[0], result.returncode, self.scrub(tail(result.stderr))))
        return result

    def exists(self, kind, name, stage):
        """True/False for an exact container or volume name; anything else fails closed."""
        result = self.run([kind, 'inspect', name], stage, check=False)
        if result.returncode == 0:
            return True
        if 'no such' in result.stderr.lower() or ('not found' in result.stderr.lower() and name in result.stderr):
            return False
        raise Failure(stage, 'cannot determine whether %s %s exists: %s'
                      % (kind, name, self.scrub(tail(result.stderr))))

    def running(self, name):
        result = self.run(['container', 'inspect', '-f', '{{.State.Running}}', name],
                          'inspect', check=False)
        return result.returncode == 0 and result.stdout.strip() == 'true'

    def logs_tail(self, name, lines=40):
        result = self.run(['logs', '--tail', str(lines), name], 'logs', check=False)
        return self.scrub(tail(result.stdout + result.stderr, lines))

    def wait_until(self, stage, timeout, predicate, description):
        deadline = self.clock() + timeout
        while True:
            if predicate():
                return
            if self.clock() >= deadline:
                raise Failure(stage, 'timed out after %ss waiting for %s' % (timeout, description))
            self.sleep(POLL_SECONDS)


def tail(text, lines=15):
    return '\n'.join((text or '').strip().splitlines()[-lines:])


# --------------------------------------------------------------------------- #
# Test
# --------------------------------------------------------------------------- #


class PitrTest:
    def __init__(self, docker, image, resources):
        self.docker = docker
        self.image = image
        self.res = resources
        self.stage = 'init'
        self.preflight_ok = False

    # -- helpers ------------------------------------------------------------- #

    def sql(self, container, query, timeout=None):
        result = self.docker.run(
            ['exec', '-u', 'postgres', container, 'psql', '-v', 'ON_ERROR_STOP=1', '-qAtX',
             '-U', PG_USER, '-d', 'postgres', '-c', query], self.stage, timeout=timeout)
        return result.stdout.strip()

    def pgbackrest(self, container, *args, timeout=None):
        self.docker.run(['exec', '-u', 'postgres', container, 'pgbackrest',
                         '--config=' + CONFIG_PATH, '--stanza=' + STANZA] + list(args),
                        self.stage, timeout=timeout)

    def pg_ready(self, container):
        if not self.docker.running(container):
            raise Failure(self.stage, 'container %s exited early:\n%s'
                          % (container, self.docker.logs_tail(container)))
        result = self.docker.run(['exec', '-u', 'postgres', container, 'pg_isready', '-q',
                                  '-U', PG_USER, '-d', 'postgres'], self.stage, check=False)
        return result.returncode == 0

    def init_complete(self, container):
        return 'PostgreSQL init process complete' in self.docker.logs_tail(container, 200)

    def start_postgres(self, name, pgdata_volume, extra_env, pg_args):
        args = ['run', '-d', '--name', name, '--label', self.res.label] + LIMITS
        for key, value in extra_env:
            args += ['-e', key + '=' + value]
        args += ['-v', pgdata_volume + ':' + PGDATA, '-v', self.res.repo + ':' + REPO_MOUNT,
                 '--entrypoint', 'docker-entrypoint.sh', self.image, 'postgres',
                 '-c', 'listen_addresses=', '-c', 'max_connections=20'] + pg_args
        self.docker.run(args, self.stage)

    # -- stages -------------------------------------------------------------- #

    def preflight(self):
        self.stage = 'preflight'
        self.docker.run(['version', '--format', '{{.Server.Version}}'], self.stage)
        inspect = self.docker.run(['image', 'inspect', '--format', '{{.Id}}', self.image],
                                  self.stage, check=False)
        if inspect.returncode != 0:
            raise Failure(self.stage, 'image %s is not present locally (not pulling)' % self.image)
        for name in self.res.containers:
            if self.docker.exists('container', name, self.stage):
                raise Failure(self.stage, 'container %s already exists; refusing to touch it' % name)
        for name in self.res.volumes:
            if self.docker.exists('volume', name, self.stage):
                raise Failure(self.stage, 'volume %s already exists; refusing to touch it' % name)
        self.preflight_ok = True
        return inspect.stdout.strip()

    def create_volumes(self):
        self.stage = 'create-volumes'
        for name in self.res.volumes:
            self.docker.run(['volume', 'create', '--label', self.res.label, name], self.stage)

    def prepare_repo(self, passphrase):
        self.stage = 'prepare-repo'
        config = CONFIG_TEMPLATE.format(repo=REPO_MOUNT, passphrase=passphrase, stanza=STANZA,
                                        pgdata=PGDATA, user=PG_USER)
        self.docker.run(['run', '--rm', '-i', '--label', self.res.label] + LIMITS
                        + ['-v', self.res.repo + ':/repo', '--entrypoint', 'sh', self.image,
                           '-c', PREPARE_SCRIPT], self.stage, stdin=config)

    def start_source(self, password):
        self.stage = 'start-source'
        archive_command = 'pgbackrest --config=%s --stanza=%s archive-push %%p' % (CONFIG_PATH, STANZA)
        self.start_postgres(self.res.source, self.res.pgdata,
                            [('POSTGRES_USER', PG_USER), ('POSTGRES_PASSWORD', password)],
                            ['-c', 'wal_level=replica', '-c', 'archive_mode=on',
                             '-c', 'archive_command=' + archive_command])
        source = self.res.source
        self.docker.wait_until(self.stage, TIMEOUTS['ready'],
                               lambda: self.init_complete(source) and self.pg_ready(source),
                               'initdb and first start of the source cluster')

    def stanza(self):
        self.stage = 'stanza-create'
        self.pgbackrest(self.res.source, 'stanza-create', timeout=TIMEOUTS['stanza'])
        self.pgbackrest(self.res.source, 'check', timeout=TIMEOUTS['stanza'])

    def backup(self):
        self.stage = 'backup'
        self.sql(self.res.source,
                 'CREATE TABLE pitr_probe (id serial PRIMARY KEY, label text NOT NULL, '
                 'created_at timestamptz NOT NULL DEFAULT clock_timestamp())')
        self.pgbackrest(self.res.source, '--type=full', 'backup', timeout=TIMEOUTS['backup'])

    def probe(self):
        """Insert 'before', take the target time, insert 'after', switch WAL."""
        self.stage = 'probe'
        source = self.res.source
        self.sql(source, "INSERT INTO pitr_probe (label) VALUES ('before')")
        self.docker.sleep(POLL_SECONDS)
        target = self.sql(source, "SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC', "
                                  "'YYYY-MM-DD HH24:MI:SS.US') || '+00'")
        if len(target) < 20:
            raise Failure(self.stage, 'unexpected target timestamp shape')
        self.docker.sleep(POLL_SECONDS)
        self.sql(source, "INSERT INTO pitr_probe (label) VALUES ('after')")
        segment = self.sql(source, 'SELECT pg_walfile_name(pg_switch_wal())')
        if len(segment) != 24:
            raise Failure(self.stage, 'unexpected WAL segment name shape')
        return target, segment

    def wait_archive(self, segment):
        self.stage = 'wait-archive'
        source = self.res.source

        def archived():
            row = self.sql(source, "SELECT coalesce(last_archived_wal, ''), failed_count FROM pg_stat_archiver")
            last, _, failed = row.partition('|')
            if failed.strip().isdigit() and int(failed) >= 5:
                raise Failure(self.stage, 'archive_command keeps failing (%s failures); see docker logs %s'
                              % (failed, source))
            return last >= segment

        self.docker.wait_until(self.stage, TIMEOUTS['archive'], archived,
                               'archive-push of segment ' + segment)

    def stop_source(self):
        self.stage = 'stop-source'
        self.docker.run(['stop', '-t', '60', self.res.source], self.stage, timeout=TIMEOUTS['stop'])

    def restore(self, target):
        self.stage = 'restore'
        self.docker.run(['run', '-d', '--name', self.res.restore, '--label', self.res.label,
                         '--user', 'postgres'] + LIMITS
                        + ['-v', self.res.restored + ':' + PGDATA, '-v', self.res.repo + ':' + REPO_MOUNT,
                           '--entrypoint', 'pgbackrest', self.image,
                           '--config=' + CONFIG_PATH, '--stanza=' + STANZA, '--type=time',
                           '--target=' + target, '--target-action=promote', 'restore'], self.stage)
        waited = self.docker.run(['wait', self.res.restore], self.stage, timeout=TIMEOUTS['restore'])
        if waited.stdout.strip() != '0':
            raise Failure(self.stage, 'pgbackrest restore exited %s:\n%s'
                          % (waited.stdout.strip(), self.docker.logs_tail(self.res.restore)))

    def start_restored(self):
        self.stage = 'start-restored'
        verify = self.res.verify
        self.start_postgres(verify, self.res.restored, [], ['-c', 'archive_mode=off'])

        def promoted():
            if not self.pg_ready(verify):
                return False
            return self.sql(verify, 'SELECT pg_is_in_recovery()') == 'f'

        self.docker.wait_until(self.stage, TIMEOUTS['recovery'], promoted,
                               'replay to the target and promotion')

    def verify(self):
        self.stage = 'verify'
        verify = self.res.verify
        labels = self.sql(verify, "SELECT coalesce(string_agg(label, ',' ORDER BY id), '') FROM pitr_probe")
        if labels != 'before':
            raise Failure(self.stage, "expected exactly the 'before' row, found labels: %r" % labels)
        timeline = self.sql(verify, 'SELECT timeline_id FROM pg_control_checkpoint()')
        if not timeline.isdigit() or int(timeline) < 2:
            raise Failure(self.stage, 'restored cluster did not promote onto a new timeline (%r)' % timeline)
        return int(timeline)

    # -- lifecycle ----------------------------------------------------------- #

    def stop_all(self):
        """Stop whatever is still running; never removes anything."""
        if not self.preflight_ok:
            return
        for name in self.res.containers:
            if self.docker.running(name):
                self.docker.run(['stop', '-t', '30', name], 'stop', timeout=TIMEOUTS['stop'], check=False)

    def cleanup(self):
        """Remove exactly this run's containers and volumes, by exact name."""
        for name in self.res.containers:
            if self.docker.exists('container', name, 'cleanup'):
                self.docker.run(['rm', name], 'cleanup')
        for name in self.res.volumes:
            if self.docker.exists('volume', name, 'cleanup'):
                self.docker.run(['volume', 'rm', name], 'cleanup')

    def run(self):
        passphrase = secrets.token_hex(48)
        password = secrets.token_urlsafe(24)
        self.docker.secrets += [passphrase, password]
        image_id = self.preflight()
        self.create_volumes()
        self.prepare_repo(passphrase)
        self.start_source(password)
        self.stanza()
        self.backup()
        target, segment = self.probe()
        self.wait_archive(segment)
        self.stop_source()
        self.restore(target)
        self.start_restored()
        timeline = self.verify()
        self.stage = 'done'
        return {'image_id': image_id, 'target': target, 'segment': segment, 'timeline': timeline}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('--image', default=DEFAULT_IMAGE, help='local image to test (never pulled)')
    parser.add_argument('--cleanup', action='store_true',
                        help='on success, also remove exactly the containers and volumes this run created')
    args = parser.parse_args(argv)

    docker = Docker()
    resources = Resources(secrets.token_hex(4))
    test = PitrTest(docker, args.image, resources)
    report = {'run_id': resources.run_id, 'containers': resources.containers, 'volumes': resources.volumes}

    try:
        result = test.run()
    except Failure as failure:
        test.stop_all()
        report.update({'result': 'failed', 'stage': failure.stage, 'detail': docker.scrub(failure.detail),
                       'retained': True,
                       'hint': 'containers stopped, not removed; inspect with docker logs <name>'})
        print(json.dumps(report, indent=2))
        return 1
    except KeyboardInterrupt:
        test.stop_all()
        report.update({'result': 'interrupted', 'stage': test.stage, 'retained': True})
        print(json.dumps(report, indent=2))
        return 130
    except Exception as error:  # never let an unexpected path leak secrets
        test.stop_all()
        report.update({'result': 'error', 'stage': test.stage, 'detail': type(error).__name__,
                       'retained': True})
        print(json.dumps(report, indent=2))
        return 1

    test.stop_all()
    report.update({'result': 'passed', 'stage': 'done', 'checks': {
        'restored_labels': 'before', 'after_row_absent': True,
        'promoted_timeline': result['timeline']},
        'image_id': result['image_id'], 'target_time_utc': result['target'],
        'archived_segment': result['segment']})
    if args.cleanup:
        test.cleanup()
        report['retained'] = False
    else:
        report['retained'] = True
        report['hint'] = 'retained for audit; remove only these listed test containers and volumes when no longer needed'
    print(json.dumps(report, indent=2))
    return 0


if __name__ == '__main__':
    sys.exit(main())
