"""Recovery must be observed; unconfirmed pictures cannot send old mail."""
import unittest
import test_alert_pusher as f


class ReviewRegressions(f.PusherTestCase):
    def test_recovery_confirmation_restarts_after_blind_gap(self):
        pusher = self.pusher(recovery_confirm_seconds=180)
        self.write_report('critical', {'sql': ('critical', 'synthetic')})
        pusher.tick()
        self.clock.advance(30)
        self.write_report('ok')
        pusher.tick()
        self.clock.advance(600)
        self.write_report('ok')
        restarted = self.pusher(recovery_confirm_seconds=180)
        restarted.tick()
        self.assertEqual(len(self.transport.calls), 1)
        for _ in range(6):
            self.clock.advance(30)
            self.write_report('ok')
            restarted.tick()
        self.assertEqual(len(self.transport.calls), 2)
        self.assertEqual(restarted.state.delivered['kind'], 'recovery')

    def test_new_debouncing_picture_cannot_send_old_pending_alert(self):
        pusher = self.pusher(alert_debounce_seconds=90)
        self.transport.outcomes = [f.mod.DeliveryError('http_429', uncertain=False)]
        for _ in range(4):
            self.write_report('warning', {'disk': ('warning', 'synthetic')})
            pusher.tick()
            self.clock.advance(30)
        self.assertEqual(len(self.transport.calls), 1)
        self.assertIsNotNone(pusher.state.pending)
        self.write_report('warning', {'backup': ('warning', 'synthetic')})
        pusher.tick()
        self.assertEqual(len(self.transport.calls), 1)
        self.assertIsNone(pusher.state.pending)
        for _ in range(3):
            self.clock.advance(30)
            self.write_report('warning', {'backup': ('warning', 'synthetic')})
            pusher.tick()
        self.assertEqual(len(self.transport.calls), 2)
        self.assertIn('backup', self.transport.calls[-1]['subject'])


if __name__ == '__main__':
    unittest.main()
