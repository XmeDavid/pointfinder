"""Unit tests for the read-only monitoring sidecar.

Run from the repository root:

    python3 -m unittest discover -s deploy/ha/monitoring -v

No test touches PostgreSQL, pgBackRest, the network or a real PGDATA: the
database, process launcher, clock, disk usage and stat calls are injected fakes.
``settings()``/``build()`` disable persistence and recovery confirmation unless
``hysteresis=True`` is passed, so the check-level tests see raw semantics and
the stabilizer tests opt in explicitly.
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
NO_HYSTERESIS = dict(persist_seconds=0, wal_persist_seconds=0, slow_persist_seconds=0,
                     recovery_confirm_seconds=0, replication_recovery_seconds=0)


def settings(hysteresis=False, **overrides):
    env = {'POINTFINDER_MONITOR_NODE_NAME': 'test-node'}
    if not hysteresis:
        env.update({'POINTFINDER_MONITOR_' + k.upper(): str(v) for k, v in NO_HYSTERESIS.items()})
    env.update({'POINTFINDER_MONITOR_' + k.upper(): str(v) for k, v in overrides.items()})
    return mod.Settings(env)


class FakeDatabase:
    """Answers the monitor's fixed SQL statements from a script keyed by a
    substring of the statement. A list value answers ``all()``."""

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

    def _lookup(self, sql):
        self.executed.append(sql)
        for key, row in self.rows.items():
            if key in sql:
                return row
        raise AssertionError('unexpected SQL: ' + sql)

    def one(self, sql):
        return self._lookup(sql)

    def all(self, sql):
        return list(self._lookup(sql))


def primary_rows(**overrides):
    rows = {'pg_is_in_recovery': (False,), 'pg_stat_activity': (10, 100),
            'pg_stat_archiver': ('on', 30.0, None, False), 'pg_stat_replication': []}
    rows.update(overrides)
    return rows


def standby_row(receive='0/5000100', replay='0/5000100', replay_age=4000.0, status='streaming',
                upstream='0/5000100', upstream_age=4000.0, last_msg_age=10.0):
    return (receive, replay, replay_age, status, upstream, upstream_age, last_msg_age)


def standby_rows(**overrides):
    rows = {'pg_is_in_recovery': (True,), 'pg_stat_activity': (3, 100),
            'pg_stat_wal_receiver': standby_row(), "current_setting('restore_command')": (True,)}
    rows.update(overrides)
    return rows


def peer_row(name='production-rainer', state='streaming', sync_state='async', sent_lag=0, replay_lag=0,
             replay_lag_s=None, write_lag_s=None, reply_age=5.0):
    return (name, state, sync_state, sent_lag, replay_lag, replay_lag_s, write_lag_s, reply_age)


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


class ScriptedPopen:
    """Returns a fresh child per call from a script of (code, output, hang)."""

    def __init__(self, script):
        self.script = list(script)
        self.commands = []
        self.children = []

    def __call__(self, command, **kwargs):
        self.commands.append(command)
        code, output, hang = self.script.pop(0) if len(self.script) > 1 else self.script[0]
        child = FakeChild(code, output, hang=hang)
        self.children.append(child)
        return child


def info_document(stanza='pointfinder-production', backups=(), code=0):
    return json.dumps([{'name': stanza, 'status': {'code': code},
                        'repo': [{'key': 1, 'cipher': 'aes-256-cbc', 'path': SECRET}],
                        'backup': [{'type': kind, 'timestamp': {'start': stop - 60, 'stop': stop},
                                    'label': str(stop), 'error': error}
                                   for kind, stop, error in backups]}]).encode()


def info_popen(backups=(), code=0, exit_code=0):
    return FakePopen(FakeChild(exit_code, info_document(backups=backups, code=code)))


def fresh_backup():
    return info_document(backups=[('full', int(NOW.timestamp()) - 3600, None)])


class Usage:
    def __init__(self, total, free):
        self.total, self.free, self.used = total, free, total - free


class Clock:
    def __init__(self, now=NOW):
        self.now = now

    def __call__(self):
        return self.now

    def advance(self, seconds):
        self.now = self.now + datetime.timedelta(seconds=seconds)
        return self.now


def build(rows=None, fail=None, popen=None, clock=None, usage=None, wal=0, stat=None, directory=None,
          hysteresis=False, **overrides):
    directory = directory or tempfile.mkdtemp()
    pgdata = pathlib.Path(directory) / 'pgdata'
    (pgdata / 'pg_wal').mkdir(parents=True, exist_ok=True)
    conf = settings(hysteresis=hysteresis, state_dir=os.path.join(directory, 'state'), pgdata=str(pgdata),
                    **overrides)
    wal_size = wal if callable(wal) else (lambda _p: wal)
    monitor = mod.Monitor(conf, database_factory=FakeDatabase(rows or primary_rows(), fail=fail),
                          popen=popen or info_popen(backups=[('full', int(NOW.timestamp()) - 3600, None)]),
                          clock=clock or (lambda: NOW),
                          disk_usage=usage or (lambda _p: Usage(100 * mod.GIB, 50 * mod.GIB)),
                          wal_size=wal_size, stat=stat or os.stat, sleep=lambda _s: None)
    monitor.directory = directory
    return monitor


def journal_lines(monitor):
    return [json.loads(line) for line in monitor.settings.journal_path.read_text().splitlines()]


# --------------------------------------------------------------------------- #
# Settings
# --------------------------------------------------------------------------- #


class SettingsTest(unittest.TestCase):
    def test_defaults(self):
        conf = mod.Settings({'POINTFINDER_MONITOR_NODE_NAME': 'test-node'})
        self.assertEqual(conf.fast_seconds, 60)
        self.assertEqual(conf.slow_seconds, 300)
        self.assertEqual(conf.backup_max_age_hours, 36)
        self.assertEqual(conf.mac_recovery_max_age, 7200)
        self.assertEqual(conf.health_max_age, 180)
        self.assertEqual(conf.mac_recovery_files, [])
        self.assertEqual(str(conf.health_path), '/state/health.json')
        self.assertEqual(str(conf.state_path), '/state/monitor-state.json')
        self.assertEqual(str(conf.journal_path), '/state/transitions.log')
        self.assertEqual(conf.expected_standbys, [])
        self.assertEqual((conf.persist_seconds, conf.wal_persist_seconds, conf.slow_persist_seconds), (180, 600, 360))
        self.assertEqual((conf.recovery_confirm_seconds, conf.replication_recovery_seconds), (180, 300))
        self.assertEqual((conf.standby_absent_critical, conf.replay_stall_critical, conf.receiver_silence_warn),
                         (900, 900, 120))
        self.assertEqual((conf.journal_max_bytes, conf.journal_backups), (1024 * 1024, 2))

    def test_node_name_falls_back_to_patroni_name(self):
        conf = mod.Settings({'PATRONI_NAME': 'production-hetzner'})
        self.assertEqual(conf.node_name, 'production-hetzner')

    def test_expected_standbys_exclude_this_node(self):
        env = {'PATRONI_NAME': 'production-hetzner',
               'POINTFINDER_MONITOR_EXPECTED_STANDBYS': 'production-hetzner, production-rainer'}
        self.assertEqual(mod.Settings(env).expected_standbys, ['production-rainer'])
        env['PATRONI_NAME'] = 'production-rainer'
        self.assertEqual(mod.Settings(env).expected_standbys, ['production-hetzner'])
        env['PATRONI_NAME'] = 'rehearsal'
        self.assertEqual(mod.Settings(env).expected_standbys, ['production-hetzner', 'production-rainer'])

    def test_expected_standbys_reject_bad_names(self):
        for value in ('a b', 'x;drop', 'n' * 65):
            with self.assertRaises(ValueError):
                settings(expected_standbys=value)

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
        with self.assertRaises(ValueError):
            settings(persist_seconds=-1)
        with self.assertRaises(ValueError):
            settings(journal_max_bytes=0)

    def test_persist_windows_per_check(self):
        conf = settings(hysteresis=True)
        self.assertEqual(conf.persist_window('archiver'), 180)
        self.assertEqual(conf.persist_window('wal'), 600)
        self.assertEqual(conf.persist_window('backup'), 360)
        self.assertEqual(conf.persist_window('mac_recovery_uploads'), 360)
        self.assertEqual(conf.recovery_window('archiver'), 180)
        self.assertEqual(conf.recovery_window('replication'), 300)
        self.assertEqual(conf.recovery_window('standbys'), 300)
        self.assertEqual(conf.longest_window(), 600)

    def test_lsn_parsing(self):
        self.assertEqual(mod.lsn_int('0/0'), 0)
        self.assertEqual(mod.lsn_int('22/D50018B8'), (0x22 << 32) | 0xD50018B8)
        self.assertIsNone(mod.lsn_int(None))
        with self.assertRaises(ValueError):
            mod.lsn_int('garbage')


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
        self.assertEqual(by['standbys'].status, mod.OK)
        self.assertNotIn('replication', by)

    def test_standby_uses_replication_not_archiver(self):
        checks, role = mod.check_database(settings(), FakeDatabase(standby_rows()), NOW)
        self.assertEqual(role, 'standby')
        by = self.names(checks)
        self.assertIn('replication', by)
        self.assertNotIn('archiver', by)
        self.assertNotIn('standbys', by)

    def test_unreachable_is_critical_prompt_and_hides_message(self):
        error = RuntimeError('could not connect to server: password=hunter2 host=/var/run/postgresql')
        checks, role = mod.check_database(settings(), FakeDatabase({}, fail=error), NOW)
        self.assertIsNone(role)
        self.assertEqual(len(checks), 1)
        self.assertEqual(checks[0].status, mod.CRITICAL)
        self.assertTrue(checks[0].prompt)
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
        self.assertFalse(mod.connections_check(conf, 80, 100, NOW).prompt)
        self.assertEqual(mod.connections_check(conf, 95, 100, NOW).status, mod.CRITICAL)
        self.assertTrue(mod.connections_check(conf, 95, 100, NOW).prompt)
        check = mod.connections_check(conf, 40, 100, NOW)
        self.assertEqual(check.details, {'used': 40, 'max': 100, 'ratio': 0.4})


class ArchiverTest(unittest.TestCase):
    def test_current_failure_is_critical_but_not_prompt(self):
        # last_failed_time newer than last_archived_time -> archive_command is failing now.
        check = mod.archiver_check(settings(), ('on', 3600.0, 20.0, True), NOW)
        self.assertEqual(check.status, mod.CRITICAL)
        self.assertFalse(check.prompt, 'a transient archive-push failure waits for persistence')
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

    def test_archive_mode_off_is_critical_and_prompt(self):
        check = mod.archiver_check(settings(), ('off', None, None, False), NOW)
        self.assertEqual(check.status, mod.CRITICAL)
        self.assertTrue(check.prompt)
        self.assertEqual(check.details['archive_mode'], 'off')


class StandbysTest(unittest.TestCase):
    """Primary side: expected peers in pg_stat_replication."""

    def conf(self, **overrides):
        return settings(node_name='production-hetzner',
                        expected_standbys='production-hetzner,production-rainer', **overrides)

    def test_no_expected_standbys_is_ok(self):
        check = mod.standbys_check(settings(), [peer_row('someone')], NOW, {})
        self.assertEqual(check.status, mod.OK)
        self.assertIn('no expected standbys configured', check.reason)
        self.assertEqual(check.details['connected'], ['someone'])

    def test_expected_peer_streaming_is_ok(self):
        memory = {}
        check = mod.standbys_check(self.conf(), [peer_row(replay_lag=512)], NOW, memory)
        self.assertEqual(check.status, mod.OK)
        self.assertEqual(check.reason, '1 of 1 expected standbys streaming; production-rainer 512 bytes behind')
        self.assertEqual(check.details['expected'], ['production-rainer'])
        self.assertEqual(check.details['standbys']['production-rainer']['replay_lag_bytes'], 512)
        self.assertEqual(check.details['unexpected'], [])
        self.assertEqual(memory['absent_since'], {})

    def test_quiet_primary_with_idle_peer_is_ok(self):
        # replay_lag/write_lag are NULL on an idle primary; only bytes and reply_time matter.
        row = peer_row(replay_lag=0, replay_lag_s=None, write_lag_s=None, reply_age=9.0)
        self.assertEqual(mod.standbys_check(self.conf(), [row], NOW, {}).status, mod.OK)

    def test_missing_peer_warns_then_escalates_to_critical(self):
        conf = self.conf()
        memory = {}
        first = mod.standbys_check(conf, [], NOW, memory)
        self.assertEqual((first.status, first.prompt), (mod.WARNING, False))
        self.assertEqual(first.reason, 'production-rainer absent')
        self.assertEqual(memory['absent_since']['production-rainer'], NOW.isoformat())
        later = mod.standbys_check(conf, [], NOW + datetime.timedelta(seconds=899), memory)
        self.assertEqual(later.status, mod.WARNING)
        self.assertEqual(later.details['standbys']['production-rainer']['absent_seconds'], 899)
        critical = mod.standbys_check(conf, [], NOW + datetime.timedelta(seconds=900), memory)
        self.assertEqual((critical.status, critical.prompt), (mod.CRITICAL, True))
        self.assertEqual(critical.reason, 'production-rainer absent for 15m')
        # The peer reconnects: the absence timer is cleared.
        back = mod.standbys_check(conf, [peer_row()], NOW + datetime.timedelta(seconds=960), memory)
        self.assertEqual(back.status, mod.OK)
        self.assertEqual(memory['absent_since'], {})

    def test_absence_timer_survives_via_memory(self):
        conf = self.conf()
        memory = {'absent_since': {'production-rainer': (NOW - datetime.timedelta(hours=3)).isoformat()}}
        check = mod.standbys_check(conf, [], NOW, memory)
        self.assertEqual((check.status, check.prompt), (mod.CRITICAL, True))
        self.assertIn('3h00m', check.reason)

    def test_large_lag_is_critical_and_prompt(self):
        check = mod.standbys_check(self.conf(), [peer_row(replay_lag=mod.GIB)], NOW, {})
        self.assertEqual((check.status, check.prompt), (mod.CRITICAL, True))
        self.assertEqual(check.reason, 'production-rainer %d bytes behind' % mod.GIB)

    def test_moderate_lag_and_slow_replay_warn(self):
        self.assertEqual(mod.standbys_check(self.conf(), [peer_row(replay_lag=64 * 1024 ** 2)], NOW, {}).status,
                         mod.WARNING)
        self.assertEqual(mod.standbys_check(self.conf(), [peer_row(replay_lag=10, replay_lag_s=300.0)], NOW, {}).status,
                         mod.WARNING)

    def test_catchup_and_silence_warn(self):
        catchup = mod.standbys_check(self.conf(), [peer_row(state='catchup', replay_lag=1000)], NOW, {})
        self.assertEqual((catchup.status, catchup.prompt), (mod.WARNING, False))
        self.assertEqual(catchup.reason, 'production-rainer catchup')
        silent = mod.standbys_check(self.conf(), [peer_row(reply_age=121.0)], NOW, {})
        self.assertEqual(silent.status, mod.WARNING)
        self.assertIn('silent for 2m', silent.reason)

    def test_invisible_positions_are_unknown(self):
        check = mod.standbys_check(self.conf(), [peer_row(sent_lag=None, replay_lag=None)], NOW, {})
        self.assertEqual(check.status, mod.UNKNOWN)
        self.assertIn('positions not visible', check.reason)

    def test_unexpected_standbys_listed_and_sanitised(self):
        rows = [peer_row(), peer_row('weird\x00name' * 20, replay_lag=5 * mod.GIB)]
        check = mod.standbys_check(self.conf(), rows, NOW, {})
        self.assertEqual(check.status, mod.OK, 'an unexpected connection never alarms')
        self.assertEqual(len(check.details['unexpected']), 1)
        self.assertEqual(len(check.details['unexpected'][0]), mod.MAX_NAME_LENGTH)
        self.assertNotIn('\x00', check.details['unexpected'][0])

    def test_worst_expected_peer_decides(self):
        conf = settings(node_name='rehearsal', expected_standbys='a,b')
        rows = [peer_row('a'), peer_row('b', replay_lag=2 * mod.GIB)]
        check = mod.standbys_check(conf, rows, NOW, {})
        self.assertEqual((check.status, check.prompt), (mod.CRITICAL, True))
        self.assertEqual(check.reason, 'b %d bytes behind' % (2 * mod.GIB))
        rows = [peer_row('b', replay_lag=100 * 1024 ** 2)]
        check = mod.standbys_check(conf, rows, NOW, {})
        self.assertEqual(check.status, mod.WARNING)
        self.assertEqual(check.reason, 'a absent; b %d bytes behind' % (100 * 1024 ** 2))


class ReplicationTest(unittest.TestCase):
    """Standby side: sender-reported position, replay advancement, continuity."""

    def check(self, row, memory=None, now=NOW, conf=None):
        return mod.replication_check(conf or settings(), row, now, {} if memory is None else memory)

    def test_idle_standby_with_old_replay_timestamp_is_ok(self):
        # No pending WAL: the replay timestamp is hours old only because the
        # primary is quiet. Keepalives keep arriving. This must not alarm.
        check = self.check(standby_row(replay_age=5 * 3600.0, upstream_age=5 * 3600.0, last_msg_age=12.0))
        self.assertEqual(check.status, mod.OK)
        self.assertEqual(check.details['lag_bytes'], 0)
        self.assertEqual(check.details['replay_delay_seconds'], 0.0)

    def test_quiet_db_with_stuck_replay_lsn_stays_ok(self):
        # Hours without replay advancement are fine while nothing is pending.
        memory = {'replay_lsn': '0/5000100', 'replay_advanced_at': (NOW - datetime.timedelta(hours=6)).isoformat()}
        check = self.check(standby_row(), memory)
        self.assertEqual(check.status, mod.OK)
        self.assertEqual(check.details['replay_stalled_seconds'], 6 * 3600)

    def test_reconnect_with_negative_receive_lag_is_not_ok(self):
        # The observed -6328: receive restarted below replay; sender position
        # still 0/0 because no message has arrived in the new session.
        check = self.check(standby_row(receive='22/D5000000', replay='22/D50018B8', status='streaming',
                                       upstream='0/0', upstream_age=None, last_msg_age=None))
        self.assertEqual(check.status, mod.WARNING)
        self.assertEqual(check.reason, 'streaming, sender position not confirmed')
        self.assertEqual(check.details['receive_lag_bytes'], -6328)
        self.assertIsNone(check.details['lag_bytes'])
        self.assertIsNone(check.details['upstream_lsn'])

    def test_stale_sender_position_below_replay_is_not_ok(self):
        check = self.check(standby_row(receive='22/D5000000', replay='22/D50018B8', upstream='22/D5001000'))
        self.assertEqual(check.status, mod.WARNING)
        self.assertEqual(check.details['lag_bytes'], -0x8B8)

    def test_streaming_reconnect_far_behind_sender_is_critical_and_prompt(self):
        # First keepalive after the reconnect reveals the primary ~30 GB ahead.
        check = self.check(standby_row(receive='22/D5000000', replay='22/D50018B8', upstream='2A/10000000',
                                       last_msg_age=1.0))
        self.assertEqual((check.status, check.prompt), (mod.CRITICAL, True))
        self.assertGreater(check.details['lag_bytes'], 30 * 10 ** 9)  # Patroni's "30.9 GB"
        self.assertIn('behind sender', check.reason)

    def test_replay_stall_with_pending_wal_warns_then_escalates(self):
        conf = settings()
        memory = {}
        clock = Clock()
        row = standby_row(receive='0/6000000', replay='0/5000100', upstream='0/6000000')
        first = self.check(row, memory, clock.now, conf)
        self.assertEqual(first.status, mod.OK, 'small pending WAL, no history yet')
        self.assertEqual(memory['replay_lsn'], '0/5000100')
        self.assertEqual(memory['replay_advanced_at'], NOW.isoformat())
        clock.advance(299)
        self.assertEqual(self.check(row, memory, clock.now, conf).status, mod.OK)
        clock.advance(1)
        stalled = self.check(row, memory, clock.now, conf)
        self.assertEqual((stalled.status, stalled.prompt), (mod.WARNING, False))
        self.assertEqual(stalled.reason, 'replay stalled for 5m with 16776960 bytes pending')
        clock.advance(600)
        critical = self.check(row, memory, clock.now, conf)
        self.assertEqual((critical.status, critical.prompt), (mod.CRITICAL, True))
        self.assertIn('stalled for 15m', critical.reason)
        # Replay moves again: the stall timer resets.
        moving = self.check(standby_row(receive='0/6000000', replay='0/5FFFF00', upstream='0/6000000'),
                            memory, clock.now, conf)
        self.assertEqual(moving.status, mod.OK)
        self.assertEqual(memory['replay_advanced_at'], clock.now.isoformat())

    def test_stall_evidence_survives_restart_via_memory(self):
        memory = {'replay_lsn': '22/D50018B8', 'replay_advanced_at': (NOW - datetime.timedelta(hours=8)).isoformat(),
                  'pending_since': (NOW - datetime.timedelta(hours=8)).isoformat()}
        check = self.check(standby_row(receive='22/D5000000', replay='22/D50018B8', upstream='22/D6000000'),
                           memory)
        self.assertEqual((check.status, check.prompt), (mod.CRITICAL, True))
        self.assertIn('stalled for 8h00m', check.reason)

    def test_sender_silence_warns(self):
        check = self.check(standby_row(last_msg_age=121.0))
        self.assertEqual(check.status, mod.WARNING)
        self.assertEqual(check.reason, 'streaming, no message from sender for 2m')

    def test_byte_thresholds(self):
        conf = settings()
        warn = self.check(standby_row(receive='0/9000000', replay='0/5000000', upstream='0/9000000'), conf=conf)
        self.assertEqual(warn.status, mod.WARNING)
        self.assertEqual(warn.details['lag_bytes'], 64 * 1024 ** 2)
        crit = self.check(standby_row(receive='0/45000000', replay='0/5000000', upstream='0/45000000'), conf=conf)
        self.assertEqual((crit.status, crit.prompt), (mod.CRITICAL, True))

    def test_small_lag_is_ok(self):
        check = self.check(standby_row(receive='0/5000500', replay='0/5000100', upstream='0/5000500', replay_age=1.0))
        self.assertEqual(check.status, mod.OK)
        self.assertEqual(check.reason, 'streaming, 1024 bytes behind sender')

    def test_missing_receiver_warns_then_escalates(self):
        memory = {}
        absent = standby_row(receive=None, replay='0/5000100', status=None, upstream=None, upstream_age=None,
                             last_msg_age=None)
        check = self.check(absent, memory)
        self.assertEqual((check.status, check.prompt), (mod.WARNING, False))
        self.assertEqual(check.reason, 'wal receiver absent')
        self.assertEqual(memory['not_streaming_since'], NOW.isoformat())
        later = self.check(absent, memory, NOW + datetime.timedelta(seconds=900))
        self.assertEqual((later.status, later.prompt), (mod.CRITICAL, True))
        self.assertEqual(later.reason, 'usable WAL stream unavailable for 15m')
        back = self.check(standby_row(), memory, NOW + datetime.timedelta(seconds=960))
        self.assertEqual(back.status, mod.OK)
        self.assertIsNone(memory['not_streaming_since'])

    def test_receiver_not_streaming_warns(self):
        check = self.check(standby_row(status='restarting', upstream=None))
        self.assertEqual(check.status, mod.WARNING)
        self.assertEqual(check.details['receiver_status'], 'restarting')

    def test_unparseable_positions_are_unknown(self):
        check = self.check(standby_row(replay='nonsense'))
        self.assertEqual(check.status, mod.UNKNOWN)
        self.assertNotIn('nonsense', check.reason)


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
        self.assertEqual([c.prompt for c in (ok, warn, crit_ratio, crit_bytes)], [False, False, True, True])
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
            self.assertFalse(mod.check_wal(conf, NOW, lambda _p: 100).prompt)
            self.assertEqual(mod.check_wal(conf, NOW, lambda _p: 200).status, mod.CRITICAL)
            self.assertTrue(mod.check_wal(conf, NOW, lambda _p: 200).prompt)

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
# Persistence, recovery confirmation, state and journal
# --------------------------------------------------------------------------- #


class StabilizerTest(unittest.TestCase):
    """Whole-monitor scenarios with hysteresis enabled and a moving clock."""

    def run_ticks(self, monitor, clock, seconds, step=60, mutate=None):
        report = None
        for _ in range(seconds // step):
            clock.advance(step)
            if mutate:
                mutate(clock.now)
            report = monitor.tick()
        return report

    def test_transient_archiver_failure_is_never_reported(self):
        rows = primary_rows()
        clock = Clock()
        monitor = build(rows=rows, clock=clock, hysteresis=True)
        monitor.tick()
        rows['pg_stat_archiver'] = ('on', 3600.0, 5.0, True)
        clock.advance(60)
        with self.assertLogs(mod.LOG, level='DEBUG') as logs:
            mod.LOG.debug('sentinel')
            report = monitor.tick()
        self.assertEqual(report['status'], mod.OK, 'held by persistence')
        self.assertEqual(report['observed_status'], mod.CRITICAL)
        archiver = report['checks']['archiver']
        self.assertEqual(archiver['status'], mod.OK)
        self.assertEqual(archiver['observed_status'], mod.CRITICAL)
        self.assertIn('[unconfirmed 0m]', archiver['reason'])
        self.assertEqual([line for line in logs.output if 'Check ' in line], [], 'no transition logged')
        rows['pg_stat_archiver'] = ('on', 10.0, 65.0, False)  # next push succeeded
        report = self.run_ticks(monitor, clock, 600)
        self.assertEqual(report['checks']['archiver']['status'], mod.OK)
        self.assertNotIn('[', report['checks']['archiver']['reason'])
        journal = journal_lines(monitor)
        reported = [e for e in journal if e.get('layer') == 'reported' and e['check'] == 'archiver']
        self.assertEqual([e['status'] for e in reported], [mod.OK], 'reported layer never left ok')
        observed = [e for e in journal if e.get('layer') == 'observed' and e['check'] == 'archiver']
        self.assertEqual([e['status'] for e in observed], [mod.OK, mod.CRITICAL, mod.OK], 'the blip is journaled')

    def test_sustained_archiver_failure_is_reported_after_persist_and_recovers_after_confirmation(self):
        rows = primary_rows()
        clock = Clock()
        monitor = build(rows=rows, clock=clock, hysteresis=True)
        monitor.tick()
        rows['pg_stat_archiver'] = ('on', 3600.0, 5.0, True)
        clock.advance(60)
        monitor.tick()  # worse_since = +60
        report = self.run_ticks(monitor, clock, 120)  # +120, +180 -> held for 120
        self.assertEqual(report['checks']['archiver']['status'], mod.OK)
        with self.assertLogs(mod.LOG, level='ERROR') as logs:
            report = self.run_ticks(monitor, clock, 60)  # +240: held for 180
        self.assertEqual(report['checks']['archiver']['status'], mod.CRITICAL)
        self.assertIn('Check archiver: ok -> critical', logs.output[0])
        self.assertEqual(report['status'], mod.CRITICAL)
        rows['pg_stat_archiver'] = ('on', 10.0, 400.0, False)
        report = self.run_ticks(monitor, clock, 120)
        self.assertEqual(report['checks']['archiver']['status'], mod.CRITICAL, 'recovery not yet confirmed')
        self.assertEqual(report['checks']['archiver']['observed_status'], mod.OK)
        self.assertIn('[recovering 1m]', report['checks']['archiver']['reason'])
        report = self.run_ticks(monitor, clock, 120)
        self.assertEqual(report['checks']['archiver']['status'], mod.OK)
        self.assertEqual(report['status'], mod.OK)

    def test_prompt_failures_are_reported_immediately(self):
        clock = Clock()
        monitor = build(fail=RuntimeError('down'), clock=clock, hysteresis=True)
        report = monitor.tick()
        self.assertEqual(report['checks']['sql']['status'], mod.CRITICAL)
        self.assertEqual(report['status'], mod.CRITICAL)
        disk = build(usage=lambda _p: Usage(100 * mod.GIB, 1 * mod.GIB), clock=clock, hysteresis=True)
        self.assertEqual(disk.tick()['checks']['disk']['status'], mod.CRITICAL)
        wal = build(wal=9 * mod.GIB, clock=clock, hysteresis=True)
        self.assertEqual(wal.tick()['checks']['wal']['status'], mod.CRITICAL)

    def test_large_true_lag_is_prompt_on_both_sides(self):
        clock = Clock()
        rows = standby_rows(pg_stat_wal_receiver=standby_row(receive='22/D5000000', replay='22/D50018B8',
                                                                upstream='2A/10000000', last_msg_age=1.0))
        standby = build(rows=rows, clock=clock, hysteresis=True)
        self.assertEqual(standby.tick()['checks']['replication']['status'], mod.CRITICAL)
        rows = primary_rows(pg_stat_replication=[peer_row(replay_lag=30 * mod.GIB)])
        primary = build(rows=rows, clock=clock, hysteresis=True, node_name='production-hetzner',
                        expected_standbys='production-hetzner,production-rainer')
        self.assertEqual(primary.tick()['checks']['standbys']['status'], mod.CRITICAL)

    def test_single_backup_info_timeout_is_absorbed(self):
        # Slow tick 1 times out (unknown), slow tick 2 succeeds: no unknown is ever reported.
        good = fresh_backup()
        popen = ScriptedPopen([(0, b'', True), (0, good, False)])
        clock = Clock()
        monitor = build(popen=popen, clock=clock, hysteresis=True)
        report = monitor.tick()
        self.assertEqual(report['checks']['backup']['observed_status'], mod.UNKNOWN)
        self.assertEqual(report['checks']['backup']['status'], mod.OK)
        self.assertEqual(report['status'], mod.OK)
        self.assertEqual(mod.evaluate_report(json.dumps(report), clock.now, 180)[0], True, 'container stays healthy')
        report = self.run_ticks(monitor, clock, 300)  # second slow tick at +300 succeeds
        self.assertEqual(len(popen.commands), 2)
        self.assertEqual(report['checks']['backup']['status'], mod.OK)
        self.assertEqual(report['checks']['backup']['observed_status'], mod.OK)
        report = self.run_ticks(monitor, clock, 600)
        self.assertEqual(report['checks']['backup']['status'], mod.OK)
        reported = [e for e in journal_lines(monitor) if e.get('layer') == 'reported' and e['check'] == 'backup']
        self.assertEqual([e['status'] for e in reported], [mod.OK])

    def test_repeated_backup_info_failure_is_reported(self):
        popen = ScriptedPopen([(0, b'', True)])  # every call hangs
        clock = Clock()
        monitor = build(popen=popen, clock=clock, hysteresis=True)
        monitor.tick()
        report = self.run_ticks(monitor, clock, 300)
        self.assertEqual(report['checks']['backup']['status'], mod.OK, 'second failure just observed')
        report = self.run_ticks(monitor, clock, 60)  # +360: held for 360
        self.assertEqual(report['checks']['backup']['status'], mod.UNKNOWN)
        self.assertEqual(report['status'], mod.UNKNOWN)
        self.assertFalse(mod.evaluate_report(json.dumps(report), clock.now, 180)[0])

    def test_wal_warning_flaps_are_absorbed_but_sustained_growth_is_reported(self):
        size = {'bytes': 0}
        clock = Clock()
        monitor = build(wal=lambda _p: size['bytes'], clock=clock, hysteresis=True)
        monitor.tick()
        for _cycle in range(10):
            size['bytes'] = 2 * mod.GIB + 1
            report = self.run_ticks(monitor, clock, 300)
            self.assertEqual(report['checks']['wal']['status'], mod.OK)
            size['bytes'] = int(0.31 * mod.GIB)
            report = self.run_ticks(monitor, clock, 300)
            self.assertEqual(report['checks']['wal']['status'], mod.OK)
        reported = [e for e in journal_lines(monitor) if e.get('layer') == 'reported' and e['check'] == 'wal']
        self.assertEqual(len(reported), 1, 'ten excursions, zero reported transitions')
        size['bytes'] = 2 * mod.GIB + 1
        report = self.run_ticks(monitor, clock, 540)
        self.assertEqual(report['checks']['wal']['status'], mod.OK)
        report = self.run_ticks(monitor, clock, 120)  # held for 600 s from the first warning tick
        self.assertEqual(report['checks']['wal']['status'], mod.WARNING)

    def test_replication_warning_recovery_storm_collapses_to_one_transition(self):
        # Alternating minutes of "streaming, reconnected" and "receiver absent"
        # on a stale replica: one warning, no recovery, then critical.
        stuck = standby_row(receive='22/D5000000', replay='22/D50018B8', upstream='0/0', upstream_age=None,
                            last_msg_age=None)
        absent = standby_row(receive=None, replay='22/D50018B8', status=None, upstream=None, upstream_age=None,
                             last_msg_age=None)
        rows = standby_rows(pg_stat_wal_receiver=absent)
        clock = Clock()
        monitor = build(rows=rows, clock=clock, hysteresis=True)
        monitor.tick()
        statuses = []
        for minute in range(1, 31):
            rows['pg_stat_wal_receiver'] = stuck if minute % 2 else absent
            clock.advance(60)
            statuses.append(monitor.tick()['checks']['replication']['status'])
        self.assertEqual(statuses[:3], [mod.OK, mod.OK, mod.WARNING])
        self.assertNotIn(mod.OK, statuses[3:], 'a momentary reconnect never reads as recovered')
        reported = [e['status'] for e in journal_lines(monitor)
                    if e.get('layer') == 'reported' and e['check'] == 'replication']
        self.assertEqual(reported, [mod.OK, mod.WARNING, mod.CRITICAL])
        # Real catch-up: streaming with the sender position confirmed and lag
        # shrinking to zero, held for the replication recovery window.
        rows['pg_stat_wal_receiver'] = standby_row(receive='2A/10000000', replay='2A/10000000',
                                                   upstream='2A/10000000', last_msg_age=3.0)
        report = self.run_ticks(monitor, clock, 240)
        self.assertEqual(report['checks']['replication']['status'], mod.CRITICAL)
        self.assertIn('[recovering 3m]', report['checks']['replication']['reason'])
        report = self.run_ticks(monitor, clock, 120)  # 300 s of confirmed catch-up
        self.assertEqual(report['checks']['replication']['status'], mod.OK)

    def test_missing_expected_standby_escalates_on_primary(self):
        rows = primary_rows()
        clock = Clock()
        monitor = build(rows=rows, clock=clock, hysteresis=True, node_name='production-hetzner',
                        expected_standbys='production-hetzner,production-rainer')
        report = monitor.tick()
        self.assertEqual(report['checks']['standbys']['status'], mod.OK, 'first sight is held')
        self.assertEqual(report['checks']['standbys']['observed_status'], mod.WARNING)
        report = self.run_ticks(monitor, clock, 180)
        self.assertEqual(report['checks']['standbys']['status'], mod.WARNING)
        self.assertEqual(report['status'], mod.WARNING)
        report = self.run_ticks(monitor, clock, 720)
        self.assertEqual(report['checks']['standbys']['status'], mod.CRITICAL)
        self.assertEqual(report['checks']['standbys']['reason'], 'production-rainer absent for 15m')
        self.assertFalse(mod.evaluate_report(json.dumps(report), clock.now, 180)[0])
        rows['pg_stat_replication'] = [peer_row()]
        report = self.run_ticks(monitor, clock, 240)
        self.assertEqual(report['checks']['standbys']['status'], mod.CRITICAL, 'return confirmed over 300 s')
        report = self.run_ticks(monitor, clock, 120)
        self.assertEqual(report['checks']['standbys']['status'], mod.OK)

    def test_quiet_healthy_pair_stays_ok_for_hours(self):
        clock = Clock()
        standby = build(rows=standby_rows(pg_stat_wal_receiver=standby_row(replay_age=7 * 3600.0,
                                                                              upstream_age=7 * 3600.0,
                                                                              last_msg_age=15.0)),
                        clock=clock, hysteresis=True)
        primary = build(rows=primary_rows(pg_stat_replication=[peer_row(reply_age=8.0)]), clock=clock,
                        hysteresis=True, node_name='production-hetzner',
                        expected_standbys='production-hetzner,production-rainer')
        for _ in range(180):
            clock.advance(60)
            self.assertEqual(standby.tick()['status'], mod.OK)
            self.assertEqual(primary.tick()['status'], mod.OK)
        for monitor in (standby, primary):
            transitions = [e for e in journal_lines(monitor) if e.get('layer') == 'reported']
            self.assertTrue(all(e['status'] == mod.OK for e in transitions))
            self.assertEqual(len(transitions), len(monitor.last_status), 'one initial entry per check')


class PersistenceTest(unittest.TestCase):
    def test_state_survives_restart_with_reported_status_and_timers(self):
        rows = primary_rows()
        clock = Clock()
        first = build(rows=rows, clock=clock, hysteresis=True, node_name='production-hetzner',
                      expected_standbys='production-hetzner,production-rainer')
        first.tick()
        report = None
        for _ in range(5):
            clock.advance(60)
            report = first.tick()
        self.assertEqual(report['checks']['standbys']['status'], mod.WARNING)
        state = json.loads(first.settings.state_path.read_text())
        self.assertEqual(state['schema'], 1)
        self.assertEqual(state['checks']['standbys']['reported'], mod.WARNING)
        self.assertEqual(state['memory']['standbys']['absent_since']['production-rainer'], NOW.isoformat())
        # Restart 2 minutes later: no re-announcement, absence continuity kept.
        clock.advance(120)
        second = build(rows=rows, clock=clock, hysteresis=True, directory=first.directory,
                       node_name='production-hetzner', expected_standbys='production-hetzner,production-rainer')
        with self.assertLogs(mod.LOG, level='INFO') as logs:
            report = second.tick()
        self.assertEqual(report['checks']['standbys']['status'], mod.WARNING)
        self.assertIn('Check standbys: new -> warning', ''.join(logs.output))
        self.assertEqual(report['checks']['standbys']['standbys']['production-rainer']['absent_seconds'], 420)
        clock.advance(480)
        self.assertEqual(second.tick()['checks']['standbys']['status'], mod.CRITICAL)
        events = [e for e in journal_lines(second) if e.get('event') == 'start']
        self.assertEqual([e['resumed'] for e in events], [False, True])

    def test_pending_change_timer_survives_short_restart(self):
        rows = primary_rows(pg_stat_archiver=('on', 3600.0, 5.0, True))
        clock = Clock()
        first = build(rows=rows, clock=clock, hysteresis=True)
        first.tick()
        clock.advance(120)
        first.tick()
        self.assertEqual(json.loads(first.settings.state_path.read_text())['checks']['archiver']['worse_since'],
                         NOW.isoformat())
        clock.advance(60)
        second = build(rows=rows, clock=clock, hysteresis=True, directory=first.directory)
        self.assertEqual(second.tick()['checks']['archiver']['status'], mod.CRITICAL, 'held for 180 s in total')

    def test_long_gap_resets_pending_timers_but_keeps_reported_status(self):
        rows = primary_rows(pg_stat_archiver=('on', 3600.0, 5.0, True))
        clock = Clock()
        first = build(rows=rows, clock=clock, hysteresis=True)
        first.tick()
        for _ in range(4):
            clock.advance(60)
            report = first.tick()
        self.assertEqual(report['checks']['archiver']['status'], mod.CRITICAL)
        rows['pg_stat_archiver'] = ('on', 10.0, 400.0, False)
        clock.advance(60)
        first.tick()  # better_since set
        clock.advance(2 * 3600)
        second = build(rows=rows, clock=clock, hysteresis=True, directory=first.directory)
        report = second.tick()
        self.assertEqual(report['checks']['archiver']['status'], mod.CRITICAL, 'reported status kept')
        self.assertIn('[recovering 0m]', report['checks']['archiver']['reason'], 'timer restarted')
        for _ in range(3):
            clock.advance(60)
            report = second.tick()
        self.assertEqual(report['checks']['archiver']['status'], mod.OK)

    def test_replay_stall_evidence_survives_restart(self):
        rows = standby_rows(pg_stat_wal_receiver=standby_row(receive='22/D5000000', replay='22/D50018B8',
                                                                upstream='22/D6000000', last_msg_age=2.0))
        clock = Clock()
        first = build(rows=rows, clock=clock, hysteresis=True)
        self.assertEqual(first.tick()['checks']['replication']['observed_status'], mod.OK)
        clock.advance(20 * 60)
        second = build(rows=rows, clock=clock, hysteresis=True, directory=first.directory)
        report = second.tick()
        self.assertEqual(report['checks']['replication']['status'], mod.CRITICAL)
        self.assertIn('stalled for 20m', report['checks']['replication']['reason'])

    def test_corrupt_or_malformed_state_starts_fresh(self):
        directory = tempfile.mkdtemp()
        state_dir = pathlib.Path(directory) / 'state'
        state_dir.mkdir()
        (state_dir / 'monitor-state.json').write_text('garbage')
        with self.assertLogs(mod.LOG, level='WARNING'):
            monitor = build(directory=directory)
        self.assertEqual(monitor.state['checks'], {})
        (state_dir / 'monitor-state.json').write_text(json.dumps({'checks': {'sql': {'reported': 'bogus'}},
                                                                  'memory': {}}))
        with self.assertLogs(mod.LOG, level='WARNING'):
            monitor = build(directory=directory)
        self.assertEqual(monitor.state['checks'], {})
        self.assertEqual(monitor.tick()['status'], mod.OK)

    def test_role_change_drops_stale_entries(self):
        rows = primary_rows()
        clock = Clock()
        monitor = build(rows=rows, clock=clock, hysteresis=True)
        monitor.tick()
        self.assertIn('archiver', monitor.state['checks'])
        rows.clear()
        rows.update(standby_rows())
        clock.advance(60)
        report = monitor.tick()
        self.assertNotIn('archiver', monitor.state['checks'])
        self.assertIn('replication', monitor.state['checks'])
        self.assertNotIn('archiver', report['checks'])


class JournalTest(unittest.TestCase):
    def test_rotation_is_bounded_and_secret_free(self):
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory) / 'transitions.log'
            journal = mod.Journal(path, max_bytes=400, backups=2)
            for index in range(60):
                journal.write(at=NOW.isoformat(), check='archiver', layer='observed', previous='ok',
                              status='critical', reason='archive_command failing; last failure 0m ago', n=index)
            files = sorted(p.name for p in pathlib.Path(directory).iterdir())
            self.assertEqual(files, ['transitions.log', 'transitions.log.1', 'transitions.log.2'])
            for name in files:
                self.assertLessEqual((pathlib.Path(directory) / name).stat().st_size, 400)
            last = json.loads(path.read_text().splitlines()[-1])
            self.assertEqual(last['n'], 59)
            self.assertNotIn('secret', path.read_text())

    def test_unwritable_journal_is_logged_once_and_never_breaks_a_tick(self):
        journal = mod.Journal(pathlib.Path('/nonexistent-root/x/transitions.log'), 1024, 2)
        with self.assertLogs(mod.LOG, level='WARNING') as logs:
            journal.write(event='start')
            journal.write(event='start')
        self.assertEqual(len(logs.output), 1)
        self.assertNotIn('/nonexistent-root', logs.output[0])

    def test_monitor_journal_records_start_role_and_transitions(self):
        monitor = build(rows=primary_rows(pg_stat_archiver=('on', 3600.0, 5.0, True)))
        monitor.tick()
        entries = journal_lines(monitor)
        self.assertEqual(entries[0]['event'], 'start')
        self.assertEqual(entries[0]['node'], 'test-node')
        self.assertIn({'at': NOW.isoformat(), 'event': 'role', 'role': 'primary'}, entries)
        archiver = [e for e in entries if e.get('check') == 'archiver']
        self.assertEqual([(e['layer'], e['previous'], e['status']) for e in archiver],
                         [('observed', None, mod.CRITICAL), ('reported', None, mod.CRITICAL)])
        text = monitor.settings.journal_path.read_text()
        self.assertNotIn('secret-bucket', text)
        self.assertNotIn('SELECT', text)


# --------------------------------------------------------------------------- #
# Monitor loop, report and healthcheck
# --------------------------------------------------------------------------- #


class MonitorTest(unittest.TestCase):
    def test_tick_writes_secret_free_report(self):
        monitor = build()
        report = monitor.tick()
        text = monitor.settings.health_path.read_text()
        self.assertEqual(json.loads(text), report)
        self.assertEqual(report['schema'], 1)
        self.assertEqual(report['status'], mod.OK)
        self.assertEqual(report['observed_status'], mod.OK)
        self.assertEqual(report['role'], 'primary')
        self.assertEqual(report['node'], 'test-node')
        self.assertEqual(set(report['checks']), {'sql', 'connections', 'archiver', 'standbys', 'disk', 'wal', 'backup'})
        for check in report['checks'].values():
            self.assertEqual(set(check) >= {'status', 'reason', 'observed_at', 'observed_status', 'reported_since'},
                             True)
        self.assertNotIn('secret-bucket', text)
        self.assertNotIn('pgbackrest.conf', text)
        self.assertFalse(monitor.settings.health_path.with_name('health.json.tmp').exists())
        self.assertTrue(monitor.settings.state_path.exists())
        self.assertNotIn('secret-bucket', monitor.settings.state_path.read_text())

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
