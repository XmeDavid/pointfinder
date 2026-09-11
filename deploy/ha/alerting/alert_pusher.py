"""Bounded email alert pusher for the read-only monitoring sidecar.

Sits next to ``deploy/ha/monitoring/monitor.py`` as uid 999, reads the
monitor's secret-free ``health.json`` (mounted read-only) and emails status
transitions through the Resend HTTPS API. It owns exactly one writable
directory (``/state``) for its own delivery state and liveness file, and reads
one secret file (``/run/secrets/email.json`` with ``api_key``, ``from``,
``to``). No database, no Docker socket, no Patroni or Dokploy API.

What triggers an email
======================

The pusher keeps a *fingerprint* of the monitor's picture: the overall status
plus the set of ``(check name, status)`` pairs that are not ``ok``. Reasons,
numbers and timestamps are deliberately excluded, so a critical archiver whose
"last failure 3m ago" becomes "4m ago" is the same fingerprint.

* Overall status leaves ``ok`` (``warning``, ``unknown`` or ``critical``) or
  changes between those levels: alert, sent immediately.
* A missing, unparseable, stale (older than ``STALE_SECONDS``, default 180)
  or future-dated report counts as ``unknown`` with a synthetic ``report``
  check, so a dead monitor alerts like a failing one.
* Only the set of failing checks changes while the overall level stays the
  same: alert, but coalesced (not before ``COALESCE_SECONDS`` after the last
  delivered email) and carrying the latest picture at send time.
* Everything back to ``ok`` after an alert was delivered: recovery email.
* A healthy monitor at first start: nothing. The pusher never mails "all good".

A hard cap of ``MAX_EMAILS_PER_HOUR`` bounds storms regardless of the above.

Delivery and state
==================

``/state/alert-state.json`` records what was *delivered* (only updated after a
2xx from Resend, so a restart never re-sends an already delivered alert) plus
the one pending message with its idempotency key. Failed sends retry with
exponential backoff bounded by ``RETRY_MAX_SECONDS``; retries reuse the same
``Idempotency-Key`` so a timed-out request that did go through is not
duplicated within the provider's idempotency retention window. A definitively
rejected alert is withdrawn if the monitor recovers. An uncertain send is
retried with its original key/body before any subsequent recovery message.

``/state/pusher-status.json`` is the secret-free liveness file for
``--healthcheck``: it fails when the file is missing or stale, or when the
pending message has been failing for longer than
``DELIVERY_FAILURE_GRACE_SECONDS``.

``--test-email`` sends one installation-confirmation email using the mounted
secret and touches no alert state.

Secret hygiene
==============

The API key only ever lives in the ``Authorization`` header of the request.
Logs and state files carry exception class names, HTTP status codes and
counts; provider response bodies are drained (bounded) and discarded, never
parsed for anything but the status code and never logged. The connection is
fixed to ``https://api.resend.com``; ``http.client`` follows no redirects and
a 3xx is treated as a definite failure.
"""
import datetime
import http.client
import json
import logging
import os
import pathlib
import signal
import socket
import ssl
import sys
import threading
import uuid

UTC = datetime.timezone.utc
LOG = logging.getLogger('pointfinder.alert_pusher')

OK, WARNING, UNKNOWN, CRITICAL = 'ok', 'warning', 'unknown', 'critical'
SEVERITY = {OK: 0, WARNING: 1, UNKNOWN: 2, CRITICAL: 3}
ALERT, RECOVERY = 'alert', 'recovery'

RESEND_HOST = 'api.resend.com'
RESEND_PORT = 443
RESEND_PATH = '/emails'
USER_AGENT = 'pointfinder-alert-pusher/1'

MAX_NAME_LENGTH = 64
MAX_REASON_LENGTH = 200
MAX_SUBJECT_LENGTH = 200
MAX_CHECKS = 50


class Settings:
    """Runtime settings, all overridable through ``POINTFINDER_ALERT_*``."""

    def __init__(self, env=None):
        env = os.environ if env is None else env

        def read(name, default, convert=str):
            return convert(env.get('POINTFINDER_ALERT_' + name, default))

        self.node_name = read('NODE_NAME', env.get('PATRONI_NAME', socket.gethostname()))
        self.monitor_state_dir = pathlib.Path(read('MONITOR_STATE_DIR', '/monitor-state'))
        self.health_path = self.monitor_state_dir / 'health.json'
        self.state_dir = pathlib.Path(read('STATE_DIR', '/state'))
        self.state_path = self.state_dir / 'alert-state.json'
        self.status_path = self.state_dir / 'pusher-status.json'
        self.secret_path = pathlib.Path(read('SECRET_PATH', '/run/secrets/email.json'))
        self.subject_prefix = read('SUBJECT_PREFIX', '[PointFinder DB]')
        self.poll_seconds = read('POLL_SECONDS', '30', int)
        self.stale_seconds = read('STALE_SECONDS', '180', int)
        self.coalesce_seconds = read('COALESCE_SECONDS', '600', int)
        self.max_emails_per_hour = read('MAX_EMAILS_PER_HOUR', '12', int)
        self.retry_min_seconds = read('RETRY_MIN_SECONDS', '30', int)
        self.retry_max_seconds = read('RETRY_MAX_SECONDS', '900', int)
        self.http_timeout = read('HTTP_TIMEOUT_SECONDS', '15', int)
        self.response_max_bytes = read('RESPONSE_MAX_BYTES', '65536', int)
        self.healthcheck_max_age = read('HEALTHCHECK_MAX_AGE_SECONDS', str(3 * self.poll_seconds), int)
        self.delivery_failure_grace = read('DELIVERY_FAILURE_GRACE_SECONDS', '1800', int)
        if min(self.poll_seconds, self.stale_seconds, self.http_timeout, self.healthcheck_max_age,
               self.max_emails_per_hour, self.response_max_bytes) <= 0:
            raise ValueError('Invalid interval or limit settings')
        if self.coalesce_seconds < 0 or self.delivery_failure_grace < 0:
            raise ValueError('Invalid interval settings')
        if not 0 < self.retry_min_seconds <= self.retry_max_seconds:
            raise ValueError('Invalid retry settings')


# --------------------------------------------------------------------------- #
# Secret
# --------------------------------------------------------------------------- #


class SecretError(Exception):
    """Raised with a short, content-free label describing what is wrong."""


class Secret:
    def __init__(self, api_key, sender, recipients):
        self.api_key = api_key
        self.sender = sender
        self.recipients = tuple(recipients)

    def __repr__(self):  # never leak the key through accidental formatting
        return '<Secret sender=%r recipients=%d>' % (self.sender, len(self.recipients))


def load_secret(path):
    """Read ``{"api_key": …, "from": …, "to": "…" | ["…", …]}``. Errors carry a
    label only; the file contents never appear in an exception message."""
    try:
        data = json.loads(pathlib.Path(path).read_text())
    except OSError:
        raise SecretError('secret file unreadable')
    except ValueError:
        raise SecretError('secret file is not valid JSON')
    if not isinstance(data, dict):
        raise SecretError('secret file is not a JSON object')
    api_key = data.get('api_key')
    sender = data.get('from')
    recipients = data.get('to')
    if isinstance(recipients, str):
        recipients = [recipients]
    if not isinstance(api_key, str) or not api_key.strip():
        raise SecretError('secret file has no api_key')
    if not isinstance(sender, str) or '@' not in sender:
        raise SecretError('secret file has no valid from address')
    if (not isinstance(recipients, list) or not recipients
            or not all(isinstance(r, str) and '@' in r for r in recipients)):
        raise SecretError('secret file has no valid to address')
    return Secret(api_key.strip(), sender.strip(), [r.strip() for r in recipients])


# --------------------------------------------------------------------------- #
# Transport
# --------------------------------------------------------------------------- #


class DeliveryError(Exception):
    """A failed send. ``label`` is a short class name or ``http_<code>``;
    ``uncertain`` means the provider may have accepted the message anyway."""

    def __init__(self, label, uncertain):
        super().__init__(label)
        self.label = label
        self.uncertain = uncertain


class ResendTransport:
    """One POST to ``https://api.resend.com/emails``. Fixed host, TLS with
    certificate verification, bounded timeout, bounded response read, no
    redirects (``http.client`` never follows them; 3xx is a failure)."""

    def __init__(self, settings, connection_factory=http.client.HTTPSConnection):
        self.settings = settings
        self.connection_factory = connection_factory

    def send(self, secret, subject, text, idempotency_key):
        body = json.dumps({'from': secret.sender, 'to': list(secret.recipients),
                           'subject': subject, 'text': text}).encode('utf-8')
        headers = {'Authorization': 'Bearer ' + secret.api_key,
                   'Content-Type': 'application/json',
                   'Accept': 'application/json',
                   'Idempotency-Key': idempotency_key,
                   'User-Agent': USER_AGENT}
        connection = self.connection_factory(RESEND_HOST, RESEND_PORT, timeout=self.settings.http_timeout,
                                             context=ssl.create_default_context())
        try:
            try:
                connection.request('POST', RESEND_PATH, body=body, headers=headers)
            except Exception as error:  # a write failure may follow partial/full delivery
                raise DeliveryError(type(error).__name__, uncertain=True)
            try:
                response = connection.getresponse()
                status = int(response.status)
                response.read(self.settings.response_max_bytes)  # drained and discarded, never logged
            except Exception as error:  # request was sent; the provider may have acted on it
                raise DeliveryError(type(error).__name__, uncertain=True)
        finally:
            try:
                connection.close()
            except Exception:
                pass
        del body, headers
        if 200 <= status < 300:
            return status
        raise DeliveryError('http_%d' % status, uncertain=status >= 500)


# --------------------------------------------------------------------------- #
# Observation of the monitor report
# --------------------------------------------------------------------------- #


def _clean(text, limit):
    text = ''.join(ch if ch.isprintable() else ' ' for ch in str(text))
    return text[:limit]


def worst(statuses):
    return max(statuses, key=lambda status: SEVERITY[status], default=OK)


class Observation:
    """The monitor's picture at one poll, reduced to what the pusher needs."""

    def __init__(self, status, checks, source, node=None, role=None, generated_at=None):
        self.status = status
        self.checks = checks  # name -> {'status': …, 'reason': …}
        self.source = source  # report | missing | unparseable | stale | future
        self.node = node
        self.role = role
        self.generated_at = generated_at

    def failing(self):
        return {name: check['status'] for name, check in self.checks.items() if check['status'] != OK}

    def fingerprint(self):
        return {'status': self.status, 'checks': self.failing()}


def _report_problem(source, reason):
    return Observation(UNKNOWN, {'report': {'status': UNKNOWN, 'reason': reason}}, source)


def observe(health_path, now, stale_seconds):
    try:
        text = pathlib.Path(health_path).read_text()
    except OSError:
        return _report_problem('missing', 'health report missing')
    try:
        report = json.loads(text)
        generated = datetime.datetime.fromisoformat(report['generated_at'])
        status = report['status']
        raw_checks = report.get('checks', {})
        if not isinstance(raw_checks, dict) or status not in SEVERITY:
            raise ValueError('invalid report')
    except (ValueError, KeyError, TypeError, AttributeError):
        return _report_problem('unparseable', 'health report unparseable')
    if generated.tzinfo is None:
        generated = generated.replace(tzinfo=UTC)
    age = (now - generated).total_seconds()
    if age > stale_seconds:
        return _report_problem('stale', 'health report stale (%ds old)' % age)
    if age < -60:
        return _report_problem('future', 'health report timestamped in the future')
    checks = {}
    for name, check in list(raw_checks.items())[:MAX_CHECKS]:
        if not isinstance(check, dict):
            continue
        check_status = check.get('status')
        if check_status not in SEVERITY:
            check_status = UNKNOWN
        checks[_clean(name, MAX_NAME_LENGTH)] = {'status': check_status,
                                                 'reason': _clean(check.get('reason', ''), MAX_REASON_LENGTH)}
    node = report.get('node')
    role = report.get('role')
    return Observation(worst([status] + [c['status'] for c in checks.values()]), checks, 'report',
                       node=_clean(node, MAX_NAME_LENGTH) if isinstance(node, str) else None,
                       role=_clean(role, MAX_NAME_LENGTH) if isinstance(role, str) else None,
                       generated_at=generated.isoformat())


# --------------------------------------------------------------------------- #
# Message text
# --------------------------------------------------------------------------- #


def build_message(settings, kind, observation, delivered, now):
    node = observation.node or settings.node_name
    failing = observation.failing()
    previous = delivered['status'] if delivered else None
    if kind == RECOVERY:
        subject = '%s %s recovered (was %s)' % (settings.subject_prefix, node, previous)
    else:
        subject = '%s %s %s: %s' % (settings.subject_prefix, node, observation.status.upper(),
                                    ', '.join(sorted(failing)) or 'no failing checks')
    lines = ['PointFinder database monitor on %s' % node,
             '',
             'Overall status: %s' % observation.status,
             'Previously notified status: %s' % (previous or 'none'),
             'Role: %s' % (observation.role or 'unknown'),
             'Monitor report generated: %s' % (observation.generated_at or 'n/a (%s)' % observation.source),
             'Observed by pusher: %s' % now.isoformat(),
             '',
             'Checks:']
    for name in sorted(observation.checks, key=lambda n: (-SEVERITY[observation.checks[n]['status']], n)):
        check = observation.checks[name]
        lines.append('  %-9s %s: %s' % (check['status'], name, check['reason']))
    lines += ['',
              'This message is sent on status transitions only. A recovery email follows',
              'when the monitor reports ok again. Sent by pointfinder-alert-pusher.']
    return subject[:MAX_SUBJECT_LENGTH], '\n'.join(lines)


# --------------------------------------------------------------------------- #
# Persistent state
# --------------------------------------------------------------------------- #


def atomic_write(path, payload):
    path = pathlib.Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + '.tmp')
    with open(tmp, 'w') as handle:
        json.dump(payload, handle, sort_keys=True)
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(tmp, path)


class State:
    """``delivered`` changes only after a successful send. ``pending`` is the
    single undelivered message with its idempotency key and retry schedule.
    ``recent_sends`` backs the hourly cap."""

    def __init__(self, path):
        self.path = pathlib.Path(path)
        self.delivered = None
        self.pending = None
        self.recent_sends = []

    def load(self):
        try:
            data = json.loads(self.path.read_text())
            if not isinstance(data, dict):
                raise ValueError('not an object')
            delivered, pending, recent = data.get('delivered'), data.get('pending'), data.get('recent_sends', [])
            if not (isinstance(delivered, (dict, type(None))) and isinstance(pending, (dict, type(None)))
                    and isinstance(recent, list)):
                raise ValueError('bad shape')
        except OSError:
            return self
        except (ValueError, TypeError):
            LOG.warning('Alert state unreadable; starting from an empty state')
            return self
        self.delivered, self.pending, self.recent_sends = delivered, pending, recent
        return self

    def save(self):
        atomic_write(self.path, {'schema': 1, 'delivered': self.delivered, 'pending': self.pending,
                                 'recent_sends': self.recent_sends})


def _iso(when):
    return when.isoformat()


def _parse(text):
    when = datetime.datetime.fromisoformat(text)
    return when if when.tzinfo else when.replace(tzinfo=UTC)


# --------------------------------------------------------------------------- #
# Pusher
# --------------------------------------------------------------------------- #


def desired_kind(delivered, observation):
    """Which email the difference between the last delivered picture and the
    current one calls for: ``ALERT``, ``RECOVERY`` or ``None``."""
    if observation.status == OK:
        if delivered is not None and delivered['status'] != OK:
            return RECOVERY
        return None
    return ALERT


class Pusher:
    def __init__(self, settings, transport=None, clock=None, sleep=None, secret_loader=load_secret,
                 new_id=None):
        self.settings = settings
        self.transport = transport or ResendTransport(settings)
        self.clock = clock or (lambda: datetime.datetime.now(UTC))
        self.secret_loader = secret_loader
        self.new_id = new_id or (lambda: str(uuid.uuid4()))
        self.stop = threading.Event()
        self._sleep = sleep or self.stop.wait
        self.state = State(settings.state_path).load()
        self.last_fingerprint = None
        self.last_source = None
        self.rate_limited_logged = False

    # -- decision ------------------------------------------------------------ #

    def earliest_send(self, now, kind, observation):
        delivered = self.state.delivered
        if (kind == ALERT and delivered is not None and delivered['kind'] == ALERT
                and delivered['status'] == observation.status):
            # Same level, different failing set: coalesce rather than mail every wobble.
            try:
                not_before = _parse(delivered['sent_at']) + datetime.timedelta(seconds=self.settings.coalesce_seconds)
            except (KeyError, ValueError, TypeError):
                return now
            return max(now, not_before)
        return now

    def rate_limit_until(self, now):
        window_start = now - datetime.timedelta(hours=1)
        recent = []
        for text in self.state.recent_sends:
            try:
                when = _parse(text)
            except (ValueError, TypeError):
                continue
            if when > window_start:
                recent.append(when)
        self.state.recent_sends = [_iso(when) for when in recent]
        if len(recent) < self.settings.max_emails_per_hour:
            return None
        return min(recent) + datetime.timedelta(hours=1)

    def plan(self, observation, now):
        kind = desired_kind(self.state.delivered, observation)
        pending = self.state.pending
        # Resolve an uncertain send with its original idempotency key/body
        # before replacing or withdrawing it, even if the monitor recovered.
        # Otherwise the recipient could receive an alert without its recovery.
        if pending is not None and pending.get('uncertain'):
            return
        if kind is None:
            if pending is not None:
                LOG.info('Withdrawing undelivered %s email: monitor is ok again', pending['kind'])
                self.state.pending = None
                self.state.save()
            return
        fingerprint = observation.fingerprint()
        delivered = self.state.delivered
        if (kind == ALERT and delivered is not None and delivered['kind'] == ALERT
                and delivered.get('status') == fingerprint['status']
                and delivered.get('checks') == fingerprint['checks']):
            # Same picture as the last delivered alert (reasons and ages may differ).
            if pending is not None:
                LOG.info('Withdrawing undelivered %s email: picture is back to the delivered one', pending['kind'])
                self.state.pending = None
                self.state.save()
            return
        if pending is not None and pending['kind'] == kind and pending['fingerprint'] == fingerprint:
            return
        queued_since = _iso(now)
        if pending is not None:
            LOG.info('Replacing undelivered %s email with a newer picture', pending['kind'])
            queued_since = pending.get('queued_since') or pending.get('created_at') or queued_since
        subject, text = build_message(self.settings, kind, observation, delivered, now)
        self.state.pending = {'id': self.new_id(), 'kind': kind, 'fingerprint': fingerprint,
                              'subject': subject, 'text': text, 'created_at': _iso(now),
                              'queued_since': queued_since, 'attempts': 0,
                              'next_attempt_at': _iso(self.earliest_send(now, kind, observation)),
                              'last_failure': None, 'uncertain': False}
        self.state.save()
        LOG.info('Queued %s email (%s: %s)', kind, observation.status, ', '.join(sorted(fingerprint['checks'])) or '-')

    # -- delivery ------------------------------------------------------------ #

    def attempt(self, now):
        pending = self.state.pending
        try:
            secret = self.secret_loader(self.settings.secret_path)
            try:
                self.transport.send(secret, pending['subject'], pending['text'], pending['id'])
            finally:
                del secret
        except SecretError as error:
            self.record_failure(pending, now, str(error), uncertain=False)
            return False
        except DeliveryError as error:
            self.record_failure(pending, now, error.label, uncertain=error.uncertain)
            return False
        except Exception as error:  # unexpected transport problem; class name only
            self.record_failure(pending, now, type(error).__name__, uncertain=True)
            return False
        self.state.delivered = {'kind': pending['kind'], 'status': pending['fingerprint']['status'],
                                'checks': pending['fingerprint']['checks'], 'sent_at': _iso(now), 'id': pending['id']}
        self.state.recent_sends = (self.state.recent_sends + [_iso(now)])[-self.settings.max_emails_per_hour:]
        self.state.pending = None
        self.state.save()
        LOG.info('Delivered %s email after %d failed attempt(s)', pending['kind'], pending['attempts'])
        return True

    def record_failure(self, pending, now, label, uncertain):
        pending['attempts'] += 1
        delay = min(self.settings.retry_max_seconds,
                    self.settings.retry_min_seconds * 2 ** min(pending['attempts'] - 1, 30))
        pending['next_attempt_at'] = _iso(now + datetime.timedelta(seconds=delay))
        pending['last_failure'] = label
        pending['uncertain'] = bool(uncertain or pending.get('uncertain'))
        self.state.save()
        LOG.warning('Delivery of %s email failed (%s%s); attempt %d, retry in %ds', pending['kind'], label,
                    ', outcome uncertain' if uncertain else '', pending['attempts'], delay)

    # -- tick ---------------------------------------------------------------- #

    def log_transition(self, observation):
        fingerprint = observation.fingerprint()
        if fingerprint != self.last_fingerprint or observation.source != self.last_source:
            LOG.info('Monitor: %s (%s%s)', observation.status, observation.source,
                     ''.join(', %s=%s' % item for item in sorted(fingerprint['checks'].items())))
        self.last_fingerprint, self.last_source = fingerprint, observation.source

    def tick(self):
        now = self.clock()
        observation = observe(self.settings.health_path, now, self.settings.stale_seconds)
        self.log_transition(observation)
        self.plan(observation, now)
        pending = self.state.pending
        if pending is not None and now >= _parse(pending['next_attempt_at']):
            blocked_until = self.rate_limit_until(now)
            if blocked_until is None:
                self.rate_limited_logged = False
                self.attempt(now)
            elif not self.rate_limited_logged:
                LOG.warning('Hourly email cap reached; next send not before %s', _iso(blocked_until))
                self.rate_limited_logged = True
        self.write_status(observation, now)
        return observation

    def write_status(self, observation, now):
        pending = self.state.pending
        delivered = self.state.delivered
        atomic_write(self.settings.status_path, {
            'schema': 1, 'tick_at': _iso(now), 'observed_status': observation.status,
            'observed_source': observation.source,
            'pending': None if pending is None else {
                'kind': pending['kind'], 'created_at': pending['created_at'],
                'queued_since': pending.get('queued_since', pending['created_at']), 'attempts': pending['attempts'],
                'next_attempt_at': pending['next_attempt_at'], 'last_failure': pending['last_failure'],
                'uncertain': pending['uncertain']},
            'last_delivered_at': delivered['sent_at'] if delivered else None,
            'last_delivered_kind': delivered['kind'] if delivered else None,
            'sends_last_hour': len(self.state.recent_sends)})

    # -- lifecycle ----------------------------------------------------------- #

    def request_stop(self, *_):
        self.stop.set()

    def loop(self):
        LOG.info('Pushing alerts for %s every %ss (stale after %ss)', self.settings.node_name,
                 self.settings.poll_seconds, self.settings.stale_seconds)
        while not self.stop.is_set():
            try:
                self.tick()
            except Exception as error:  # keep the sidecar alive; class name only
                LOG.error('Tick failed: %s', type(error).__name__)
            self._sleep(float(self.settings.poll_seconds))
        LOG.info('Stopped')


# --------------------------------------------------------------------------- #
# Entry points
# --------------------------------------------------------------------------- #


def evaluate_status(text, now, max_age, failure_grace):
    """(healthy, reason) for a pusher-status.json body."""
    try:
        status = json.loads(text)
        tick_at = _parse(status['tick_at'])
        pending = status.get('pending')
    except (ValueError, KeyError, TypeError):
        return False, 'pusher status unparseable'
    age = (now - tick_at).total_seconds()
    if age < -60 or age > max_age:
        return False, 'pusher status stale (%ds)' % age
    if isinstance(pending, dict) and pending.get('attempts', 0) > 0:
        try:
            failing_for = (now - _parse(pending.get('queued_since') or pending['created_at'])).total_seconds()
        except (KeyError, ValueError, TypeError):
            failing_for = failure_grace + 1
        if failing_for > failure_grace:
            return False, 'delivery failing for %ds (%d attempts, %s)' % (
                failing_for, pending.get('attempts', 0), pending.get('last_failure') or 'unknown')
    return True, 'ok'


def healthcheck(settings, clock=None):
    now = (clock or (lambda: datetime.datetime.now(UTC)))()
    try:
        text = settings.status_path.read_text()
    except OSError:
        print('pusher status missing')
        return 1
    healthy, reason = evaluate_status(text, now, settings.healthcheck_max_age, settings.delivery_failure_grace)
    print(reason)
    return 0 if healthy else 1


def test_email(settings, transport=None, clock=None, secret_loader=load_secret, new_id=None):
    """Send one installation-confirmation email. Touches no alert state."""
    now = (clock or (lambda: datetime.datetime.now(UTC)))()
    transport = transport or ResendTransport(settings)
    try:
        secret = secret_loader(settings.secret_path)
    except SecretError as error:
        print('test email not sent: %s' % error)
        return 1
    subject = '%s alert pusher installed on %s' % (settings.subject_prefix, settings.node_name)
    text = '\n'.join(['This is a test message from pointfinder-alert-pusher on %s.' % settings.node_name,
                      'Sent at %s.' % now.isoformat(),
                      'It confirms the email secret and outbound HTTPS to Resend work.',
                      'No alert state was changed; real alerts follow monitor status transitions.'])
    try:
        status = transport.send(secret, subject, text, (new_id or (lambda: str(uuid.uuid4())))())
    except DeliveryError as error:
        print('test email failed: %s' % error.label)
        return 1
    except Exception as error:
        print('test email failed: %s' % type(error).__name__)
        return 1
    finally:
        del secret
    print('test email accepted (HTTP %d)' % status)
    return 0


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    logging.basicConfig(level=logging.INFO, stream=sys.stdout,
                        format='%(asctime)sZ %(levelname)s %(message)s')
    logging.Formatter.converter = __import__('time').gmtime
    settings = Settings()
    if argv == ['--healthcheck']:
        return healthcheck(settings)
    if argv == ['--test-email']:
        return test_email(settings)
    if argv:
        print('usage: pointfinder-alert-pusher [--healthcheck | --test-email]')
        return 2
    pusher = Pusher(settings)
    signal.signal(signal.SIGTERM, pusher.request_stop)
    signal.signal(signal.SIGINT, pusher.request_stop)
    pusher.loop()
    return 0


if __name__ == '__main__':
    sys.exit(main())
