"""Tests for the health-gated connector supervisor.

Run from the repository root:

    python3 -m unittest discover -s deploy/cloudflared-supervisor -v

Unit tests drive ``Supervisor.tick()`` with a fake clock, a scripted probe and a
fake child. Two integration tests run the real module as a subprocess with a
real (harmless) child process and a local HTTP probe server, and never touch
cloudflared or any network beyond loopback.
"""

import http.server
import os
import signal
import subprocess
import sys
import tempfile
import textwrap
import threading
import time
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import supervisor as sup  # noqa: E402


# --------------------------------------------------------------------------- #
# Fakes
# --------------------------------------------------------------------------- #


class FakeClock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now

    def sleep(self, seconds: float) -> None:
        self.now += seconds


class FakeChild:
    """Behaves like subprocess.Popen for the calls the supervisor makes."""

    _next_pid = 4000

    def __init__(self, honors_sigterm: bool = True) -> None:
        FakeChild._next_pid += 1
        self.pid = FakeChild._next_pid
        self.exit_code = None
        self.honors_sigterm = honors_sigterm
        self.terminated = False
        self.killed = False

    def poll(self):
        return self.exit_code

    def terminate(self) -> None:
        self.terminated = True
        if self.honors_sigterm:
            self.exit_code = 0

    def kill(self) -> None:
        self.killed = True
        self.exit_code = -9

    def wait(self, timeout=None):
        if self.exit_code is None:
            raise subprocess.TimeoutExpired(cmd="fake", timeout=timeout)
        return self.exit_code

    # test helpers
    def crash(self, code: int = 1) -> None:
        self.exit_code = code


class ScriptedProbe:
    """Returns queued results; the last result repeats forever."""

    def __init__(self, *results) -> None:
        self.results = list(results)
        self.calls = 0

    def __call__(self) -> bool:
        self.calls += 1
        if len(self.results) > 1:
            return self.results.pop(0)
        return self.results[0]


def make_supervisor(probe, honors_sigterm=True, **overrides):
    config = sup.Config(
        probe_url="http://origin:8080/_ha/ready",
        probe_interval=5.0,
        healthy_threshold=2,
        unhealthy_threshold=3,
        stop_grace=10.0,
        backoff_min=2.0,
        backoff_max=16.0,
        backoff_reset_after=100.0,
        **overrides,
    )
    config.validate()
    clock = FakeClock()
    children = []

    def spawn():
        child = FakeChild(honors_sigterm=honors_sigterm)
        children.append(child)
        return child

    logs = []
    s = sup.Supervisor(config, probe=probe, spawn=spawn, clock=clock, sleep=clock.sleep,
                       logger=logs.append)
    s.children = children  # type: ignore[attr-defined]
    s.logs = logs  # type: ignore[attr-defined]
    s.clock = clock  # type: ignore[attr-defined]
    return s


def ticks(s, n):
    for _ in range(n):
        s.tick()
        s.clock.sleep(s.config.probe_interval)


# --------------------------------------------------------------------------- #
# Unit tests
# --------------------------------------------------------------------------- #


class StartupGatingTest(unittest.TestCase):
    def test_does_not_start_while_probe_unhealthy(self):
        s = make_supervisor(ScriptedProbe(False))
        ticks(s, 10)
        self.assertEqual(s.spawn_count, 0)
        self.assertEqual(s.state, sup.STATE_WITHDRAWN)

    def test_starts_only_after_healthy_threshold(self):
        s = make_supervisor(ScriptedProbe(True))
        s.tick()
        self.assertEqual(s.spawn_count, 0, "one healthy probe must not start the connector")
        s.tick()
        self.assertEqual(s.spawn_count, 1)
        self.assertEqual(s.state, sup.STATE_SERVING)
        ticks(s, 5)
        self.assertEqual(s.spawn_count, 1, "a serving connector is not respawned")

    def test_flapping_probe_never_reaches_threshold(self):
        s = make_supervisor(ScriptedProbe(True, False, True, False, True, False))
        ticks(s, 6)
        self.assertEqual(s.spawn_count, 0)

    def test_probe_exception_counts_as_unhealthy(self):
        def boom():
            raise ConnectionError("refused")

        s = make_supervisor(boom)
        ticks(s, 3)
        self.assertEqual(s.spawn_count, 0)
        self.assertEqual(s.unhealthy_streak, 3)
        self.assertTrue(any(line == "probe raised ConnectionError" for line in s.logs),
                        "exception text must not be logged")


class UnhealthyWithdrawalTest(unittest.TestCase):
    def serving_supervisor(self, probe, **kw):
        s = make_supervisor(probe, **kw)
        ticks(s, 2)
        self.assertEqual(s.state, sup.STATE_SERVING)
        return s

    def test_withdraws_after_unhealthy_threshold(self):
        s = self.serving_supervisor(ScriptedProbe(True, True, False, False, False))
        ticks(s, 2)
        self.assertEqual(s.state, sup.STATE_SERVING, "two failures are below the threshold")
        self.assertFalse(s.children[0].terminated)
        s.tick()
        self.assertEqual(s.state, sup.STATE_WITHDRAWN)
        self.assertTrue(s.children[0].terminated)
        self.assertFalse(s.children[0].killed)
        self.assertIsNone(s.child)
        self.assertEqual(s.crash_count, 0, "a deliberate withdrawal is not a crash")

    def test_single_failure_in_healthy_run_does_not_withdraw(self):
        s = self.serving_supervisor(ScriptedProbe(True, True, False, True, True, False, True))
        ticks(s, 6)
        self.assertEqual(s.state, sup.STATE_SERVING)
        self.assertEqual(s.spawn_count, 1)

    def test_child_ignoring_sigterm_is_killed_after_grace(self):
        s = self.serving_supervisor(ScriptedProbe(True, True, False), honors_sigterm=False)
        ticks(s, 3)
        child = s.children[0]
        self.assertTrue(child.terminated)
        self.assertTrue(child.killed)
        self.assertEqual(s.state, sup.STATE_WITHDRAWN)
        self.assertTrue(any("SIGKILL" in line for line in s.logs))


class RecoveryTest(unittest.TestCase):
    def test_restarts_after_probe_recovers(self):
        probe = ScriptedProbe(True, True, False, False, False, True, True)
        s = make_supervisor(probe)
        ticks(s, 5)
        self.assertEqual(s.state, sup.STATE_WITHDRAWN)
        s.tick()
        self.assertEqual(s.spawn_count, 1, "recovery needs the full healthy threshold again")
        s.tick()
        self.assertEqual(s.spawn_count, 2)
        self.assertEqual(s.state, sup.STATE_SERVING)
        self.assertIsNot(s.children[1], s.children[0])

    def test_recovery_is_not_delayed_by_backoff(self):
        s = make_supervisor(ScriptedProbe(True, True, False, False, False, True, True))
        ticks(s, 7)
        self.assertEqual(s.spawn_count, 2)
        self.assertEqual(s.next_start_allowed_at, 0.0)


class CrashBackoffTest(unittest.TestCase):
    def test_crash_is_restarted_after_backoff(self):
        s = make_supervisor(ScriptedProbe(True))
        ticks(s, 2)
        s.children[0].crash(1)
        s.tick()  # reaps the crash; probe healthy (streak 1 after reset)
        self.assertEqual(s.state, sup.STATE_WITHDRAWN)
        self.assertEqual(s.crash_count, 1)
        self.assertEqual(s.spawn_count, 1)
        self.assertEqual(s.next_start_allowed_at, s.clock.now + 2.0)
        # Backoff of 2s is shorter than the 5s interval: next tick has streak 2 and is allowed.
        s.clock.sleep(5.0)
        s.tick()
        self.assertEqual(s.spawn_count, 2)

    def test_backoff_doubles_and_caps(self):
        s = make_supervisor(ScriptedProbe(True))
        expected = [2.0, 4.0, 8.0, 16.0, 16.0]
        ticks(s, 2)
        for crash_number, backoff in enumerate(expected, start=1):
            s.children[-1].crash(2)
            before = s.clock.now
            s.tick()
            self.assertEqual(s.crash_count, crash_number)
            self.assertAlmostEqual(s.next_start_allowed_at - before, backoff)
            # Healthy probes alone do not restart until the backoff has elapsed.
            s.clock.sleep(backoff - 1.0)
            s.tick()
            self.assertEqual(s.spawn_count, crash_number, f"restarted early before crash #{crash_number} backoff")
            s.clock.sleep(1.0)
            s.tick()
            self.assertEqual(s.spawn_count, crash_number + 1)

    def test_backoff_resets_after_stable_run(self):
        s = make_supervisor(ScriptedProbe(True))
        ticks(s, 2)
        s.children[0].crash(1)
        s.tick()
        s.clock.sleep(5.0)
        s.tick()
        self.assertEqual(s.spawn_count, 2)
        self.assertEqual(s.crash_count, 1)
        s.clock.sleep(150.0)  # longer than backoff_reset_after
        s.children[1].crash(1)
        s.tick()
        self.assertEqual(s.crash_count, 1, "a stable run resets the crash counter before counting the new crash")
        self.assertAlmostEqual(s.next_start_allowed_at - s.clock.now, 2.0)

    def test_crash_while_unhealthy_waits_for_health(self):
        s = make_supervisor(ScriptedProbe(True, True, False))
        ticks(s, 2)
        s.children[0].crash(1)
        ticks(s, 20)
        self.assertEqual(s.spawn_count, 1)
        self.assertEqual(s.state, sup.STATE_WITHDRAWN)


class StopTest(unittest.TestCase):
    def test_request_stop_terminates_child_and_returns_zero(self):
        s = make_supervisor(ScriptedProbe(True))
        calls = {"n": 0}

        def stopping_sleep(seconds):
            calls["n"] += 1
            s.clock.sleep(seconds)
            if calls["n"] == 3:
                s.request_stop()

        s._sleep = stopping_sleep
        code = s.run()
        self.assertEqual(code, sup.EXIT_OK)
        self.assertEqual(s.spawn_count, 1)
        self.assertTrue(s.children[0].terminated)
        self.assertIsNone(s.child)
        self.assertEqual(s.state, sup.STATE_WITHDRAWN)

    def test_stop_during_probe_never_spawns(self):
        s = make_supervisor(ScriptedProbe(True))
        s.tick()
        original = s._probe

        def probe_then_signal():
            result = original()
            s.request_stop()  # signal handler fires while the probe is in flight
            return result

        s._probe = probe_then_signal
        s._sleep = lambda seconds: None
        self.assertEqual(s.run(), sup.EXIT_OK)
        self.assertEqual(s.spawn_count, 0)

    def test_real_sleep_returns_promptly_on_stop(self):
        s = make_supervisor(ScriptedProbe(False))
        s._sleep = s._interruptible_sleep  # the real, instance-bound sleep
        started = time.monotonic()
        threading.Timer(0.3, s.request_stop).start()
        s._sleep(60.0)
        self.assertLess(time.monotonic() - started, 2.0)
        self.assertEqual(s.run(), sup.EXIT_OK)

    def test_stop_while_withdrawn_is_clean(self):
        s = make_supervisor(ScriptedProbe(False))
        s._sleep = lambda seconds: s.request_stop()
        self.assertEqual(s.run(), sup.EXIT_OK)
        self.assertEqual(s.spawn_count, 0)


class ConfigTest(unittest.TestCase):
    def test_requires_probe_url(self):
        with self.assertRaises(sup.ConfigError):
            sup.Config.from_env({})

    def test_defaults_and_overrides(self):
        c = sup.Config.from_env({"PF_PROBE_URL": "http://origin:8080/_ha/ready",
                                 "PF_UNHEALTHY_THRESHOLD": "4", "PF_STOP_GRACE_SECONDS": "20"})
        self.assertEqual(c.unhealthy_threshold, 4)
        self.assertEqual(c.stop_grace, 20.0)
        self.assertEqual(c.healthy_threshold, 2)
        self.assertEqual(c.token_file, sup.DEFAULT_TOKEN_FILE)

    def test_rejects_bad_values(self):
        base = {"PF_PROBE_URL": "http://origin:8080/_ha/ready"}
        for bad in ({"PF_PROBE_URL": "origin:8080"},
                    {"PF_HEALTHY_THRESHOLD": "0"},
                    {"PF_PROBE_INTERVAL_SECONDS": "abc"},
                    {"PF_BACKOFF_MIN_SECONDS": "100", "PF_BACKOFF_MAX_SECONDS": "10"},
                    {"PF_STOP_GRACE_SECONDS": "28"},  # 28 + 3s probe timeout reaches Docker's 30s SIGKILL
                    {"PF_CLOUDFLARED_GRACE_PERIOD": "20"}):
            env = dict(base)
            env.update(bad)
            with self.assertRaises(sup.ConfigError, msg=str(bad)):
                sup.Config.from_env(env)

    def test_child_command_is_fixed_and_uses_token_file(self):
        c = sup.Config.from_env({"PF_PROBE_URL": "http://origin:8080/_ha/ready"})
        cmd = sup.cloudflared_command(c)
        self.assertEqual(cmd[0], sup.CLOUDFLARED_BIN)
        self.assertIn("--no-autoupdate", cmd)
        self.assertEqual(cmd[cmd.index("--token-file") + 1], sup.DEFAULT_TOKEN_FILE)
        self.assertNotIn("--token", cmd)

    def test_main_rejects_unreadable_token_file(self):
        code = sup.run_main(
            sup.Config(probe_url="http://127.0.0.1:1/x", token_file="/nonexistent/token"),
            probe=lambda: False, spawn=lambda: FakeChild())
        self.assertEqual(code, sup.EXIT_CONFIG)

    def test_config_error_log_omits_values(self):
        logs = []
        original = sup.log
        sup.log = logs.append
        try:
            sup.run_main(sup.Config(probe_url="http://127.0.0.1:1/x", token_file="/nonexistent/secret-name"),
                         probe=lambda: False, spawn=lambda: FakeChild())
        finally:
            sup.log = original
        self.assertEqual(logs, ["configuration error: PF_TUNNEL_TOKEN_FILE is not readable"])


# --------------------------------------------------------------------------- #
# Integration tests: real processes, loopback HTTP only
# --------------------------------------------------------------------------- #


class _ProbeHandler(http.server.BaseHTTPRequestHandler):
    status = 200

    def do_GET(self):  # noqa: N802
        self.send_response(self.__class__.status)
        self.send_header("Content-Type", "text/plain")
        self.end_headers()
        self.wfile.write(b"ready" if self.__class__.status == 200 else b"unavailable")

    def log_message(self, *args):  # silence
        pass


class ProbeServer:
    def __init__(self):
        self.handler = type("Handler", (_ProbeHandler,), {"status": 200})
        self.server = http.server.HTTPServer(("127.0.0.1", 0), self.handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)

    def __enter__(self):
        self.thread.start()
        return self

    def __exit__(self, *exc):
        self.server.shutdown()
        self.server.server_close()

    @property
    def url(self):
        return f"http://127.0.0.1:{self.server.server_address[1]}/_ha/ready"


CHILD_SCRIPT = textwrap.dedent("""
    import os, signal, sys, time
    pid_file = sys.argv[1]
    with open(pid_file, "w") as f:
        f.write(str(os.getpid()))
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))
    while True:
        time.sleep(0.05)
""")

# Runs the real module in-process with an injected spawner. No command comes
# from the environment; the child script path is fixed by the test driver.
DRIVER_SCRIPT = textwrap.dedent("""
    import subprocess, sys
    sys.path.insert(0, {here!r})
    import supervisor as sup
    config = sup.Config(probe_url={probe_url!r}, probe_interval=0.2, probe_timeout=1.0,
                        healthy_threshold=2, unhealthy_threshold=2, stop_grace=5.0,
                        backoff_min=0.2, backoff_max=1.0)
    spawn = lambda: subprocess.Popen([sys.executable, {child!r}, {pid_file!r}], start_new_session=True)
    sys.exit(sup.run_main(config, spawn=spawn, check_token_file=False))
""")


def pid_alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    # A zombie still answers kill(0); make sure it is not merely unreaped.
    try:
        with open(f"/proc/{pid}/status") as f:
            return "zombie" not in f.read()
    except OSError:
        return True


def wait_for(predicate, timeout=10.0, interval=0.05):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return True
        time.sleep(interval)
    return False


class RealProcessTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.child_script = os.path.join(self.tmp.name, "child.py")
        self.pid_file = os.path.join(self.tmp.name, "child.pid")
        with open(self.child_script, "w") as f:
            f.write(CHILD_SCRIPT)

    def tearDown(self):
        self.tmp.cleanup()

    def start_driver(self, probe_url):
        script = DRIVER_SCRIPT.format(here=HERE, probe_url=probe_url,
                                      child=self.child_script, pid_file=self.pid_file)
        return subprocess.Popen([sys.executable, "-c", script],
                                stderr=subprocess.PIPE, text=True)

    def read_child_pid(self):
        try:
            with open(self.pid_file) as f:
                return int(f.read() or 0)
        except (OSError, ValueError):
            return 0

    def test_sigterm_stops_child_and_exits_zero(self):
        with ProbeServer() as probe:
            driver = self.start_driver(probe.url)
            try:
                self.assertTrue(wait_for(lambda: self.read_child_pid() > 0), "child never started")
                child_pid = self.read_child_pid()
                self.assertTrue(pid_alive(child_pid))
                driver.send_signal(signal.SIGTERM)
                _, stderr = driver.communicate(timeout=15)
            finally:
                if driver.poll() is None:
                    driver.kill()
        self.assertEqual(driver.returncode, 0, stderr)
        self.assertTrue(wait_for(lambda: not pid_alive(child_pid), timeout=5), "child survived supervisor shutdown")
        self.assertIn("received SIGTERM", stderr)
        self.assertNotIn(probe.url, stderr, "probe URL must not be logged")
        self.assertIn("state=withdrawn (shutdown requested)", stderr)
        self.assertIn("exited cleanly", stderr)

    def test_probe_failure_withdraws_and_recovery_restarts(self):
        with ProbeServer() as probe:
            driver = self.start_driver(probe.url)
            try:
                self.assertTrue(wait_for(lambda: self.read_child_pid() > 0), "child never started")
                first_pid = self.read_child_pid()
                probe.handler.status = 503
                self.assertTrue(wait_for(lambda: not pid_alive(first_pid), timeout=10), "unhealthy probe did not withdraw")
                os.unlink(self.pid_file)
                probe.handler.status = 200
                self.assertTrue(wait_for(lambda: self.read_child_pid() > 0, timeout=10), "recovery did not restart")
                second_pid = self.read_child_pid()
                self.assertNotEqual(first_pid, second_pid)
                driver.send_signal(signal.SIGTERM)
                _, stderr = driver.communicate(timeout=15)
            finally:
                if driver.poll() is None:
                    driver.kill()
        self.assertEqual(driver.returncode, 0, stderr)
        self.assertIn("probe unhealthy 2x", stderr)
        self.assertIn("spawn #2", stderr)


class HttpProbeTest(unittest.TestCase):
    def test_200_is_healthy_503_is_not(self):
        with ProbeServer() as probe:
            self.assertTrue(sup.http_probe(probe.url, timeout=2.0))
            probe.handler.status = 503
            self.assertFalse(sup.http_probe(probe.url, timeout=2.0))

    def test_connection_refused_is_unhealthy(self):
        import socket
        with socket.socket() as s:
            s.bind(("127.0.0.1", 0))
            port = s.getsockname()[1]
        self.assertFalse(sup.http_probe(f"http://127.0.0.1:{port}/_ha/ready", timeout=1.0))


if __name__ == "__main__":
    unittest.main()
