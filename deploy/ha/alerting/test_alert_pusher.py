"""Unit tests for the email alert pusher.

Run from the repository root:

    python3 -m unittest discover -s deploy/ha/alerting -v

No test opens a network connection: the transport, clock, secret file and
report file are all fakes or temporary files.
"""
import datetime
import json
import logging
import os
import pathlib
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import alert_pusher as mod  # noqa: E402

UTC = datetime.timezone.utc
NOW = datetime.datetime(2026, 9, 10, 12, 0, tzinfo=UTC)
API_KEY = 're_SECRET_KEY_do_not_leak_9f8e7d'
PROVIDER_BODY = '{"id":"provider-body-must-not-leak-1234"}'


class Clock:
    def __init__(self, now=NOW):
        self.now = now

    def __call__(self):
        return self.now

    def advance(self, seconds):
        self.now = self.now + datetime.timedelta(seconds=seconds)
        return self.now


class FakeTransport:
    """Records every send; ``outcomes`` is a script of ``None`` (accepted) or an
    exception to raise, consumed in order. Empty script means accept."""

    def __init__(self, outcomes=None):
        self.outcomes = list(outcomes or [])
        self.calls = []

    def send(self, secret, subject, text, idempotency_key):
        self.calls.append({'secret': secret, 'subject': subject, 'text': text, 'key': idempotency_key})
        outcome = self.outcomes.pop(0) if self.outcomes else None
        if outcome is not None:
            raise outcome
        return 200


class PusherTestCase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        root = pathlib.Path(self.tmp.name)
        self.monitor_dir = root / 'monitor-state'
        self.state_dir = root / 'state'
        self.secret_path = root / 'secrets' / 'email.json'
        self.monitor_dir.mkdir()
        self.secret_path.parent.mkdir()
        self.write_secret()
        self.clock = Clock()
        self.transport = FakeTransport()
        self.ids = iter('id-%d' % n for n in range(1, 1000))

    def settings(self, **overrides):
        env = {'POINTFINDER_ALERT_NODE_NAME': 'test-node',
               'POINTFINDER_ALERT_MONITOR_STATE_DIR': str(self.monitor_dir),
               'POINTFINDER_ALERT_STATE_DIR': str(self.state_dir),
               'POINTFINDER_ALERT_SECRET_PATH': str(self.secret_path)}
        env.update({'POINTFINDER_ALERT_' + k.upper(): str(v) for k, v in overrides.items()})
        return mod.Settings(env)

    def pusher(self, **overrides):
        return mod.Pusher(self.settings(**overrides), transport=self.transport, clock=self.clock,
                          new_id=lambda: next(self.ids))

    def write_secret(self, **fields):
        data = {'api_key': API_KEY, 'from': 'alerts@example.com', 'to': ['ops@example.com']}
        data.update(fields)
        self.secret_path.write_text(json.dumps(data))

    def write_report(self, status='ok', checks=None, generated_at=None, node='production-hetzner', role='primary'):
        generated_at = generated_at or self.clock.now
        checks = checks if checks is not None else {'sql': ('ok', 'reachable')}
        report = {'schema': 1, 'node': node, 'role': role, 'generated_at': generated_at.isoformat(),
                  'status': status,
                  'checks': {name: {'status': s, 'reason': r, 'observed_at': generated_at.isoformat()}
                             for name, (s, r) in checks.items()}}
        (self.monitor_dir / 'health.json').write_text(json.dumps(report))

    def state(self):
        return json.loads((self.state_dir / 'alert-state.json').read_text())

    def status(self):
        return json.loads((self.state_dir / 'pusher-status.json').read_text())


class TransitionTests(PusherTestCase):
    def test_uncertain_alert_is_confirmed_before_recovery(self):
        self.write_report('critical', {'sql': ('critical', 'synthetic')})
        self.transport.outcomes = [mod.DeliveryError('TimeoutError', uncertain=True)]
        pusher = self.pusher()
        pusher.tick()
        key = self.transport.calls[0]['key']
        self.write_report('ok')
        self.clock.advance(30)
        pusher.tick()
        self.assertEqual(self.transport.calls[-1]['key'], key)
        self.assertEqual(pusher.state.delivered['kind'], 'alert')
        self.clock.advance(30)
        pusher.tick()
        self.assertEqual(pusher.state.delivered['kind'], 'recovery')
        self.assertEqual(len(self.transport.calls), 3)

    def test_healthy_start_sends_nothing(self):
        self.write_report('ok')
        pusher = self.pusher()
        for _ in range(3):
            pusher.tick()
            self.clock.advance(30)
            self.write_report('ok')
        self.assertEqual(self.transport.calls, [])
        self.assertFalse((self.state_dir / 'alert-state.json').exists())
        self.assertTrue((self.state_dir / 'pusher-status.json').exists())

    def test_ok_to_critical_alerts_once_despite_changing_reasons(self):
        self.write_report('ok')
        pusher = self.pusher()
        pusher.tick()
        self.write_report('critical', {'sql': ('ok', 'reachable'),
                                       'archiver': ('critical', 'archive_command failing; last failure 0m ago')})
        pusher.tick()
        self.assertEqual(len(self.transport.calls), 1)
        call = self.transport.calls[0]
        self.assertEqual(call['subject'], '[PointFinder DB] production-hetzner CRITICAL: archiver')
        self.assertIn('critical  archiver: archive_command failing; last failure 0m ago', call['text'])
        self.assertIn('Previously notified status: none', call['text'])
        for minutes in range(1, 20):
            self.clock.advance(60)
            self.write_report('critical', {'sql': ('ok', 'reachable'),
                                           'archiver': ('critical', 'archive_command failing; last failure %dm ago'
                                                        % minutes)})
            pusher.tick()
        self.assertEqual(len(self.transport.calls), 1)
        delivered = self.state()['delivered']
        self.assertEqual(delivered['status'], 'critical')
        self.assertEqual(delivered['checks'], {'archiver': 'critical'})
        self.assertIsNone(self.state()['pending'])

    def test_warning_and_level_changes_alert_immediately(self):
        self.write_report('warning', {'disk': ('warning', '15.0% free')})
        pusher = self.pusher()
        pusher.tick()
        self.assertEqual(self.transport.calls[-1]['subject'], '[PointFinder DB] production-hetzner WARNING: disk')
        self.clock.advance(30)
        self.write_report('critical', {'disk': ('critical', '5.0% free')})
        pusher.tick()
        self.assertEqual(len(self.transport.calls), 2)
        self.assertIn('CRITICAL: disk', self.transport.calls[-1]['subject'])
        self.assertIn('Previously notified status: warning', self.transport.calls[-1]['text'])
        self.clock.advance(30)
        self.write_report('warning', {'disk': ('warning', '15.0% free')})
        pusher.tick()
        self.assertEqual(len(self.transport.calls), 3)
        self.assertIn('WARNING: disk', self.transport.calls[-1]['subject'])

    def test_check_set_change_at_same_level_is_coalesced(self):
        self.write_report('warning', {'disk': ('warning', '15.0% free')})
        pusher = self.pusher(coalesce_seconds=600)
        pusher.tick()
        self.assertEqual(len(self.transport.calls), 1)
        self.clock.advance(30)
        self.write_report('warning', {'disk': ('warning', '15.0% free'), 'wal': ('warning', '2.5 GiB in pg_wal')})
        pusher.tick()
        self.assertEqual(len(self.transport.calls), 1, 'coalesced, not sent yet')
        self.assertIsNotNone(self.state()['pending'])
        # The picture keeps changing while we wait; only the latest one is sent.
        self.clock.advance(30)
        self.write_report('warning', {'disk': ('warning', '15.0% free'),
                                      'replication': ('warning', 'wal receiver absent')})
        pusher.tick()
        self.assertEqual(len(self.transport.calls), 1)
        self.clock.advance(600)
        self.write_report('warning', {'disk': ('warning', '15.0% free'),
                                      'replication': ('warning', 'wal receiver absent')})
        pusher.tick()
        self.assertEqual(len(self.transport.calls), 2)
        self.assertEqual(self.transport.calls[-1]['subject'],
                         '[PointFinder DB] production-hetzner WARNING: disk, replication')
        self.assertNotIn('wal', self.transport.calls[-1]['subject'])

    def test_recovery_email_after_alert(self):
        self.write_report('critical', {'backup': ('critical', 'no successful backup in repository')})
        pusher = self.pusher()
        pusher.tick()
        self.clock.advance(60)
        self.write_report('ok')
        pusher.tick()
        self.assertEqual(len(self.transport.calls), 2)
        self.assertEqual(self.transport.calls[-1]['subject'],
                         '[PointFinder DB] production-hetzner recovered (was critical)')
        self.assertEqual(self.state()['delivered']['kind'], 'recovery')
        self.clock.advance(60)
        self.write_report('ok')
        pusher.tick()
        self.assertEqual(len(self.transport.calls), 2, 'no repeated recovery')

    def test_recovery_before_delivery_withdraws_alert(self):
        self.write_report('warning', {'disk': ('warning', '15.0% free')})
        self.transport.outcomes = [mod.DeliveryError('http_429', uncertain=False)]
        pusher = self.pusher()
        with self.assertLogs(mod.LOG, logging.INFO) as logs:
            pusher.tick()
            self.clock.advance(30)
            self.write_report('ok')
            pusher.tick()
        self.assertEqual(len(self.transport.calls), 1)
        self.assertIsNone(self.state()['pending'])
        self.assertIsNone(self.state()['delivered'])
        self.assertTrue(any('Withdrawing undelivered alert' in line for line in logs.output))
        self.clock.advance(30)
        self.write_report('ok')
        pusher.tick()
        self.assertEqual(len(self.transport.calls), 1, 'no recovery for an alert that was never delivered')


class StaleReportTests(PusherTestCase):
    def test_stale_report_alerts_as_unknown_and_recovers(self):
        self.write_report('ok')
        pusher = self.pusher()
        pusher.tick()
        self.clock.advance(150)
        pusher.tick()
        self.assertEqual(self.transport.calls, [], 'inside the stale window')
        self.clock.advance(60)
        pusher.tick()
        self.assertEqual(len(self.transport.calls), 1)
        self.assertEqual(self.transport.calls[0]['subject'], '[PointFinder DB] test-node UNKNOWN: report')
        self.assertIn('health report stale (210s old)', self.transport.calls[0]['text'])
        self.clock.advance(30)
        pusher.tick()
        self.assertEqual(len(self.transport.calls), 1, 'growing age does not re-alert')
        self.write_report('ok')
        pusher.tick()
        self.assertEqual(len(self.transport.calls), 2)
        self.assertIn('recovered (was unknown)', self.transport.calls[-1]['subject'])

    def test_missing_and_unparseable_reports_alert(self):
        pusher = self.pusher()
        pusher.tick()
        self.assertEqual(len(self.transport.calls), 1)
        self.assertIn('health report missing', self.transport.calls[0]['text'])
        (self.monitor_dir / 'health.json').write_text('{not json')
        self.clock.advance(30)
        pusher.tick()
        self.assertEqual(len(self.transport.calls), 1, 'unknown -> unknown with the same report check')
        self.assertEqual(self.state()['delivered']['checks'], {'report': 'unknown'})

    def test_future_dated_report_is_unknown(self):
        observation = mod.observe(self.monitor_dir / 'health.json', NOW, 180)
        self.assertEqual(observation.source, 'missing')
        self.write_report('ok', generated_at=NOW + datetime.timedelta(seconds=120))
        observation = mod.observe(self.monitor_dir / 'health.json', NOW, 180)
        self.assertEqual((observation.status, observation.source), ('unknown', 'future'))

    def test_observation_sanitises_report_content(self):
        self.write_report('ok', {'weird\x00name' * 20: ('bogus', 'x' * 1000)})
        observation = mod.observe(self.monitor_dir / 'health.json', NOW, 180)
        self.assertEqual(observation.status, 'unknown')
        name, check = next(iter(observation.checks.items()))
        self.assertEqual(len(name), mod.MAX_NAME_LENGTH)
        self.assertNotIn('\x00', name)
        self.assertEqual(len(check['reason']), mod.MAX_REASON_LENGTH)


class DeliveryFailureTests(PusherTestCase):
    def test_failed_delivery_retries_with_bounded_backoff_and_same_key(self):
        self.write_report('critical', {'sql': ('critical', 'unreachable: OperationalError')})
        self.transport.outcomes = [mod.DeliveryError('TimeoutError', uncertain=True),
                                   mod.DeliveryError('http_500', uncertain=True),
                                   mod.DeliveryError('ConnectionRefusedError', uncertain=False),
                                   mod.DeliveryError('http_500', uncertain=True),
                                   mod.DeliveryError('http_500', uncertain=True),
                                   mod.DeliveryError('http_500', uncertain=True)]
        pusher = self.pusher(retry_min_seconds=30, retry_max_seconds=200)
        pusher.tick()
        self.assertEqual(len(self.transport.calls), 1)
        self.assertIsNone(self.state()['delivered'], 'delivery state only on success')
        pending = self.state()['pending']
        self.assertEqual((pending['attempts'], pending['last_failure'], pending['uncertain']), (1, 'TimeoutError', True))
        # Each retry waits for the persisted backoff; the key never changes.
        expected_delays = [30, 60, 120, 200, 200]
        for index, delay in enumerate(expected_delays):
            scheduled = mod._parse(self.state()['pending']['next_attempt_at'])
            self.assertEqual((scheduled - self.clock.now).total_seconds(), delay)
            self.clock.advance(delay - 10)
            self.write_report('critical', {'sql': ('critical', 'unreachable: OperationalError')})
            pusher.tick()
            self.assertEqual(len(self.transport.calls), index + 1, 'not due yet')
            self.clock.advance(10)
            self.write_report('critical', {'sql': ('critical', 'unreachable: OperationalError')})
            pusher.tick()
            self.assertEqual(len(self.transport.calls), index + 2)
        self.assertEqual({call['key'] for call in self.transport.calls}, {'id-1'}, 'idempotency key reused')
        self.assertEqual(self.state()['pending']['attempts'], 6)
        self.assertIsNone(self.state()['delivered'])
        # Now the provider accepts: the same key is used and delivery is recorded.
        self.clock.advance(200)
        self.write_report('critical', {'sql': ('critical', 'unreachable: OperationalError')})
        pusher.tick()
        self.assertEqual(len(self.transport.calls), 7)
        self.assertEqual(self.transport.calls[-1]['key'], 'id-1')
        self.assertEqual(self.state()['delivered']['id'], 'id-1')
        self.assertIsNone(self.state()['pending'])

    def test_backoff_schedule_is_exponential_and_capped(self):
        pending = {'kind': 'alert', 'attempts': 0, 'next_attempt_at': None, 'last_failure': None, 'uncertain': False}
        pusher = self.pusher(retry_min_seconds=30, retry_max_seconds=200)
        pusher.state.pending = pending
        expected = [30, 60, 120, 200, 200]
        for delay in expected:
            pusher.record_failure(pending, self.clock.now, 'http_500', uncertain=True)
            self.assertEqual((mod._parse(pending['next_attempt_at']) - self.clock.now).total_seconds(), delay)

    def test_secret_problems_are_reported_by_label_only(self):
        self.write_report('critical', {'sql': ('critical', 'unreachable: OperationalError')})
        self.secret_path.write_text('{"api_key": "%s", "from": "nope"}' % API_KEY)
        pusher = self.pusher()
        with self.assertLogs(mod.LOG, logging.WARNING) as logs:
            pusher.tick()
        self.assertEqual(self.transport.calls, [])
        self.assertEqual(self.state()['pending']['last_failure'], 'secret file has no valid from address')
        self.assertTrue(any('secret file has no valid from address' in line for line in logs.output))
        self.assertFalse(any(API_KEY in line for line in logs.output))
        # Fixing the secret file is picked up on the next attempt without a restart.
        self.write_secret()
        self.clock.advance(60)
        pusher.tick()
        self.assertEqual(len(self.transport.calls), 1)

    def test_hourly_cap_bounds_storms(self):
        pusher = self.pusher(max_emails_per_hour=3)
        with self.assertLogs(mod.LOG, logging.WARNING) as logs:
            for n in range(10):
                self.write_report('critical' if n % 2 == 0 else 'ok',
                                  {'sql': ('critical', 'unreachable')} if n % 2 == 0 else None)
                pusher.tick()
                self.clock.advance(30)
        self.assertEqual(len(self.transport.calls), 3)
        self.assertTrue(any('Hourly email cap reached' in line for line in logs.output))
        self.assertEqual(sum('Hourly email cap reached' in line for line in logs.output), 1, 'logged once')
        self.clock.advance(3600)
        self.write_report('ok')
        pusher.tick()
        self.assertEqual(len(self.transport.calls), 4, 'pending message flows once the window moves on')


class RestartTests(PusherTestCase):
    def test_restart_does_not_repeat_a_delivered_alert(self):
        self.write_report('critical', {'sql': ('critical', 'unreachable: OperationalError')})
        first = self.pusher()
        first.tick()
        self.assertEqual(len(self.transport.calls), 1)
        self.clock.advance(120)
        self.write_report('critical', {'sql': ('critical', 'unreachable: InterfaceError')})
        second = self.pusher()
        second.tick()
        self.assertEqual(len(self.transport.calls), 1)
        self.clock.advance(60)
        self.write_report('ok')
        second.tick()
        self.assertEqual(len(self.transport.calls), 2)
        self.assertIn('recovered', self.transport.calls[-1]['subject'])

    def test_restart_keeps_pending_key_and_schedule(self):
        self.write_report('critical', {'sql': ('critical', 'unreachable: OperationalError')})
        self.transport.outcomes = [mod.DeliveryError('TimeoutError', uncertain=True)]
        first = self.pusher(retry_min_seconds=300)
        first.tick()
        next_attempt = self.state()['pending']['next_attempt_at']
        self.clock.advance(30)
        second = self.pusher(retry_min_seconds=300)
        second.tick()
        self.assertEqual(len(self.transport.calls), 1, 'backoff respected across restart')
        self.assertEqual(self.state()['pending']['next_attempt_at'], next_attempt)
        self.clock.advance(300)
        self.write_report('critical', {'sql': ('critical', 'unreachable: OperationalError')})
        second.tick()
        self.assertEqual(len(self.transport.calls), 2)
        self.assertEqual(self.transport.calls[0]['key'], self.transport.calls[1]['key'])

    def test_corrupt_state_starts_fresh(self):
        self.state_dir.mkdir()
        (self.state_dir / 'alert-state.json').write_text('garbage')
        with self.assertLogs(mod.LOG, logging.WARNING):
            pusher = self.pusher()
        self.assertIsNone(pusher.state.delivered)


class SecretHygieneTests(PusherTestCase):
    def test_key_and_provider_body_never_reach_logs_or_state(self):
        self.write_report('critical', {'sql': ('critical', 'unreachable: OperationalError')})

        class LeakyError(Exception):
            pass

        self.transport.outcomes = [LeakyError('leaked ' + API_KEY + ' ' + PROVIDER_BODY), None]
        pusher = self.pusher()
        with self.assertLogs(mod.LOG, logging.INFO) as logs:
            pusher.tick()
            self.clock.advance(60)
            self.write_report('critical', {'sql': ('critical', 'unreachable: OperationalError')})
            pusher.tick()
        self.assertEqual(len(self.transport.calls), 2)
        output = '\n'.join(logs.output)
        self.assertIn('LeakyError', output)
        self.assertNotIn(API_KEY, output)
        self.assertNotIn(PROVIDER_BODY, output)
        for name in ('alert-state.json', 'pusher-status.json'):
            text = (self.state_dir / name).read_text()
            self.assertNotIn(API_KEY, text)
            self.assertNotIn(PROVIDER_BODY, text)
            self.assertNotIn('ops@example.com', text)
        self.assertNotIn(API_KEY, repr(self.transport.calls[0]['secret']))

    def test_secret_loader_errors_carry_no_content(self):
        self.secret_path.write_text('{"api_key": "%s", "from": 1' % API_KEY)
        with self.assertRaises(mod.SecretError) as ctx:
            mod.load_secret(self.secret_path)
        self.assertNotIn(API_KEY, str(ctx.exception))
        self.secret_path.unlink()
        with self.assertRaises(mod.SecretError):
            mod.load_secret(self.secret_path)
        self.write_secret(to='single@example.com')
        secret = mod.load_secret(self.secret_path)
        self.assertEqual(secret.recipients, ('single@example.com',))


class TransportTests(unittest.TestCase):
    class FakeResponse:
        def __init__(self, status, body):
            self.status = status
            self.body = body
            self.read_sizes = []

        def read(self, size=None):
            self.read_sizes.append(size)
            return self.body[:size]

    class FakeConnection:
        instances = []

        def __init__(self, host, port, timeout=None, context=None):
            self.host, self.port, self.timeout, self.context = host, port, timeout, context
            self.requests = []
            self.closed = False
            self.response = None
            self.request_error = None
            self.response_error = None
            TransportTests.FakeConnection.instances.append(self)

        def request(self, method, path, body=None, headers=None):
            if self.request_error:
                raise self.request_error
            self.requests.append((method, path, body, headers))

        def getresponse(self):
            if self.response_error:
                raise self.response_error
            return self.response

        def close(self):
            self.closed = True

    def setUp(self):
        TransportTests.FakeConnection.instances = []
        self.settings = mod.Settings({'POINTFINDER_ALERT_NODE_NAME': 'n', 'POINTFINDER_ALERT_HTTP_TIMEOUT_SECONDS': '7',
                                      'POINTFINDER_ALERT_RESPONSE_MAX_BYTES': '100'})
        self.secret = mod.Secret(API_KEY, 'alerts@example.com', ['ops@example.com', 'oncall@example.com'])
        self.response = None
        self.request_error = None
        self.response_error = None

        def factory(host, port, timeout=None, context=None):
            connection = TransportTests.FakeConnection(host, port, timeout, context)
            connection.response = self.response
            connection.request_error = self.request_error
            connection.response_error = self.response_error
            return connection

        self.transport = mod.ResendTransport(self.settings, connection_factory=factory)

    def test_request_shape(self):
        self.response = self.FakeResponse(200, ('x' * 500).encode())
        status = self.transport.send(self.secret, 'Subject', 'Body', 'key-1')
        self.assertEqual(status, 200)
        connection = self.FakeConnection.instances[0]
        self.assertEqual((connection.host, connection.port, connection.timeout), ('api.resend.com', 443, 7))
        self.assertIsNotNone(connection.context)
        method, path, body, headers = connection.requests[0]
        self.assertEqual((method, path), ('POST', '/emails'))
        self.assertEqual(headers['Authorization'], 'Bearer ' + API_KEY)
        self.assertEqual(headers['Idempotency-Key'], 'key-1')
        self.assertEqual(json.loads(body), {'from': 'alerts@example.com',
                                            'to': ['ops@example.com', 'oncall@example.com'],
                                            'subject': 'Subject', 'text': 'Body'})
        self.assertEqual(self.response.read_sizes, [100], 'response read is bounded')
        self.assertTrue(connection.closed)

    def test_redirect_and_client_errors_are_definite_failures(self):
        for status in (301, 302, 307, 400, 401, 422, 429):
            self.response = self.FakeResponse(status, b'{"message": "%s"}' % PROVIDER_BODY.encode())
            with self.assertRaises(mod.DeliveryError) as ctx:
                self.transport.send(self.secret, 'S', 'B', 'k')
            self.assertEqual(ctx.exception.label, 'http_%d' % status)
            self.assertFalse(ctx.exception.uncertain)
            self.assertNotIn(PROVIDER_BODY, str(ctx.exception))
        self.response = self.FakeResponse(502, b'')
        with self.assertRaises(mod.DeliveryError) as ctx:
            self.transport.send(self.secret, 'S', 'B', 'k')
        self.assertTrue(ctx.exception.uncertain)

    def test_send_and_response_errors_classified(self):
        self.request_error = ConnectionRefusedError('refused ' + API_KEY)
        with self.assertRaises(mod.DeliveryError) as ctx:
            self.transport.send(self.secret, 'S', 'B', 'k')
        self.assertEqual((ctx.exception.label, ctx.exception.uncertain), ('ConnectionRefusedError', True))
        self.assertNotIn(API_KEY, str(ctx.exception))
        self.request_error = None
        self.response_error = TimeoutError('timed out')
        with self.assertRaises(mod.DeliveryError) as ctx:
            self.transport.send(self.secret, 'S', 'B', 'k')
        self.assertEqual((ctx.exception.label, ctx.exception.uncertain), ('TimeoutError', True))
        self.assertTrue(all(c.closed for c in self.FakeConnection.instances))


class EntryPointTests(PusherTestCase):
    def test_healthcheck_states(self):
        settings = self.settings()
        self.assertEqual(mod.healthcheck(settings, self.clock), 1, 'missing status file')
        self.write_report('ok')
        pusher = self.pusher()
        pusher.tick()
        self.assertEqual(mod.healthcheck(settings, self.clock), 0)
        self.clock.advance(settings.healthcheck_max_age + 1)
        self.assertEqual(mod.healthcheck(settings, self.clock), 1, 'stale status file')
        # A delivery that keeps failing turns unhealthy after the grace period only.
        self.write_report('critical', {'sql': ('critical', 'unreachable')})
        self.transport.outcomes = [mod.DeliveryError('http_401', uncertain=False)] * 50
        pusher = self.pusher(delivery_failure_grace_seconds=1000)
        settings = self.settings(delivery_failure_grace_seconds=1000)
        pusher.tick()
        self.assertEqual(mod.healthcheck(settings, self.clock), 0, 'inside grace')
        self.clock.advance(500)
        self.write_report('critical', {'sql': ('critical', 'unreachable'), 'disk': ('critical', '1% free')})
        pusher.tick()
        self.assertEqual(self.status()['pending']['attempts'], 1, 'replaced pending retried at once')
        self.clock.advance(501)
        self.write_report('critical', {'sql': ('critical', 'unreachable'), 'disk': ('critical', '1% free')})
        pusher.tick()
        self.assertEqual(mod.healthcheck(settings, self.clock), 1, 'grace counts from the first queued message')
        self.assertNotIn(API_KEY, (self.state_dir / 'pusher-status.json').read_text())

    def test_test_email_sends_without_touching_state(self):
        settings = self.settings()
        code = mod.test_email(settings, transport=self.transport, clock=self.clock, new_id=lambda: 'test-key')
        self.assertEqual(code, 0)
        self.assertEqual(len(self.transport.calls), 1)
        self.assertEqual(self.transport.calls[0]['subject'], '[PointFinder DB] alert pusher installed on test-node')
        self.assertEqual(self.transport.calls[0]['key'], 'test-key')
        self.assertFalse(self.state_dir.exists())
        self.secret_path.unlink()
        self.assertEqual(mod.test_email(settings, transport=self.transport, clock=self.clock), 1)
        self.write_secret()
        self.transport.outcomes = [mod.DeliveryError('http_401', uncertain=False)]
        self.assertEqual(mod.test_email(settings, transport=self.transport, clock=self.clock), 1)

    def test_sigterm_stops_loop(self):
        self.write_report('ok')
        sleeps = []

        def sleep(seconds):
            sleeps.append(seconds)
            pusher.request_stop()

        pusher = mod.Pusher(self.settings(), transport=self.transport, clock=self.clock, sleep=sleep)
        pusher.loop()
        self.assertEqual(sleeps, [30.0])
        self.assertTrue(pusher.stop.is_set())

    def test_loop_survives_tick_errors(self):
        self.write_report('ok')
        calls = []

        def sleep(seconds):
            calls.append(seconds)
            if len(calls) == 2:
                pusher.request_stop()

        pusher = mod.Pusher(self.settings(), transport=self.transport, clock=self.clock, sleep=sleep)
        pusher.tick = lambda: (_ for _ in ()).throw(RuntimeError('boom ' + API_KEY))
        with self.assertLogs(mod.LOG, logging.ERROR) as logs:
            pusher.loop()
        self.assertEqual(len(calls), 2)
        self.assertTrue(any('Tick failed: RuntimeError' in line for line in logs.output))
        self.assertFalse(any(API_KEY in line for line in logs.output))

    def test_main_usage(self):
        self.assertEqual(mod.main(['--bogus']), 2)


if __name__ == '__main__':
    unittest.main()
