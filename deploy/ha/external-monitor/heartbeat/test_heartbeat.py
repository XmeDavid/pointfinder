"""Unit tests for heartbeat.py: fake transport, fake clock, temp secret files."""
import datetime
import io
import json
import logging
import os
import pathlib
import tempfile
import threading
import unittest

import heartbeat

UTC = datetime.timezone.utc
T0 = datetime.datetime(2026, 9, 10, 12, 0, tzinfo=UTC)


class FakeClock:
    def __init__(self, start=T0):
        self.now = start

    def __call__(self):
        return self.now

    def advance(self, seconds):
        self.now += datetime.timedelta(seconds=seconds)


class FakeResponse:
    def __init__(self, status, body=b'{"leak":"never-logged"}'):
        self.status = status
        self._body = body

    def read(self, limit=None):
        return self._body[:limit]


class FakeConnection:
    def __init__(self, log, outcome):
        self.log = log
        self.outcome = outcome
        self.closed = False

    def request(self, method, path, body=None, headers=None):
        self.log.append({'method': method, 'path': path, 'body': body, 'headers': dict(headers or {})})
        if isinstance(self.outcome, Exception):
            raise self.outcome

    def getresponse(self):
        return FakeResponse(self.outcome)

    def close(self):
        self.closed = True


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        root = pathlib.Path(self.tmp.name)
        self.secret = root / 'heartbeat.json'
        self.write_secret({'token': 'tok-hetzner-123'})
        self.env = {
            'POINTFINDER_HEARTBEAT_HOST': 'hetzner',
            'POINTFINDER_HEARTBEAT_SECRET_PATH': str(self.secret),
            'POINTFINDER_HEARTBEAT_STATE_DIR': str(root / 'state'),
            'POINTFINDER_HEARTBEAT_INTERVAL_SECONDS': '300',
            'POINTFINDER_HEARTBEAT_START_JITTER_SECONDS': '0',
        }
        self.settings = heartbeat.Settings(self.env)
        self.clock = FakeClock()
        self.status = heartbeat.Status(self.settings, self.clock)
        self.requests = []
        self.outcomes = [204]
        self.connections = []
        self.log_stream = io.StringIO()
        self.logger = logging.getLogger('test.heartbeat')
        self.logger.handlers = [logging.StreamHandler(self.log_stream)]
        self.logger.setLevel(logging.DEBUG)
        self.logger.propagate = False

    def write_secret(self, payload, mode=0o400):
        if self.secret.exists():
            os.chmod(self.secret, 0o600)
        self.secret.write_text(json.dumps(payload))
        os.chmod(self.secret, mode)

    def transport(self):
        def factory():
            outcome = self.outcomes.pop(0) if len(self.outcomes) > 1 else self.outcomes[0]
            connection = FakeConnection(self.requests, outcome)
            self.connections.append(connection)
            return connection
        return heartbeat.Transport(self.settings, connection_factory=factory)

    def status_file(self):
        return json.loads(self.settings.status_path.read_text())


class SettingsTests(Base):
    def test_host_must_be_in_fixed_list(self):
        for bad in ('', 'evil', '../x', 'HETZNER'):
            env = dict(self.env, POINTFINDER_HEARTBEAT_HOST=bad)
            with self.assertRaises(heartbeat.ConfigError):
                heartbeat.Settings(env)
        for host in heartbeat.HOSTS:
            self.assertEqual(heartbeat.Settings(dict(self.env, POINTFINDER_HEARTBEAT_HOST=host)).path,
                             '/heartbeat/' + host)

    def test_worker_host_is_a_bare_name_and_defaults_to_workers_dev(self):
        self.assertEqual(self.settings.worker_host, 'pointfinder-monitor.xmedavid.workers.dev')
        for bad in ('', 'x/y', 'host:8443', 'https://x'):
            with self.assertRaises(heartbeat.ConfigError):
                heartbeat.Settings(dict(self.env, POINTFINDER_HEARTBEAT_WORKER_HOST=bad))

    def test_healthcheck_max_age_defaults_to_three_intervals(self):
        self.assertEqual(self.settings.healthcheck_max_age, 900)
        with self.assertRaises(heartbeat.ConfigError):
            heartbeat.Settings(dict(self.env, POINTFINDER_HEARTBEAT_INTERVAL_SECONDS='0'))


class SecretTests(Base):
    def test_reads_token_from_0400_file_owned_by_current_uid(self):
        self.assertEqual(heartbeat.read_secret(self.settings), 'tok-hetzner-123')

    def test_rejects_wrong_mode(self):
        for mode in (0o600, 0o440, 0o644, 0o000):
            self.write_secret({'token': 'x'}, mode=mode)
            with self.assertRaises(heartbeat.ConfigError) as ctx:
                heartbeat.read_secret(self.settings)
            self.assertIn('0400', str(ctx.exception))
            self.assertNotIn('tok-', str(ctx.exception))

    def test_rejects_wrong_owner(self):
        settings = heartbeat.Settings(dict(self.env, POINTFINDER_HEARTBEAT_EXPECTED_UID='999'))
        if os.getuid() == 999:
            self.skipTest('running as uid 999')
        with self.assertRaises(heartbeat.ConfigError) as ctx:
            heartbeat.read_secret(settings)
        self.assertIn('owned by uid 999', str(ctx.exception))

    def test_rejects_missing_or_malformed_secret_without_leaking(self):
        self.secret.unlink()
        with self.assertRaises(heartbeat.ConfigError):
            heartbeat.read_secret(self.settings)
        for payload in ({}, {'token': ''}, {'token': 7}, {'token': 'a\nb'}, {'token': 'x' * 600}, ['tok']):
            self.write_secret(payload)
            with self.assertRaises(heartbeat.ConfigError) as ctx:
                heartbeat.read_secret(self.settings)
            self.assertNotIn('x' * 10, str(ctx.exception))
        os.chmod(self.secret, 0o600)
        self.secret.write_text('not json')
        os.chmod(self.secret, 0o400)
        with self.assertRaises(heartbeat.ConfigError):
            heartbeat.read_secret(self.settings)


class AttemptTests(Base):
    def test_successful_beat_posts_empty_body_with_bearer_and_records_success(self):
        ok = heartbeat.attempt(self.settings, self.transport(), self.status, self.logger)
        self.assertTrue(ok)
        self.assertEqual(len(self.requests), 1)
        request = self.requests[0]
        self.assertEqual(request['method'], 'POST')
        self.assertEqual(request['path'], '/heartbeat/hetzner')
        self.assertEqual(request['body'], b'')
        self.assertEqual(request['headers']['Authorization'], 'Bearer tok-hetzner-123')
        self.assertEqual(request['headers']['Content-Length'], '0')
        self.assertTrue(self.connections[0].closed)
        data = self.status_file()
        self.assertEqual(data['last_success'], T0.isoformat())
        self.assertEqual(data['last_status_code'], 204)
        self.assertEqual(data['consecutive_failures'], 0)
        self.assertEqual(data['accepted'], 1)
        self.assertNotIn('tok-hetzner', self.settings.status_path.read_text())
        self.assertNotIn('tok-hetzner', self.log_stream.getvalue())

    def test_rejected_beat_records_status_code_only(self):
        self.outcomes = [401]
        ok = heartbeat.attempt(self.settings, self.transport(), self.status, self.logger)
        self.assertFalse(ok)
        data = self.status_file()
        self.assertIsNone(data['last_success'])
        self.assertEqual(data['last_status_code'], 401)
        self.assertEqual(data['consecutive_failures'], 1)
        self.assertIn('HTTP 401', self.log_stream.getvalue())
        self.assertNotIn('never-logged', self.log_stream.getvalue())

    def test_transport_error_records_exception_class_only(self):
        self.outcomes = [OSError('connect to 10.0.0.1 failed: secret detail')]
        ok = heartbeat.attempt(self.settings, self.transport(), self.status, self.logger)
        self.assertFalse(ok)
        self.assertEqual(self.status_file()['last_error'], 'OSError')
        self.assertNotIn('secret detail', self.log_stream.getvalue())
        self.assertNotIn('secret detail', self.settings.status_path.read_text())
        self.assertTrue(self.connections[0].closed)

    def test_secret_problem_is_reported_without_the_token_and_reread_next_time(self):
        self.write_secret({'token': 'tok-hetzner-123'}, mode=0o644)
        ok = heartbeat.attempt(self.settings, self.transport(), self.status, self.logger)
        self.assertFalse(ok)
        self.assertEqual(self.requests, [])
        self.assertIn('secret: secret file must have mode 0400', self.status_file()['last_error'])
        self.write_secret({'token': 'tok-hetzner-123'})
        self.assertTrue(heartbeat.attempt(self.settings, self.transport(), self.status, self.logger))

    def test_failure_then_success_resets_consecutive_failures(self):
        self.outcomes = [500, 503, 204]
        transport = self.transport()
        heartbeat.attempt(self.settings, transport, self.status, self.logger)
        heartbeat.attempt(self.settings, transport, self.status, self.logger)
        self.assertEqual(self.status_file()['consecutive_failures'], 2)
        heartbeat.attempt(self.settings, transport, self.status, self.logger)
        self.assertEqual(self.status_file()['consecutive_failures'], 0)
        self.assertEqual(self.status_file()['accepted'], 1)


class LoopTests(Base):
    def test_loop_beats_then_sleeps_the_interval_until_stopped(self):
        sleeps = []
        stop = threading.Event()

        def sleep(seconds):
            sleeps.append(seconds)
            self.clock.advance(seconds)
            if len(sleeps) == 3:
                stop.set()
                return True
            return False

        heartbeat.run_loop(self.settings, self.transport(), self.status, stop, sleep, log=self.logger)
        self.assertEqual(sleeps, [300, 300, 300])
        self.assertEqual(len(self.requests), 3)
        self.assertEqual(self.status_file()['accepted'], 3)

    def test_loop_applies_start_jitter_and_stops_during_it(self):
        settings = heartbeat.Settings(dict(self.env, POINTFINDER_HEARTBEAT_START_JITTER_SECONDS='20'))

        class Rng:
            @staticmethod
            def uniform(low, high):
                return 12.5

        sleeps = []
        heartbeat.run_loop(settings, self.transport(), self.status, threading.Event(),
                           lambda s: sleeps.append(s) or True, rng=Rng, log=self.logger)
        self.assertEqual(sleeps, [12.5])
        self.assertEqual(self.requests, [])

    def test_loop_fails_fast_on_a_bad_secret_mount(self):
        self.write_secret({'token': 'x'}, mode=0o644)
        with self.assertRaises(heartbeat.ConfigError):
            heartbeat.run_loop(self.settings, self.transport(), self.status, threading.Event(), lambda s: True,
                               log=self.logger)


class HealthcheckTests(Base):
    def check(self):
        out = io.StringIO()
        code = heartbeat.healthcheck(self.settings, self.clock, out)
        return code, out.getvalue().strip()

    def test_missing_status_file_is_unhealthy(self):
        code, text = self.check()
        self.assertEqual(code, 1)
        self.assertIn('missing', text)

    def test_fresh_success_is_healthy_and_ages_out_after_three_intervals(self):
        heartbeat.attempt(self.settings, self.transport(), self.status, self.logger)
        self.assertEqual(self.check()[0], 0)
        self.clock.advance(899)
        self.assertEqual(self.check()[0], 0)
        self.clock.advance(2)
        code, text = self.check()
        self.assertEqual(code, 1)
        self.assertIn('901s ago', text)

    def test_health_is_judged_from_last_success_not_last_attempt(self):
        self.outcomes = [204, 500]
        transport = self.transport()
        heartbeat.attempt(self.settings, transport, self.status, self.logger)
        self.clock.advance(300)
        heartbeat.attempt(self.settings, transport, self.status, self.logger)
        self.assertEqual(self.check()[0], 0)
        self.clock.advance(700)
        heartbeat.attempt(self.settings, transport, self.status, self.logger)
        self.assertEqual(self.check()[0], 1)

    def test_never_accepted_is_starting_then_unhealthy(self):
        self.outcomes = [401]
        transport = self.transport()
        heartbeat.attempt(self.settings, transport, self.status, self.logger)
        code, text = self.check()
        self.assertEqual(code, 0)
        self.assertIn('starting', text)
        for _ in range(3):
            heartbeat.attempt(self.settings, transport, self.status, self.logger)
        code, text = self.check()
        self.assertEqual(code, 1)
        self.assertIn('no beat accepted after 4 attempts', text)

    def test_future_dated_status_is_unhealthy(self):
        heartbeat.attempt(self.settings, self.transport(), self.status, self.logger)
        self.clock.advance(-60)
        self.assertEqual(self.check()[0], 1)


class MainTests(Base):
    def test_main_rejects_bad_configuration_and_unknown_arguments(self):
        original = dict(os.environ)
        try:
            os.environ.clear()
            os.environ.update(self.env)
            self.assertEqual(heartbeat.main(['--bogus']), 2)
            os.environ['POINTFINDER_HEARTBEAT_HOST'] = 'nope'
            self.assertEqual(heartbeat.main([]), 2)
        finally:
            os.environ.clear()
            os.environ.update(original)


if __name__ == '__main__':
    unittest.main()
