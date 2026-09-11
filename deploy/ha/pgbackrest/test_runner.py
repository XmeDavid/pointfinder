"""Unit tests for the pgBackRest backup runner.

Run from the repository root:

    python3 -m unittest discover -s deploy/ha/pgbackrest -v

No test touches pgBackRest, PostgreSQL, S3 or the network: the process
launcher, clock and role check are all injected fakes.
"""
import datetime
import json
import os
import pathlib
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import runner as mod  # noqa: E402

UTC = datetime.timezone.utc


def at(text):
    return datetime.datetime.fromisoformat(text).replace(tzinfo=UTC)


def settings(**overrides):
    env = {'POINTFINDER_PGBACKREST_HOUR': '3', 'POINTFINDER_PGBACKREST_MINUTE': '30',
           'POINTFINDER_PGBACKREST_FULL_WEEKDAY': '6', 'POINTFINDER_PGBACKREST_RETRY_SECONDS': '900',
           'POINTFINDER_PGBACKREST_MAX_RETRIES': '2', 'POINTFINDER_PGBACKREST_POLL_SECONDS': '60'}
    env.update({'POINTFINDER_PGBACKREST_' + k.upper(): str(v) for k, v in overrides.items()})
    return mod.Settings(env)


class FakeChild:
    def __init__(self, code, output=b''):
        self.code = code
        self.output = output
        self.returncode = None
        self.terminated = False

    def communicate(self):
        self.returncode = self.code
        return self.output, None

    def poll(self):
        return self.returncode

    def terminate(self):
        self.terminated = True


class FakePopen:
    """Scripted pgBackRest: records commands, answers info and backup calls."""

    def __init__(self, info=None, backup_codes=(0,)):
        self.info = info
        self.backup_codes = list(backup_codes)
        self.commands = []
        self.children = []

    def __call__(self, command, **kwargs):
        self.commands.append(command)
        if 'info' in command:
            child = FakeChild(1) if self.info is None else FakeChild(0, json.dumps(self.info).encode())
        else:
            code = self.backup_codes.pop(0) if self.backup_codes else 0
            child = FakeChild(code, b'ERROR: [055]: unable to load info file s3://secret-bucket/x\n')
        self.children.append(child)
        return child


def info_document(stanza='pointfinder-production', backups=()):
    return [{'name': stanza, 'status': {'code': 0},
             'backup': [{'type': kind, 'timestamp': {'start': stop - 60, 'stop': stop},
                         'label': str(stop), 'error': error} for kind, stop, error in backups]}]


# --------------------------------------------------------------------------- #
# Schedule arithmetic
# --------------------------------------------------------------------------- #


class ScheduleTest(unittest.TestCase):
    def test_latest_slot_before_and_after_time_of_day(self):
        self.assertEqual(mod.latest_slot(at('2026-09-10T02:00'), 3, 30), at('2026-09-09T03:30'))
        self.assertEqual(mod.latest_slot(at('2026-09-10T03:30'), 3, 30), at('2026-09-10T03:30'))
        self.assertEqual(mod.latest_slot(at('2026-09-10T23:59'), 3, 30), at('2026-09-10T03:30'))

    def test_next_slot(self):
        self.assertEqual(mod.next_slot(at('2026-09-10T02:00'), 3, 30), at('2026-09-10T03:30'))
        self.assertEqual(mod.next_slot(at('2026-09-10T04:00'), 3, 30), at('2026-09-11T03:30'))

    def test_latest_full_slot_is_previous_sunday_or_today(self):
        # 2026-09-06 is a Sunday; 2026-09-10 is a Thursday.
        self.assertEqual(mod.latest_full_slot(at('2026-09-10T12:00'), 6, 3, 30), at('2026-09-06T03:30'))
        self.assertEqual(mod.latest_full_slot(at('2026-09-06T03:30'), 6, 3, 30), at('2026-09-06T03:30'))
        self.assertEqual(mod.latest_full_slot(at('2026-09-06T03:00'), 6, 3, 30), at('2026-08-30T03:30'))

    def test_decide_full_when_nothing_recorded(self):
        self.assertEqual(mod.decide(at('2026-09-10T12:00'), mod.State(), settings()),
                         ('full', at('2026-09-06T03:30')))

    def test_decide_diff_after_daily_slot(self):
        state = mod.State(last_full=at('2026-09-06T03:40'), last_diff=at('2026-09-09T03:40'))
        self.assertEqual(mod.decide(at('2026-09-10T03:31'), state, settings()),
                         ('diff', at('2026-09-10T03:30')))

    def test_decide_nothing_when_current(self):
        state = mod.State(last_full=at('2026-09-06T03:40'), last_diff=at('2026-09-10T03:40'))
        self.assertIsNone(mod.decide(at('2026-09-10T12:00'), state, settings()))

    def test_decide_full_supersedes_diff_on_full_day(self):
        state = mod.State(last_full=at('2026-08-30T03:40'), last_diff=at('2026-09-05T03:40'))
        self.assertEqual(mod.decide(at('2026-09-06T03:31'), state, settings()),
                         ('full', at('2026-09-06T03:30')))

    def test_no_diff_needed_right_after_full(self):
        state = mod.State(last_full=at('2026-09-06T04:10'))
        self.assertIsNone(mod.decide(at('2026-09-06T12:00'), state, settings()))

    def test_settings_validation(self):
        with self.assertRaises(ValueError):
            settings(full_weekday=7)
        with self.assertRaises(ValueError):
            settings(retry_seconds=0)


# --------------------------------------------------------------------------- #
# State persistence and repository parsing
# --------------------------------------------------------------------------- #


class StateTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = pathlib.Path(self.tmp.name, 'nested', 'state.json')

    def tearDown(self):
        self.tmp.cleanup()

    def test_round_trip_and_no_temp_file_left(self):
        mod.State(last_full=at('2026-09-06T03:40'), last_diff=None).save(self.path)
        loaded = mod.State.load(self.path)
        self.assertEqual(loaded.last_full, at('2026-09-06T03:40'))
        self.assertIsNone(loaded.last_diff)
        self.assertEqual(sorted(p.name for p in self.path.parent.iterdir()), ['state.json'])

    def test_missing_and_corrupt_files_are_empty(self):
        self.assertIsNone(mod.State.load(self.path).last_full)
        self.path.parent.mkdir()
        self.path.write_text('{not json')
        with self.assertLogs(mod.LOG, level='WARNING'):
            self.assertIsNone(mod.State.load(self.path).last_full)

    def test_merge_keeps_newest_per_kind(self):
        local = mod.State(last_full=at('2026-09-06T03:40'), last_diff=at('2026-09-09T03:40'))
        remote = mod.State(last_full=at('2026-08-30T03:40'), last_diff=at('2026-09-10T03:40'))
        merged = local.merged(remote)
        self.assertEqual(merged.last_full, at('2026-09-06T03:40'))
        self.assertEqual(merged.last_diff, at('2026-09-10T03:40'))

    def test_parse_info_ignores_other_stanzas_errors_and_incrementals(self):
        full = int(at('2026-09-06T03:40').timestamp())
        diff = int(at('2026-09-09T03:40').timestamp())
        doc = info_document(backups=[('full', full, False), ('diff', diff, False),
                                     ('diff', diff + 86400, True), ('incr', diff + 90000, False)])
        doc += info_document(stanza='other', backups=[('full', diff + 100000, False)])
        state = mod.parse_info(json.dumps(doc), 'pointfinder-production')
        self.assertEqual(state.last_full, at('2026-09-06T03:40'))
        self.assertEqual(state.last_diff, at('2026-09-09T03:40'))

    def test_parse_info_without_backups(self):
        state = mod.parse_info(json.dumps(info_document()), 'pointfinder-production')
        self.assertIsNone(state.last_full)


# --------------------------------------------------------------------------- #
# Runner behaviour
# --------------------------------------------------------------------------- #


class RunnerTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.settings = settings(state=os.path.join(self.tmp.name, 'state.json'),
                                 config='/run/pgbackrest/pgbackrest.conf', binary='/usr/bin/pgbackrest')
        self.now = at('2026-09-10T03:31')
        self.primary = True

    def tearDown(self):
        self.tmp.cleanup()

    def make(self, popen):
        return mod.Runner(self.settings, popen=popen, clock=lambda: self.now,
                          is_primary=lambda: self.primary, sleep=lambda _: None)

    def state(self):
        return mod.State.load(self.settings.state_path)

    def test_first_run_takes_full_backup_and_persists_success(self):
        popen = FakePopen(info=info_document())
        runner = self.make(popen)
        with self.assertLogs(mod.LOG, level='INFO') as logs:
            runner.tick()
        backup = popen.commands[-1]
        self.assertEqual(backup, ['/usr/bin/pgbackrest', '--config=/run/pgbackrest/pgbackrest.conf',
                                  '--stanza=pointfinder-production', '--log-level-console=off',
                                  '--type=full', 'backup'])
        self.assertEqual(self.state().last_full, self.now)
        self.assertTrue(any('Completed full backup' in line for line in logs.output))

    def test_repository_record_prevents_duplicate_after_failover(self):
        full = int(at('2026-09-06T03:40').timestamp())
        diff = int(at('2026-09-10T03:40').timestamp())
        popen = FakePopen(info=info_document(backups=[('full', full, False), ('diff', diff, False)]))
        self.now = at('2026-09-10T12:00')
        delay = self.make(popen).tick()
        self.assertEqual([c for c in popen.commands if 'backup' in c], [])
        self.assertAlmostEqual(delay, (at('2026-09-11T03:30') - self.now).total_seconds())

    def test_diff_when_only_full_exists(self):
        full = int(at('2026-09-06T03:40').timestamp())
        popen = FakePopen(info=info_document(backups=[('full', full, False)]))
        self.make(popen).tick()
        self.assertIn('--type=diff', popen.commands[-1])
        self.assertEqual(self.state().last_diff, self.now)
        self.assertEqual(self.state().last_full, at('2026-09-06T03:40'))  # repository record cached

    def test_standby_never_runs_backup(self):
        self.primary = False
        popen = FakePopen(info=info_document())
        runner = self.make(popen)
        with self.assertLogs(mod.LOG, level='INFO') as logs:
            self.assertEqual(runner.tick(), 60.0)
            self.assertEqual(runner.tick(), 60.0)
        self.assertEqual([c for c in popen.commands if 'backup' in c], [])
        self.assertEqual(sum('Role: standby' in line for line in logs.output), 1)
        self.assertFalse(self.settings.state_path.exists())

    def test_unknown_role_is_treated_as_not_primary(self):
        self.primary = None
        popen = FakePopen(info=None)
        with self.assertLogs(mod.LOG, level='WARNING'):
            self.make(popen).tick()
        self.assertEqual([c for c in popen.commands if 'backup' in c], [])

    def test_failure_is_not_persisted_and_retries_then_gives_up(self):
        popen = FakePopen(info=info_document(), backup_codes=[1, 1, 1, 0])
        runner = self.make(popen)
        with self.assertLogs(mod.LOG, level='WARNING') as logs:
            self.assertEqual(runner.tick(), 900.0)
        self.assertFalse(self.settings.state_path.exists())
        self.assertNotIn('secret-bucket', ''.join(logs.output))
        self.now += datetime.timedelta(seconds=60)
        self.assertEqual(runner.tick(), 900.0 - 60)  # too early: retry not due
        self.now -= datetime.timedelta(seconds=60)
        self.now += datetime.timedelta(seconds=900)
        self.assertEqual(runner.tick(), 900.0)
        self.now += datetime.timedelta(seconds=900)
        with self.assertLogs(mod.LOG, level='ERROR'):
            delay = runner.tick()  # third failure exceeds max_retries=2
        self.assertAlmostEqual(delay, (at('2026-09-11T03:30') - self.now).total_seconds())
        self.assertEqual(len([c for c in popen.commands if 'backup' in c]), 3)
        self.assertEqual(runner.tick(), delay)  # no further attempts this slot
        self.assertFalse(self.settings.state_path.exists())
        # Next slot: retries start again and the success is recorded.
        self.now = at('2026-09-11T03:31')
        runner.tick()
        self.assertEqual(self.state().last_full, self.now)

    def test_info_failure_falls_back_to_local_record(self):
        mod.State(last_full=at('2026-09-06T03:40'), last_diff=at('2026-09-10T03:40')).save(self.settings.state_path)
        popen = FakePopen(info=None)
        with self.assertLogs(mod.LOG, level='WARNING'):
            self.make(popen).tick()
        self.assertEqual([c for c in popen.commands if 'backup' in c], [])

    def test_sigterm_forwards_to_child_and_stops_loop(self):
        popen = FakePopen(info=info_document(), backup_codes=[143])
        runner = self.make(popen)
        original = popen.__call__

        def interrupting(command, **kwargs):
            child = original(command, **kwargs)
            if 'backup' in command:
                runner.child = child
                runner.request_stop()
                self.assertTrue(child.terminated)
            return child

        runner.popen = interrupting
        with self.assertLogs(mod.LOG, level='INFO') as logs:
            runner.loop()
        self.assertFalse(self.settings.state_path.exists())
        self.assertTrue(any('interrupted by shutdown' in line for line in logs.output))
        self.assertTrue(logs.output[-1].endswith('Stopped'))

    def test_loop_survives_tick_exception(self):
        runner = self.make(FakePopen(info=info_document()))
        calls = []

        def failing():
            calls.append(1)
            if len(calls) == 1:
                raise RuntimeError('repo1-s3-key-secret=leak')
            runner.stop.set()
            return 1.0

        runner.tick = failing
        with self.assertLogs(mod.LOG, level='ERROR') as logs:
            runner.loop()
        self.assertEqual(len(calls), 2)
        self.assertNotIn('leak', ''.join(logs.output))


class InstallConfigTest(unittest.TestCase):
    def test_copies_with_read_only_mode_and_ownership(self):
        with tempfile.TemporaryDirectory() as tmp:
            source = pathlib.Path(tmp, 'secret.conf')
            source.write_text('[global]\nrepo1-cipher-pass=x\n')
            destination = pathlib.Path(tmp, 'run', 'pgbackrest.conf')
            chowned = []
            result = mod.install_config(source, destination, 999, 999,
                                        chown=lambda path, uid, gid: chowned.append((pathlib.Path(path), uid, gid)))
            self.assertEqual(result.read_text(), source.read_text())
            self.assertEqual(oct(result.stat().st_mode & 0o777), '0o400')
            self.assertEqual(oct(result.parent.stat().st_mode & 0o777), '0o700')
            self.assertIn((result.parent, 999, 999), chowned)
            self.assertEqual([p.name for p in result.parent.iterdir()], ['pgbackrest.conf'])


if __name__ == '__main__':
    unittest.main()
