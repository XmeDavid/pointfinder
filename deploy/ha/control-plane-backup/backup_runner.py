#!/usr/bin/env python3
"""Dokploy control-plane backup, retention and isolated restore rehearsal.

One stdlib-only runner with five jobs:

* ``backup``          consistent ``pg_dump`` of the Dokploy database plus the
                      ``/etc/dokploy`` configuration tree and Swarm service
                      specifications, validated, encrypted, then published
                      atomically to the destination directory;
* ``prune``           7 daily / 4 weekly / 3 monthly retention of this
                      runner's own files only (dry-run unless ``--apply``);
* ``restore-test``    decrypt the newest (or a named) backup, rebuild the
                      configuration tree privately and restore the database
                      into a throw-away ``--network none`` PostgreSQL
                      container on a fresh volume, verify counts and
                      representative artefacts, then tear everything down;
* ``run``             the scheduler: one cycle a day (backup, prune,
                      optional restore rehearsal) plus a periodic secret-free
                      ``health.json``;
* ``healthcheck`` / ``status``   consume that health file.

Everything the archive contains (database dump, ``docker service inspect``
output, ``/etc/dokploy``) holds secrets. Nothing from those streams, from
``docker inspect`` or from any command's stdout/stderr is ever logged: logs
and state files carry return codes, byte counts, names, hashes and counts.
"""
import argparse
import collections
import datetime
import fcntl
import hashlib
import json
import logging
import os
import pathlib
import re
import secrets
import shutil
import signal
import stat
import subprocess
import sys
import tarfile
import threading
import time
import zlib

LOG = logging.getLogger('control-plane-backup')
UTC = datetime.timezone.utc

STAMP_FORMAT = '%Y%m%dT%H%M%SZ'
PREFIX = 'dokploy-control-plane-'
ARCHIVE_SUFFIX = '.tar.gz.enc'
MANIFEST_SUFFIX = '.manifest.json'
ARCHIVE_RE = re.compile(r'^dokploy-control-plane-(\d{8}T\d{6}Z)\.tar\.gz\.enc$')
MANIFEST_RE = re.compile(r'^dokploy-control-plane-(\d{8}T\d{6}Z)\.manifest\.json$')
DUMP_MEMBER = 'dump/dokploy.dump'
SERVICES_MEMBER_DIR = 'services'
SECRETS_MEMBER_DIR = 'secrets'
SECRETS_MANIFEST_MEMBER = 'secrets/manifest.json'
CONFIG_MEMBER_DIR = 'etc/dokploy'
DOCKER_CONFIG_MEMBER_DIR = 'root/.docker'
SWARM_SECRET_MOUNT = '/run/secrets/'
EXCLUDED_DIRS = frozenset({'code', 'logs', '.git', 'node_modules'})
RESTORE_LABEL = 'pointfinder.control-plane-restore'
RESTORE_PREFIX = 'cp-restore-'
MANIFEST_SCHEMA = 1

OK, WARNING, UNKNOWN, CRITICAL = 'ok', 'warning', 'unknown', 'critical'
SEVERITY = {OK: 0, WARNING: 1, UNKNOWN: 2, CRITICAL: 3}

RESTORE_SCOPE = ('Verifies that the encrypted backup decrypts, that the configuration '
                 'tree reconstructs and that the database dump restores into an isolated '
                 'PostgreSQL with the expected tables and row counts. It does NOT start '
                 'Dokploy, Traefik or Redis against the restored data, does not touch Swarm, '
                 'and is not an end-to-end control-plane failover rehearsal.')
ROW_COUNTS_NOTE = ('Row counts were read from the live database immediately before pg_dump '
                   'and are not snapshot-consistent with the dump; the table list comes from '
                   'the dump table of contents and is exact.')

TOC_TABLE_DATA = re.compile(r'^\d+;\s+\d+\s+\d+\s+TABLE DATA\s+(\S+)\s+(.+?)\s+\S+\s*$')

ROW_COUNT_SQL = (
    "select c.relname, (xpath('/row/n/text()', query_to_xml(format("
    "'select count(*) as n from %I.%I', n.nspname, c.relname), false, true, '')))[1]"
    "::text::bigint from pg_class c join pg_namespace n on n.oid = c.relnamespace "
    "where n.nspname = 'public' and c.relkind in ('r', 'p') order by 1")


class BackupError(Exception):
    """Operator-facing failure. Messages never contain command output."""


class CommandError(BackupError):
    pass


Result = collections.namedtuple('Result', 'code stdout stderr')
BackupFile = collections.namedtuple('BackupFile', 'name stamp archive manifest')


# --------------------------------------------------------------------------- #
# Settings
# --------------------------------------------------------------------------- #


def parse_hhmm(text):
    match = re.match(r'^(\d{1,2}):(\d{2})$', text.strip())
    if not match:
        raise ValueError('CPB_BACKUP_TIME_UTC must be HH:MM, got %r' % text)
    hour, minute = int(match.group(1)), int(match.group(2))
    if hour > 23 or minute > 59:
        raise ValueError('CPB_BACKUP_TIME_UTC out of range: %r' % text)
    return hour, minute


def parse_bool(text):
    return text.strip().lower() in ('1', 'true', 'yes', 'on')


def parse_list(text):
    return [item.strip() for item in text.split(',') if item.strip()]


class Settings:
    """All configuration comes from ``CPB_*`` environment variables."""

    def __init__(self, env=None):
        env = os.environ if env is None else env

        def read(name, default):
            return env.get('CPB_' + name, default)

        self.dest_dir = pathlib.Path(read('DEST_DIR', '/backups'))
        copy_dir = read('COPY_DIR', '')
        self.copy_dir = pathlib.Path(copy_dir) if copy_dir else None
        self.state_dir = pathlib.Path(read('STATE_DIR', '/state'))
        self.stage_dir = pathlib.Path(read('STAGE_DIR', '/tmp/control-plane-stage'))
        self.passphrase_file = pathlib.Path(read('PASSPHRASE_FILE', '/run/secrets/control-plane-passphrase'))
        self.dokploy_etc = pathlib.Path(read('DOKPLOY_ETC', '/host/etc/dokploy'))
        docker_config = read('DOCKER_CONFIG_DIR', '')
        self.docker_config_dir = pathlib.Path(docker_config) if docker_config else None
        self.services = parse_list(read('SERVICES', 'dokploy,dokploy-postgres,dokploy-redis'))
        self.postgres_service = read('POSTGRES_SERVICE', 'dokploy-postgres')
        self.backup_time = parse_hhmm(read('BACKUP_TIME_UTC', '04:15'))
        self.keep_daily = int(read('KEEP_DAILY', '7'))
        self.keep_weekly = int(read('KEEP_WEEKLY', '4'))
        self.keep_monthly = int(read('KEEP_MONTHLY', '3'))
        self.prune_apply = parse_bool(read('PRUNE_APPLY', 'false'))
        self.backup_max_age = float(read('BACKUP_MAX_AGE_HOURS', '36')) * 3600
        self.copy_max_age = float(read('COPY_MAX_AGE_HOURS', '48')) * 3600
        self.restore_image = read('RESTORE_IMAGE', '')
        self.restore_interval_days = int(read('RESTORE_INTERVAL_DAYS', '0'))
        self.restore_max_age_days = float(read('RESTORE_MAX_AGE_DAYS', '35'))
        self.restore_memory = read('RESTORE_MEMORY', '512m')
        self.restore_cpus = read('RESTORE_CPUS', '1')
        self.restore_ready_timeout = int(read('RESTORE_READY_TIMEOUT_SECONDS', '180'))
        self.expected_config_paths = parse_list(read('EXPECTED_CONFIG_PATHS', 'traefik/traefik.yml,traefik/dynamic'))
        s3_credentials = read('S3_CREDENTIALS_FILE', '')
        self.s3_credentials_file = pathlib.Path(s3_credentials) if s3_credentials else None
        self.s3_bucket = read('S3_BUCKET', 'pointfinder-prod-backups-202609')
        self.s3_prefix = read('S3_PREFIX', 'control-plane/')
        self.s3_max_age = float(read('S3_MAX_AGE_HOURS', '48')) * 3600
        self.pbkdf2_iterations = int(read('PBKDF2_ITERATIONS', '600000'))
        self.row_count_tolerance_percent = float(read('ROW_COUNT_TOLERANCE_PERCENT', '2'))
        self.row_count_tolerance_rows = int(read('ROW_COUNT_TOLERANCE_ROWS', '5'))
        self.tick_seconds = int(read('TICK_SECONDS', '60'))
        self.health_max_age = float(read('HEALTH_MAX_AGE_SECONDS', str(self.tick_seconds * 5)))
        self.command_timeout = int(read('COMMAND_TIMEOUT_SECONDS', '1800'))
        for name in ('keep_daily', 'keep_weekly', 'keep_monthly'):
            if getattr(self, name) < 1:
                raise ValueError('CPB_%s must be at least 1' % name.upper())
        if self.pbkdf2_iterations < 100000:
            raise ValueError('CPB_PBKDF2_ITERATIONS must be at least 100000')
        if self.tick_seconds < 5:
            raise ValueError('CPB_TICK_SECONDS must be at least 5')

    @property
    def health_path(self):
        return self.state_dir / 'health.json'

    @property
    def last_run_path(self):
        return self.state_dir / 'last-run.json'

    @property
    def last_success_path(self):
        return self.state_dir / 'last-success.json'

    @property
    def last_restore_path(self):
        return self.state_dir / 'last-restore-test.json'

    @property
    def last_remote_path(self):
        return self.state_dir / 'last-remote-upload.json'

    @property
    def last_healthy_path(self):
        return self.state_dir / 'last-healthy.json'

    @property
    def s3_enabled(self):
        return self.s3_credentials_file is not None

    @property
    def lock_path(self):
        return self.state_dir / 'runner.lock'


# --------------------------------------------------------------------------- #
# Processes
# --------------------------------------------------------------------------- #


class ProcessRunner:
    """Runs a command. stdin/stdout are paths so that fakes are trivial."""

    def run(self, argv, stdin_path=None, stdout_path=None, timeout=None):
        stdin = open(stdin_path, 'rb') if stdin_path else subprocess.DEVNULL
        try:
            stdout = open(stdout_path, 'xb') if stdout_path else subprocess.PIPE
            try:
                proc = subprocess.run(list(argv), stdin=stdin, stdout=stdout, stderr=subprocess.PIPE,
                                      timeout=timeout, check=False)
            finally:
                if stdout_path:
                    stdout.close()
        finally:
            if stdin_path:
                stdin.close()
        return Result(proc.returncode, proc.stdout or b'', proc.stderr or b'')


class Tool:
    """Thin wrapper that converts failures into secret-free CommandErrors."""

    def __init__(self, runner=None, timeout=1800):
        self.runner = runner or ProcessRunner()
        self.timeout = timeout

    def call(self, argv, label, stdin_path=None, stdout_path=None, ok=(0,)):
        try:
            result = self.runner.run(argv, stdin_path=stdin_path, stdout_path=stdout_path, timeout=self.timeout)
        except subprocess.TimeoutExpired:
            raise CommandError('%s timed out after %ss' % (label, self.timeout))
        except OSError as error:
            raise CommandError('%s could not start (%s)' % (label, type(error).__name__))
        if result.code not in ok:
            raise CommandError('%s exited %d (%d bytes of output suppressed)'
                               % (label, result.code, len(result.stdout) + len(result.stderr)))
        return result


def openssl_encrypt_argv(source, target, passphrase_file, iterations):
    return ['openssl', 'enc', '-aes-256-cbc', '-pbkdf2', '-iter', str(iterations), '-md', 'sha256',
            '-salt', '-in', str(source), '-out', str(target), '-pass', 'file:' + str(passphrase_file)]


def openssl_decrypt_argv(source, target, passphrase_file, iterations):
    return ['openssl', 'enc', '-d', '-aes-256-cbc', '-pbkdf2', '-iter', str(iterations), '-md', 'sha256',
            '-in', str(source), '-out', str(target), '-pass', 'file:' + str(passphrase_file)]


# --------------------------------------------------------------------------- #
# Small filesystem helpers
# --------------------------------------------------------------------------- #


def sha256_file(path):
    digest = hashlib.sha256()
    with open(path, 'rb') as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def fsync_path(path, directory=False):
    fd = os.open(str(path), os.O_RDONLY)
    try:
        os.fsync(fd)
    except OSError:
        if not directory:
            raise
    finally:
        os.close(fd)


def write_json_atomic(path, payload):
    path = pathlib.Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + '.tmp')
    with open(tmp, 'w') as handle:
        json.dump(payload, handle, sort_keys=True, indent=1)
        handle.write('\n')
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(tmp, path)
    fsync_path(path.parent, directory=True)


def read_json(path):
    try:
        with open(path) as handle:
            return json.load(handle)
    except (OSError, ValueError):
        return None


def check_passphrase_file(path):
    try:
        info = os.lstat(str(path))
    except OSError:
        raise BackupError('passphrase file missing: %s' % path)
    if not stat.S_ISREG(info.st_mode):
        raise BackupError('passphrase file is not a regular file: %s' % path)
    if info.st_mode & 0o077:
        raise BackupError('passphrase file is group/world accessible: %s' % path)
    if info.st_size == 0:
        raise BackupError('passphrase file is empty: %s' % path)


def require_directory(path, role):
    if not pathlib.Path(path).is_dir():
        raise BackupError('%s directory is not mounted or not a directory: %s' % (role, path))


def parse_stamp(text):
    return datetime.datetime.strptime(text, STAMP_FORMAT).replace(tzinfo=UTC)


def format_age(seconds):
    seconds = int(seconds)
    if seconds < 3600:
        return '%dm' % (seconds // 60)
    if seconds < 86400:
        return '%dh%02dm' % (seconds // 3600, (seconds % 3600) // 60)
    return '%dd%02dh' % (seconds // 86400, (seconds % 86400) // 3600)


class Lock:
    """Non-blocking exclusive flock so two jobs never overlap."""

    def __init__(self, path):
        self.path = pathlib.Path(path)
        self.fd = None

    def __enter__(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.fd = os.open(str(self.path), os.O_RDWR | os.O_CREAT, 0o600)
        try:
            fcntl.flock(self.fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            os.close(self.fd)
            self.fd = None
            raise BackupError('another control-plane backup job holds %s' % self.path)
        return self

    def __exit__(self, *exc):
        if self.fd is not None:
            fcntl.flock(self.fd, fcntl.LOCK_UN)
            os.close(self.fd)
            self.fd = None


# --------------------------------------------------------------------------- #
# Backup inventory (own-format files only)
# --------------------------------------------------------------------------- #


def list_backups(directory):
    """Return (complete backups newest first, orphan archive names, foreign names).

    Only regular, non-symlink files whose names match this runner's exact
    format are considered. Everything else is *foreign* and never touched.
    """
    directory = pathlib.Path(directory)
    archives, manifests, foreign = {}, {}, []
    for name in sorted(os.listdir(str(directory))):
        path = directory / name
        try:
            info = os.lstat(str(path))
        except OSError:
            continue
        if name == '.incoming':
            continue
        if not stat.S_ISREG(info.st_mode):
            foreign.append(name)
            continue
        match = ARCHIVE_RE.match(name)
        if match:
            archives[match.group(1)] = path
            continue
        match = MANIFEST_RE.match(name)
        if match:
            manifests[match.group(1)] = path
            continue
        foreign.append(name)
    complete = []
    for stamp_text, archive in archives.items():
        manifest = manifests.get(stamp_text)
        if manifest is None:
            continue
        try:
            stamp = parse_stamp(stamp_text)
        except ValueError:
            foreign.append(archive.name)
            continue
        complete.append(BackupFile(PREFIX + stamp_text, stamp, archive, manifest))
    complete.sort(key=lambda item: item.stamp, reverse=True)
    orphans = sorted(archives[s].name for s in archives if s not in manifests)
    orphans += sorted(manifests[s].name for s in manifests if s not in archives)
    return complete, orphans, foreign


# --------------------------------------------------------------------------- #
# Dump table of contents and archive construction
# --------------------------------------------------------------------------- #


def parse_toc(text):
    """(number of TOC entries, sorted public table names) from ``pg_restore --list``."""
    entries = 0
    tables = set()
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith(';'):
            continue
        entries += 1
        match = TOC_TABLE_DATA.match(line)
        if match and match.group(1) == 'public':
            tables.add(match.group(2).strip().strip('"'))
    return entries, sorted(tables)


def parse_row_counts(text):
    counts = {}
    for line in text.splitlines():
        if not line.strip():
            continue
        name, _, value = line.rpartition('\t')
        if not name:
            raise BackupError('row-count query returned an unparseable line')
        counts[name.strip().strip('"')] = int(value)
    return counts


def add_tree(tar, root, arcbase, excluded=EXCLUDED_DIRS):
    """Add a directory tree. Directories named in ``excluded`` are skipped at
    any depth; symlinks are stored as symlinks, never followed; sockets,
    fifos and devices are ignored. Returns secret-free statistics."""
    stats = {'files': 0, 'dirs': 0, 'symlinks': 0, 'bytes': 0, 'excluded_dirs': 0, 'members': 0}
    for dirpath, dirnames, filenames in os.walk(str(root), followlinks=False):
        kept = []
        for name in dirnames:
            if name in excluded:
                stats['excluded_dirs'] += 1
            else:
                kept.append(name)
        dirnames[:] = sorted(kept)
        relative = os.path.relpath(dirpath, str(root))
        arcdir = arcbase if relative == '.' else arcbase + '/' + relative
        tar.add(dirpath, arcname=arcdir, recursive=False)
        stats['dirs'] += 1
        stats['members'] += 1
        for name in sorted(filenames):
            full = os.path.join(dirpath, name)
            info = os.lstat(full)
            if stat.S_ISLNK(info.st_mode):
                stats['symlinks'] += 1
            elif stat.S_ISREG(info.st_mode):
                stats['files'] += 1
                stats['bytes'] += info.st_size
            else:
                continue
            tar.add(full, arcname=arcdir + '/' + name, recursive=False)
            stats['members'] += 1
    return stats


def build_archive(target, members, trees, excluded=EXCLUDED_DIRS):
    """Write a gzip tar. ``members`` are (path, arcname) files; ``trees`` are
    (root, arcbase) directories. Returns {'members': n, 'trees': {arcbase: stats}}."""
    stats = {'members': 0, 'trees': {}}
    with tarfile.open(str(target), 'w:gz', compresslevel=6) as tar:
        for path, arcname in members:
            tar.add(str(path), arcname=arcname, recursive=False)
            stats['members'] += 1
        for root, arcbase in trees:
            tree = add_tree(tar, root, arcbase, excluded)
            stats['trees'][arcbase] = tree
            stats['members'] += tree['members']
    return stats


def member_is_safe(member):
    name = member.name
    if name.startswith('/') or name.startswith('..') or '/../' in name or name.endswith('/..'):
        return False
    return member.isfile() or member.isdir() or member.issym()


def validate_archive(path, expected_dump_bytes, expected_members):
    """Fully read the gzip tar, check structure and required members."""
    members = 0
    config_members = 0
    dump_bytes = None
    try:
        with tarfile.open(str(path), 'r:gz') as tar:
            for member in tar:
                if not member_is_safe(member):
                    raise BackupError('archive member rejected: unsafe name or type')
                members += 1
                if member.name == DUMP_MEMBER:
                    dump_bytes = member.size
                if member.name.startswith(CONFIG_MEMBER_DIR + '/') or member.name == CONFIG_MEMBER_DIR:
                    config_members += 1
                if member.isfile():
                    handle = tar.extractfile(member)
                    while handle.read(1024 * 1024):
                        pass
    except (tarfile.TarError, zlib.error, EOFError, OSError) as error:
        raise BackupError('archive unreadable (%s)' % type(error).__name__)
    if dump_bytes != expected_dump_bytes:
        raise BackupError('archive dump member missing or size mismatch')
    if config_members == 0:
        raise BackupError('archive contains no configuration members')
    if members != expected_members:
        raise BackupError('archive member count %d != expected %d' % (members, expected_members))
    return members


def safe_extract(archive_path, target_dir):
    """Extract files/dirs under ``target_dir``; symlinks are counted, not created."""
    target_dir = pathlib.Path(target_dir)
    target_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
    counts = {'files': 0, 'dirs': 0, 'symlinks_skipped': 0}
    try:
        with tarfile.open(str(archive_path), 'r:gz') as tar:
            for member in tar:
                if not member_is_safe(member):
                    raise BackupError('archive member rejected: unsafe name or type')
                if member.issym():
                    counts['symlinks_skipped'] += 1
                    continue
                destination = target_dir / member.name
                if member.isdir():
                    destination.mkdir(mode=0o700, parents=True, exist_ok=True)
                    counts['dirs'] += 1
                    continue
                destination.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
                source = tar.extractfile(member)
                with open(str(destination), 'xb') as handle:
                    shutil.copyfileobj(source, handle)
                counts['files'] += 1
    except (tarfile.TarError, zlib.error, EOFError) as error:
        raise BackupError('archive unreadable (%s)' % type(error).__name__)
    return counts


# --------------------------------------------------------------------------- #
# Backup job
# --------------------------------------------------------------------------- #


def default_uploader(archive, manifest, settings, expected_sha):
    """Lazy import so the stdlib-only paths never need boto3."""
    import s3_upload  # noqa: WPS433 - optional dependency, same directory
    return s3_upload.upload_backup(archive, manifest, settings.s3_credentials_file, settings.s3_bucket,
                                   settings.s3_prefix, expected_sha)


class BackupJob:
    def __init__(self, settings, tool, clock=None, uploader=default_uploader):
        self.settings = settings
        self.tool = tool
        self.clock = clock or (lambda: datetime.datetime.now(UTC))
        self.uploader = uploader

    def service_container(self, service):
        label = 'label=com.docker.swarm.service.name=' + service
        result = self.tool.call(['docker', 'ps', '-q', '--filter', label], 'docker ps')
        ids = result.stdout.decode('ascii', 'replace').split()
        if len(ids) != 1:
            raise BackupError('expected exactly one running %s container, found %d' % (service, len(ids)))
        return ids[0]

    def identity(self, container):
        """(user, database, image) from ``docker inspect``; the JSON is parsed
        in memory and dropped, it can contain credentials."""
        result = self.tool.call(['docker', 'inspect', container], 'docker inspect')
        try:
            data = json.loads(result.stdout)[0]
            env = dict(item.partition('=')[::2] for item in data['Config']['Env'])
            image = data['Config']['Image']
        except (ValueError, KeyError, IndexError, TypeError):
            raise BackupError('docker inspect output unparseable')
        user = env.get('POSTGRES_USER', 'postgres')
        database = env.get('POSTGRES_DB', user)
        return user, database, image

    def row_counts(self, container, user, database):
        result = self.tool.call(['docker', 'exec', container, 'psql', '-U', user, '-d', database,
                                 '-At', '-F', '\t', '-v', 'ON_ERROR_STOP=1', '-c', ROW_COUNT_SQL], 'row counts')
        return parse_row_counts(result.stdout.decode('utf-8', 'replace'))

    def capture_services(self, stage):
        """Save each ``docker service inspect`` into staging and return
        ((path, arcname) members, {service: [secret spec, ...]}). Specs only
        *reference* Swarm secrets; the values are captured separately."""
        service_dir = stage / SERVICES_MEMBER_DIR
        service_dir.mkdir(mode=0o700)
        members, specs = [], {}
        for service in self.settings.services:
            path = service_dir / (service + '.json')
            self.tool.call(['docker', 'service', 'inspect', service], 'docker service inspect', stdout_path=str(path))
            if path.stat().st_size == 0:
                raise BackupError('service inspect produced no output for %s' % service)
            members.append((path, SERVICES_MEMBER_DIR + '/' + path.name))
            specs[service] = secret_specs(read_json(path), service)
        return members, specs

    def capture_secrets(self, stage, specs):
        """Copy every mounted Swarm secret referenced by a service out of its
        single running container straight into protected staging. Nothing is
        read into this process except for hashing; failure is fatal because a
        restore without these values is not a restore."""
        secrets_dir = stage / SECRETS_MEMBER_DIR
        secrets_dir.mkdir(mode=0o700)
        entries = []
        members = []
        for service, items in specs.items():
            if not items:
                continue
            container = self.service_container(service)
            (secrets_dir / service).mkdir(mode=0o700)
            for spec in items:
                path = secrets_dir / service / spec['name']
                self.tool.call(['docker', 'exec', container, 'cat', spec['target']], 'secret read',
                               stdout_path=str(path))
                size = path.stat().st_size
                if size == 0:
                    raise BackupError('secret %s of %s is empty or unreadable' % (spec['name'], service))
                entry = dict(spec, service=service, member=SECRETS_MEMBER_DIR + '/' + service + '/' + spec['name'],
                             bytes=size, sha256=sha256_file(path))
                entries.append(entry)
                members.append((path, entry['member']))
        manifest = secrets_dir / 'manifest.json'
        write_json_atomic(manifest, {'schema': MANIFEST_SCHEMA, 'mount_prefix': SWARM_SECRET_MOUNT,
                                     'secrets': entries})
        members.append((manifest, SECRETS_MANIFEST_MEMBER))
        summary = {'count': len(entries), 'services': {s: len(i) for s, i in specs.items()}}
        return members, summary

    def run(self, copy=True):
        os.umask(0o077)
        settings = self.settings
        started = self.clock()
        check_passphrase_file(settings.passphrase_file)
        require_directory(settings.dest_dir, 'destination')
        if copy and settings.copy_dir is not None:
            require_directory(settings.copy_dir, 'copy destination')
        if copy and settings.s3_enabled:
            check_passphrase_file(settings.s3_credentials_file)  # same rules: regular, 0600, non-empty
        require_directory(settings.dokploy_etc, 'Dokploy configuration')
        if settings.docker_config_dir is not None:
            require_directory(settings.docker_config_dir, 'Docker client configuration')
        settings.stage_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
        stamp = started.strftime(STAMP_FORMAT)
        name = PREFIX + stamp
        stage = settings.stage_dir / name
        stage.mkdir(mode=0o700)
        incoming = settings.dest_dir / '.incoming'
        incoming.mkdir(mode=0o700, exist_ok=True)
        encrypted_tmp = incoming / (name + ARCHIVE_SUFFIX)
        try:
            LOG.info('Backup %s: locating %s', name, settings.postgres_service)
            container = self.service_container(settings.postgres_service)
            user, database, image = self.identity(container)
            counts = self.row_counts(container, user, database)
            dump = stage / 'dokploy.dump'
            self.tool.call(['docker', 'exec', container, 'pg_dump', '-U', user, '-d', database,
                            '--format=custom', '--no-owner', '--no-acl'], 'pg_dump', stdout_path=str(dump))
            dump_bytes = dump.stat().st_size
            if dump_bytes == 0:
                raise BackupError('pg_dump produced an empty archive')
            toc = self.tool.call(['docker', 'exec', '-i', container, 'pg_restore', '--list'],
                                 'pg_restore --list', stdin_path=str(dump))
            toc_entries, tables = parse_toc(toc.stdout.decode('utf-8', 'replace'))
            if toc_entries == 0 or not tables:
                raise BackupError('dump table of contents is empty')
            LOG.info('Backup %s: dump %d bytes, %d TOC entries, %d tables', name, dump_bytes, toc_entries, len(tables))
            service_members, specs = self.capture_services(stage)
            secret_members, secret_summary = self.capture_secrets(stage, specs)
            LOG.info('Backup %s: %d service specs, %d Swarm secrets captured', name, len(service_members),
                     secret_summary['count'])
            members = [(dump, DUMP_MEMBER)] + service_members + secret_members
            trees = [(settings.dokploy_etc, CONFIG_MEMBER_DIR)]
            if settings.docker_config_dir is not None:
                trees.append((settings.docker_config_dir, DOCKER_CONFIG_MEMBER_DIR))
            plain = stage / 'plain.tar.gz'
            stats = build_archive(plain, members, trees)
            validate_archive(plain, dump_bytes, stats['members'])
            plain_sha = sha256_file(plain)
            plain_bytes = plain.stat().st_size
            LOG.info('Backup %s: archive %d members, %d bytes, validated', name, stats['members'], plain_bytes)
            if encrypted_tmp.exists():
                encrypted_tmp.unlink()
            self.tool.call(openssl_encrypt_argv(plain, encrypted_tmp, settings.passphrase_file,
                                                settings.pbkdf2_iterations), 'openssl enc')
            roundtrip = stage / 'roundtrip.tar.gz'
            self.tool.call(openssl_decrypt_argv(encrypted_tmp, roundtrip, settings.passphrase_file,
                                                settings.pbkdf2_iterations), 'openssl dec')
            if sha256_file(roundtrip) != plain_sha:
                raise BackupError('decrypt round-trip does not reproduce the archive')
            roundtrip.unlink()
            encrypted_sha = sha256_file(encrypted_tmp)
            config_stats = stats['trees'][CONFIG_MEMBER_DIR]
            docker_stats = stats['trees'].get(DOCKER_CONFIG_MEMBER_DIR)
            manifest = {
                'schema': MANIFEST_SCHEMA,
                'name': name,
                'created_at': started.isoformat(),
                'postgres_image': image,
                'postgres_service': settings.postgres_service,
                'postgres_user': user,
                'postgres_database': database,
                'services': [s for s in settings.services],
                'dump': {'bytes': dump_bytes, 'toc_entries': toc_entries, 'tables': tables},
                'row_counts': counts,
                'row_counts_note': ROW_COUNTS_NOTE,
                'secrets': secret_summary,
                'config': {'source': str(settings.dokploy_etc), 'excluded_dir_names': sorted(EXCLUDED_DIRS),
                           'files': config_stats['files'], 'dirs': config_stats['dirs'],
                           'symlinks': config_stats['symlinks'], 'bytes': config_stats['bytes'],
                           'excluded_dirs': config_stats['excluded_dirs']},
                'docker_config': ({'captured': True, 'files': docker_stats['files'], 'bytes': docker_stats['bytes']}
                                  if docker_stats else {'captured': False}),
                'archive': {'members': stats['members'], 'bytes': plain_bytes, 'sha256': plain_sha},
                'encrypted': {'bytes': encrypted_tmp.stat().st_size, 'sha256': encrypted_sha,
                              'cipher': 'aes-256-cbc', 'kdf': 'pbkdf2-sha256',
                              'iterations': settings.pbkdf2_iterations, 'tool': 'openssl enc'},
                'validated': True,
                'decrypt_verified': True,
                'confidential': True,
            }
            final_archive = settings.dest_dir / (name + ARCHIVE_SUFFIX)
            final_manifest = settings.dest_dir / (name + MANIFEST_SUFFIX)
            fsync_path(encrypted_tmp)
            os.replace(str(encrypted_tmp), str(final_archive))
            write_json_atomic(final_manifest, manifest)
            fsync_path(settings.dest_dir, directory=True)
            LOG.info('Backup %s: published %d encrypted bytes', name, manifest['encrypted']['bytes'])
            result = {'status': OK, 'name': name, 'archive': str(final_archive), 'manifest': str(final_manifest),
                      'encrypted_bytes': manifest['encrypted']['bytes'], 'encrypted_sha256': encrypted_sha,
                      'tables': len(tables), 'toc_entries': toc_entries, 'config_files': config_stats['files'],
                      'secrets': secret_summary['count'], 'docker_config': manifest['docker_config']['captured'],
                      'started_at': started.isoformat(), 'copy': None, 'remote': None}
            if copy and settings.copy_dir is not None:
                try:
                    result['copy'] = copy_backup(final_archive, final_manifest, settings.copy_dir, encrypted_sha)
                except (BackupError, OSError) as error:
                    LOG.warning('Backup %s: copy to %s failed (%s)', name, settings.copy_dir, type(error).__name__)
                    result['copy'] = {'status': WARNING, 'error': type(error).__name__, 'directory': str(settings.copy_dir)}
                    result['status'] = WARNING
            if copy and settings.s3_enabled:
                result['remote'] = self.upload(final_archive, final_manifest, encrypted_sha, name)
                if result['remote']['status'] != OK:
                    result['status'] = CRITICAL  # a required off-host copy failed: never report success
            result['finished_at'] = self.clock().isoformat()
            if result['status'] == OK:
                write_json_atomic(settings.last_success_path, {'name': name, 'finished_at': result['finished_at'],
                                                               'encrypted_sha256': encrypted_sha,
                                                               'remote_verified': bool(result['remote'])})
            return result
        finally:
            shutil.rmtree(str(stage), ignore_errors=True)
            if encrypted_tmp.exists():
                encrypted_tmp.unlink()

    def upload(self, archive, manifest, expected_sha, name):
        """Post-backup hook: off-host copy to the private backups bucket.

        Only the outcome is recorded; credentials, endpoints and exception
        text (which may embed signed URLs) never reach logs or state."""
        settings = self.settings
        try:
            outcome = self.uploader(archive, manifest, settings, expected_sha)
            if outcome.get('status') != OK or outcome.get('sha256') != expected_sha:
                raise BackupError('remote verification did not confirm the archive checksum')
            record = {'status': OK, 'name': name, 'bucket': settings.s3_bucket, 'key': outcome.get('key'),
                      'sha256': expected_sha, 'bytes': outcome.get('bytes'),
                      'finished_at': self.clock().isoformat()}
            LOG.info('Backup %s: remote copy verified in %s', name, settings.s3_bucket)
        except Exception as error:  # noqa: BLE001 - boto3 raises many types; text may hold secrets
            record = {'status': CRITICAL, 'name': name, 'bucket': settings.s3_bucket,
                      'error': type(error).__name__, 'finished_at': self.clock().isoformat()}
            LOG.error('Backup %s: remote copy failed (%s)', name, type(error).__name__)
        write_json_atomic(settings.last_remote_path, record)
        return record


def secret_specs(inspect_data, service):
    """Secret references from a ``docker service inspect`` document: name and
    the absolute mount path inside the task container. Values are NOT here."""
    try:
        spec = inspect_data[0]['Spec']['TaskTemplate']['ContainerSpec']
    except (TypeError, KeyError, IndexError):
        raise BackupError('service inspect for %s is unparseable' % service)
    items = []
    for ref in spec.get('Secrets') or []:
        try:
            name = ref['SecretName']
            file_spec = ref.get('File') or {}
            target = file_spec.get('Name') or name
        except (TypeError, KeyError):
            raise BackupError('secret reference of %s is unparseable' % service)
        if not re.match(r'^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$', name):
            raise BackupError('secret name of %s is not a plain identifier' % service)
        if not target.startswith('/'):
            target = SWARM_SECRET_MOUNT + target
        items.append({'name': name, 'target': target, 'mode': file_spec.get('Mode'),
                      'uid': file_spec.get('UID'), 'gid': file_spec.get('GID')})
    return items


def copy_backup(archive, manifest, copy_dir, expected_sha):
    copy_dir = pathlib.Path(copy_dir)
    incoming = copy_dir / '.incoming'
    incoming.mkdir(mode=0o700, exist_ok=True)
    published = []
    for source in (archive, manifest):
        tmp = incoming / source.name
        with open(str(source), 'rb') as src, open(str(tmp), 'wb') as dst:
            shutil.copyfileobj(src, dst)
            dst.flush()
            os.fsync(dst.fileno())
        target = copy_dir / source.name
        os.replace(str(tmp), str(target))
        published.append(target)
    fsync_path(copy_dir, directory=True)
    actual = sha256_file(published[0])
    if actual != expected_sha:
        raise BackupError('copied archive checksum mismatch')
    return {'status': OK, 'directory': str(copy_dir), 'sha256': actual}


# --------------------------------------------------------------------------- #
# Retention
# --------------------------------------------------------------------------- #


def plan_retention(stamps, daily, weekly, monthly):
    """Grandfather-father-son keep set over *distinct* periods that have a
    backup, so gaps never widen deletions. The newest stamp is always kept."""
    ordered = sorted(set(stamps), reverse=True)
    keep = set(ordered[:1])

    def bucket(key, limit):
        seen = []
        for stamp in ordered:
            period = key(stamp)
            if period in seen:
                continue
            if len(seen) >= limit:
                break
            seen.append(period)
            keep.add(stamp)  # first hit in a period is its newest backup

    bucket(lambda s: s.date(), daily)
    bucket(lambda s: s.isocalendar()[:2], weekly)
    bucket(lambda s: (s.year, s.month), monthly)
    return keep, set(ordered) - keep


def prune(directory, settings, apply=False, clock=None):
    """Delete only complete own-format backups outside the keep set."""
    now = (clock or (lambda: datetime.datetime.now(UTC)))()
    directory = pathlib.Path(directory)
    require_directory(directory, 'prune')
    complete, orphans, foreign = list_backups(directory)
    keep, drop = plan_retention([b.stamp for b in complete], settings.keep_daily,
                                settings.keep_weekly, settings.keep_monthly)
    by_stamp = {b.stamp: b for b in complete}
    candidates = sorted((by_stamp[s] for s in drop), key=lambda b: b.stamp)
    if complete and complete[0].stamp not in keep:
        raise BackupError('retention plan would drop the newest backup; refusing')
    report = {'directory': str(directory), 'mode': 'apply' if apply else 'dry-run', 'at': now.isoformat(),
              'complete': len(complete), 'kept': sorted(by_stamp[s].name for s in keep),
              'protected_orphans': orphans, 'protected_foreign': len(foreign),
              'deleted': [], 'would_delete': [b.name for b in candidates], 'errors': []}
    if not apply:
        return report
    # A newer filename is not proof of a usable replacement. Do not remove
    # any history unless every selected retained copy still matches its
    # verified manifest; corruption must fail closed before the first unlink.
    if candidates:
        for stamp in keep:
            retained = by_stamp[stamp]
            metadata = read_json(retained.manifest) or {}
            encrypted = metadata.get('encrypted') or {}
            if (metadata.get('name') != retained.name or metadata.get('validated') is not True
                    or metadata.get('decrypt_verified') is not True
                    or retained.archive.stat().st_size != encrypted.get('bytes')
                    or sha256_file(retained.archive) != encrypted.get('sha256')):
                raise BackupError('retained backup integrity not verified; no history deleted')
    for backup in candidates:
        if not keep:
            raise BackupError('empty keep set; refusing to delete')
        for path in (backup.archive, backup.manifest):
            try:
                info = os.lstat(str(path))
                if not stat.S_ISREG(info.st_mode):
                    raise BackupError('not a regular file')
                if not (ARCHIVE_RE.match(path.name) or MANIFEST_RE.match(path.name)):
                    raise BackupError('name no longer matches')
                os.unlink(str(path))
            except (OSError, BackupError) as error:
                report['errors'].append({'file': path.name, 'error': type(error).__name__})
        report['deleted'].append(backup.name)
    report['would_delete'] = []
    fsync_path(directory, directory=True)
    LOG.info('Prune %s: deleted %d, kept %d, protected %d foreign/%d orphan',
             directory, len(report['deleted']), len(keep), len(foreign), len(orphans))
    return report


# --------------------------------------------------------------------------- #
# Restore rehearsal
# --------------------------------------------------------------------------- #


def compare_counts(expected_tables, expected_counts, actual_counts, tolerance_percent, tolerance_rows):
    expected_tables = sorted(expected_tables)
    actual_tables = sorted(actual_counts)
    missing = sorted(set(expected_tables) - set(actual_tables))
    extra = sorted(set(actual_tables) - set(expected_tables))
    exact = within = 0
    mismatches = []
    for table in expected_tables:
        if table in missing or table not in expected_counts:
            continue
        expected = expected_counts[table]
        actual = actual_counts[table]
        delta = abs(actual - expected)
        allowed = max(tolerance_rows, expected * tolerance_percent / 100.0)
        if delta == 0:
            exact += 1
        elif delta <= allowed:
            within += 1
        else:
            mismatches.append({'table': table, 'expected': expected, 'restored': actual})
    return {'tables_expected': len(expected_tables), 'tables_restored': len(actual_tables),
            'missing_tables': missing, 'extra_tables': extra, 'rows_exact': exact,
            'rows_within_tolerance': within, 'rows_mismatch': mismatches,
            'rows_total_restored': sum(actual_counts.values()),
            'ok': not missing and not extra and not mismatches}


def verify_config_tree(root, expected_paths):
    root = pathlib.Path(root)
    if not root.is_dir():
        raise BackupError('reconstructed configuration tree missing')
    files = dirs = total = 0
    for dirpath, dirnames, filenames in os.walk(str(root)):
        dirs += 1
        for name in filenames:
            files += 1
            total += os.lstat(os.path.join(dirpath, name)).st_size
    artefacts = {}
    for relative in expected_paths:
        path = root / relative
        if path.is_file():
            artefacts[relative] = {'present': True, 'kind': 'file', 'bytes': path.stat().st_size}
        elif path.is_dir():
            artefacts[relative] = {'present': True, 'kind': 'dir', 'entries': len(os.listdir(str(path)))}
        else:
            artefacts[relative] = {'present': False}
    return {'files': files, 'dirs': dirs, 'bytes': total, 'artefacts': artefacts,
            'ok': all(item['present'] for item in artefacts.values())}


def verify_secrets(directory, expected_count):
    """Check every reconstructed Swarm secret against the encrypted secrets
    manifest by size and SHA-256. Only names and counts are reported."""
    directory = pathlib.Path(directory)
    manifest = read_json(directory / 'manifest.json')
    if not manifest or not isinstance(manifest.get('secrets'), list):
        raise BackupError('secrets manifest missing from archive')
    entries = manifest['secrets']
    verified, mismatched = 0, []
    for entry in entries:
        path = directory / entry['service'] / entry['name']
        label = entry['service'] + '/' + entry['name']
        try:
            ok = path.is_file() and path.stat().st_size == entry['bytes'] and sha256_file(path) == entry['sha256']
        except (OSError, KeyError, TypeError):
            ok = False
        if ok:
            verified += 1
        else:
            mismatched.append(label)
    count_ok = expected_count is None or expected_count == len(entries)
    return {'expected': len(entries), 'verified': verified, 'mismatched': mismatched,
            'targets': sorted(e.get('target', '') for e in entries),
            'ok': count_ok and not mismatched}


def verify_docker_config(directory, expected):
    if not expected.get('captured'):
        return {'captured': False, 'ok': True}
    config = pathlib.Path(directory) / 'config.json'
    present = config.is_file()
    parseable = present and isinstance(read_json(config), dict)
    return {'captured': True, 'config_json_present': present, 'parseable': bool(parseable), 'ok': bool(parseable)}


class RestoreTest:
    def __init__(self, settings, tool, clock=None, sleep=time.sleep):
        self.settings = settings
        self.tool = tool
        self.clock = clock or (lambda: datetime.datetime.now(UTC))
        self.sleep = sleep

    def select(self, name):
        complete, _, _ = list_backups(self.settings.dest_dir)
        if not complete:
            raise BackupError('no complete backup in %s' % self.settings.dest_dir)
        if name is None:
            return complete[0]
        for backup in complete:
            if backup.name == name:
                return backup
        raise BackupError('backup %s not found' % name)

    def run_argv(self, container, volume, image, user, database):
        return ['docker', 'run', '-d', '--name', container, '--label', RESTORE_LABEL + '=1',
                '--network', 'none', '--volume', volume + ':/var/lib/postgresql/data',
                '--env', 'POSTGRES_HOST_AUTH_METHOD=trust', '--env', 'POSTGRES_USER=' + user,
                '--env', 'POSTGRES_DB=' + database, '--memory', self.settings.restore_memory,
                '--cpus', self.settings.restore_cpus, '--pids-limit', '256',
                '--security-opt', 'no-new-privileges:true', '--restart', 'no', image]

    def wait_ready(self, container, user, database):
        deadline = time.monotonic() + self.settings.restore_ready_timeout
        attempts = 0
        while True:
            attempts += 1
            result = self.tool.call(['docker', 'exec', container, 'pg_isready', '-U', user, '-d', database],
                                    'pg_isready', ok=(0, 1, 2, 3))
            if result.code == 0:
                return attempts
            if time.monotonic() >= deadline:
                raise BackupError('restore container not ready after %ss' % self.settings.restore_ready_timeout)
            self.sleep(2)

    def run(self, name=None, keep=False):
        os.umask(0o077)
        settings = self.settings
        started = self.clock()
        check_passphrase_file(settings.passphrase_file)
        require_directory(settings.dest_dir, 'destination')
        backup = self.select(name)
        manifest = read_json(backup.manifest)
        if not manifest or manifest.get('schema') != MANIFEST_SCHEMA:
            raise BackupError('manifest unreadable or unsupported schema: %s' % backup.manifest.name)
        token = started.strftime(STAMP_FORMAT) + '-' + secrets.token_hex(3)
        container = volume = RESTORE_PREFIX + token
        work = settings.stage_dir / ('restore-' + token)
        result = {'schema': 1, 'name': backup.name, 'started_at': started.isoformat(), 'status': 'failed',
                  'stage': 'prepare', 'scope': RESTORE_SCOPE, 'container': container, 'volume': volume}
        created_volume = created_container = False
        try:
            settings.stage_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
            work.mkdir(mode=0o700)
            result['stage'] = 'integrity'
            if sha256_file(backup.archive) != manifest['encrypted']['sha256']:
                raise BackupError('encrypted archive checksum does not match manifest')
            result['stage'] = 'decrypt'
            plain = work / 'plain.tar.gz'
            self.tool.call(openssl_decrypt_argv(backup.archive, plain, settings.passphrase_file,
                                                manifest['encrypted']['iterations']), 'openssl dec')
            if sha256_file(plain) != manifest['archive']['sha256']:
                raise BackupError('decrypted archive checksum does not match manifest')
            result['stage'] = 'extract'
            tree = work / 'tree'
            extracted = safe_extract(plain, tree)
            members = extracted['files'] + extracted['dirs'] + extracted['symlinks_skipped']
            if members != manifest['archive']['members']:
                raise BackupError('extracted member count %d != manifest %d' % (members, manifest['archive']['members']))
            plain.unlink()
            result['stage'] = 'config'
            result['config'] = verify_config_tree(tree / CONFIG_MEMBER_DIR, settings.expected_config_paths)
            result['services'] = self.verify_services(tree / SERVICES_MEMBER_DIR, manifest.get('services', []))
            result['secrets'] = verify_secrets(tree / SECRETS_MEMBER_DIR, manifest.get('secrets', {}).get('count'))
            result['docker_config'] = verify_docker_config(tree / DOCKER_CONFIG_MEMBER_DIR,
                                                           manifest.get('docker_config', {}))
            dump = tree / DUMP_MEMBER
            if not dump.is_file() or dump.stat().st_size != manifest['dump']['bytes']:
                raise BackupError('dump member missing or size mismatch after extraction')
            result['stage'] = 'start'
            image = settings.restore_image or manifest['postgres_image']
            user, database = self.restore_identity(manifest)
            result['image'] = image
            self.tool.call(['docker', 'volume', 'create', '--label', RESTORE_LABEL + '=1', volume], 'docker volume create')
            created_volume = True
            self.tool.call(self.run_argv(container, volume, image, user, database), 'docker run')
            created_container = True
            result['stage'] = 'ready'
            result['ready_attempts'] = self.wait_ready(container, user, database)
            result['stage'] = 'restore'
            self.tool.call(['docker', 'exec', '-i', container, 'pg_restore', '-U', user, '-d', database,
                            '--no-owner', '--no-acl', '--exit-on-error', '--single-transaction'],
                           'pg_restore', stdin_path=str(dump))
            result['stage'] = 'verify-db'
            counts = self.tool.call(['docker', 'exec', container, 'psql', '-U', user, '-d', database, '-At', '-F', '\t',
                                     '-v', 'ON_ERROR_STOP=1', '-c', ROW_COUNT_SQL], 'row counts')
            actual = parse_row_counts(counts.stdout.decode('utf-8', 'replace'))
            result['database'] = compare_counts(manifest['dump']['tables'], manifest.get('row_counts', {}), actual,
                                                settings.row_count_tolerance_percent, settings.row_count_tolerance_rows)
            result['database']['row_counts_note'] = manifest.get('row_counts_note', '')
            result['stage'] = 'done'
            checks = [result['database']['ok'], result['config']['ok'], result['services']['ok'],
                      result['secrets']['ok'], result['docker_config']['ok']]
            result['status'] = 'passed' if all(checks) else 'failed'
            if result['status'] == 'failed':
                result['error'] = 'verification mismatch'
        except (BackupError, OSError, KeyError, TypeError, ValueError) as error:
            result['error'] = '%s: %s' % (type(error).__name__, error)
            LOG.error('Restore test %s failed at stage %s (%s)', backup.name, result['stage'], type(error).__name__)
        finally:
            if keep:
                result['retained'] = {'container': container if created_container else None,
                                      'volume': volume if created_volume else None, 'workdir': str(work),
                                      'warning': 'retained resources contain production secrets'}
            else:
                result['cleanup'] = self.teardown(container if created_container else None,
                                                  volume if created_volume else None, work)
            result['finished_at'] = self.clock().isoformat()
            write_json_atomic(settings.last_restore_path, result)
        LOG.info('Restore test %s: %s (stage %s)', backup.name, result['status'], result['stage'])
        return result

    def restore_identity(self, manifest):
        """Role and database names as discovered at backup time (names only,
        no credentials); the throw-away instance uses trust auth on no network."""
        user = manifest.get('postgres_user') or 'dokploy'
        database = manifest.get('postgres_database') or user
        for value in (user, database):
            if not re.match(r'^[A-Za-z_][A-Za-z0-9_]{0,62}$', value):
                raise BackupError('manifest identity is not a plain identifier')
        return user, database

    def verify_services(self, directory, expected):
        found = {}
        for service in expected:
            path = pathlib.Path(directory) / (service + '.json')
            data = read_json(path)
            ok = isinstance(data, list) and len(data) == 1 and isinstance(data[0], dict) and 'Spec' in data[0]
            found[service] = {'present': path.is_file(), 'parseable': bool(ok)}
        return {'services': found, 'ok': all(v['present'] and v['parseable'] for v in found.values())}

    def teardown(self, container, volume, work):
        outcome = {'container_removed': None, 'volume_removed': None, 'workdir_removed': None}
        if container:
            try:
                self.tool.call(['docker', 'rm', '-f', container], 'docker rm')
                outcome['container_removed'] = True
            except BackupError:
                outcome['container_removed'] = False
        if volume:
            try:
                self.tool.call(['docker', 'volume', 'rm', volume], 'docker volume rm')
                outcome['volume_removed'] = True
            except BackupError:
                outcome['volume_removed'] = False
        shutil.rmtree(str(work), ignore_errors=True)
        outcome['workdir_removed'] = not pathlib.Path(work).exists()
        return outcome


def restore_cleanup(tool, apply=False):
    """List (and with ``apply`` remove) leftovers labelled by this runner only."""
    label = 'label=' + RESTORE_LABEL + '=1'
    containers = tool.call(['docker', 'ps', '-a', '-q', '--filter', label], 'docker ps').stdout.decode().split()
    volumes = tool.call(['docker', 'volume', 'ls', '-q', '--filter', label], 'docker volume ls').stdout.decode().split()
    report = {'mode': 'apply' if apply else 'dry-run', 'containers': containers, 'volumes': volumes,
              'removed_containers': [], 'removed_volumes': [], 'errors': []}
    if not apply:
        return report
    for container in containers:
        try:
            tool.call(['docker', 'rm', '-f', container], 'docker rm')
            report['removed_containers'].append(container)
        except BackupError as error:
            report['errors'].append(str(error))
    for volume in volumes:
        try:
            tool.call(['docker', 'volume', 'rm', volume], 'docker volume rm')
            report['removed_volumes'].append(volume)
        except BackupError as error:
            report['errors'].append(str(error))
    return report


# --------------------------------------------------------------------------- #
# Health
# --------------------------------------------------------------------------- #


def check(check_name, status, reason, **details):
    payload = {'status': status, 'reason': reason}
    payload.update(details)
    return check_name, payload


def worst(statuses):
    return max(statuses, key=lambda s: SEVERITY[s]) if statuses else UNKNOWN


def parse_time(text):
    try:
        value = datetime.datetime.fromisoformat(text)
    except (TypeError, ValueError):
        return None
    return value if value.tzinfo else value.replace(tzinfo=UTC)


def newest_check(name, directory, max_age, now, missing_status, role):
    if directory is None:
        return None
    try:
        complete, orphans, foreign = list_backups(directory)
    except OSError:
        return check(name, missing_status, '%s directory unreadable' % role)
    if not complete:
        return check(name, missing_status, 'no complete backup in %s directory' % role,
                     orphans=len(orphans), foreign=len(foreign))
    newest = complete[0]
    age = (now - newest.stamp).total_seconds()
    status = missing_status if age > max_age else OK
    return check(name, status, 'newest backup %s ago' % format_age(age), newest=newest.name,
                 age_seconds=int(age), complete=len(complete), orphans=len(orphans), foreign=len(foreign))


def build_health(settings, now):
    checks = dict([newest_check('backup', settings.dest_dir, settings.backup_max_age, now, CRITICAL, 'destination')])
    copy_check = newest_check('copy', settings.copy_dir, settings.copy_max_age, now, WARNING, 'copy')
    if copy_check:
        checks.update([copy_check])
    last_run = read_json(settings.last_run_path)
    if not last_run:
        checks.update([check('last_run', WARNING, 'no scheduler cycle recorded yet')])
    else:
        status = last_run.get('status', UNKNOWN)
        if status not in SEVERITY:
            status = UNKNOWN
        if status == CRITICAL:
            status = WARNING if checks['backup']['status'] == OK else CRITICAL
        checks.update([check('last_run', status, 'last cycle %s' % last_run.get('status', 'unknown'),
                             started_at=last_run.get('started_at'), stage=last_run.get('failed_stage'))])
    restore = read_json(settings.last_restore_path)
    if not restore:
        checks.update([check('restore_test', WARNING, 'restore rehearsal never recorded')])
    else:
        finished = parse_time(restore.get('finished_at'))
        age = (now - finished).total_seconds() if finished else None
        if restore.get('status') != 'passed':
            status, reason = CRITICAL, 'last restore rehearsal failed at stage %s' % restore.get('stage')
        elif age is None or age > settings.restore_max_age_days * 86400:
            status, reason = WARNING, 'last passed rehearsal is stale'
        else:
            status, reason = OK, 'rehearsal passed %s ago' % format_age(age)
        checks.update([check('restore_test', status, reason, name=restore.get('name'),
                             age_seconds=int(age) if age is not None else None)])
    if settings.s3_enabled:
        remote = read_json(settings.last_remote_path)
        newest = checks['backup'].get('newest')
        if not remote:
            checks.update([check('remote_copy', WARNING, 'no remote upload recorded yet')])
        elif remote.get('status') != OK:
            checks.update([check('remote_copy', CRITICAL, 'last remote upload failed', name=remote.get('name'),
                                 bucket=remote.get('bucket'))])
        else:
            finished = parse_time(remote.get('finished_at'))
            age = (now - finished).total_seconds() if finished else None
            if age is None or age > settings.s3_max_age:
                status, reason = CRITICAL, 'last verified remote copy is stale'
            elif newest and remote.get('name') != newest:
                status, reason = WARNING, 'newest local backup not yet verified remotely'
            else:
                status, reason = OK, 'remote copy verified %s ago' % format_age(age)
            checks.update([check('remote_copy', status, reason, name=remote.get('name'),
                                 bucket=remote.get('bucket'), age_seconds=int(age) if age is not None else None)])
    prune_reports = (last_run or {}).get('prune') or []
    if prune_reports:
        errors = sum(len(r.get('errors', [])) for r in prune_reports)
        pending = sum(len(r.get('would_delete', [])) for r in prune_reports)
        checks.update([check('prune', WARNING if errors else OK,
                             '%d errors, %d pending dry-run deletions' % (errors, pending),
                             mode=prune_reports[0].get('mode'))])
    status = worst([c['status'] for c in checks.values()])
    return {'schema': 1, 'component': 'control-plane-backup', 'generated_at': now.isoformat(),
            'status': status, 'checks': checks}


def write_health(settings, now):
    """Write health.json; additionally touch last-healthy.json whenever the
    overall status is not critical/unknown, so the existing database monitor
    can watch its mtime like any other ``last-success.json``."""
    report = build_health(settings, now)
    write_json_atomic(settings.health_path, report)
    if report['status'] in (OK, WARNING):
        write_json_atomic(settings.last_healthy_path, {'generated_at': now.isoformat(), 'status': report['status']})
    return report


def evaluate_report(text, now, max_age):
    """Mirror of the database monitor's rule: warnings pass, stale/critical/unknown fail."""
    try:
        report = json.loads(text)
        generated = parse_time(report['generated_at'])
        status = report['status']
    except (ValueError, KeyError, TypeError):
        return False, 'health report unparseable'
    if generated is None:
        return False, 'health report unparseable'
    age = (now - generated).total_seconds()
    if age < -60 or age > max_age:
        return False, 'health report stale (%ds)' % age
    if status not in SEVERITY or status in (CRITICAL, UNKNOWN):
        failing = sorted(name for name, item in report.get('checks', {}).items()
                         if item.get('status') in (CRITICAL, UNKNOWN))
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
# Scheduler
# --------------------------------------------------------------------------- #


def next_due(now, hhmm, last_started):
    """Most recent scheduled instant at/before ``now``; if the last cycle
    started before it the cycle is due immediately, else tomorrow's slot."""
    hour, minute = hhmm
    today = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
    due = today if today <= now else today - datetime.timedelta(days=1)
    if last_started is None or last_started < due:
        return due
    return due + datetime.timedelta(days=1)


class Scheduler:
    def __init__(self, settings, tool, clock=None, stop=None):
        self.settings = settings
        self.tool = tool
        self.clock = clock or (lambda: datetime.datetime.now(UTC))
        self.stop = stop or threading.Event()

    def restore_due(self, now):
        if self.settings.restore_interval_days <= 0:
            return False
        last = read_json(self.settings.last_restore_path)
        finished = parse_time((last or {}).get('finished_at'))
        if finished is None:
            return True
        return (now - finished).total_seconds() >= self.settings.restore_interval_days * 86400

    def cycle(self):
        settings = self.settings
        started = self.clock()
        record = {'started_at': started.isoformat(), 'status': OK, 'failed_stage': None,
                  'backup': None, 'prune': [], 'restore_test': None}
        try:
            record['backup'] = BackupJob(settings, self.tool, self.clock).run()
            if record['backup']['status'] != OK:
                record['status'] = WARNING
        except (BackupError, OSError) as error:
            record['status'] = CRITICAL
            record['failed_stage'] = 'backup'
            record['backup'] = {'status': CRITICAL, 'error': '%s: %s' % (type(error).__name__, error)}
            LOG.error('Backup failed (%s)', type(error).__name__)
        for directory in (settings.dest_dir, settings.copy_dir):
            if directory is None:
                continue
            try:
                record['prune'].append(prune(directory, settings, apply=settings.prune_apply, clock=self.clock))
            except (BackupError, OSError) as error:
                record['prune'].append({'directory': str(directory), 'errors': [type(error).__name__]})
                if record['status'] == OK:
                    record['status'] = WARNING
        if record['status'] != CRITICAL and self.restore_due(started):
            record['restore_test'] = RestoreTest(settings, self.tool, self.clock).run()
        record['finished_at'] = self.clock().isoformat()
        write_json_atomic(settings.last_run_path, record)
        write_health(settings, self.clock())
        return record

    def loop(self):
        settings = self.settings
        LOG.info('Scheduler: daily cycle at %02d:%02d UTC, tick %ss', settings.backup_time[0],
                 settings.backup_time[1], settings.tick_seconds)
        while not self.stop.is_set():
            now = self.clock()
            last = read_json(settings.last_run_path) or {}
            due = next_due(now, settings.backup_time, parse_time(last.get('started_at')))
            if due <= now:
                try:
                    with Lock(settings.lock_path):
                        latest = read_json(settings.last_run_path) or {}
                        if next_due(self.clock(), settings.backup_time,
                                    parse_time(latest.get('started_at'))) <= self.clock():
                            self.cycle()
                except BackupError:
                    LOG.info('Another backup operation is active; retry next tick')
                except Exception as error:  # noqa: BLE001 - keep the loop alive, never print output
                    LOG.error('Cycle crashed (%s)', type(error).__name__)
                    write_json_atomic(settings.last_run_path, {'started_at': now.isoformat(), 'status': CRITICAL,
                                                               'failed_stage': 'cycle',
                                                               'error': type(error).__name__})
            try:
                write_health(settings, self.clock())
            except OSError as error:
                LOG.error('Health write failed (%s)', type(error).__name__)
            self.stop.wait(settings.tick_seconds)


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #


def build_parser():
    parser = argparse.ArgumentParser(prog='backup_runner', description=__doc__.split('\n\n')[0])
    sub = parser.add_subparsers(dest='command', required=True)
    backup = sub.add_parser('backup', help='create, validate, encrypt and publish one backup now')
    backup.add_argument('--no-copy', action='store_true', help='skip the optional copy destination')
    prune_cmd = sub.add_parser('prune', help='apply retention (dry-run unless --apply)')
    prune_cmd.add_argument('--apply', action='store_true')
    prune_cmd.add_argument('--dir', action='append', help='directory to prune (default: destination and copy)')
    restore = sub.add_parser('restore-test', help='isolated full restore rehearsal')
    restore.add_argument('--name', help='backup name (default newest)')
    restore.add_argument('--keep', action='store_true', help='keep the restore container/volume/workdir (secrets!)')
    cleanup = sub.add_parser('restore-cleanup', help='remove leftover restore-test containers/volumes')
    cleanup.add_argument('--apply', action='store_true')
    sub.add_parser('status', help='print the secret-free health report')
    sub.add_parser('healthcheck', help='exit 0 when the health report is fresh and not critical')
    run = sub.add_parser('run', help='scheduler loop (default container command)')
    run.add_argument('--once', action='store_true', help='run one cycle now and exit')
    return parser


def main(argv=None):
    logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s', stream=sys.stderr)
    os.umask(0o077)
    args = build_parser().parse_args(argv)
    try:
        settings = Settings()
    except ValueError as error:
        print(str(error), file=sys.stderr)
        return 2
    tool = Tool(timeout=settings.command_timeout)
    try:
        if args.command == 'healthcheck':
            return healthcheck(settings)
        if args.command == 'status':
            print(json.dumps(build_health(settings, datetime.datetime.now(UTC)), sort_keys=True, indent=1))
            return 0
        settings.state_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
        if args.command == 'run' and not args.once:
            scheduler = Scheduler(settings, tool)
            for signum in (signal.SIGTERM, signal.SIGINT):
                signal.signal(signum, lambda *_: scheduler.stop.set())
            scheduler.loop()
            return 0
        with Lock(settings.lock_path):
            if args.command == 'restore-cleanup':
                print(json.dumps(restore_cleanup(tool, apply=args.apply), sort_keys=True, indent=1))
                return 0
            if args.command == 'backup':
                result = BackupJob(settings, tool).run(copy=not args.no_copy)
                write_health(settings, datetime.datetime.now(UTC))
                print(json.dumps(result, sort_keys=True, indent=1))
                return 0 if result['status'] == OK else 1
            if args.command == 'prune':
                directories = args.dir or [d for d in (settings.dest_dir, settings.copy_dir) if d is not None]
                reports = [prune(d, settings, apply=args.apply) for d in directories]
                print(json.dumps(reports, sort_keys=True, indent=1))
                return 1 if any(r['errors'] for r in reports) else 0
            if args.command == 'restore-test':
                result = RestoreTest(settings, tool).run(name=args.name, keep=args.keep)
                write_health(settings, datetime.datetime.now(UTC))
                print(json.dumps(result, sort_keys=True, indent=1))
                return 0 if result['status'] == 'passed' else 1
            if args.command == 'run':
                scheduler = Scheduler(settings, tool)
                if args.once:
                    record = scheduler.cycle()
                    print(json.dumps(record, sort_keys=True, indent=1))
                    return 0 if record['status'] == OK else 1
                for signum in (signal.SIGTERM, signal.SIGINT):
                    signal.signal(signum, lambda *_: scheduler.stop.set())
                scheduler.loop()
                return 0
    except BackupError as error:
        LOG.error('%s', error)
        return 1
    return 2


if __name__ == '__main__':
    sys.exit(main())
