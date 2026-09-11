"""Unit tests for the control-plane backup runner.

Run from the repository root:

    python3 -m unittest discover -s deploy/ha/control-plane-backup -v

No test touches Docker, PostgreSQL, the network or real Dokploy files: every
``docker`` command is answered by a fake; ``openssl`` is the real binary
(skipped if absent) so the encrypt/decrypt round trip is genuine.
"""
import datetime
import io
import json
import os
import pathlib
import shutil
import stat
import subprocess
import sys
import tarfile
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import backup_runner as mod  # noqa: E402
import s3_upload  # noqa: E402

UTC = datetime.timezone.utc
NOW = datetime.datetime(2026, 9, 10, 4, 15, tzinfo=UTC)
SECRET = 'hunter2-super-secret-token'
DUMP = b'PGDMP\x01fake-custom-dump-' + SECRET.encode() + b'\x00' * 64
TOC = (';\n; Archive created at 2026-09-10 04:15:00 UTC\n;\n'
       '10; 0 0 ENCODING - ENCODING\n'
       '200; 1259 16400 TABLE public application dokploy\n'
       '3000; 0 16400 TABLE DATA public application dokploy\n'
       '3001; 0 16410 TABLE DATA public project dokploy\n'
       '3002; 0 16420 TABLE DATA public "user" dokploy\n')
COUNTS = 'application\t3\nproject\t2\nuser\t1\n'
SECRET_VALUES = {'/run/secrets/postgres_password': b'pg-' + SECRET.encode() + b'\n',
                 '/run/secrets/dokploy_auth_secret': b'auth-' + SECRET.encode()}
SERVICE_SECRETS = {
    'dokploy': [{'SecretName': 'dokploy_auth_secret', 'SecretID': 'id1',
                 'File': {'Name': 'dokploy_auth_secret', 'UID': '0', 'GID': '0', 'Mode': 292}}],
    'dokploy-postgres': [{'SecretName': 'postgres_password', 'SecretID': 'id2',
                          'File': {'Name': '/run/secrets/postgres_password', 'UID': '0', 'GID': '0', 'Mode': 292}}],
    'dokploy-redis': [],
}
OPENSSL = shutil.which('openssl')


def result(code=0, stdout=b'', stderr=b''):
    return mod.Result(code, stdout, stderr)


class FakeRunner:
    """Answers docker commands from canned data; delegates openssl to the real binary."""

    def __init__(self):
        self.calls = []
        self.fail = set()
        self.service_ids = {'dokploy-postgres': ['abc123'], 'dokploy': ['def456'], 'dokploy-redis': ['ghi789']}
        self.secrets = dict(SECRET_VALUES)
        self.service_secrets = {k: list(v) for k, v in SERVICE_SECRETS.items()}
        self.toc = TOC
        self.counts = COUNTS
        self.restored_counts = COUNTS
        self.containers = set()
        self.volumes = set()
        self.ready_after = 1
        self._ready_calls = 0
        self.real = mod.ProcessRunner()

    def kinds(self):
        return [self.classify(argv) for argv in self.calls]

    @staticmethod
    def classify(argv):
        if argv[0] == 'openssl':
            return 'openssl'
        head = argv[:2]
        if head == ['docker', 'exec']:
            for tool in ('pg_dump', 'pg_isready', 'psql'):
                if tool in argv:
                    return tool
            if argv[3] == 'cat':
                return 'secret_read'
            if 'pg_restore' in argv:
                return 'pg_restore_list' if '--list' in argv else 'pg_restore'
        if argv[:3] == ['docker', 'service', 'inspect']:
            return 'service_inspect'
        if head == ['docker', 'volume']:
            return 'volume_' + argv[2]
        return '_'.join(head)

    def run(self, argv, stdin_path=None, stdout_path=None, timeout=None):
        argv = list(argv)
        self.calls.append(argv)
        kind = self.classify(argv)
        if kind == 'openssl':
            return self.real.run(argv, stdin_path, stdout_path, timeout)
        if kind in self.fail:
            return result(1, b'', ('failure mentioning ' + SECRET).encode())
        return getattr(self, 'do_' + kind)(argv, stdin_path, stdout_path)

    def do_docker_ps(self, argv, *_):
        label = argv[argv.index('--filter') + 1]
        if mod.RESTORE_LABEL in label:
            return result(0, '\n'.join(sorted(self.containers)).encode())
        service = label.rpartition('=')[2]
        return result(0, '\n'.join(self.service_ids.get(service, [])).encode())

    def do_docker_inspect(self, argv, *_):
        payload = [{'Config': {'Env': ['PATH=/usr/bin', 'POSTGRES_USER=dokploy', 'POSTGRES_DB=dokploydb',
                                       'POSTGRES_PASSWORD_FILE=/run/secrets/postgres_password',
                                       'HIDDEN=' + SECRET],
                               'Image': 'postgres:16.4'}}]
        return result(0, json.dumps(payload).encode())

    def do_service_inspect(self, argv, stdin_path, stdout_path):
        payload = [{'Spec': {'Name': argv[3], 'TaskTemplate': {'ContainerSpec': {
            'Env': ['TOKEN=' + SECRET], 'Secrets': self.service_secrets.get(argv[3], [])}}}}]
        pathlib.Path(stdout_path).write_bytes(json.dumps(payload).encode())
        return result(0)

    def do_secret_read(self, argv, stdin_path, stdout_path):
        value = self.secrets.get(argv[4])
        if value is None:
            return result(1, b'', b'cat: no such file')
        pathlib.Path(stdout_path).write_bytes(value)
        return result(0)

    def do_pg_dump(self, argv, stdin_path, stdout_path):
        pathlib.Path(stdout_path).write_bytes(DUMP)
        return result(0, b'', ('pg_dump: warning about ' + SECRET).encode())

    def do_pg_restore_list(self, argv, stdin_path, stdout_path):
        assert pathlib.Path(stdin_path).read_bytes() == DUMP
        return result(0, self.toc.encode())

    def do_psql(self, argv, *_):
        container = argv[2]
        if container.startswith(mod.RESTORE_PREFIX):
            return result(0, self.restored_counts.encode())
        return result(0, self.counts.encode())

    def do_volume_create(self, argv, *_):
        self.volumes.add(argv[-1])
        return result(0, argv[-1].encode())

    def do_volume_rm(self, argv, *_):
        self.volumes.discard(argv[-1])
        return result(0)

    def do_volume_ls(self, argv, *_):
        return result(0, '\n'.join(sorted(self.volumes)).encode())

    def do_docker_run(self, argv, *_):
        self.containers.add(argv[argv.index('--name') + 1])
        return result(0, b'containerid\n')

    def do_docker_rm(self, argv, *_):
        self.containers.discard(argv[-1])
        return result(0)

    def do_pg_isready(self, argv, *_):
        self._ready_calls += 1
        return result(0 if self._ready_calls >= self.ready_after else 1)

    def do_pg_restore(self, argv, stdin_path, stdout_path):
        assert pathlib.Path(stdin_path).read_bytes() == DUMP
        return result(0)


class Sandbox(unittest.TestCase):
    """Temporary tree: destination, copy, state, stage, passphrase, /etc/dokploy."""

    def setUp(self):
        self.root = pathlib.Path(tempfile.mkdtemp(prefix='cpb-test-'))
        self.addCleanup(shutil.rmtree, str(self.root), True)
        self.old_umask = os.umask(0o077)
        self.addCleanup(os.umask, self.old_umask)
        for name in ('dest', 'copy', 'state', 'stage'):
            (self.root / name).mkdir(mode=0o700)
        self.passphrase = self.root / 'passphrase'
        self.passphrase.write_text('correct horse battery staple\n')
        os.chmod(str(self.passphrase), 0o600)
        etc = self.root / 'etc-dokploy'
        (etc / 'traefik' / 'dynamic').mkdir(parents=True)
        (etc / 'traefik' / 'traefik.yml').write_text('entryPoints: {}\n')
        (etc / 'traefik' / 'dynamic' / 'app.yml').write_text('http: {}\n')
        (etc / '.env').write_text('DATABASE_PASSWORD=' + SECRET + '\n')
        (etc / 'applications' / 'app1' / 'code' / 'src').mkdir(parents=True)
        (etc / 'applications' / 'app1' / 'code' / 'src' / 'index.js').write_text('x' * 1000)
        (etc / 'applications' / 'app1' / 'code' / 'node_modules').mkdir()
        (etc / 'applications' / 'app1' / 'logs').mkdir()
        (etc / 'applications' / 'app1' / 'logs' / 'deploy.log').write_text('log')
        (etc / 'applications' / 'app1' / '.git').mkdir()
        (etc / 'applications' / 'app1' / '.git' / 'HEAD').write_text('ref')
        (etc / 'applications' / 'app1' / 'compose.yml').write_text('services: {}\n')
        os.symlink('/etc/hostname', str(etc / 'hostname-link'))
        self.etc = etc
        self.runner = FakeRunner()
        self.tool = mod.Tool(self.runner, timeout=30)
        self.clock_now = NOW

    def clock(self):
        return self.clock_now

    def env(self, **overrides):
        values = {'DEST_DIR': str(self.root / 'dest'), 'COPY_DIR': str(self.root / 'copy'),
                  'STATE_DIR': str(self.root / 'state'), 'STAGE_DIR': str(self.root / 'stage'),
                  'PASSPHRASE_FILE': str(self.passphrase), 'DOKPLOY_ETC': str(self.etc),
                  'PBKDF2_ITERATIONS': '100000'}
        values.update({k: str(v) for k, v in overrides.items()})
        return {'CPB_' + k: v for k, v in values.items() if v != ''}

    def settings(self, **overrides):
        return mod.Settings(self.env(**overrides))

    def job(self, settings=None, uploader=None):
        return mod.BackupJob(settings or self.settings(), self.tool, self.clock, uploader=uploader or self.no_upload)

    @staticmethod
    def no_upload(*_):
        raise AssertionError('uploader must not be called when S3 is disabled')

    def make_backup(self, directory, stamp, manifest=True, archive=True):
        name = mod.PREFIX + stamp
        directory = pathlib.Path(directory)
        if archive:
            (directory / (name + mod.ARCHIVE_SUFFIX)).write_bytes(b'enc')
        if manifest:
            import hashlib
            (directory / (name + mod.MANIFEST_SUFFIX)).write_text(json.dumps({
                'name': name, 'validated': True, 'decrypt_verified': True,
                'encrypted': {'bytes': 3, 'sha256': hashlib.sha256(b'enc').hexdigest()}}))
        return name

    def assert_no_secret(self, *texts):
        for text in texts:
            self.assertNotIn(SECRET, text)


# --------------------------------------------------------------------------- #
# Settings and preconditions
# --------------------------------------------------------------------------- #


class SettingsTests(Sandbox):
    def test_defaults_and_overrides(self):
        settings = self.settings(BACKUP_TIME_UTC='23:59', KEEP_DAILY='9')
        self.assertEqual(settings.backup_time, (23, 59))
        self.assertEqual(settings.keep_daily, 9)
        self.assertEqual(settings.keep_weekly, 4)
        self.assertEqual(settings.keep_monthly, 3)
        self.assertFalse(settings.prune_apply)
        self.assertFalse(settings.s3_enabled)
        self.assertEqual(settings.s3_bucket, 'pointfinder-prod-backups-202609')
        self.assertEqual(settings.s3_prefix, 'control-plane/')

    def test_invalid_values_rejected(self):
        for overrides in ({'BACKUP_TIME_UTC': '25:00'}, {'BACKUP_TIME_UTC': 'noon'}, {'KEEP_DAILY': '0'},
                          {'PBKDF2_ITERATIONS': '1000'}, {'TICK_SECONDS': '1'}):
            with self.assertRaises(ValueError):
                self.settings(**overrides)

    def test_passphrase_file_rules(self):
        mod.check_passphrase_file(self.passphrase)
        os.chmod(str(self.passphrase), 0o640)
        with self.assertRaisesRegex(mod.BackupError, 'group/world'):
            mod.check_passphrase_file(self.passphrase)
        os.chmod(str(self.passphrase), 0o600)
        self.passphrase.write_text('')
        with self.assertRaisesRegex(mod.BackupError, 'empty'):
            mod.check_passphrase_file(self.passphrase)
        with self.assertRaisesRegex(mod.BackupError, 'missing'):
            mod.check_passphrase_file(self.root / 'nope')
        link = self.root / 'link'
        os.symlink(str(self.passphrase), str(link))
        with self.assertRaisesRegex(mod.BackupError, 'regular'):
            mod.check_passphrase_file(link)

    def test_backup_refuses_missing_destination(self):
        shutil.rmtree(str(self.root / 'dest'))
        with self.assertRaisesRegex(mod.BackupError, 'destination'):
            self.job().run()
        self.assertEqual(self.runner.calls, [])


# --------------------------------------------------------------------------- #
# Inventory, TOC and archive helpers
# --------------------------------------------------------------------------- #


class InventoryTests(Sandbox):
    def test_only_exact_own_format_pairs_are_complete(self):
        dest = self.root / 'dest'
        self.make_backup(dest, '20260910T041500Z')
        self.make_backup(dest, '20260909T041500Z')
        self.make_backup(dest, '20260908T041500Z', manifest=False)          # orphan archive
        self.make_backup(dest, '20260907T041500Z', archive=False)           # orphan manifest
        self.make_backup(dest, '20261399T041500Z')                          # impossible date
        (dest / 'dokploy-control-plane-20260910T083014Z.tar.gz').write_bytes(b'legacy')
        (dest / 'notes.txt').write_text('x')
        os.symlink(str(dest / 'notes.txt'), str(dest / 'dokploy-control-plane-20260906T041500Z.tar.gz.enc'))
        (dest / '.incoming').mkdir()
        complete, orphans, foreign = mod.list_backups(dest)
        self.assertEqual([b.name for b in complete], ['dokploy-control-plane-20260910T041500Z',
                                                      'dokploy-control-plane-20260909T041500Z'])
        self.assertEqual(orphans, ['dokploy-control-plane-20260908T041500Z.tar.gz.enc',
                                   'dokploy-control-plane-20260907T041500Z.manifest.json'])
        self.assertIn('dokploy-control-plane-20260910T083014Z.tar.gz', foreign)
        self.assertIn('notes.txt', foreign)
        self.assertIn('dokploy-control-plane-20260906T041500Z.tar.gz.enc', foreign)
        self.assertIn('dokploy-control-plane-20261399T041500Z.tar.gz.enc', foreign)

    def test_parse_toc_counts_entries_and_public_tables(self):
        entries, tables = mod.parse_toc(TOC)
        self.assertEqual(entries, 5)
        self.assertEqual(tables, ['application', 'project', 'user'])

    def test_parse_row_counts(self):
        self.assertEqual(mod.parse_row_counts(COUNTS), {'application': 3, 'project': 2, 'user': 1})
        with self.assertRaises(mod.BackupError):
            mod.parse_row_counts('garbage-without-tab')

    def test_build_archive_excludes_and_keeps_symlinks(self):
        dump = self.root / 'd.dump'
        dump.write_bytes(DUMP)
        service = self.root / 'dokploy.json'
        service.write_text('[]')
        target = self.root / 'plain.tar.gz'
        stats = mod.build_archive(target, [(dump, mod.DUMP_MEMBER), (service, 'services/dokploy.json')],
                                  [(self.etc, mod.CONFIG_MEMBER_DIR)])
        with tarfile.open(str(target)) as tar:
            names = tar.getnames()
            links = [m for m in tar.getmembers() if m.issym()]
        self.assertIn(mod.DUMP_MEMBER, names)
        self.assertIn('services/dokploy.json', names)
        self.assertIn('etc/dokploy/traefik/traefik.yml', names)
        self.assertIn('etc/dokploy/applications/app1/compose.yml', names)
        self.assertIn('etc/dokploy/.env', names)
        for excluded in ('code', 'logs', '.git', 'node_modules'):
            self.assertFalse(any('/' + excluded + '/' in n or n.endswith('/' + excluded) for n in names), excluded)
        self.assertEqual([m.name for m in links], ['etc/dokploy/hostname-link'])
        tree = stats['trees'][mod.CONFIG_MEMBER_DIR]
        self.assertEqual(tree['excluded_dirs'], 3)  # code, logs, .git (node_modules sits under code)
        self.assertEqual(tree['symlinks'], 1)
        self.assertEqual(tree['files'], 4)
        self.assertEqual(stats['members'], len(names))
        self.assertEqual(mod.validate_archive(target, len(DUMP), stats['members']), stats['members'])

    def test_validate_archive_rejects_corruption_and_missing_dump(self):
        dump = self.root / 'd.dump'
        dump.write_bytes(DUMP)
        target = self.root / 'plain.tar.gz'
        stats = mod.build_archive(target, [(dump, mod.DUMP_MEMBER)], [(self.etc, mod.CONFIG_MEMBER_DIR)])
        with self.assertRaisesRegex(mod.BackupError, 'size mismatch'):
            mod.validate_archive(target, len(DUMP) + 1, stats['members'])
        with self.assertRaisesRegex(mod.BackupError, 'member count'):
            mod.validate_archive(target, len(DUMP), stats['members'] + 1)
        data = bytearray(target.read_bytes())
        data[len(data) // 2] ^= 0xFF
        target.write_bytes(bytes(data))
        with self.assertRaises(mod.BackupError):
            mod.validate_archive(target, len(DUMP), stats['members'])

    def test_safe_extract_rejects_traversal_and_skips_symlinks(self):
        evil = self.root / 'evil.tar.gz'
        with tarfile.open(str(evil), 'w:gz') as tar:
            info = tarfile.TarInfo('../escape')
            info.size = 1
            tar.addfile(info, io.BytesIO(b'x'))
        with self.assertRaisesRegex(mod.BackupError, 'unsafe'):
            mod.safe_extract(evil, self.root / 'out')
        absolute = self.root / 'abs.tar.gz'
        with tarfile.open(str(absolute), 'w:gz') as tar:
            info = tarfile.TarInfo('/etc/passwd')
            info.size = 1
            tar.addfile(info, io.BytesIO(b'x'))
        with self.assertRaisesRegex(mod.BackupError, 'unsafe'):
            mod.safe_extract(absolute, self.root / 'out2')
        dump = self.root / 'd.dump'
        dump.write_bytes(DUMP)
        good = self.root / 'good.tar.gz'
        mod.build_archive(good, [(dump, mod.DUMP_MEMBER)], [(self.etc, mod.CONFIG_MEMBER_DIR)])
        counts = mod.safe_extract(good, self.root / 'tree')
        self.assertEqual(counts['symlinks_skipped'], 1)
        self.assertFalse((self.root / 'tree' / 'etc/dokploy/hostname-link').exists())
        self.assertTrue((self.root / 'tree' / 'etc/dokploy/traefik/traefik.yml').is_file())


# --------------------------------------------------------------------------- #
# Backup job
# --------------------------------------------------------------------------- #


@unittest.skipUnless(OPENSSL, 'openssl binary required for the encryption round trip')
class BackupJobTests(Sandbox):
    def test_backup_publishes_encrypted_archive_and_manifest(self):
        with self.assertLogs(mod.LOG, level='DEBUG') as logs:
            outcome = self.job().run()
        self.assertEqual(outcome['status'], 'ok')
        dest = self.root / 'dest'
        archive = dest / ('dokploy-control-plane-20260910T041500Z' + mod.ARCHIVE_SUFFIX)
        manifest_path = dest / ('dokploy-control-plane-20260910T041500Z' + mod.MANIFEST_SUFFIX)
        self.assertTrue(archive.is_file())
        self.assertEqual(stat.S_IMODE(archive.stat().st_mode), 0o600)
        manifest = json.loads(manifest_path.read_text())
        self.assertEqual(manifest['dump']['tables'], ['application', 'project', 'user'])
        self.assertEqual(manifest['dump']['bytes'], len(DUMP))
        self.assertEqual(manifest['row_counts'], {'application': 3, 'project': 2, 'user': 1})
        self.assertEqual(manifest['postgres_user'], 'dokploy')
        self.assertEqual(manifest['postgres_database'], 'dokploydb')
        self.assertEqual(manifest['postgres_image'], 'postgres:16.4')
        self.assertEqual(manifest['encrypted']['sha256'], mod.sha256_file(archive))
        self.assertEqual(manifest['config']['files'], 4)  # index.js, deploy.log, HEAD are excluded
        self.assertEqual(manifest['config']['excluded_dirs'], 3)
        self.assertTrue(manifest['validated'] and manifest['decrypt_verified'])
        self.assertEqual(manifest['secrets'], {'count': 2, 'services': {'dokploy': 1, 'dokploy-postgres': 1,
                                                                        'dokploy-redis': 0}})
        self.assertEqual(manifest['docker_config'], {'captured': False})
        # the sidecar manifest names no secret and holds no hash of one
        self.assertNotIn('postgres_password', manifest_path.read_text())
        self.assertNotIn('dokploy_auth_secret', manifest_path.read_text())
        # the encrypted file is opaque: no dump magic, no secret
        blob = archive.read_bytes()
        self.assertTrue(blob.startswith(b'Salted__'))
        self.assertNotIn(SECRET.encode(), blob)
        self.assertNotIn(b'PGDMP', blob)
        # staging and incoming are cleaned; nothing else was left in dest
        self.assertEqual(os.listdir(str(self.root / 'stage')), [])
        self.assertEqual(os.listdir(str(dest / '.incoming')), [])
        self.assertEqual(sorted(os.listdir(str(dest))), sorted(['.incoming', archive.name, manifest_path.name]))
        # copy destination has verified duplicates
        self.assertEqual(outcome['copy']['status'], 'ok')
        self.assertEqual(mod.sha256_file(self.root / 'copy' / archive.name), manifest['encrypted']['sha256'])
        # last-success is written; secrets appear nowhere
        success = json.loads((self.root / 'state' / 'last-success.json').read_text())
        self.assertEqual(success['name'], manifest['name'])
        self.assert_no_secret('\n'.join(logs.output), manifest_path.read_text(), json.dumps(outcome))

    def test_decrypt_round_trip_reproduces_the_plain_archive(self):
        self.job().run()
        archive = next((self.root / 'dest').glob('*.enc'))
        manifest = json.loads(next((self.root / 'dest').glob('*.manifest.json')).read_text())
        plain = self.root / 'plain.tar.gz'
        subprocess.run(mod.openssl_decrypt_argv(archive, plain, self.passphrase, manifest['encrypted']['iterations']),
                       check=True, capture_output=True)
        self.assertEqual(mod.sha256_file(plain), manifest['archive']['sha256'])
        with tarfile.open(str(plain)) as tar:
            self.assertEqual(tar.extractfile(mod.DUMP_MEMBER).read(), DUMP)
            self.assertEqual(tar.extractfile('secrets/dokploy-postgres/postgres_password').read(),
                             SECRET_VALUES['/run/secrets/postgres_password'])
            self.assertEqual(tar.extractfile('secrets/dokploy/dokploy_auth_secret').read(),
                             SECRET_VALUES['/run/secrets/dokploy_auth_secret'])
            secrets = json.loads(tar.extractfile(mod.SECRETS_MANIFEST_MEMBER).read())
            self.assertEqual(sorted(e['target'] for e in secrets['secrets']), sorted(SECRET_VALUES))
            entry = [e for e in secrets['secrets'] if e['name'] == 'postgres_password'][0]
            self.assertEqual(entry['service'], 'dokploy-postgres')
            self.assertEqual(entry['bytes'], len(SECRET_VALUES['/run/secrets/postgres_password']))
            self.assertEqual(entry['mode'], 292)
            self.assertEqual(len(entry['sha256']), 64)

    def test_secret_reads_go_straight_to_staging(self):
        self.job().run()
        reads = [a for a in self.runner.calls if a[:2] == ['docker', 'exec'] and a[3] == 'cat']
        self.assertEqual(sorted(a[4] for a in reads), sorted(SECRET_VALUES))
        self.assertEqual({a[2] for a in reads}, {'abc123', 'def456'})
        self.assertEqual(os.listdir(str(self.root / 'stage')), [])

    def test_missing_or_empty_secret_fails_the_backup(self):
        self.runner.secrets.pop('/run/secrets/dokploy_auth_secret')
        with self.assertRaisesRegex(mod.BackupError, 'secret read exited 1'):
            self.job().run()
        self.runner.secrets['/run/secrets/dokploy_auth_secret'] = b''
        with self.assertRaisesRegex(mod.BackupError, 'empty'):
            self.job().run()
        self.runner.secrets = dict(SECRET_VALUES)
        self.runner.service_ids['dokploy'] = []
        with self.assertRaisesRegex(mod.BackupError, 'exactly one running dokploy container'):
            self.job().run()
        self.assertEqual(sorted(os.listdir(str(self.root / 'dest'))), ['.incoming'])

    def test_service_without_secrets_needs_no_container(self):
        self.runner.service_ids['dokploy-redis'] = []
        self.assertEqual(self.job().run()['secrets'], 2)

    def test_docker_client_config_capture_is_optional(self):
        docker_dir = self.root / 'root-docker'
        docker_dir.mkdir(mode=0o700)
        (docker_dir / 'config.json').write_text(json.dumps({'auths': {'ghcr.io': {'auth': SECRET}}}))
        settings = self.settings(DOCKER_CONFIG_DIR=str(docker_dir))
        outcome = self.job(settings).run(copy=False)
        self.assertTrue(outcome['docker_config'])
        manifest_path = next(settings.dest_dir.glob('*.manifest.json'))
        manifest = json.loads(manifest_path.read_text())
        self.assertEqual(manifest['docker_config']['files'], 1)
        self.assert_no_secret(manifest_path.read_text())
        plain = self.root / 'plain.tar.gz'
        subprocess.run(mod.openssl_decrypt_argv(next(settings.dest_dir.glob('*.enc')), plain, self.passphrase,
                                                manifest['encrypted']['iterations']), check=True, capture_output=True)
        with tarfile.open(str(plain)) as tar:
            self.assertIn('root/.docker/config.json', tar.getnames())
        shutil.rmtree(str(docker_dir))
        with self.assertRaisesRegex(mod.BackupError, 'Docker client configuration'):
            self.job(settings).run(copy=False)

    def test_passphrase_never_appears_in_argv(self):
        self.job().run()
        for argv in self.runner.calls:
            self.assertNotIn('correct horse battery staple', ' '.join(argv))
        openssl = [a for a in self.runner.calls if a[0] == 'openssl']
        self.assertEqual(len(openssl), 2)
        for argv in openssl:
            self.assertIn('-pbkdf2', argv)
            self.assertIn('-aes-256-cbc', argv)
            self.assertIn('file:' + str(self.passphrase), argv)

    def test_pg_dump_is_custom_format_without_owner_or_acl(self):
        self.job().run()
        dump = [a for a in self.runner.calls if 'pg_dump' in a][0]
        self.assertEqual(dump[:3], ['docker', 'exec', 'abc123'])
        for flag in ('--format=custom', '--no-owner', '--no-acl'):
            self.assertIn(flag, dump)
        self.assertIn(['docker', 'exec', '-i', 'abc123', 'pg_restore', '--list'], self.runner.calls)

    def test_failed_validation_publishes_nothing(self):
        for kind in ('pg_dump', 'pg_restore_list', 'service_inspect', 'docker_inspect', 'secret_read'):
            self.runner.fail = {kind}
            with self.assertLogs(mod.LOG, level='DEBUG') as logs:
                with self.assertRaises(mod.BackupError) as raised:
                    self.job().run()
            self.assert_no_secret(str(raised.exception), '\n'.join(logs.output))
            self.assertEqual(sorted(os.listdir(str(self.root / 'dest'))), ['.incoming'], kind)
            self.assertEqual(os.listdir(str(self.root / 'stage')), [], kind)
            self.assertFalse((self.root / 'state' / 'last-success.json').exists(), kind)

    def test_empty_toc_is_rejected(self):
        self.runner.toc = ';\n; only comments\n'
        with self.assertRaisesRegex(mod.BackupError, 'empty'):
            self.job().run()
        self.assertEqual(sorted(os.listdir(str(self.root / 'dest'))), ['.incoming'])

    def test_container_discovery_requires_exactly_one(self):
        for ids in ([], ['a', 'b']):
            self.runner.service_ids['dokploy-postgres'] = ids
            with self.assertRaisesRegex(mod.BackupError, 'exactly one'):
                self.job().run()

    def test_copy_failure_is_warning_and_keeps_primary(self):
        shutil.rmtree(str(self.root / 'copy'))
        settings = self.settings()
        with self.assertRaisesRegex(mod.BackupError, 'copy destination'):
            self.job(settings).run()
        (self.root / 'copy').mkdir()
        os.chmod(str(self.root / 'copy'), 0o500)
        self.addCleanup(os.chmod, str(self.root / 'copy'), 0o700)
        if os.geteuid() == 0:
            self.skipTest('root ignores directory permissions')
        outcome = self.job(settings).run()
        self.assertEqual(outcome['status'], 'warning')
        self.assertEqual(outcome['copy']['status'], 'warning')
        self.assertEqual(len(list((self.root / 'dest').glob('*.enc'))), 1)
        self.assertFalse((self.root / 'state' / 'last-success.json').exists())

    def test_no_copy_flag_skips_copy(self):
        outcome = self.job().run(copy=False)
        self.assertIsNone(outcome['copy'])
        self.assertEqual(os.listdir(str(self.root / 'copy')), [])

    def test_stray_incoming_file_is_replaced_not_published(self):
        incoming = self.root / 'dest' / '.incoming'
        incoming.mkdir()
        stray = incoming / ('dokploy-control-plane-20260910T041500Z' + mod.ARCHIVE_SUFFIX)
        stray.write_bytes(b'partial')
        self.job().run()
        self.assertFalse(stray.exists())
        self.assertTrue((self.root / 'dest' / stray.name).read_bytes().startswith(b'Salted__'))


@unittest.skipUnless(OPENSSL, 'openssl binary required for the encryption round trip')
class RemoteCopyTests(Sandbox):
    def setUp(self):
        super().setUp()
        self.credentials = self.root / 's3.json'
        self.credentials.write_text(json.dumps({'endpoint': 'https://example.invalid', 'access_key': 'AK',
                                                'secret_key': SECRET}))
        os.chmod(str(self.credentials), 0o600)
        self.uploads = []

    def uploader(self, archive, manifest, settings, expected_sha):
        self.uploads.append((archive.name, manifest.name, settings.s3_bucket, settings.s3_prefix))
        return {'status': 'ok', 'sha256': expected_sha, 'key': settings.s3_prefix + archive.name, 'bytes': 1}

    def test_remote_success_is_required_for_success(self):
        settings = self.settings(S3_CREDENTIALS_FILE=str(self.credentials))
        outcome = self.job(settings, uploader=self.uploader).run()
        self.assertEqual(outcome['status'], 'ok')
        self.assertEqual(self.uploads[0][2:], ('pointfinder-prod-backups-202609', 'control-plane/'))
        remote = json.loads(settings.last_remote_path.read_text())
        self.assertEqual(remote['status'], 'ok')
        self.assertTrue(settings.last_success_path.exists())
        self.assertTrue(json.loads(settings.last_success_path.read_text())['remote_verified'])
        health = mod.write_health(settings, NOW + datetime.timedelta(minutes=5))
        self.assertEqual(health['checks']['remote_copy']['status'], 'ok')
        self.assertEqual(health['status'], 'warning')  # restore rehearsal / cycle not recorded yet

    def test_remote_failure_is_critical_and_never_marks_success(self):
        settings = self.settings(S3_CREDENTIALS_FILE=str(self.credentials))

        def failing(archive, manifest, s, sha):
            raise RuntimeError('endpoint https://x?X-Amz-Signature=' + SECRET)

        with self.assertLogs(mod.LOG, level='DEBUG') as logs:
            outcome = self.job(settings, uploader=failing).run()
        self.assertEqual(outcome['status'], 'critical')
        self.assertEqual(outcome['remote']['status'], 'critical')
        self.assertEqual(outcome['remote']['error'], 'RuntimeError')
        self.assertFalse(settings.last_success_path.exists())
        self.assertEqual(len(list(settings.dest_dir.glob('*.enc'))), 1)  # local copy stays published
        self.assert_no_secret('\n'.join(logs.output), settings.last_remote_path.read_text(), json.dumps(outcome))
        health = mod.write_health(settings, NOW)
        self.assertEqual(health['checks']['remote_copy']['status'], 'critical')
        self.assertEqual(health['status'], 'critical')
        self.assertFalse(settings.last_healthy_path.exists())

    def test_remote_checksum_mismatch_is_failure(self):
        settings = self.settings(S3_CREDENTIALS_FILE=str(self.credentials))
        outcome = self.job(settings, uploader=lambda a, m, s, sha: {'status': 'ok', 'sha256': 'deadbeef'}).run()
        self.assertEqual(outcome['status'], 'critical')
        self.assertEqual(outcome['remote']['error'], 'BackupError')

    def test_credentials_file_must_be_protected(self):
        os.chmod(str(self.credentials), 0o644)
        settings = self.settings(S3_CREDENTIALS_FILE=str(self.credentials))
        with self.assertRaisesRegex(mod.BackupError, 'group/world'):
            self.job(settings, uploader=self.uploader).run()
        self.assertEqual(self.runner.calls, [])

    def test_stale_remote_copy_is_critical(self):
        settings = self.settings(S3_CREDENTIALS_FILE=str(self.credentials))
        self.job(settings, uploader=self.uploader).run()
        later = NOW + datetime.timedelta(hours=49)
        self.assertEqual(mod.build_health(settings, later)['checks']['remote_copy']['status'], 'critical')
        self.make_backup(settings.dest_dir, '20260911T041500Z')
        soon = NOW + datetime.timedelta(hours=24, minutes=1)
        remote = mod.build_health(settings, soon)['checks']['remote_copy']
        self.assertEqual(remote['status'], 'warning')
        self.assertIn('not yet verified', remote['reason'])


class S3UploadTests(Sandbox):
    class FakeClient:
        def __init__(self, corrupt=False):
            self.calls = []
            self.objects = {}
            self.corrupt = corrupt

        def put_object(self, Bucket, Key, Body, ContentType):
            data = Body.read()
            self.calls.append(('put', Bucket, Key, len(data)))
            self.objects[Key] = data
            return {'VersionId': 'v1'}

        def get_object(self, Bucket, Key):
            self.calls.append(('get', Bucket, Key))
            data = self.objects[Key]
            if self.corrupt:
                data = data[:-1] + b'?'
            return {'Body': io.BytesIO(data)}

    def test_upload_verifies_by_get_and_never_deletes(self):
        archive = self.root / ('dokploy-control-plane-20260910T041500Z' + mod.ARCHIVE_SUFFIX)
        manifest = self.root / ('dokploy-control-plane-20260910T041500Z' + mod.MANIFEST_SUFFIX)
        archive.write_bytes(b'Salted__' + os.urandom(64))
        manifest.write_text('{}')
        client = self.FakeClient()
        outcome = s3_upload.upload_backup(archive, manifest, None, 'bucket', 'control-plane/',
                                          mod.sha256_file(archive), client=client)
        self.assertEqual(outcome['status'], 'ok')
        self.assertEqual(outcome['key'], 'control-plane/' + archive.name)
        self.assertEqual(outcome['manifest_key'], 'control-plane/' + manifest.name)
        self.assertEqual(outcome['sha256'], mod.sha256_file(archive))
        self.assertEqual([c[0] for c in client.calls], ['put', 'put', 'get'])
        self.assertFalse(any('delete' in c[0] for c in client.calls))
        with self.assertRaises(ValueError):
            s3_upload.upload_backup(archive, manifest, None, 'bucket', 'control-plane/', mod.sha256_file(archive),
                                    client=self.FakeClient(corrupt=True))

    def test_credentials_validation(self):
        path = self.root / 'c.json'
        path.write_text(json.dumps({'endpoint': 'e', 'access_key': 'a'}))
        with self.assertRaises(ValueError):
            s3_upload.load_credentials(path)
        path.write_text(json.dumps({'endpoint': 'e', 'access_key': 'a', 'secret_key': 's'}))
        self.assertEqual(s3_upload.load_credentials(path)['secret_key'], 's')
        self.assertEqual(s3_upload.object_key('', 'x'), 'x')
        self.assertEqual(s3_upload.object_key('/control-plane/', 'x'), 'control-plane/x')


# --------------------------------------------------------------------------- #
# Retention
# --------------------------------------------------------------------------- #


def stamps(days, start=NOW):
    return [start - datetime.timedelta(days=d) for d in days]


class RetentionTests(Sandbox):
    def test_fewer_than_limits_keeps_everything(self):
        keep, drop = mod.plan_retention(stamps(range(5)), 7, 4, 3)
        self.assertEqual(len(keep), 5)
        self.assertEqual(drop, set())

    def test_daily_weekly_monthly_buckets(self):
        every_day = stamps(range(120))
        keep, drop = mod.plan_retention(every_day, 7, 4, 3)
        ordered = sorted(every_day, reverse=True)

        def newest_per_period(key, limit):
            seen = {}
            for stamp in ordered:
                if key(stamp) not in seen:
                    seen[key(stamp)] = stamp
                if len(seen) == limit:
                    break
            return set(seen.values())

        expected = (newest_per_period(lambda s: s.date(), 7) | newest_per_period(lambda s: s.isocalendar()[:2], 4)
                    | newest_per_period(lambda s: (s.year, s.month), 3))
        self.assertEqual(keep, expected)
        self.assertIn(ordered[0], keep)
        self.assertLessEqual(len(keep), 7 + 4 + 3)
        self.assertEqual(keep | drop, set(every_day))
        self.assertTrue(keep.isdisjoint(drop))
        # the oldest kept file is the newest backup of the third most recent month
        self.assertEqual(min(keep).strftime('%Y-%m'), (NOW - datetime.timedelta(days=61)).strftime('%Y-%m'))

    def test_newest_per_period_is_kept_and_gaps_do_not_widen_deletion(self):
        morning = NOW.replace(hour=4)
        evening = NOW.replace(hour=20)
        keep, drop = mod.plan_retention([morning, evening], 1, 1, 1)
        self.assertEqual(keep, {evening})
        self.assertEqual(drop, {morning})
        sparse = stamps([0, 30, 60, 90, 400])  # long gaps: distinct periods still count
        keep, drop = mod.plan_retention(sparse, 7, 4, 3)
        self.assertEqual(keep, set(sparse))

    def test_prune_is_dry_run_by_default_and_protects_foreign_files(self):
        dest = self.root / 'dest'
        names = [self.make_backup(dest, (NOW - datetime.timedelta(days=d)).strftime(mod.STAMP_FORMAT))
                 for d in range(40)]
        legacy = dest / 'dokploy-control-plane-20260910T083014Z.tar.gz'
        legacy.write_bytes(b'legacy unencrypted export')
        orphan = self.make_backup(dest, '20250101T000000Z', manifest=False)
        settings = self.settings()
        report = mod.prune(dest, settings)
        self.assertEqual(report['mode'], 'dry-run')
        self.assertTrue(report['would_delete'])
        self.assertEqual(report['deleted'], [])
        self.assertEqual(len(os.listdir(str(dest))), 40 * 2 + 2)
        self.assertIn(names[0], report['kept'])
        applied = mod.prune(dest, settings, apply=True)
        self.assertEqual(applied['mode'], 'apply')
        self.assertEqual(sorted(applied['deleted']), sorted(report['would_delete']))
        self.assertEqual(applied['errors'], [])
        remaining = os.listdir(str(dest))
        self.assertIn(legacy.name, remaining)
        self.assertIn(orphan + mod.ARCHIVE_SUFFIX, remaining)
        self.assertIn(names[0] + mod.ARCHIVE_SUFFIX, remaining)
        self.assertIn(names[0] + mod.MANIFEST_SUFFIX, remaining)
        for name in applied['deleted']:
            self.assertFalse((dest / (name + mod.ARCHIVE_SUFFIX)).exists())
            self.assertFalse((dest / (name + mod.MANIFEST_SUFFIX)).exists())
        self.assertEqual(2 * len(applied['kept']), len(remaining) - 2)  # pairs + legacy + orphan
        self.assertLessEqual(len(applied['kept']), 14)

    def test_prune_never_touches_the_only_backup_or_symlinks(self):
        dest = self.root / 'dest'
        only = self.make_backup(dest, '20260101T000000Z')
        report = mod.prune(dest, self.settings(), apply=True)
        self.assertEqual(report['deleted'], [])
        self.assertEqual(report['kept'], [only])
        target = self.root / 'elsewhere.enc'
        target.write_bytes(b'x')
        for d in range(1, 30):
            self.make_backup(dest, (NOW - datetime.timedelta(days=d)).strftime(mod.STAMP_FORMAT))
        victim = dest / ('dokploy-control-plane-20260801T000000Z' + mod.ARCHIVE_SUFFIX)
        os.symlink(str(target), str(victim))
        (dest / ('dokploy-control-plane-20260801T000000Z' + mod.MANIFEST_SUFFIX)).write_text('{}')
        mod.prune(dest, self.settings(), apply=True)
        self.assertTrue(target.exists())
        self.assertTrue(os.path.lexists(str(victim)))

    def test_prune_missing_directory_fails_closed(self):
        with self.assertRaisesRegex(mod.BackupError, 'not mounted'):
            mod.prune(self.root / 'absent', self.settings(), apply=True)

    def test_corrupt_retained_backup_prevents_all_deletion(self):
        dest = self.root / 'dest'
        for d in range(40):
            self.make_backup(dest, (NOW - datetime.timedelta(days=d)).strftime(mod.STAMP_FORMAT))
        newest = mod.list_backups(dest)[0][0]
        newest.archive.write_bytes(b'corrupt')
        before = set(dest.iterdir())
        with self.assertRaisesRegex(mod.BackupError, 'integrity'):
            mod.prune(dest, self.settings(), apply=True)
        self.assertEqual(before, set(dest.iterdir()))


# --------------------------------------------------------------------------- #
# Restore rehearsal
# --------------------------------------------------------------------------- #


@unittest.skipUnless(OPENSSL, 'openssl binary required for the encryption round trip')
class RestoreTests(Sandbox):
    def setUp(self):
        super().setUp()
        self.settings_obj = self.settings()
        self.job(self.settings_obj).run(copy=False)
        self.runner.calls = []
        self.clock_now = NOW + datetime.timedelta(hours=1)

    def restore(self, **kwargs):
        return mod.RestoreTest(self.settings_obj, self.tool, self.clock, sleep=lambda s: None).run(**kwargs)

    def test_full_rehearsal_passes_and_cleans_up(self):
        with self.assertLogs(mod.LOG, level='DEBUG') as logs:
            outcome = self.restore()
        self.assertEqual(outcome['status'], 'passed', outcome)
        self.assertEqual(outcome['stage'], 'done')
        self.assertTrue(outcome['database']['ok'])
        self.assertEqual(outcome['database']['rows_exact'], 3)
        self.assertEqual(outcome['database']['tables_expected'], 3)
        self.assertTrue(outcome['config']['artefacts']['traefik/traefik.yml']['present'])
        self.assertEqual(outcome['config']['artefacts']['traefik/dynamic']['kind'], 'dir')
        self.assertEqual(outcome['config']['files'], 4)
        self.assertTrue(outcome['services']['ok'])
        self.assertEqual(outcome['secrets']['expected'], 2)
        self.assertEqual(outcome['secrets']['verified'], 2)
        self.assertEqual(outcome['secrets']['targets'], sorted(SECRET_VALUES))
        self.assertTrue(outcome['secrets']['ok'])
        self.assertEqual(outcome['docker_config'], {'captured': False, 'ok': True})
        self.assertEqual(outcome['cleanup'], {'container_removed': True, 'volume_removed': True, 'workdir_removed': True})
        self.assertEqual(self.runner.containers, set())
        self.assertEqual(self.runner.volumes, set())
        self.assertEqual(os.listdir(str(self.root / 'stage')), [])
        self.assertIn('NOT start Dokploy', outcome['scope'])
        kinds = self.runner.kinds()
        self.assertEqual(kinds, ['openssl', 'volume_create', 'docker_run', 'pg_isready', 'pg_restore', 'psql',
                                 'docker_rm', 'volume_rm'])
        saved = json.loads(self.settings_obj.last_restore_path.read_text())
        self.assertEqual(saved['status'], 'passed')
        self.assert_no_secret('\n'.join(logs.output), json.dumps(outcome), json.dumps(saved))

    def test_restore_container_is_isolated(self):
        self.restore()
        run = [a for a in self.runner.calls if a[:2] == ['docker', 'run']][0]
        self.assertEqual(run[run.index('--network') + 1], 'none')
        self.assertIn('--label', run)
        self.assertIn(mod.RESTORE_LABEL + '=1', run)
        self.assertIn('--restart', run)
        self.assertEqual(run[-1], 'postgres:16.4')  # same image as the live container by default
        volumes = [run[i + 1] for i, a in enumerate(run) if a in ('--volume', '-v')]
        self.assertEqual(len(volumes), 1)
        self.assertTrue(volumes[0].startswith(mod.RESTORE_PREFIX))
        self.assertTrue(volumes[0].endswith(':/var/lib/postgresql/data'))
        joined = ' '.join(run)
        for forbidden in ('docker.sock', 'production-data', '/mnt/', '/etc/dokploy', '/var/backups', '--privileged'):
            self.assertNotIn(forbidden, joined)
        self.assertNotIn(SECRET, joined)
        self.assertIn('POSTGRES_HOST_AUTH_METHOD=trust', run)
        self.assertIn('POSTGRES_USER=dokploy', run)
        self.assertIn('POSTGRES_DB=dokploydb', run)
        restore = [a for a in self.runner.calls if 'pg_restore' in a][0]
        for flag in ('--exit-on-error', '--single-transaction', '--no-owner', '--no-acl'):
            self.assertIn(flag, restore)

    def test_restore_image_override(self):
        self.settings_obj = self.settings(RESTORE_IMAGE='postgres@sha256:abc')
        self.restore()
        run = [a for a in self.runner.calls if a[:2] == ['docker', 'run']][0]
        self.assertEqual(run[-1], 'postgres@sha256:abc')

    def test_failure_tears_down_and_records_stage(self):
        self.runner.fail = {'pg_restore'}
        with self.assertLogs(mod.LOG, level='DEBUG') as logs:
            outcome = self.restore()
        self.assertEqual(outcome['status'], 'failed')
        self.assertEqual(outcome['stage'], 'restore')
        self.assertIn('pg_restore exited 1', outcome['error'])
        self.assertEqual(self.runner.containers, set())
        self.assertEqual(self.runner.volumes, set())
        self.assertEqual(os.listdir(str(self.root / 'stage')), [])
        self.assert_no_secret('\n'.join(logs.output), json.dumps(outcome))
        health = mod.build_health(self.settings_obj, self.clock_now)
        self.assertEqual(health['checks']['restore_test']['status'], 'critical')

    def test_not_ready_in_time_fails(self):
        self.runner.ready_after = 10 ** 6
        self.settings_obj = self.settings(RESTORE_READY_TIMEOUT_SECONDS='0')
        outcome = self.restore()
        self.assertEqual(outcome['status'], 'failed')
        self.assertEqual(outcome['stage'], 'ready')
        self.assertEqual(self.runner.containers, set())

    def test_row_count_mismatch_and_missing_table(self):
        self.runner.restored_counts = 'application\t3\nproject\t2\n'  # user table missing
        outcome = self.restore()
        self.assertEqual(outcome['status'], 'failed')
        self.assertEqual(outcome['database']['missing_tables'], ['user'])
        self.runner.restored_counts = 'application\t3\nproject\t2\nuser\t100\n'
        outcome = self.restore()
        self.assertEqual(outcome['status'], 'failed')
        self.assertEqual(outcome['database']['rows_mismatch'], [{'table': 'user', 'expected': 1, 'restored': 100}])
        self.runner.restored_counts = 'application\t4\nproject\t2\nuser\t1\n'  # within tolerance (5 rows)
        outcome = self.restore()
        self.assertEqual(outcome['status'], 'passed')
        self.assertEqual(outcome['database']['rows_within_tolerance'], 1)

    def test_tampered_archive_is_rejected_before_docker(self):
        archive = next(self.settings_obj.dest_dir.glob('*.enc'))
        data = bytearray(archive.read_bytes())
        data[-1] ^= 0x01
        archive.write_bytes(bytes(data))
        outcome = self.restore()
        self.assertEqual(outcome['status'], 'failed')
        self.assertEqual(outcome['stage'], 'integrity')
        self.assertEqual([a for a in self.runner.calls if a[0] == 'docker'], [])

    def test_wrong_passphrase_fails_at_decrypt(self):
        self.passphrase.write_text('wrong\n')
        outcome = self.restore()
        self.assertEqual(outcome['status'], 'failed')
        self.assertEqual(outcome['stage'], 'decrypt')
        self.assertEqual([a for a in self.runner.calls if a[0] == 'docker'], [])

    def test_keep_retains_resources_with_warning(self):
        outcome = self.restore(keep=True)
        self.assertEqual(outcome['status'], 'passed')
        self.assertEqual(outcome['retained']['container'], outcome['container'])
        self.assertIn('secrets', outcome['retained']['warning'])
        self.assertEqual(len(self.runner.containers), 1)
        self.assertTrue(pathlib.Path(outcome['retained']['workdir']).is_dir())
        report = mod.restore_cleanup(self.tool)
        self.assertEqual(report['mode'], 'dry-run')
        self.assertEqual(report['containers'], [outcome['container']])
        self.assertEqual(len(self.runner.containers), 1)
        report = mod.restore_cleanup(self.tool, apply=True)
        self.assertEqual(report['removed_containers'], [outcome['container']])
        self.assertEqual(report['removed_volumes'], [outcome['volume']])
        self.assertEqual(self.runner.containers, set())

    def test_named_backup_selection(self):
        with self.assertRaisesRegex(mod.BackupError, 'not found'):
            self.restore(name='dokploy-control-plane-19990101T000000Z')
        outcome = self.restore(name='dokploy-control-plane-20260910T041500Z')
        self.assertEqual(outcome['status'], 'passed')

    def test_identity_must_be_plain_identifier(self):
        manifest_path = next(self.settings_obj.dest_dir.glob('*.manifest.json'))
        manifest = json.loads(manifest_path.read_text())
        manifest['postgres_user'] = 'x; drop database'
        manifest_path.write_text(json.dumps(manifest))
        outcome = self.restore()
        self.assertEqual(outcome['status'], 'failed')
        self.assertEqual(outcome['stage'], 'start')
        self.assertEqual([a for a in self.runner.calls if a[:2] == ['docker', 'run']], [])


class SecretVerificationTests(Sandbox):
    def test_verify_secrets_by_size_and_hash(self):
        directory = self.root / 'secrets'
        (directory / 'svc').mkdir(parents=True)
        (directory / 'svc' / 'one').write_bytes(b'value-one')
        entries = [{'service': 'svc', 'name': 'one', 'target': '/run/secrets/one', 'bytes': 9,
                    'sha256': mod.sha256_file(directory / 'svc' / 'one')},
                   {'service': 'svc', 'name': 'two', 'target': '/run/secrets/two', 'bytes': 1, 'sha256': '00'}]
        mod.write_json_atomic(directory / 'manifest.json', {'secrets': entries[:1]})
        self.assertTrue(mod.verify_secrets(directory, 1)['ok'])
        self.assertFalse(mod.verify_secrets(directory, 2)['ok'])
        mod.write_json_atomic(directory / 'manifest.json', {'secrets': entries})
        outcome = mod.verify_secrets(directory, 2)
        self.assertEqual(outcome['mismatched'], ['svc/two'])
        self.assertFalse(outcome['ok'])
        (directory / 'svc' / 'one').write_bytes(b'value-ONE')
        self.assertEqual(mod.verify_secrets(directory, 2)['mismatched'], ['svc/one', 'svc/two'])
        self.assertNotIn('value', json.dumps(outcome))
        shutil.rmtree(str(directory))
        with self.assertRaisesRegex(mod.BackupError, 'secrets manifest missing'):
            mod.verify_secrets(directory, 0)

    def test_secret_specs_resolve_absolute_targets(self):
        data = [{'Spec': {'TaskTemplate': {'ContainerSpec': {'Secrets': SERVICE_SECRETS['dokploy']}}}}]
        self.assertEqual(mod.secret_specs(data, 'dokploy')[0]['target'], '/run/secrets/dokploy_auth_secret')
        data = [{'Spec': {'TaskTemplate': {'ContainerSpec': {}}}}]
        self.assertEqual(mod.secret_specs(data, 'x'), [])
        with self.assertRaises(mod.BackupError):
            mod.secret_specs([{'Spec': {}}], 'x')
        bad = [{'Spec': {'TaskTemplate': {'ContainerSpec': {'Secrets': [{'SecretName': '../etc'}]}}}}]
        with self.assertRaisesRegex(mod.BackupError, 'plain identifier'):
            mod.secret_specs(bad, 'x')


class CompareTests(unittest.TestCase):
    def test_compare_counts_tolerance(self):
        expected = {'a': 1000, 'b': 10, 'c': 0}
        outcome = mod.compare_counts(['a', 'b', 'c'], expected, {'a': 1015, 'b': 12, 'c': 0}, 2, 5)
        self.assertTrue(outcome['ok'])
        self.assertEqual(outcome['rows_exact'], 1)
        self.assertEqual(outcome['rows_within_tolerance'], 2)
        outcome = mod.compare_counts(['a', 'b'], expected, {'a': 1021, 'b': 10, 'z': 1}, 2, 5)
        self.assertFalse(outcome['ok'])
        self.assertEqual(outcome['extra_tables'], ['z'])
        self.assertEqual(outcome['rows_mismatch'][0]['table'], 'a')


# --------------------------------------------------------------------------- #
# Health and scheduler
# --------------------------------------------------------------------------- #


class HealthTests(Sandbox):
    def test_backup_freshness_drives_status(self):
        settings = self.settings(COPY_DIR='')
        health = mod.build_health(settings, NOW)
        self.assertEqual(health['checks']['backup']['status'], 'critical')
        self.assertEqual(health['status'], 'critical')
        self.make_backup(settings.dest_dir, '20260910T041500Z')
        health = mod.build_health(settings, NOW + datetime.timedelta(hours=35))
        self.assertEqual(health['checks']['backup']['status'], 'ok')
        self.assertNotIn('copy', health['checks'])
        health = mod.build_health(settings, NOW + datetime.timedelta(hours=37))
        self.assertEqual(health['checks']['backup']['status'], 'critical')

    def test_copy_and_restore_checks(self):
        settings = self.settings()
        self.make_backup(settings.dest_dir, '20260910T041500Z')
        health = mod.build_health(settings, NOW)
        self.assertEqual(health['checks']['copy']['status'], 'warning')
        self.assertEqual(health['checks']['restore_test']['status'], 'warning')
        self.assertEqual(health['checks']['last_run']['status'], 'warning')
        self.make_backup(settings.copy_dir, '20260910T041500Z')
        mod.write_json_atomic(settings.last_restore_path, {'status': 'passed', 'finished_at': NOW.isoformat(),
                                                           'name': 'x'})
        mod.write_json_atomic(settings.last_run_path, {'status': 'ok', 'started_at': NOW.isoformat(),
                                                       'prune': [{'mode': 'dry-run', 'would_delete': ['a'],
                                                                  'errors': []}]})
        health = mod.build_health(settings, NOW + datetime.timedelta(days=1))
        self.assertEqual(health['status'], 'ok', health)
        self.assertEqual(health['checks']['prune']['reason'], '0 errors, 1 pending dry-run deletions')
        health = mod.build_health(settings, NOW + datetime.timedelta(days=36))
        self.assertEqual(health['checks']['restore_test']['status'], 'warning')
        mod.write_json_atomic(settings.last_restore_path, {'status': 'failed', 'stage': 'restore',
                                                           'finished_at': NOW.isoformat()})
        self.assertEqual(mod.build_health(settings, NOW)['checks']['restore_test']['status'], 'critical')

    def test_failed_cycle_with_fresh_backup_is_warning(self):
        settings = self.settings(COPY_DIR='')
        self.make_backup(settings.dest_dir, '20260910T041500Z')
        mod.write_json_atomic(settings.last_run_path, {'status': 'critical', 'started_at': NOW.isoformat(),
                                                       'failed_stage': 'backup'})
        self.assertEqual(mod.build_health(settings, NOW)['checks']['last_run']['status'], 'warning')
        self.assertEqual(mod.build_health(settings, NOW + datetime.timedelta(days=2))['checks']['last_run']['status'],
                         'critical')

    def test_healthcheck_exit_codes_and_heartbeat(self):
        settings = self.settings(COPY_DIR='')
        self.assertEqual(mod.healthcheck(settings, lambda: NOW), 1)          # missing report
        mod.write_health(settings, NOW)                                        # no backup: critical
        self.assertEqual(mod.healthcheck(settings, lambda: NOW), 1)
        self.assertFalse(settings.last_healthy_path.exists())
        self.make_backup(settings.dest_dir, '20260910T041500Z')
        mod.write_health(settings, NOW)                                        # warnings only
        self.assertEqual(mod.healthcheck(settings, lambda: NOW), 0)
        self.assertTrue(settings.last_healthy_path.exists())
        self.assertEqual(mod.healthcheck(settings, lambda: NOW + datetime.timedelta(seconds=301)), 1)  # stale
        self.assertEqual(mod.healthcheck(settings, lambda: NOW - datetime.timedelta(minutes=2)), 1)   # future
        settings.health_path.write_text('{not json')
        self.assertEqual(mod.healthcheck(settings, lambda: NOW), 1)

    def test_state_files_are_secret_free_and_private(self):
        settings = self.settings(COPY_DIR='')
        mod.write_health(settings, NOW)
        self.assertEqual(stat.S_IMODE(settings.health_path.stat().st_mode), 0o600)
        self.assert_no_secret(settings.health_path.read_text())


class SchedulerTests(Sandbox):
    def test_next_due(self):
        slot = (4, 15)
        at = datetime.datetime(2026, 9, 10, 4, 20, tzinfo=UTC)
        today = at.replace(minute=15)
        self.assertEqual(mod.next_due(at, slot, None), today)
        self.assertEqual(mod.next_due(at, slot, today - datetime.timedelta(days=1)), today)
        self.assertEqual(mod.next_due(at, slot, today), today + datetime.timedelta(days=1))
        early = datetime.datetime(2026, 9, 10, 3, 0, tzinfo=UTC)
        self.assertEqual(mod.next_due(early, slot, today - datetime.timedelta(days=1)),
                         today)  # not yet due today, previous slot already ran
        self.assertEqual(mod.next_due(early, slot, None), today - datetime.timedelta(days=1))  # never ran: now

    @unittest.skipUnless(OPENSSL, 'openssl binary required')
    def test_cycle_runs_backup_then_prune_and_writes_state(self):
        settings = self.settings()
        for d in range(1, 30):
            self.make_backup(settings.dest_dir, (NOW - datetime.timedelta(days=d)).strftime(mod.STAMP_FORMAT))
        scheduler = mod.Scheduler(settings, self.tool, self.clock)
        scheduler.tool = self.tool
        original = mod.BackupJob.__init__

        def init(job, s, tool, clock=None, uploader=None):
            original(job, s, tool, clock, uploader=self.no_upload)
        mod.BackupJob.__init__ = init
        self.addCleanup(setattr, mod.BackupJob, '__init__', original)
        record = scheduler.cycle()
        self.assertEqual(record['status'], 'ok', record)
        self.assertEqual(record['backup']['name'], 'dokploy-control-plane-20260910T041500Z')
        self.assertEqual([r['mode'] for r in record['prune']], ['dry-run', 'dry-run'])
        self.assertTrue(record['prune'][0]['would_delete'])
        self.assertIsNone(record['restore_test'])
        self.assertEqual(len(list(settings.dest_dir.glob('*.enc'))), 30)  # dry-run deleted nothing
        health = json.loads(settings.health_path.read_text())
        self.assertEqual(health['checks']['backup']['status'], 'ok')
        self.assertEqual(health['checks']['last_run']['status'], 'ok')
        self.assertEqual(json.loads(settings.last_run_path.read_text())['status'], 'ok')

    def test_cycle_records_backup_failure_and_still_writes_health(self):
        settings = self.settings(COPY_DIR='')
        self.runner.fail = {'docker_ps'}
        record = mod.Scheduler(settings, self.tool, self.clock).cycle()
        self.assertEqual(record['status'], 'critical')
        self.assertEqual(record['failed_stage'], 'backup')
        self.assertIn('docker ps exited 1', record['backup']['error'])
        self.assert_no_secret(json.dumps(record))
        self.assertTrue(settings.health_path.exists())
        self.assertEqual(json.loads(settings.health_path.read_text())['status'], 'critical')

    def test_lock_prevents_overlap(self):
        settings = self.settings()
        with mod.Lock(settings.lock_path):
            with self.assertRaisesRegex(mod.BackupError, 'holds'):
                with mod.Lock(settings.lock_path):
                    pass
        with mod.Lock(settings.lock_path):
            pass


if __name__ == '__main__':
    unittest.main()
