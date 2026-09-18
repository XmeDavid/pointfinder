"""Review regressions: idle-to-busy, unusable reconnects and honest recovery."""
import datetime
import tempfile
import unittest
from pathlib import Path

import test_monitor as f

mod = f.mod


class ReviewRegressions(unittest.TestCase):
    def test_idle_time_does_not_become_replay_stall_time(self):
        memory = {}
        conf = f.settings()
        mod.replication_check(conf, f.standby_row(), f.NOW, memory)
        later = f.NOW + datetime.timedelta(hours=12)
        mod.replication_check(conf, f.standby_row(), later, memory)
        pending = f.standby_row(upstream='0/5000200')
        result = mod.replication_check(conf, pending, later + datetime.timedelta(seconds=60), memory)
        self.assertEqual(result.status, mod.OK)
        self.assertEqual(result.details['replay_stalled_seconds'], 0)
        result = mod.replication_check(conf, pending, later + datetime.timedelta(seconds=360), memory)
        self.assertEqual(result.status, mod.WARNING)

    def test_large_lag_is_not_masked_by_sender_silence(self):
        result = mod.replication_check(f.settings(), f.standby_row(upstream='2A/10000000', last_msg_age=180), f.NOW, {})
        self.assertEqual((result.status, result.prompt), (mod.CRITICAL, True))

    def test_primary_unusable_reconnects_do_not_reset_escalation(self):
        conf = f.settings(node_name='production-hetzner', expected_standbys='production-hetzner,production-rainer')
        memory = {}
        for minute in range(17):
            rows = [] if minute % 2 == 0 else [f.peer_row(state='catchup', replay_lag=None)]
            result = mod.standbys_check(conf, rows, f.NOW + datetime.timedelta(minutes=minute), memory)
        self.assertEqual(result.status, mod.CRITICAL)

    def test_missing_restore_configuration_is_prompt(self):
        monitor = f.build(rows=f.standby_rows(**{"current_setting('restore_command')": (False,)}), hysteresis=True)
        report = monitor.tick()
        self.assertEqual(report['checks']['archive_restore']['status'], mod.CRITICAL)

    def stabilizer(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        return mod.Stabilizer(f.settings(hysteresis=True), {}, mod.Journal(Path(directory.name) / 'journal', 1024, 2))

    def observe(self, stabilizer, status, seconds):
        now = f.NOW + datetime.timedelta(seconds=seconds)
        return stabilizer.apply([mod.Check('replication', status, 'synthetic', now,
                                          prompt=status == mod.CRITICAL)], now)[0]

    def test_warning_time_cannot_count_as_confirmed_ok(self):
        stable = self.stabilizer()
        self.observe(stable, mod.CRITICAL, 0)
        for t in (60, 120, 180, 240):
            self.observe(stable, mod.WARNING, t)
        for t in (300, 360, 420, 480, 540):
            self.assertEqual(self.observe(stable, mod.OK, t).status, mod.CRITICAL)
        self.assertEqual(self.observe(stable, mod.OK, 600).status, mod.OK)

    def test_blind_gap_cannot_count_as_confirmed_recovery(self):
        stable = self.stabilizer()
        self.observe(stable, mod.CRITICAL, 0)
        self.observe(stable, mod.OK, 60)
        self.assertEqual(self.observe(stable, mod.OK, 420).status, mod.CRITICAL)
        for t in (480, 540, 600, 660):
            self.assertEqual(self.observe(stable, mod.OK, t).status, mod.CRITICAL)
        self.assertEqual(self.observe(stable, mod.OK, 720).status, mod.OK)


if __name__ == '__main__':
    unittest.main()
