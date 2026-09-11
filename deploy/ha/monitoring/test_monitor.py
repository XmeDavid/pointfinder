"""Unit tests for the read-only monitoring sidecar.

Run from the repository root:

    python3 -m unittest discover -s deploy/ha/monitoring -v

No test touches PostgreSQL, pgBackRest, the network or a real PGDATA: the
database, process launcher, clock, disk usage and stat calls are injected fakes.
"""
import datetime
import json
import logging
import os
import pathlib
import subprocess
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import monitor as mod  # noqa: E402

UTC = datetime.timezone.utc
NOW = datetime.datetime(2026, 9, 10, 12, 0, tzinfo=UTC)
SECRET = 's3://secret-bucket/pgbackrest'


def settings(**overrides):
    env = {'POINTFINDER_MONITOR_NODE_NAME': 'test-node'}
    env.update({'POINTFINDER_MONITOR_' + k.upper(): str(v) for k, v in overrides.items()})
    return mod.Settings(env)


class FakeDatabase:
    """Answers the monitor's fixed SQL statements from a script keyed by a
    substring of the statement."""

    def __init__(self, rows, fail=None):
        self.rows = rows
        self.fail = fail
        self.executed = []

    def __call__(self, _settings):
        return self

    def __enter__(self):
        if self.fail is not None:
            raise self.fail
        return self

    def __exit__(self, *exc):
        return False

    def one(self, sql):
        self.executed.append(sql)
        for key, row in self.rows.items():
            if key in sql:
                return row
        raise AssertionError('unexpected SQL: ' + sql)


def primary_rows(**overrides):
    rows = {'pg_is_in_recovery': (False,), 'pg_stat_activity': (10, 100),
            'pg_stat_archiver': ('on', 30.0, None, False)}
    rows.update(overrides)
    return rows


def standby_rows(**overrides):
    rows = {'pg_is_in_recovery': (True,), 'pg_stat_activity': (3, 100),
            'pg_stat_wal_receiver': (0, 4000.0, 'streaming')}
    rows.update(overrides)
    return rows


class FakeChild:
    def __init__(self, code, output=b'', hang=False):
        self.code = code
        self.output = output
        self.hang = hang
        self.returncode = None
        self.terminated = False
        self.killed = False

    def communicate(self, timeout=None):
        if self.hang and not self.killed:
            raise subprocess.TimeoutExpired('pgbackrest', timeout)
        self.returncode = self.code
        return self.output, None

    def poll(self):
        return self.returncode

    def terminate(self):
        self.terminated = True

    def kill(self):
        self.killed = True
        self.hang = False
        self.code = -9


class FakePopen:
    def __init__(self, child):
        self.child = child
        self.commands = []

    def __call__(self, command, **kwargs):
        self.commands.append(command)
        return self.child


def info_document(stanza='pointfinder-production', backups=(), code=0):
    return json.dumps([{'name': stanza, 'status': {'code': code},
                        'repo': [{'key': 1, 'cipher': 'aes-256-cbc', 'path': SECRET}],
                        'backup': [{'type': kind, 'timestamp': {'start': stop - 60, 'stop': stop},
                                    'label': str(stop), 'error': error}
                                   for kind, stop, error in backups]}]).encode()


def info_popen(backups=(), code=0, exit_code=0):
    return FakePopen(FakeChild(exit_code, info_document(backups=backups, code=code)))


class Usage:
    def __init__(self, total, free):
        self.total, self.free, self.used = total, free, total - free


def build(rows=None, fail=None, popen=None, clock=None, usage=None, wal=0, stat=None, **overrides):
    directory = tempfile.mkdtemp()
    pgdata = pathlib.Path(directory) / 'pgdata'
    (pgdata / 'pg_wal').mkdir(parents=True)
    conf = settings(state_dir=os.path.join(directory, 'state'), pgdata=str(pgdata), **overrides)
    monitor = mod.Monitor(conf, database_factory=FakeDatabase(rows or primary_rows(), fail=fail),
                          popen=popen or info_popen(backups=[('full', int(NOW.timestamp()) - 3600, None)]),
                          clock=clock or (lambda: NOW),
                          disk_usage=usage or (lambda _p: Usage(100 * mod.GIB, 50 * mod.GIB)),
                          wal_size=lambda _p: wal, stat=stat or os.stat, sleep=lambda _s: None)
    return monitor


# --------------------------------------------------------------------------- #
# Settings
# --------------------------------------------------------------------------- #


class SettingsTest(unittest.TestCase):
    def test_defaults(self):
        conf = settings()
        self.assertEqual(conf.fast_seconds, 60)
        self.assertEqual(conf.slow_seconds, 300)
        self.assertEqual(conf.backup_max_age_hours, 36)
        self.assertEqual(conf.mac_recovery_max_age, 7200)
        self.assertEqual(conf.health_max_age, 180)
        self.assertEqual(conf.mac_recovery_files, [])
        self.assertEqual(str(conf.health_path), '/state/health.json')

    def test_node_name_falls_back_to_patroni_name(self):
        conf = mod.Settings({'PATRONI_NAME': 'production-hetzner'})
        self.assertEqual(conf.node_name, 'production-hetzner')

    def test_recovery_files_parse(self):
        conf = settings(mac_recovery_files='uploads=/mac/uploads/last-success.json, backups=/mac/b/last-success.json')
        self.assertEqual([(label, str(path)) for label, path in conf.mac_recovery_files],
                         [('uploads', '/mac/uploads/last-success.json'), ('backups', '/mac/b/last-success.json')])

    def test_recovery_files_reject_bad_entries(self):
        for value in ('/mac/last-success.json', 'a b=/x', '=/x', 'a='):
            with self.assertRaises(ValueError):
                settings(mac_recovery_files=value)

    def test_invalid_thresholds_rejected(self):
        with self.assertRaises(ValueError):
            settings(fast_seconds=0)
        with self.assertRaises(ValueError):
            settings(connections_warn_ratio=0.99, connections_critical_ratio=0.9)
        with self.assertRaises(ValueError):
            settings(disk_warn_free_ratio=0.05, disk_critical_free_ratio=0.1)


# --------------------------------------------------------------------------- #
# SQL checks
# --------------------------------------------------------------------------- #


class DatabaseChecksTest(unittest.TestCase):
    def names(self, checks):
        return {check.name: check for check in checks}

    def test_primary_healthy(self):
        checks, role = mod.check_database(settings(), FakeDatabase(primary_rows()), NOW)
        self.assertEqual(role, 'primary')
        by = self.names(checks)
        self.assertEqual(by['sql'].status, mod.OK)
        self.assertEqual(by['connections'].status, mod.OK)
        self.assertEqual(by['archiver'].status, mod.OK)
        self.assertNotIn('replication', by)

    def test_standby_uses_replication_not_archiver(self):
        checks, role = mod.check_database(settings(), FakeDatabase(standby_rows()), NOW)
        self.assertEqual(role, 'standby')
        by = self.names(checks)
        self.assertIn('replication', by)
        self.assertNotIn('archiver', by)

    def test_unreachable_is_critical_and_hides_message(self):
        error = RuntimeError('could not connect to server: password=hunter2 host=/var/run/postgresql')
        checks, role = mod.check_database(settings(), FakeDatabase({}, fail=error), NOW)
        self.assertIsNone(role)
        self.assertEqual(len(checks), 1)
        self.assertEqual(checks[0].status, mod.CRITICAL)
        self.assertEqual(checks[0].reason, 'unreachable: RuntimeError')
        self.assertNotIn('hunter2', json.dumps(checks[0].to_json()))

    def test_query_failure_after_connect_is_critical(self):
        rows = primary_rows()
        del rows['pg_stat_activity']  # FakeDatabase raises AssertionError('unexpected SQL')
        checks, role = mod.check_database(settings(), FakeDatabase(rows), NOW)
        self.assertIsNone(role)
        self.assertEqual(checks[0].status, mod.CRITICAL)
        self.assertNotIn('SELECT', checks[0].reason)

    def test_connection_thresholds(self):
        conf = settings()
        self.assertEqual(mod.connections_check(conf, 79, 100, NOW).status, mod.OK)
        self.assertEqual(mod.connections_check(conf, 80, 100, NOW).status, mod.WARNING)
        self.assertEqual(mod.connections_check(conf, 95, 100, NOW).status, mod.CRITICAL)
        check = mod.connections_check(conf, 40, 100, NOW)
        self.assertEqual(check.details, {'used': 40, 'max': 100, 'ratio': 0.4})


class ArchiverTest(unittest.TestCase):
    def test_current_failure_is_critical(self):
        # last_failed_time newer than last_archived_time -> archive_command is failing now.
        check = mod.archiver_check(settings(), ('on', 3600.0, 20.0, True), NOW)
        self.assertEqual(check.status, mod.CRITICAL)
        self.assertIn('failing', check.reason)
        self.assertTrue(check.details['failing_now'])

    def test_historical_failure_is_ok(self):
        # A failure older than the last success is history (failed_count > 0 but recovered).
        check = mod.archiver_check(settings(), ('on', 20.0, 86400.0, False), NOW)
        self.assertEqual(check.status, mod.OK)
        self.assertFalse(check.details['failing_now'])
        self.assertEqual(check.details['last_failed_age_seconds'], 86400.0)

    def test_never_failed(self):
        check = mod.archiver_check(settings(), ('on', 20.0, None, False), NOW)
        self.assertEqual(check.status, mod.OK)
        self.assertIsNone(check.details['last_failed_age_seconds'])

    def test_nothing_archived_yet_is_ok(self):
        check = mod.archiver_check(settings(), ('on', None, None, False), NOW)
        self.assertEqual(check.status, mod.OK)

    def test_archive_mode_off_is_critical(self):
        check = mod.archiver_check(settings(), ('off', None, None, False), NOW)
        self.assertEqual(check.status, mod.CRITICAL)
        self.assertEqual(check.details['archive_mode'], 'off')


class ReplicationTest(unittest.TestCase):
    def test_idle_standby_with_old_replay_timestamp_is_ok(self):
        # No un-replayed WAL: the replay timestamp is hours old only because the
        # primary is quiet. This must not alarm.
        check = mod.replication_check(settings(), (0, 5 * 3600.0, 'streaming'), NOW)
        self.assertEqual(check.status, mod.OK)
        self.assertEqual(check.details['replay_delay_seconds'], 0.0)

    def test_pending_wal_with_old_replay_timestamp_warns(self):
        check = mod.replication_check(settings(), (1024, 600.0, 'streaming'), NOW)
        self.assertEqual(check.status, mod.WARNING)
        self.assertEqual(check.details['replay_delay_seconds'], 600.0)

    def test_small_lag_is_ok(self):
        check = mod.replication_check(settings(), (1024, 1.0, 'streaming'), NOW)
        self.assertEqual(check.status, mod.OK)

    def test_byte_thresholds(self):
        conf = settings()
        self.assertEqual(mod.replication_check(conf, (64 * 1024 ** 2, 1.0, 'streaming'), NOW).status, mod.WARNING)
        self.assertEqual(mod.replication_check(conf, (mod.GIB, 1.0, 'streaming'), NOW).status, mod.CRITICAL)

    def test_missing_receiver_warns(self):
        check = mod.replication_check(settings(), (None, 4000.0, None), NOW)
        self.assertEqual(check.status, mod.WARNING)
        self.assertEqual(check.reason, 'wal receiver absent')

    def test_receiver_not_streaming_warns(self):
        check = mod.replication_check(settings(), (None, 1.0, 'catchup'), NOW)
        self.assertEqual(check.status, mod.WARNING)
        self.assertEqual(check.details['receiver_status'], 'catchup')


# --------------------------------------------------------------------------- #
# Filesystem checks
# --------------------------------------------------------------------------- #


class DiskAndWalTest(unittest.TestCase):
    def test_disk_thresholds(self):
        conf = settings()
        ok = mod.check_disk(conf, NOW, lambda _p: Usage(100 * mod.GIB, 50 * mod.GIB))
        warn = mod.check_disk(conf, NOW, lambda _p: Usage(100 * mod.GIB, 15 * mod.GIB))
        crit_ratio = mod.check_disk(conf, NOW, lambda _p: Usage(100 * mod.GIB, 9 * mod.GIB))
        crit_bytes = mod.check_disk(conf, NOW, lambda _p: Usage(10 * mod.GIB, int(1.5 * mod.GIB)))
        self.assertEqual([c.status for c in (ok, warn, crit_ratio, crit_bytes)],
                         [mod.OK, mod.WARNING, mod.CRITICAL, mod.CRITICAL])
        self.assertEqual(ok.details['free_ratio'], 0.5)

    def test_disk_unreadable_is_unknown(self):
        def boom(_path):
            raise OSError('permission denied /var/lib/postgresql/data')
        check = mod.check_disk(settings(), NOW, boom)
        self.assertEqual(check.status, mod.UNKNOWN)
        self.assertNotIn('/var/lib', check.reason)

    def test_wal_bytes_sums_real_files(self):
        with tempfile.TemporaryDirectory() as directory:
            wal = pathlib.Path(directory) / 'pg_wal'
            (wal / 'archive_status').mkdir(parents=True)
            (wal / '000000010000000000000001').write_bytes(b'x' * 1000)
            (wal / 'archive_status' / '000000010000000000000001.ready').write_bytes(b'')
            (wal / '000000010000000000000002').write_bytes(b'y' * 24)
            self.assertEqual(mod.wal_bytes(directory), 1024)

    def test_wal_thresholds(self):
        with tempfile.TemporaryDirectory() as directory:
            (pathlib.Path(directory) / 'pg_wal').mkdir()
            conf = settings(pgdata=directory, wal_warn_bytes=100, wal_critical_bytes=200)
            self.assertEqual(mod.check_wal(conf, NOW, lambda _p: 99).status, mod.OK)
            self.assertEqual(mod.check_wal(conf, NOW, lambda _p: 100).status, mod.WARNING)
            self.assertEqual(mod.check_wal(conf, NOW, lambda _p: 200).status, mod.CRITICAL)

    def test_wal_missing_is_unknown(self):
        with tempfile.TemporaryDirectory() as directory:
            conf = settings(pgdata=directory)
            self.assertEqual(mod.check_wal(conf, NOW, lambda _p: 0).status, mod.UNKNOWN)


# --------------------------------------------------------------------------- #
# pgBackRest info and Mac recovery files
# --------------------------------------------------------------------------- #


class BackupCheckTest(unittest.TestCase):
    def test_fresh_backup_ok(self):
        stop = int(NOW.timestamp()) - 10 * 3600
        check = mod.backup_check(settings(), 0, info_document(backups=[('full', stop, None)]), NOW)
        self.assertEqual(check.status, mod.OK)
        self.assertEqual(check.details['age_seconds'], 36000)
        self.assertNotIn('secret-bucket', json.dumps(check.to_json()))

    def test_newest_successful_backup_wins_and_errors_ignored(self):
        base = int(NOW.timestamp())
        backups = [('full', base - 48 * 3600, None), ('diff', base - 20 * 3600, None),
                   ('diff', base - 3600, True)]
        check = mod.backup_check(settings(), 0, info_document(backups=backups), NOW)
        self.assertEqual(check.status, mod.OK)
        self.assertEqual(check.details['age_seconds'], 20 * 3600)

    def test_stale_backup_is_critical(self):
        stop = int(NOW.timestamp()) - 37 * 3600
        check = mod.backup_check(settings(), 0, info_document(backups=[('full', stop, None)]), NOW)
        self.assertEqual(check.status, mod.CRITICAL)
        self.assertIn('37h', check.reason)

    def test_no_backup_is_critical(self):
        check = mod.backup_check(settings(), 0, info_document(), NOW)
        self.assertEqual(check.status, mod.CRITICAL)

    def test_bad_stanza_status_is_critical(self):
        stop = int(NOW.timestamp()) - 3600
        check = mod.backup_check(settings(), 0, info_document(backups=[('full', stop, None)], code=2), NOW)
        self.assertEqual(check.status, mod.CRITICAL)
        self.assertEqual(check.details['stanza_status'], 2)

    def test_other_stanza_only_is_unknown(self):
        check = mod.backup_check(settings(), 0, info_document(stanza='other'), NOW)
        self.assertEqual(check.status, mod.UNKNOWN)

    def test_nonzero_exit_is_unknown_and_output_dropped(self):
        output = b'ERROR: [055]: unable to load info file ' + SECRET.encode()
        check = mod.backup_check(settings(), 55, output, NOW)
        self.assertEqual(check.status, mod.UNKNOWN)
        self.assertEqual(check.details['info_exit'], 55)
        self.assertNotIn('secret-bucket', json.dumps(check.to_json()) + check.reason)

    def test_garbage_output_is_unknown(self):
        check = mod.backup_check(settings(), 0, b'not json ' + SECRET.encode(), NOW)
        self.assertEqual(check.status, mod.UNKNOWN)
        self.assertNotIn('secret-bucket', check.reason)


class RecoveryFileTest(unittest.TestCase):
    def test_fresh_file_ok(self):
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory) / 'last-success.json'
            path.write_text('{}')
            os.utime(str(path), (NOW.timestamp() - 600, NOW.timestamp() - 600))
            check = mod.recovery_file_check('uploads', path, 7200, NOW)
            self.assertEqual(check.name, 'mac_recovery_uploads')
            self.assertEqual(check.status, mod.OK)
            self.assertEqual(check.details['age_seconds'], 600)

    def test_old_file_warns(self):
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory) / 'last-success.json'
            path.write_text('{}')
            os.utime(str(path), (NOW.timestamp() - 7201, NOW.timestamp() - 7201))
            self.assertEqual(mod.recovery_file_check('backups', path, 7200, NOW).status, mod.WARNING)

    def test_missing_file_warns(self):
        check = mod.recovery_file_check('uploads', pathlib.Path('/nonexistent/last-success.json'), 7200, NOW)
        self.assertEqual(check.status, mod.WARNING)
        self.assertEqual(check.reason, 'last-success file missing')


# --------------------------------------------------------------------------- #
# Monitor loop, report and healthcheck
# --------------------------------------------------------------------------- #


class MonitorTest(unittest.TestCase):
    def test_tick_writes_secret_free_report(self):
        monitor = build()
        report = monitor.tick()
        text = monitor.settings.health_path.read_text()
        self.assertEqual(json.loads(text), report)
        self.assertEqual(report['status'], mod.OK)
        self.assertEqual(report['role'], 'primary')
        self.assertEqual(report['node'], 'test-node')
        self.assertEqual(set(report['checks']), {'sql', 'connections', 'archiver', 'disk', 'wal', 'backup'})
        self.assertNotIn('secret-bucket', text)
        self.assertNotIn('pgbackrest.conf', text)
        self.assertFalse(monitor.settings.health_path.with_name('health.json.tmp').exists())

    def test_info_command_is_read_only_and_quiet(self):
        monitor = build()
        monitor.tick()
        command = monitor.popen.commands[0]
        self.assertEqual(command[-1], 'info')
        self.assertIn('--output=json', command)
        self.assertIn('--log-level-console=off', command)
        self.assertIn('--log-level-file=off', command)
        self.assertFalse({'backup', 'restore', 'expire', 'stanza-create'} & set(command))

    def test_slow_checks_run_on_interval_only(self):
        clock = [NOW]
        monitor = build(clock=lambda: clock[0])
        monitor.tick()
        clock[0] = NOW + datetime.timedelta(seconds=60)
        report = monitor.tick()
        self.assertEqual(len(monitor.popen.commands), 1)
        self.assertEqual(report['checks']['backup']['observed_at'], NOW.isoformat())  # cached
        clock[0] = NOW + datetime.timedelta(seconds=300)
        monitor.tick()
        self.assertEqual(len(monitor.popen.commands), 2)

    def test_mac_recovery_files_included(self):
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory) / 'last-success.json'
            path.write_text('{}')
            os.utime(str(path), (NOW.timestamp() - 60, NOW.timestamp() - 60))
            monitor = build(mac_recovery_files='uploads=%s,backups=%s/missing.json' % (path, directory))
            report = monitor.tick()
            self.assertEqual(report['checks']['mac_recovery_uploads']['status'], mod.OK)
            self.assertEqual(report['checks']['mac_recovery_backups']['status'], mod.WARNING)
            self.assertEqual(report['status'], mod.WARNING)

    def test_overall_status_is_worst(self):
        monitor = build(rows=primary_rows(pg_stat_archiver=('on', 3600.0, 10.0, True)))
        self.assertEqual(monitor.tick()['status'], mod.CRITICAL)

    def test_unreachable_database_still_reports_disk_and_backup(self):
        monitor = build(fail=RuntimeError('boom'))
        report = monitor.tick()
        self.assertEqual(report['status'], mod.CRITICAL)
        self.assertIsNone(report['role'])
        self.assertEqual(set(report['checks']), {'sql', 'disk', 'wal', 'backup'})

    def test_transition_only_logging(self):
        rows = primary_rows()
        monitor = build(rows=rows)
        with self.assertLogs(mod.LOG, level='INFO') as first:
            monitor.tick()
        self.assertTrue(any('Check archiver: new -> ok' in line for line in first.output))
        with self.assertLogs(mod.LOG, level='DEBUG') as second:
            mod.LOG.debug('sentinel')  # assertLogs needs at least one record
            monitor.tick()
        self.assertEqual([line for line in second.output if 'Check ' in line], [])
        rows['pg_stat_archiver'] = ('on', 3600.0, 10.0, True)
        with self.assertLogs(mod.LOG, level='ERROR') as third:
            monitor.tick()
        self.assertEqual(len(third.output), 1)
        self.assertIn('Check archiver: ok -> critical', third.output[0])
        self.assertNotIn('SELECT', third.output[0])

    def test_role_change_logged_once(self):
        rows = primary_rows()
        monitor = build(rows=rows)
        with self.assertLogs(mod.LOG, level='INFO') as logs:
            monitor.tick()
            monitor.tick()
        self.assertEqual(sum('Role: primary' in line for line in logs.output), 1)

    def test_info_timeout_is_unknown(self):
        monitor = build(popen=FakePopen(FakeChild(0, b'', hang=True)))
        report = monitor.tick()
        self.assertEqual(report['checks']['backup']['status'], mod.UNKNOWN)
        self.assertEqual(report['checks']['backup']['info_exit'], 124)
        self.assertTrue(monitor.popen.child.killed)

    def test_tick_exception_keeps_loop_alive(self):
        calls = []

        def sleep(seconds):
            calls.append(seconds)
            if len(calls) == 2:
                monitor.stop.set()
        monitor = build()
        monitor._sleep = sleep
        monitor.write_failures = 0
        original = mod.write_report

        def failing_write(path, report):
            raise OSError('disk full at /state/health.json')
        mod.write_report = failing_write
        try:
            with self.assertLogs(mod.LOG, level='ERROR') as logs:
                monitor.loop()
        finally:
            mod.write_report = original
        self.assertEqual(calls, [60.0, 60.0])
        self.assertTrue(all('Tick failed: OSError' in line for line in logs.output if 'Tick failed' in line))
        self.assertNotIn('/state', ''.join(logs.output))

    def test_stop_forwards_terminate_to_child(self):
        child = FakeChild(0, info_document())
        child.returncode = None
        monitor = build(popen=FakePopen(child))
        monitor.child = child
        monitor.request_stop()
        self.assertTrue(monitor.stop.is_set())
        self.assertTrue(child.terminated)
        self.assertEqual(monitor.run_info(), (143, b''))  # nothing launched after stop

    def test_loop_stops_on_signal_request(self):
        monitor = build()
        monitor._sleep = lambda _s: monitor.request_stop()
        monitor.loop()
        self.assertTrue(monitor.settings.health_path.exists())


class HealthcheckTest(unittest.TestCase):
    def report(self, status='ok', age=0, checks=None):
        return json.dumps({'generated_at': (NOW - datetime.timedelta(seconds=age)).isoformat(),
                           'status': status, 'checks': checks or {}})

    def test_ok_and_warning_pass(self):
        self.assertEqual(mod.evaluate_report(self.report('ok'), NOW, 180), (True, 'ok'))
        self.assertEqual(mod.evaluate_report(self.report('warning'), NOW, 180)[0], True)

    def test_critical_fails_with_check_names(self):
        checks = {'archiver': {'status': 'critical'}, 'disk': {'status': 'ok'}, 'wal': {'status': 'critical'}}
        healthy, reason = mod.evaluate_report(self.report('critical', checks=checks), NOW, 180)
        self.assertFalse(healthy)
        self.assertEqual(reason, 'unhealthy checks: archiver, wal')

    def test_unknown_and_invalid_status_fail(self):
        for status in ['unknown', 'not-a-status']:
            self.assertFalse(mod.evaluate_report(self.report(status), NOW, 180)[0])

    def test_future_timestamp_fails(self):
        self.assertFalse(mod.evaluate_report(self.report('ok', age=-120), NOW, 180)[0])

    def test_stale_fails(self):
        healthy, reason = mod.evaluate_report(self.report('ok', age=181), NOW, 180)
        self.assertFalse(healthy)
        self.assertIn('stale', reason)

    def test_garbage_fails(self):
        self.assertFalse(mod.evaluate_report('{', NOW, 180)[0])
        self.assertFalse(mod.evaluate_report('{"status": "ok"}', NOW, 180)[0])

    def test_healthcheck_missing_file(self):
        with tempfile.TemporaryDirectory() as directory:
            self.assertEqual(mod.healthcheck(settings(state_dir=directory), clock=lambda: NOW), 1)

    def test_healthcheck_end_to_end(self):
        monitor = build()
        monitor.tick()
        conf = monitor.settings
        self.assertEqual(mod.healthcheck(conf, clock=lambda: NOW), 0)
        self.assertEqual(mod.healthcheck(conf, clock=lambda: NOW + datetime.timedelta(seconds=181)), 1)

    def test_main_dispatch(self):
        with tempfile.TemporaryDirectory() as directory:
            os.environ['POINTFINDER_MONITOR_STATE_DIR'] = directory
            try:
                self.assertEqual(mod.main(['--healthcheck']), 1)
                self.assertEqual(mod.main(['--bogus']), 2)
            finally:
                del os.environ['POINTFINDER_MONITOR_STATE_DIR']


if __name__ == '__main__':
    unittest.main()
