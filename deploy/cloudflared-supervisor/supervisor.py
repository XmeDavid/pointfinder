#!/usr/bin/env python3
"""Health-gated supervisor for a Cloudflare Tunnel connector.

The supervisor owns a single ``cloudflared tunnel run`` child and decides,
from a local HTTP readiness probe, whether that connector may be registered
with Cloudflare at all:

* ``withdrawn``  - no connector process; Cloudflare routes to other connectors.
* ``serving``    - cloudflared is running and attracting requests.

Transitions are driven by consecutive probe results so a single flap never
starts or stops the connector. A connector that exits on its own is restarted
with exponential backoff, and only after the probe is healthy again.

Only environment *values* are read at runtime; the child command line is
fixed in this file so no operator-supplied command is ever executed. Tests
inject the probe, the spawner and the clock through ``Supervisor``'s
constructor instead of hooks in the environment.

Stdlib only; compatible with Python 3.9+.
"""

from __future__ import annotations

import os
import signal
import subprocess
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Callable, Optional, Protocol

STATE_WITHDRAWN = "withdrawn"
STATE_SERVING = "serving"

EXIT_OK = 0
EXIT_CONFIG = 78  # EX_CONFIG from sysexits.h

# Docker sends SIGKILL this long after SIGTERM by default; the whole shutdown
# (an in-flight probe plus the child grace) must fit inside it.
MAX_SHUTDOWN_SECONDS = 30.0

CLOUDFLARED_BIN = "/usr/local/bin/cloudflared"
DEFAULT_TOKEN_FILE = "/run/secrets/tunnel_token"


# --------------------------------------------------------------------------- #
# Configuration
# --------------------------------------------------------------------------- #


class ConfigError(ValueError):
    """Raised for invalid or missing configuration values."""


@dataclass(frozen=True)
class Config:
    probe_url: str
    probe_interval: float = 5.0
    probe_timeout: float = 3.0
    healthy_threshold: int = 2
    unhealthy_threshold: int = 3
    stop_grace: float = 25.0
    backoff_min: float = 2.0
    backoff_max: float = 60.0
    backoff_reset_after: float = 120.0
    token_file: str = DEFAULT_TOKEN_FILE
    metrics_address: str = "0.0.0.0:2000"
    cloudflared_grace_period: str = "20s"

    def validate(self) -> None:
        if not self.probe_url.startswith(("http://", "https://")):
            raise ConfigError("PF_PROBE_URL must be an http(s) URL")
        for name in ("probe_interval", "probe_timeout", "stop_grace", "backoff_min",
                     "backoff_max", "backoff_reset_after"):
            if getattr(self, name) <= 0:
                raise ConfigError(f"{name} must be positive")
        for name in ("healthy_threshold", "unhealthy_threshold"):
            if getattr(self, name) < 1:
                raise ConfigError(f"{name} must be at least 1")
        if self.backoff_min > self.backoff_max:
            raise ConfigError("PF_BACKOFF_MIN_SECONDS must not exceed PF_BACKOFF_MAX_SECONDS")
        if self.probe_timeout + self.stop_grace >= MAX_SHUTDOWN_SECONDS:
            raise ConfigError("PF_PROBE_TIMEOUT_SECONDS + PF_STOP_GRACE_SECONDS must stay below "
                              f"{MAX_SHUTDOWN_SECONDS:.0f}s so shutdown finishes before Docker's SIGKILL")
        if not self.cloudflared_grace_period.endswith(("s", "m")) or \
                not self.cloudflared_grace_period[:-1].isdigit():
            raise ConfigError("PF_CLOUDFLARED_GRACE_PERIOD must look like 20s or 1m")

    @classmethod
    def from_env(cls, env: Optional[dict] = None) -> "Config":
        env = os.environ if env is None else env

        def number(name: str, default: float, cast=float):
            raw = env.get(name)
            if raw is None or raw == "":
                return default
            try:
                return cast(raw)
            except ValueError as exc:
                raise ConfigError(f"{name} must be a number") from exc

        probe_url = env.get("PF_PROBE_URL", "")
        if not probe_url:
            raise ConfigError("PF_PROBE_URL is required")
        config = cls(
            probe_url=probe_url,
            probe_interval=number("PF_PROBE_INTERVAL_SECONDS", cls.probe_interval),
            probe_timeout=number("PF_PROBE_TIMEOUT_SECONDS", cls.probe_timeout),
            healthy_threshold=number("PF_HEALTHY_THRESHOLD", cls.healthy_threshold, int),
            unhealthy_threshold=number("PF_UNHEALTHY_THRESHOLD", cls.unhealthy_threshold, int),
            stop_grace=number("PF_STOP_GRACE_SECONDS", cls.stop_grace),
            backoff_min=number("PF_BACKOFF_MIN_SECONDS", cls.backoff_min),
            backoff_max=number("PF_BACKOFF_MAX_SECONDS", cls.backoff_max),
            backoff_reset_after=number("PF_BACKOFF_RESET_AFTER_SECONDS", cls.backoff_reset_after),
            token_file=env.get("PF_TUNNEL_TOKEN_FILE") or cls.token_file,
            metrics_address=env.get("PF_METRICS_ADDRESS") or cls.metrics_address,
            cloudflared_grace_period=env.get("PF_CLOUDFLARED_GRACE_PERIOD") or cls.cloudflared_grace_period,
        )
        config.validate()
        return config


def cloudflared_command(config: Config) -> list:
    """The only child command this supervisor will ever run."""
    return [
        CLOUDFLARED_BIN,
        "tunnel",
        "--no-autoupdate",
        "--metrics", config.metrics_address,
        "--grace-period", config.cloudflared_grace_period,
        "run",
        "--token-file", config.token_file,
    ]


# --------------------------------------------------------------------------- #
# Collaborators (real implementations; tests provide fakes)
# --------------------------------------------------------------------------- #


class Child(Protocol):
    pid: int

    def poll(self) -> Optional[int]: ...
    def terminate(self) -> None: ...
    def kill(self) -> None: ...
    def wait(self, timeout: Optional[float] = None) -> int: ...


def http_probe(url: str, timeout: float) -> bool:
    """Return True only for an HTTP 200 answer within ``timeout`` seconds."""
    request = urllib.request.Request(url, method="GET", headers={"User-Agent": "pointfinder-connector-supervisor"})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:  # noqa: S310 - URL is operator config
            return response.status == 200
    except (urllib.error.URLError, OSError, ValueError):
        return False


def spawn_cloudflared(config: Config) -> Child:
    return subprocess.Popen(
        cloudflared_command(config),
        stdin=subprocess.DEVNULL,
        start_new_session=True,  # keep terminal SIGINT away; the supervisor forwards shutdown itself
    )


def log(message: str) -> None:
    sys.stderr.write(f"supervisor: {message}\n")
    sys.stderr.flush()


# --------------------------------------------------------------------------- #
# Supervisor
# --------------------------------------------------------------------------- #


class Supervisor:
    def __init__(
        self,
        config: Config,
        probe: Callable[[], bool],
        spawn: Callable[[], Child],
        clock: Callable[[], float] = time.monotonic,
        sleep: Optional[Callable[[float], None]] = None,
        logger: Callable[[str], None] = log,
    ) -> None:
        self.config = config
        self._probe = probe
        self._spawn = spawn
        self._clock = clock
        self._sleep = sleep or self._interruptible_sleep
        self._log = logger

        self.child: Optional[Child] = None
        self.state = STATE_WITHDRAWN
        self.healthy_streak = 0
        self.unhealthy_streak = 0
        self.crash_count = 0
        self.next_start_allowed_at = 0.0
        self.child_started_at = 0.0
        self.stop_requested = False
        self.spawn_count = 0

    # -- public API ------------------------------------------------------- #

    def request_stop(self) -> None:
        self.stop_requested = True

    def run(self) -> int:
        self._log(f"starting in state={self.state}; "
                  f"probe_interval={self.config.probe_interval:g}s "
                  f"healthy_threshold={self.config.healthy_threshold} "
                  f"unhealthy_threshold={self.config.unhealthy_threshold}")
        try:
            while not self.stop_requested:
                self.tick()
                if self.stop_requested:
                    break
                self._sleep(self.config.probe_interval)
        finally:
            self._withdraw("shutdown requested")
        self._log("exited cleanly")
        return EXIT_OK

    def tick(self) -> None:
        """One supervision cycle: reap, probe, then act on the streaks."""
        now = self._clock()
        self._reap_child(now)

        healthy = self._safe_probe()
        if healthy:
            self.healthy_streak += 1
            self.unhealthy_streak = 0
        else:
            self.unhealthy_streak += 1
            self.healthy_streak = 0

        if self.state == STATE_SERVING:
            if self.unhealthy_streak >= self.config.unhealthy_threshold:
                self._withdraw(f"probe unhealthy {self.unhealthy_streak}x")
        elif self.stop_requested:
            return  # a stop signal arrived during the probe; never start a connector now
        elif self.healthy_streak >= self.config.healthy_threshold:
            if now >= self.next_start_allowed_at:
                self._serve(now)
            elif self.healthy_streak == self.config.healthy_threshold:
                self._log(f"probe healthy but restart backoff active for "
                          f"{self.next_start_allowed_at - now:.1f}s more")

    # -- internals -------------------------------------------------------- #

    def _interruptible_sleep(self, seconds: float) -> None:
        # Sleep in short slices and return as soon as a signal handler flips stop_requested.
        deadline = time.monotonic() + seconds
        while not self.stop_requested:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                return
            time.sleep(min(0.25, remaining))

    def _safe_probe(self) -> bool:
        try:
            return bool(self._probe())
        except Exception as exc:  # noqa: BLE001 - any probe failure means "not healthy"
            # Only the exception type is logged: messages can echo URLs or response bodies.
            self._log(f"probe raised {exc.__class__.__name__}")
            return False

    def _reap_child(self, now: float) -> None:
        if self.child is None:
            return
        code = self.child.poll()
        if code is None:
            return
        uptime = now - self.child_started_at
        self.child = None
        self.state = STATE_WITHDRAWN
        if uptime >= self.config.backoff_reset_after:
            self.crash_count = 0
        self.crash_count += 1
        backoff = min(self.config.backoff_max,
                      self.config.backoff_min * (2 ** (self.crash_count - 1)))
        self.next_start_allowed_at = now + backoff
        self.healthy_streak = 0
        self._log(f"cloudflared exited code={code} after {uptime:.1f}s; "
                  f"crash #{self.crash_count}, next start in >= {backoff:.1f}s")

    def _serve(self, now: float) -> None:
        self.child = self._spawn()
        self.spawn_count += 1
        self.child_started_at = now
        self.state = STATE_SERVING
        self.unhealthy_streak = 0
        self._log(f"state=serving pid={getattr(self.child, 'pid', '?')} (spawn #{self.spawn_count})")

    def _withdraw(self, reason: str) -> None:
        if self.child is None:
            if self.state != STATE_WITHDRAWN:
                self.state = STATE_WITHDRAWN
            return
        child, self.child = self.child, None
        self.state = STATE_WITHDRAWN
        self.healthy_streak = 0
        if child.poll() is not None:
            self._log(f"state=withdrawn ({reason}); cloudflared already exited")
            return
        self._log(f"state=withdrawn ({reason}); sending SIGTERM to pid={getattr(child, 'pid', '?')}")
        try:
            child.terminate()
        except ProcessLookupError:
            return
        try:
            code = child.wait(timeout=self.config.stop_grace)
            self._log(f"cloudflared stopped code={code}")
        except subprocess.TimeoutExpired:
            self._log(f"cloudflared ignored SIGTERM for {self.config.stop_grace:.0f}s; sending SIGKILL")
            try:
                child.kill()
            except ProcessLookupError:
                return
            child.wait()


# --------------------------------------------------------------------------- #
# Entrypoint
# --------------------------------------------------------------------------- #


def install_signal_handlers(supervisor: Supervisor) -> None:
    def handler(signum, _frame):
        log(f"received {signal.Signals(signum).name}; stopping")
        supervisor.request_stop()

    for sig in (signal.SIGTERM, signal.SIGINT):
        signal.signal(sig, handler)


def run_main(
    config: Optional[Config] = None,
    probe: Optional[Callable[[], bool]] = None,
    spawn: Optional[Callable[[], Child]] = None,
    check_token_file: bool = True,
) -> int:
    """Build and run the supervisor. Tests pass their own probe/spawn."""
    try:
        config = config or Config.from_env()
        if check_token_file and not os.access(config.token_file, os.R_OK):
            raise ConfigError("PF_TUNNEL_TOKEN_FILE is not readable")
    except ConfigError as exc:
        log(f"configuration error: {exc}")
        return EXIT_CONFIG

    supervisor = Supervisor(
        config,
        probe=probe or (lambda: http_probe(config.probe_url, config.probe_timeout)),
        spawn=spawn or (lambda: spawn_cloudflared(config)),
    )
    install_signal_handlers(supervisor)
    return supervisor.run()


if __name__ == "__main__":
    sys.exit(run_main())
