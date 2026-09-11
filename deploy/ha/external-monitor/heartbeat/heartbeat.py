"""Outbound heartbeat runner for the PointFinder external uptime monitor.

Runs as uid 999 on each Dokploy host (hetzner, arthur, rainer) and POSTs an
empty body to ``https://<worker>/heartbeat/<host>`` every ``INTERVAL_SECONDS``
(default 300) with a per-host bearer token. It opens no inbound port, mounts
no Docker socket and touches nothing but one read-only secret file and its
own ``/state`` directory. Python standard library only.

Secret file (``/run/secrets/heartbeat.json``, mode 0400, owned by the uid the
container runs as) contains ``{"token": "..."}``. The token only ever lives
in the ``Authorization`` header; it is never logged, never written to
``/state`` and never placed in the environment or process arguments.

``--healthcheck`` reads the secret-free ``/state/heartbeat-status.json`` the
loop writes after every attempt and exits non-zero when the last *success*
is older than ``HEALTHCHECK_MAX_AGE_SECONDS`` (default 3 x interval), so a
container whose beats stopped being accepted shows as unhealthy in Dokploy.

Failure handling is deliberately dumb: a failed beat is logged with the HTTP
status or exception class only, the response body is drained (bounded) and
discarded, and the next attempt happens at the next interval. The Worker side
tolerates two missed beats before alerting.
"""
import datetime
import http.client
import json
import logging
import os
import pathlib
import random
import signal
import ssl
import stat
import sys
import threading

UTC = datetime.timezone.utc
LOG = logging.getLogger('pointfinder.heartbeat')

HOSTS = ('hetzner', 'arthur', 'rainer')
USER_AGENT = 'pointfinder-heartbeat/1'
DEFAULT_WORKER_HOST = 'pointfinder-monitor.xmedavid.workers.dev'
MAX_TOKEN_LENGTH = 512
REQUIRED_MODE = 0o400


class ConfigError(Exception):
    """Raised for configuration problems; the message never carries a secret."""


class Settings:
    """Runtime settings, all overridable through ``POINTFINDER_HEARTBEAT_*``."""

    def __init__(self, env=None):
        env = os.environ if env is None else env

        def read(name, default, convert=str):
            return convert(env.get('POINTFINDER_HEARTBEAT_' + name, default))

        self.host = read('HOST', '')
        if self.host not in HOSTS:
            raise ConfigError('POINTFINDER_HEARTBEAT_HOST must be one of %s' % ', '.join(HOSTS))
        self.worker_host = read('WORKER_HOST', DEFAULT_WORKER_HOST)
        if not self.worker_host or '/' in self.worker_host or ':' in self.worker_host:
            raise ConfigError('POINTFINDER_HEARTBEAT_WORKER_HOST must be a bare host name')
        self.path = '/heartbeat/' + self.host
        self.secret_path = pathlib.Path(read('SECRET_PATH', '/run/secrets/heartbeat.json'))
        self.state_dir = pathlib.Path(read('STATE_DIR', '/state'))
        self.status_path = self.state_dir / 'heartbeat-status.json'
        self.interval_seconds = read('INTERVAL_SECONDS', '300', int)
        self.http_timeout = read('HTTP_TIMEOUT_SECONDS', '10', int)
        self.response_max_bytes = read('RESPONSE_MAX_BYTES', '4096', int)
        self.start_jitter_seconds = read('START_JITTER_SECONDS', '20', int)
        self.healthcheck_max_age = read('HEALTHCHECK_MAX_AGE_SECONDS', str(3 * self.interval_seconds), int)
        self.expected_uid = read('EXPECTED_UID', str(os.getuid()), int)
        if min(self.interval_seconds, self.http_timeout, self.response_max_bytes,
               self.healthcheck_max_age) <= 0 or self.start_jitter_seconds < 0:
            raise ConfigError('heartbeat intervals, timeouts and sizes must be positive')


def read_secret(settings):
    """Return the bearer token after checking the file is 0400 and owned by us."""
    try:
        info = os.stat(settings.secret_path)
    except OSError as exc:
        raise ConfigError('secret file unreadable (%s)' % exc.__class__.__name__)
    if not stat.S_ISREG(info.st_mode):
        raise ConfigError('secret file is not a regular file')
    if stat.S_IMODE(info.st_mode) != REQUIRED_MODE:
        raise ConfigError('secret file must have mode 0400 (has %04o)' % stat.S_IMODE(info.st_mode))
    if info.st_uid != settings.expected_uid:
        raise ConfigError('secret file must be owned by uid %d (is %d)' % (settings.expected_uid, info.st_uid))
    try:
        payload = json.loads(settings.secret_path.read_text())
    except (OSError, ValueError) as exc:
        raise ConfigError('secret file unreadable or not JSON (%s)' % exc.__class__.__name__)
    token = payload.get('token') if isinstance(payload, dict) else None
    if not isinstance(token, str) or not token.strip() or len(token) > MAX_TOKEN_LENGTH:
        raise ConfigError('secret file must contain a non-empty "token" string')
    if any(ch in token for ch in '\r\n') or not token.isascii():
        raise ConfigError('token must be single-line ASCII')
    return token.strip()


class Transport:
    """One HTTPS POST; TLS via the system trust store, no redirects followed."""

    def __init__(self, settings, connection_factory=None):
        self.settings = settings
        self.context = ssl.create_default_context()
        self.connection_factory = connection_factory or self._connect

    def _connect(self):
        return http.client.HTTPSConnection(
            self.settings.worker_host, 443, timeout=self.settings.http_timeout, context=self.context)

    def beat(self, token):
        """Return the HTTP status code. Raises on transport errors."""
        connection = self.connection_factory()
        try:
            connection.request('POST', self.settings.path, body=b'', headers={
                'Authorization': 'Bearer ' + token,
                'Content-Length': '0',
                'User-Agent': USER_AGENT,
                'Connection': 'close',
            })
            response = connection.getresponse()
            try:
                response.read(self.settings.response_max_bytes)
            except Exception:  # noqa: BLE001 - body content is irrelevant
                pass
            return response.status
        finally:
            connection.close()


class Status:
    """Secret-free status file for the healthcheck and for humans."""

    def __init__(self, settings, clock):
        self.settings = settings
        self.clock = clock
        self.data = {
            'host': settings.host,
            'last_attempt': None,
            'last_success': None,
            'last_status_code': None,
            'last_error': None,
            'consecutive_failures': 0,
            'accepted': 0,
        }

    def record(self, status_code=None, error=None):
        now = self.clock().isoformat()
        self.data['last_attempt'] = now
        self.data['last_status_code'] = status_code
        self.data['last_error'] = error
        if status_code is not None and 200 <= status_code < 300:
            self.data['last_success'] = now
            self.data['consecutive_failures'] = 0
            self.data['accepted'] += 1
        else:
            self.data['consecutive_failures'] += 1
        self.write()

    def write(self):
        self.settings.state_dir.mkdir(parents=True, exist_ok=True)
        tmp = self.settings.status_path.with_suffix('.tmp')
        tmp.write_text(json.dumps(self.data, sort_keys=True))
        os.replace(tmp, self.settings.status_path)


def attempt(settings, transport, status, log=LOG):
    """One heartbeat attempt: read secret, POST, record. Never raises."""
    try:
        token = read_secret(settings)
    except ConfigError as exc:
        log.error('heartbeat %s: secret problem: %s', settings.host, exc)
        status.record(error='secret: ' + str(exc))
        return False
    try:
        code = transport.beat(token)
    except Exception as exc:  # noqa: BLE001 - class name only, never the message
        name = exc.__class__.__name__
        log.warning('heartbeat %s: transport failure (%s)', settings.host, name)
        status.record(error=name)
        return False
    finally:
        token = None  # noqa: F841 - drop the reference promptly
    if 200 <= code < 300:
        log.info('heartbeat %s: accepted (HTTP %d)', settings.host, code)
        status.record(status_code=code)
        return True
    log.warning('heartbeat %s: rejected (HTTP %d)', settings.host, code)
    status.record(status_code=code)
    return False


def run_loop(settings, transport, status, stop_event, sleep, rng=random, log=LOG):
    """Beat immediately (after a small jitter), then every interval until stopped."""
    read_secret(settings)  # fail fast at startup on a bad mount; message is secret-free
    jitter = rng.uniform(0, settings.start_jitter_seconds) if settings.start_jitter_seconds else 0
    log.info('heartbeat %s: starting, interval %ds, first beat in %.0fs', settings.host,
             settings.interval_seconds, jitter)
    if jitter and sleep(jitter):
        return
    while not stop_event.is_set():
        attempt(settings, transport, status, log)
        if sleep(settings.interval_seconds):
            return


def healthcheck(settings, clock, out=sys.stdout):
    """Exit status for the container healthcheck, judged from the last success."""
    try:
        data = json.loads(settings.status_path.read_text())
    except (OSError, ValueError):
        print('unhealthy: status file missing or unreadable', file=out)
        return 1
    last_success = data.get('last_success')
    if not last_success:
        attempts = data.get('consecutive_failures', 0)
        if attempts * settings.interval_seconds > settings.healthcheck_max_age:
            print('unhealthy: no beat accepted after %d attempts' % attempts, file=out)
            return 1
        print('starting: no beat accepted yet', file=out)
        return 0
    try:
        age = (clock() - datetime.datetime.fromisoformat(last_success)).total_seconds()
    except ValueError:
        print('unhealthy: status file corrupt', file=out)
        return 1
    if age < 0 or age > settings.healthcheck_max_age:
        print('unhealthy: last accepted beat %.0fs ago (max %ds)' % (age, settings.healthcheck_max_age), file=out)
        return 1
    print('healthy: last accepted beat %.0fs ago' % age, file=out)
    return 0


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s', stream=sys.stderr)
    try:
        settings = Settings()
    except ConfigError as exc:
        LOG.error('configuration: %s', exc)
        return 2
    clock = lambda: datetime.datetime.now(UTC)  # noqa: E731
    if argv == ['--healthcheck']:
        return healthcheck(settings, clock)
    if argv:
        LOG.error('unknown arguments; only --healthcheck is supported')
        return 2
    stop_event = threading.Event()
    for signum in (signal.SIGTERM, signal.SIGINT):
        signal.signal(signum, lambda *_: stop_event.set())
    transport = Transport(settings)
    status = Status(settings, clock)
    try:
        run_loop(settings, transport, status, stop_event, stop_event.wait)
    except ConfigError as exc:
        LOG.error('startup: %s', exc)
        return 2
    LOG.info('heartbeat %s: stopped', settings.host)
    return 0


if __name__ == '__main__':
    sys.exit(main())
