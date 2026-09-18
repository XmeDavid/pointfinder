"""Read-only PostgreSQL/pgBackRest monitoring sidecar for the Patroni production pair.

Runs next to a Patroni container as uid 999 (postgres) with the shared socket
directory, PGDATA mounted read-only and the postgres-readable pgBackRest
configuration mounted read-only. It never changes anything: no SQL writes, no
pgBackRest commands other than ``info``, no Patroni API calls, no remediation.

Every ``FAST_SECONDS`` (60) it checks:

* SQL connectivity over the socket and the node role (primary/standby);
* client connections versus ``max_connections``;
* free space on the PGDATA filesystem;
* bytes held in ``pg_wal``;
* on the primary: whether ``archive_command`` is *currently* failing
  (``pg_stat_archiver.last_failed_time`` newer than ``last_archived_time``;
  historical ``failed_count`` is ignored on purpose), and whether every
  *expected* standby (``EXPECTED_STANDBYS``: the cluster member names, this
  node excluded automatically) is connected in ``pg_stat_replication`` and
  how far its replay position is behind the primary's current WAL position;
* on a standby: the WAL receiver state, the replay position measured against
  the WAL end the sender last reported (``pg_stat_wal_receiver.latest_end_lsn``,
  which is the primary's position, not the local receive position), whether
  the replay LSN keeps advancing while WAL is pending, and whether the sender
  keeps talking (keepalives arrive even on a quiet primary). The receive-minus-
  replay difference is reported but never decides the status: it goes negative
  on every reconnect and a reconnect is not a recovery.

Every ``SLOW_SECONDS`` (300) it checks:

* backup freshness from ``pgbackrest info --output=json`` (newest successful
  backup must be younger than ``BACKUP_MAX_AGE_HOURS``, default 36);
* optionally, freshness of mounted Mac recovery ``last-success.json`` files
  (``MAC_RECOVERY_FILES``), default limit two hours.

Persistence and recovery confirmation
=====================================

Raw observations pass through a stabilizer before they are reported. A check
that gets worse is reported only after the degraded observation has held for a
persistence window (``PERSIST_SECONDS`` 180; ``WAL_PERSIST_SECONDS`` 600 for
``wal``; ``SLOW_PERSIST_SECONDS`` 360 for ``backup``/``mac_recovery_*``), except
for observations the check itself marks *prompt*: SQL unreachable, disk
critical, WAL critical, connections critical, ``archive_mode`` off, replay lag
at or above ``LAG_CRITICAL_BYTES``, a standby absent or a receiver not
streaming for ``STANDBY_ABSENT_CRITICAL_SECONDS``, and replay stalled for
``REPLAY_STALL_CRITICAL_SECONDS``. A check that gets better is reported only
after the improvement has held for ``RECOVERY_CONFIRM_SECONDS`` (180;
``REPLICATION_RECOVERY_SECONDS`` 300 for ``replication``/``standbys``). While a
change is being confirmed the reported check keeps its previous status and
carries the raw observation as ``observed_status`` with the reason annotated
``[unconfirmed 1m]`` or ``[recovering 2m]``.

The stabilizer state, the last replay position and the per-standby absence
timers live in ``/state/monitor-state.json`` and survive restarts, so a
restarted monitor neither re-announces an old problem nor forgets how long a
peer has been missing. Every observed and reported transition is appended to
``/state/transitions.log`` (JSON lines, rotated at ``JOURNAL_MAX_BYTES`` with
``JOURNAL_BACKUPS`` older files kept), which is the bounded incident history
that outlives container logs.

Each tick writes a secret-free ``health.json`` atomically into ``/state``.
``--healthcheck`` reads that file and exits non-zero when it is missing,
unparseable, older than ``HEALTH_MAX_AGE_SECONDS`` or reports ``critical`` or
``unknown``. Invalid status and excessively future timestamps also fail.

Logging is transition-only: a check is logged when its reported status
changes. Log lines carry status names, counts, node names and ages only. Raw
subprocess output, SQL exception text, connection strings and pgBackRest
configuration never reach the log, the journal or the report.
"""
import datetime
import json
import logging
import os
import pathlib
import shutil
import signal
import socket
import subprocess
import sys
import threading

UTC = datetime.timezone.utc
LOG = logging.getLogger('pointfinder.monitor')

OK, WARNING, UNKNOWN, CRITICAL = 'ok', 'warning', 'unknown', 'critical'
SEVERITY = {OK: 0, WARNING: 1, UNKNOWN: 2, CRITICAL: 3}
GIB = 1024 ** 3
MAX_NAME_LENGTH = 64


class Settings:
    """Runtime settings, all overridable through ``POINTFINDER_MONITOR_*``."""

    def __init__(self, env=None):
        env = os.environ if env is None else env

        def read(name, default, convert=str):
            return convert(env.get('POINTFINDER_MONITOR_' + name, default))

        self.node_name = read('NODE_NAME', env.get('PATRONI_NAME', socket.gethostname()))
        self.socket_dir = read('SOCKET_DIR', '/var/run/postgresql')
        self.pg_user = read('PG_USER', 'scout')
        self.pg_dbname = read('PG_DBNAME', 'postgres')
        self.pgdata = pathlib.Path(read('PGDATA', '/var/lib/postgresql/data'))
        self.pgbackrest_binary = read('PGBACKREST_BINARY', '/usr/bin/pgbackrest')
        self.pgbackrest_config = pathlib.Path(read('PGBACKREST_CONFIG', '/run/pgbackrest/pgbackrest.conf'))
        self.stanza = read('STANZA', 'pointfinder-production')
        self.state_dir = pathlib.Path(read('STATE_DIR', '/state'))
        self.health_path = self.state_dir / 'health.json'
        self.state_path = self.state_dir / 'monitor-state.json'
        self.journal_path = self.state_dir / 'transitions.log'
        self.fast_seconds = read('FAST_SECONDS', '60', int)
        self.slow_seconds = read('SLOW_SECONDS', '300', int)
        self.sql_timeout = read('SQL_TIMEOUT_SECONDS', '5', int)
        self.info_timeout = read('INFO_TIMEOUT_SECONDS', '60', int)
        self.connections_warn_ratio = read('CONNECTIONS_WARN_RATIO', '0.8', float)
        self.connections_critical_ratio = read('CONNECTIONS_CRITICAL_RATIO', '0.95', float)
        self.disk_warn_free_ratio = read('DISK_WARN_FREE_RATIO', '0.2', float)
        self.disk_critical_free_ratio = read('DISK_CRITICAL_FREE_RATIO', '0.1', float)
        self.disk_critical_free_bytes = read('DISK_CRITICAL_FREE_BYTES', str(2 * GIB), int)
        self.wal_warn_bytes = read('WAL_WARN_BYTES', str(2 * GIB), int)
        self.wal_critical_bytes = read('WAL_CRITICAL_BYTES', str(8 * GIB), int)
        self.lag_warn_bytes = read('LAG_WARN_BYTES', str(64 * 1024 ** 2), int)
        self.lag_critical_bytes = read('LAG_CRITICAL_BYTES', str(1 * GIB), int)
        self.lag_warn_seconds = read('LAG_WARN_SECONDS', '300', int)
        self.backup_max_age_hours = read('BACKUP_MAX_AGE_HOURS', '36', float)
        self.mac_recovery_files = parse_recovery_files(read('MAC_RECOVERY_FILES', ''))
        self.mac_recovery_max_age = read('MAC_RECOVERY_MAX_AGE_SECONDS', '7200', int)
        self.health_max_age = read('HEALTH_MAX_AGE_SECONDS', str(3 * self.fast_seconds), int)
        # Replication topology and escalation. EXPECTED_STANDBYS lists every
        # cluster member; this node is excluded, so both nodes share one value.
        self.expected_standbys = [name for name in parse_names(read('EXPECTED_STANDBYS', ''))
                                  if name != self.node_name]
        self.standby_absent_critical = read('STANDBY_ABSENT_CRITICAL_SECONDS', '900', int)
        self.replay_stall_critical = read('REPLAY_STALL_CRITICAL_SECONDS', '900', int)
        self.receiver_silence_warn = read('RECEIVER_SILENCE_WARN_SECONDS', '120', int)
        # Persistence (degradation must hold this long) and recovery confirmation.
        self.persist_seconds = read('PERSIST_SECONDS', '180', int)
        self.wal_persist_seconds = read('WAL_PERSIST_SECONDS', '600', int)
        self.slow_persist_seconds = read('SLOW_PERSIST_SECONDS', '360', int)
        self.recovery_confirm_seconds = read('RECOVERY_CONFIRM_SECONDS', '180', int)
        self.replication_recovery_seconds = read('REPLICATION_RECOVERY_SECONDS', '300', int)
        self.journal_max_bytes = read('JOURNAL_MAX_BYTES', str(1024 * 1024), int)
        self.journal_backups = read('JOURNAL_BACKUPS', '2', int)
        if self.fast_seconds <= 0 or self.slow_seconds <= 0 or self.health_max_age <= 0:
            raise ValueError('Invalid interval settings')
        if not 0 < self.connections_warn_ratio <= self.connections_critical_ratio <= 1:
            raise ValueError('Invalid connection thresholds')
        if not 0 <= self.disk_critical_free_ratio <= self.disk_warn_free_ratio < 1:
            raise ValueError('Invalid disk thresholds')
        if min(self.persist_seconds, self.wal_persist_seconds, self.slow_persist_seconds,
               self.recovery_confirm_seconds, self.replication_recovery_seconds,
               self.standby_absent_critical, self.replay_stall_critical, self.receiver_silence_warn,
               self.journal_backups) < 0 or self.journal_max_bytes <= 0:
            raise ValueError('Invalid persistence settings')

    def persist_window(self, name):
        if name == 'wal':
            return self.wal_persist_seconds
        if name == 'backup' or name.startswith('mac_recovery_'):
            return self.slow_persist_seconds
        return self.persist_seconds

    def recovery_window(self, name):
        if name in ('replication', 'standbys'):
            return self.replication_recovery_seconds
        return self.recovery_confirm_seconds

    def longest_window(self):
        return max(self.persist_seconds, self.wal_persist_seconds, self.slow_persist_seconds,
                   self.recovery_confirm_seconds, self.replication_recovery_seconds)


def parse_recovery_files(text):
    """``label=/path,label2=/path2`` -> ordered list of (label, Path)."""
    files = []
    for item in filter(None, (part.strip() for part in text.split(','))):
        if '=' not in item:
            raise ValueError('MAC_RECOVERY_FILES entries must be label=path')
        label, path = item.split('=', 1)
        label, path = label.strip(), path.strip()
        if not label or not path or not label.replace('-', '').replace('_', '').isalnum():
            raise ValueError('MAC_RECOVERY_FILES entries must be label=path')
        files.append((label, pathlib.Path(path)))
    return files


def parse_names(text):
    """Comma-separated Patroni member names -> ordered, de-duplicated list."""
    names = []
    for item in filter(None, (part.strip() for part in str(text).split(','))):
        if len(item) > MAX_NAME_LENGTH or not item.replace('-', '').replace('_', '').replace('.', '').isalnum():
            raise ValueError('member names must be short and alphanumeric')
        if item not in names:
            names.append(item)
    return names


def lsn_int(text):
    """``'22/D50018B8'`` -> integer WAL position. ``None`` stays ``None``."""
    if text is None:
        return None
    high, low = str(text).split('/')
    return (int(high, 16) << 32) | int(low, 16)


def _clean_name(text):
    text = ''.join(ch if ch.isprintable() else '?' for ch in str(text))
    return text[:MAX_NAME_LENGTH]


# --------------------------------------------------------------------------- #
# Check results
# --------------------------------------------------------------------------- #


class Check:
    """One named observation. ``details`` holds only numbers, booleans and
    short strings the monitor itself produced. ``prompt`` marks a degraded
    observation that must be reported without waiting for persistence."""

    def __init__(self, name, status, reason, observed_at, prompt=False, **details):
        if status not in SEVERITY:
            raise ValueError('Unknown status')
        self.name = name
        self.status = status
        self.reason = reason
        self.observed_at = observed_at
        self.prompt = bool(prompt)
        self.details = details

    def to_json(self):
        return {'status': self.status, 'reason': self.reason,
                'observed_at': self.observed_at.isoformat(), **self.details}


def worst(statuses):
    return max(statuses, key=lambda status: SEVERITY[status], default=OK)


def _fmt_age(seconds):
    if seconds is None:
        return 'unknown age'
    seconds = int(seconds)
    if seconds < 3600:
        return '%dm' % (seconds // 60)
    return '%dh%02dm' % (seconds // 3600, (seconds % 3600) // 60)


def _iso(when):
    return when.isoformat()


def _parse(text):
    if not text:
        return None
    try:
        when = datetime.datetime.fromisoformat(text)
    except (ValueError, TypeError):
        return None
    return when if when.tzinfo else when.replace(tzinfo=UTC)


# --------------------------------------------------------------------------- #
# Fast checks (SQL + filesystem)
# --------------------------------------------------------------------------- #


class Database:
    """Thin psycopg2 wrapper; the tests inject a fake with the same interface."""

    def __init__(self, settings):
        self.settings = settings

    def __enter__(self):
        import psycopg2  # provided by the Patroni virtualenv
        self.errors = psycopg2.Error
        self.connection = psycopg2.connect(host=self.settings.socket_dir, user=self.settings.pg_user,
                                           dbname=self.settings.pg_dbname,
                                           connect_timeout=self.settings.sql_timeout,
                                           options='-c statement_timeout=%d000 -c default_transaction_read_only=on'
                                                   % self.settings.sql_timeout)
        self.connection.set_session(readonly=True, autocommit=True)
        return self

    def __exit__(self, *exc):
        self.connection.close()
        return False

    def one(self, sql):
        with self.connection.cursor() as cursor:
            cursor.execute(sql)
            return cursor.fetchone()

    def all(self, sql):
        with self.connection.cursor() as cursor:
            cursor.execute(sql)
            return cursor.fetchall()


SQL_ROLE = 'SELECT pg_is_in_recovery()'
SQL_CONNECTIONS = ("SELECT (SELECT count(*) FROM pg_stat_activity WHERE backend_type = 'client backend'), "
                   "current_setting('max_connections')::int")
SQL_ARCHIVER = ("SELECT current_setting('archive_mode'), "
                "EXTRACT(EPOCH FROM now() - last_archived_time), "
                "EXTRACT(EPOCH FROM now() - last_failed_time), "
                "last_failed_time IS NOT NULL AND (last_archived_time IS NULL OR last_failed_time > last_archived_time) "
                "FROM pg_stat_archiver")
# Primary side: every connected standby with its replay distance from the
# primary's *current* WAL position (the true primary-to-replay lag).
SQL_STANDBYS = ("SELECT application_name, state, sync_state, "
                "pg_wal_lsn_diff(pg_current_wal_lsn(), sent_lsn), "
                "pg_wal_lsn_diff(pg_current_wal_lsn(), replay_lsn), "
                "EXTRACT(EPOCH FROM replay_lag), EXTRACT(EPOCH FROM write_lag), "
                "EXTRACT(EPOCH FROM now() - reply_time) "
                "FROM pg_stat_replication")
# Standby side: local positions plus what the sender last reported. latest_end_lsn
# is the WAL end on the sender (walEnd in every data/keepalive message), so
# latest_end_lsn - replay_lsn is the primary-to-replay lag as seen from here.
SQL_STANDBY = ("SELECT pg_last_wal_receive_lsn()::text, pg_last_wal_replay_lsn()::text, "
               "EXTRACT(EPOCH FROM now() - pg_last_xact_replay_timestamp()), "
               "(SELECT status FROM pg_stat_wal_receiver), "
               "(SELECT latest_end_lsn::text FROM pg_stat_wal_receiver), "
               "(SELECT EXTRACT(EPOCH FROM now() - latest_end_time) FROM pg_stat_wal_receiver), "
               "(SELECT EXTRACT(EPOCH FROM now() - last_msg_receipt_time) FROM pg_stat_wal_receiver)")
SQL_ARCHIVE_RESTORE = "SELECT current_setting('restore_command') <> ''"


def check_database(settings, database_factory, now, memory=None):
    """Return the SQL-derived checks and the role ('primary', 'standby', None).
    ``memory`` is the persisted dict holding replay/absence continuity."""
    memory = {} if memory is None else memory
    checks = []
    try:
        with database_factory(settings) as db:
            in_recovery = bool(db.one(SQL_ROLE)[0])
            role = 'standby' if in_recovery else 'primary'
            checks.append(Check('sql', OK, 'reachable', now, role=role))
            used, maximum = db.one(SQL_CONNECTIONS)
            checks.append(connections_check(settings, int(used), int(maximum), now))
            if role == 'primary':
                checks.append(archiver_check(settings, db.one(SQL_ARCHIVER), now))
                checks.append(standbys_check(settings, db.all(SQL_STANDBYS), now, memory.setdefault('standbys', {})))
            else:
                checks.append(replication_check(settings, db.one(SQL_STANDBY), now,
                                                memory.setdefault('replication', {})))
                configured = bool(db.one(SQL_ARCHIVE_RESTORE)[0])
                checks.append(Check('archive_restore', OK if configured else CRITICAL,
                    'standby archive retrieval configured' if configured else 'standby archive restore command missing',
                    now, prompt=not configured, configured=configured))
            return checks, role
    except Exception as error:  # psycopg2.Error or an unexpected driver problem
        # Only the exception class is kept: messages can quote hosts and SQL.
        checks = [Check('sql', CRITICAL, 'unreachable: ' + type(error).__name__, now, prompt=True, role=None)]
        return checks, None


def connections_check(settings, used, maximum, now):
    ratio = used / maximum if maximum else 1.0
    status = OK
    if ratio >= settings.connections_critical_ratio:
        status = CRITICAL
    elif ratio >= settings.connections_warn_ratio:
        status = WARNING
    return Check('connections', status, '%d of %d client connections' % (used, maximum), now,
                 prompt=status == CRITICAL, used=used, max=maximum, ratio=round(ratio, 3))


def archiver_check(settings, row, now):
    archive_mode, archived_age, failed_age, failing_now = row
    archived_age = None if archived_age is None else float(archived_age)
    failed_age = None if failed_age is None else float(failed_age)
    details = dict(archive_mode=archive_mode, last_archived_age_seconds=archived_age,
                   last_failed_age_seconds=failed_age, failing_now=bool(failing_now))
    if archive_mode != 'on':
        return Check('archiver', CRITICAL, 'archive_mode is ' + str(archive_mode), now, prompt=True, **details)
    if failing_now:
        # Held for PERSIST_SECONDS by the stabilizer: one failed archive-push
        # that succeeds on retry a minute later is not an incident.
        return Check('archiver', CRITICAL, 'archive_command failing; last failure %s ago'
                     % _fmt_age(failed_age), now, **details)
    if archived_age is None:
        # archive_mode on, nothing archived and nothing failed yet: fresh primary or a quiet
        # instance right after restart. Not a failure; the WAL-bytes check covers growth.
        return Check('archiver', OK, 'archiving on, no segment archived yet', now, **details)
    return Check('archiver', OK, 'archiving, last success %s ago' % _fmt_age(archived_age), now, **details)


def standbys_check(settings, rows, now, memory):
    """Primary side: is every expected standby connected and how far behind is
    its replay? Absence is timed in ``memory['absent_since']`` (persisted) and
    escalates to critical after ``STANDBY_ABSENT_CRITICAL_SECONDS``."""
    expected = settings.expected_standbys
    present = {}
    for row in rows or []:
        if row and isinstance(row[0], str):
            present[_clean_name(row[0])] = row
    absent_since = memory.setdefault('absent_since', {})
    for name in list(absent_since):
        if name not in expected:
            del absent_since[name]
    if not expected:
        return Check('standbys', OK, 'no expected standbys configured; %d connected' % len(present), now,
                     expected=[], connected=sorted(present))
    per_standby = {}
    verdicts = []  # (status, prompt, reason)
    for name in expected:
        row = present.get(name)
        if row is None:
            since = _parse(absent_since.get(name)) or now
            absent_since[name] = _iso(since)
            absent_for = (now - since).total_seconds()
            per_standby[name] = {'state': 'absent', 'absent_seconds': int(absent_for)}
            if absent_for >= settings.standby_absent_critical:
                verdicts.append((CRITICAL, True, '%s absent for %s' % (name, _fmt_age(absent_for))))
            else:
                verdicts.append((WARNING, False, '%s absent' % name))
            continue
        _name, state, sync_state, sent_lag, replay_lag, replay_lag_s, write_lag_s, reply_age = row
        state = _clean_name(state) if state is not None else None
        replay_lag = None if replay_lag is None else int(replay_lag)
        sent_lag = None if sent_lag is None else int(sent_lag)
        replay_lag_s = None if replay_lag_s is None else float(replay_lag_s)
        write_lag_s = None if write_lag_s is None else float(write_lag_s)
        reply_age = None if reply_age is None else float(reply_age)
        usable = (state == 'streaming' and replay_lag is not None
                  and (reply_age is None or reply_age < settings.receiver_silence_warn))
        if usable:
            absent_since.pop(name, None)
            unavailable_for = 0
        else:
            since = _parse(absent_since.get(name)) or now
            absent_since[name] = _iso(since)
            unavailable_for = (now - since).total_seconds()
        per_standby[name] = {'state': state, 'sync_state': _clean_name(sync_state) if sync_state else None,
                             'replay_lag_bytes': replay_lag, 'sent_lag_bytes': sent_lag,
                             'replay_lag_seconds': replay_lag_s, 'write_lag_seconds': write_lag_s,
                             'reply_age_seconds': reply_age}
        if replay_lag is not None and replay_lag >= settings.lag_critical_bytes:
            verdicts.append((CRITICAL, True, '%s %d bytes behind' % (name, replay_lag)))
        elif not usable and unavailable_for >= settings.standby_absent_critical:
            verdicts.append((CRITICAL, True, '%s unavailable for %s' % (name, _fmt_age(unavailable_for))))
        elif replay_lag is None:
            verdicts.append((UNKNOWN, False, '%s connected, positions not visible' % name))
        elif state != 'streaming':
            verdicts.append((WARNING, False, '%s %s' % (name, state or 'unknown state')))
        elif reply_age is not None and reply_age >= settings.receiver_silence_warn:
            verdicts.append((WARNING, False, '%s silent for %s' % (name, _fmt_age(reply_age))))
        elif replay_lag >= settings.lag_warn_bytes or (replay_lag_s or 0) >= settings.lag_warn_seconds:
            verdicts.append((WARNING, False, '%s %d bytes behind' % (name, replay_lag)))
        else:
            verdicts.append((OK, False, '%s %d bytes behind' % (name, replay_lag)))
    status = worst(v[0] for v in verdicts)
    prompt = any(v[1] for v in verdicts if v[0] == status)
    if status == OK:
        reason = '%d of %d expected standbys streaming; %s' % (
            len(expected), len(expected), ', '.join(v[2] for v in verdicts))
    else:
        reason = '; '.join(v[2] for v in verdicts if v[0] != OK)
    return Check('standbys', status, reason, now, prompt=prompt, expected=list(expected), standbys=per_standby,
                 unexpected=sorted(name for name in present if name not in expected))


def replication_check(settings, row, now, memory):
    """Standby side. Status is decided by (a) receiver streaming, (b) the
    sender-reported WAL end minus the local replay position, (c) replay LSN
    advancement while WAL is pending and (d) sender keepalive continuity.
    ``memory`` (persisted) carries the last replay LSN, when it last advanced
    and since when the receiver has not been streaming."""
    receive_lsn, replay_lsn, replay_age, receiver_status, upstream_lsn, upstream_age, last_msg_age = row
    try:
        receive, replay, upstream = lsn_int(receive_lsn), lsn_int(replay_lsn), lsn_int(upstream_lsn)
    except (ValueError, AttributeError):
        return Check('replication', UNKNOWN, 'wal positions unparseable', now, receiver_status=receiver_status)
    replay_age = None if replay_age is None else float(replay_age)
    upstream_age = None if upstream_age is None else float(upstream_age)
    last_msg_age = None if last_msg_age is None else float(last_msg_age)
    receiver_status = _clean_name(receiver_status) if receiver_status is not None else None

    # Replay advancement: any change of the replay LSN counts (a timeline switch
    # or a rewind moves it too). Equality across a monitor restart is evidence
    # of no progress, which is why the previous position is persisted.
    previous = memory.get('replay_lsn')
    advanced_at = _parse(memory.get('replay_advanced_at'))
    if replay is not None and (advanced_at is None or previous is None or lsn_int(previous) != replay):
        advanced_at = now
        memory['replay_lsn'] = replay_lsn
        memory['replay_advanced_at'] = _iso(now)
    stalled_for = None if advanced_at is None else (now - advanced_at).total_seconds()

    streaming = receiver_status == 'streaming'
    if streaming:
        memory['not_streaming_since'] = None
        not_streaming_for = 0.0
    else:
        since = _parse(memory.get('not_streaming_since')) or now
        memory['not_streaming_since'] = _iso(since)
        not_streaming_for = (now - since).total_seconds()

    receive_lag = None if receive is None or replay is None else receive - replay
    # latest_end_lsn is 0/0 until the first message of a session arrives.
    upstream_lag = None if not upstream or replay is None else upstream - replay
    # Idle time is not replay-stall time. Start the clock only when there is
    # confirmed pending WAL, while retaining continuity across reconnects.
    if upstream_lag == 0:
        memory['pending_since'] = None
    elif upstream_lag is not None and upstream_lag > 0:
        pending_since = _parse(memory.get('pending_since')) or now
        memory['pending_since'] = _iso(pending_since)
        stalled_for = (now - max(pending_since, advanced_at or now)).total_seconds()
    usable = (streaming and upstream_lag is not None and upstream_lag >= 0
              and last_msg_age is not None and last_msg_age < settings.receiver_silence_warn)
    if usable:
        memory['unusable_since'] = None
        unavailable_for = 0
    else:
        since = (_parse(memory.get('unusable_since'))
                 or _parse(memory.get('not_streaming_since')) or now)
        memory['unusable_since'] = _iso(since)
        unavailable_for = (now - since).total_seconds()
    details = dict(receiver_status=receiver_status, lag_bytes=upstream_lag, receive_lag_bytes=receive_lag,
                   replay_lsn=replay_lsn, upstream_lsn=upstream_lsn if upstream else None,
                   replay_stalled_seconds=None if stalled_for is None else int(stalled_for),
                   last_message_age_seconds=last_msg_age, not_streaming_seconds=int(not_streaming_for),
                   unavailable_seconds=int(unavailable_for),
                   replay_delay_seconds=replay_age if (upstream_lag or 0) > 0 else 0.0)
    if upstream_lag is not None and upstream_lag >= settings.lag_critical_bytes:
        return Check('replication', CRITICAL, 'streaming, %d bytes behind sender' % upstream_lag, now,
                     prompt=True, **details)
    if not usable and unavailable_for >= settings.standby_absent_critical:
        return Check('replication', CRITICAL, 'usable WAL stream unavailable for %s' % _fmt_age(unavailable_for),
                     now, prompt=True, **details)
    if not streaming:
        label = 'wal receiver ' + (receiver_status or 'absent')
        if not_streaming_for >= settings.standby_absent_critical:
            return Check('replication', CRITICAL, '%s for %s' % (label, _fmt_age(not_streaming_for)), now,
                         prompt=True, **details)
        return Check('replication', WARNING, label, now, **details)
    if upstream_lag is None or upstream_lag < 0:
        # No (or an older-than-replay) sender position yet: a reconnect in
        # progress, or a session that never received a message. Not ok.
        return Check('replication', WARNING, 'streaming, sender position not confirmed', now, **details)
    if last_msg_age is None:
        return Check('replication', WARNING, 'streaming, sender message not confirmed', now, **details)
    if last_msg_age >= settings.receiver_silence_warn:
        return Check('replication', WARNING, 'streaming, no message from sender for %s' % _fmt_age(last_msg_age),
                     now, **details)
    if upstream_lag > 0 and stalled_for is not None and stalled_for >= settings.replay_stall_critical:
        return Check('replication', CRITICAL, 'replay stalled for %s with %d bytes pending'
                     % (_fmt_age(stalled_for), upstream_lag), now, prompt=True, **details)
    if upstream_lag >= settings.lag_warn_bytes:
        return Check('replication', WARNING, 'streaming, %d bytes behind sender' % upstream_lag, now, **details)
    if upstream_lag > 0 and stalled_for is not None and stalled_for >= settings.lag_warn_seconds:
        return Check('replication', WARNING, 'replay stalled for %s with %d bytes pending'
                     % (_fmt_age(stalled_for), upstream_lag), now, **details)
    return Check('replication', OK, 'streaming, %d bytes behind sender' % upstream_lag, now, **details)


def check_disk(settings, now, disk_usage=shutil.disk_usage):
    try:
        usage = disk_usage(str(settings.pgdata))
    except OSError:
        return Check('disk', UNKNOWN, 'PGDATA filesystem not readable', now)
    free_ratio = usage.free / usage.total if usage.total else 0.0
    details = dict(total_bytes=usage.total, free_bytes=usage.free, free_ratio=round(free_ratio, 3))
    if free_ratio < settings.disk_critical_free_ratio or usage.free < settings.disk_critical_free_bytes:
        status = CRITICAL
    elif free_ratio < settings.disk_warn_free_ratio:
        status = WARNING
    else:
        status = OK
    return Check('disk', status, '%.1f%% free' % (free_ratio * 100), now, prompt=status == CRITICAL, **details)


def wal_bytes(pgdata):
    """Total size of regular files directly under ``pg_wal`` (segments and
    ``archive_status`` are what grow when archiving stalls)."""
    total = 0
    def unreadable(error):
        raise error
    for root, _dirs, files in os.walk(str(pathlib.Path(pgdata) / 'pg_wal'), onerror=unreadable):
        for name in files:
            try:
                total += os.lstat(os.path.join(root, name)).st_size
            except FileNotFoundError:
                continue
    return total


def check_wal(settings, now, size=wal_bytes):
    if not (pathlib.Path(settings.pgdata) / 'pg_wal').is_dir():
        return Check('wal', UNKNOWN, 'pg_wal missing', now)
    try:
        total = size(settings.pgdata)
    except OSError:
        return Check('wal', UNKNOWN, 'pg_wal not readable', now)
    if total >= settings.wal_critical_bytes:
        status = CRITICAL
    elif total >= settings.wal_warn_bytes:
        status = WARNING
    else:
        status = OK
    return Check('wal', status, '%.2f GiB in pg_wal' % (total / GIB), now, prompt=status == CRITICAL, bytes=total)


# --------------------------------------------------------------------------- #
# Slow checks (pgBackRest info, Mac recovery files)
# --------------------------------------------------------------------------- #


def newest_backup(text, stanza):
    """(stop time of the newest successful backup, stanza status code) from
    ``pgbackrest info --output=json``. Raises ValueError on malformed input."""
    newest = None
    code = None
    for entry in json.loads(text):
        if entry.get('name') != stanza:
            continue
        code = entry.get('status', {}).get('code')
        for backup in entry.get('backup', []):
            if backup.get('error'):
                continue
            stop = backup.get('timestamp', {}).get('stop')
            if stop is None:
                continue
            when = datetime.datetime.fromtimestamp(int(stop), UTC)
            if newest is None or when > newest:
                newest = when
    if code is None:
        raise ValueError('stanza not present')
    return newest, int(code)


def backup_check(settings, code, output, now):
    """Turn a ``pgbackrest info`` exit code and raw output into a check.
    ``output`` is parsed and dropped; it is never logged or stored."""
    if code != 0:
        return Check('backup', UNKNOWN, 'pgbackrest info exited %d' % code, now, info_exit=code)
    try:
        newest, status_code = newest_backup(output.decode('utf-8', 'replace'), settings.stanza)
    except (ValueError, KeyError, TypeError, AttributeError):
        return Check('backup', UNKNOWN, 'pgbackrest info unparseable', now, info_exit=code)
    if status_code != 0:
        return Check('backup', CRITICAL, 'stanza status code %d' % status_code, now,
                     stanza_status=status_code)
    if newest is None:
        return Check('backup', CRITICAL, 'no successful backup in repository', now, stanza_status=0)
    age = (now - newest).total_seconds()
    limit = settings.backup_max_age_hours * 3600
    status = CRITICAL if age > limit else OK
    return Check('backup', status, 'newest backup %s ago' % _fmt_age(age), now, stanza_status=0,
                 newest_backup_at=newest.isoformat(), age_seconds=int(age))


def recovery_file_check(label, path, max_age, now, stat=os.stat):
    name = 'mac_recovery_' + label
    try:
        mtime = stat(str(path)).st_mtime
    except OSError:
        return Check(name, WARNING, 'last-success file missing', now)
    age = now.timestamp() - mtime
    status = WARNING if age > max_age else OK
    return Check(name, status, 'last success %s ago' % _fmt_age(age), now, age_seconds=int(age))


# --------------------------------------------------------------------------- #
# Persistence, recovery confirmation and the transition journal
# --------------------------------------------------------------------------- #


class Journal:
    """Append-only JSON-lines file, rotated by size. Entries are the monitor's
    own status names, check names, reasons and timestamps: never raw output."""

    def __init__(self, path, max_bytes, backups):
        self.path = pathlib.Path(path)
        self.max_bytes = max_bytes
        self.backups = backups
        self.failed = False

    def write(self, **record):
        line = json.dumps(record, sort_keys=True) + '\n'
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            try:
                size = self.path.stat().st_size
            except FileNotFoundError:
                size = 0
            if size and size + len(line) > self.max_bytes:
                self.rotate()
            with open(self.path, 'a') as handle:
                handle.write(line)
            self.failed = False
        except OSError:
            if not self.failed:
                LOG.warning('Transition journal not writable')
            self.failed = True

    def rotate(self):
        if self.backups <= 0:
            self.path.unlink()
            return
        for index in range(self.backups, 0, -1):
            older = self.path.with_name('%s.%d' % (self.path.name, index))
            newer = self.path if index == 1 else self.path.with_name('%s.%d' % (self.path.name, index - 1))
            if newer.exists():
                os.replace(newer, older)


class Stabilizer:
    """Turns raw checks into reported checks with persistence for degradations
    and confirmation for improvements. ``entries`` (persisted) maps check name
    to reported/observed status and the timers behind a pending change."""

    def __init__(self, settings, entries, journal):
        self.settings = settings
        self.entries = entries
        self.journal = journal

    def apply(self, checks, now):
        reported = [self.stabilize(check, now) for check in checks]
        present = {check.name for check in checks}
        for name in [name for name in self.entries if name not in present]:
            del self.entries[name]  # the check no longer exists for this role
        return reported

    def stabilize(self, raw, now):
        entry = self.entries.get(raw.name)
        if entry is None:
            immediate = raw.prompt or self.settings.persist_window(raw.name) == 0
            initial = raw.status if raw.status == OK or immediate else OK
            entry = {'reported': initial, 'reported_since': _iso(now), 'observed': raw.status,
                     'observed_since': _iso(now), 'worse_since': None, 'better_since': None}
            self.entries[raw.name] = entry
            self.journal.write(at=_iso(now), check=raw.name, layer='observed', previous=None, status=raw.status,
                               reason=raw.reason)
            self.journal.write(at=_iso(now), check=raw.name, layer='reported', previous=None, status=initial,
                               reason=raw.reason)
        elif entry['observed'] != raw.status:
            self.journal.write(at=_iso(now), check=raw.name, layer='observed', previous=entry['observed'],
                               status=raw.status, reason=raw.reason)
            entry['observed'] = raw.status
            entry['observed_since'] = _iso(now)
            # Warning time must not count as confirmed OK time after a
            # critical incident. Every improvement needs its own full window.
            entry['better_since'] = None
        last_seen = _parse(entry.get('last_seen'))
        if last_seen is not None and (now - last_seen).total_seconds() > self.settings.health_max_age:
            entry['better_since'] = None
        entry['last_seen'] = _iso(now)
        reported = entry['reported']
        if SEVERITY[raw.status] > SEVERITY[reported]:
            entry['better_since'] = None
            since = _parse(entry.get('worse_since')) or now
            entry['worse_since'] = _iso(since)
            held = (now - since).total_seconds()
            if raw.prompt or held >= self.settings.persist_window(raw.name):
                return self.promote(raw, entry, now)
            return self.hold(raw, entry, 'unconfirmed', held)
        if SEVERITY[raw.status] < SEVERITY[reported]:
            entry['worse_since'] = None
            since = _parse(entry.get('better_since')) or now
            entry['better_since'] = _iso(since)
            held = (now - since).total_seconds()
            if held >= self.settings.recovery_window(raw.name):
                return self.promote(raw, entry, now)
            return self.hold(raw, entry, 'recovering', held)
        entry['worse_since'] = entry['better_since'] = None
        return Check(raw.name, reported, raw.reason, raw.observed_at, prompt=raw.prompt,
                     observed_status=raw.status, reported_since=entry['reported_since'], **raw.details)

    def promote(self, raw, entry, now):
        self.journal.write(at=_iso(now), check=raw.name, layer='reported', previous=entry['reported'],
                           status=raw.status, reason=raw.reason)
        entry['reported'] = raw.status
        entry['reported_since'] = _iso(now)
        entry['worse_since'] = entry['better_since'] = None
        return Check(raw.name, raw.status, raw.reason, raw.observed_at, prompt=raw.prompt,
                     observed_status=raw.status, reported_since=entry['reported_since'], **raw.details)

    def hold(self, raw, entry, word, held):
        return Check(raw.name, entry['reported'], '%s [%s %s]' % (raw.reason, word, _fmt_age(held)),
                     raw.observed_at, prompt=raw.prompt, observed_status=raw.status,
                     reported_since=entry['reported_since'], **raw.details)

    def reset_timers(self):
        """After a long gap the pending-change timers are meaningless: a
        change must be confirmed again. Reported statuses are kept."""
        for entry in self.entries.values():
            entry['worse_since'] = entry['better_since'] = None


def load_state(path, now, settings):
    """Persisted monitor state or a fresh one. Malformed files start fresh;
    a stale file keeps reported statuses and continuity data but drops the
    pending-change timers."""
    fresh = {'schema': 1, 'checks': {}, 'memory': {}, 'saved_at': None}
    try:
        data = json.loads(pathlib.Path(path).read_text())
        if not isinstance(data, dict) or not isinstance(data.get('checks'), dict) \
                or not isinstance(data.get('memory'), dict):
            raise ValueError('bad shape')
        for entry in data['checks'].values():
            if not isinstance(entry, dict) or entry.get('reported') not in SEVERITY \
                    or entry.get('observed') not in SEVERITY:
                raise ValueError('bad entry')
    except OSError:
        return fresh
    except (ValueError, TypeError):
        LOG.warning('Monitor state unreadable; starting from an empty state')
        return fresh
    saved_at = _parse(data.get('saved_at'))
    if saved_at is None or (now - saved_at).total_seconds() > settings.health_max_age:
        Stabilizer(settings, data['checks'], None).reset_timers()
    return {'schema': 1, 'checks': data['checks'], 'memory': data['memory'], 'saved_at': data.get('saved_at')}


# --------------------------------------------------------------------------- #
# Report
# --------------------------------------------------------------------------- #


def write_report(path, report):
    """Atomic, fsynced replace so the healthcheck never reads a partial file."""
    path = pathlib.Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + '.tmp')
    with open(tmp, 'w') as handle:
        json.dump(report, handle, sort_keys=True)
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(tmp, path)
    try:
        fd = os.open(str(path.parent), os.O_RDONLY)
        try:
            os.fsync(fd)
        finally:
            os.close(fd)
    except OSError:
        pass


def evaluate_report(text, now, max_age):
    """Return (healthy, reason) for a health.json body. Warnings pass; only a
    stale, missing, malformed or critical report fails the container check."""
    try:
        report = json.loads(text)
        generated = datetime.datetime.fromisoformat(report['generated_at'])
        status = report['status']
    except (ValueError, KeyError, TypeError):
        return False, 'health report unparseable'
    if generated.tzinfo is None:
        generated = generated.replace(tzinfo=UTC)
    age = (now - generated).total_seconds()
    if age < -60 or age > max_age:
        return False, 'health report stale (%ds)' % age
    if status not in SEVERITY or status in (CRITICAL, UNKNOWN):
        failing = sorted(name for name, check in report.get('checks', {}).items()
                         if check.get('status') in (CRITICAL, UNKNOWN))
        return False, 'unhealthy checks: ' + ', '.join(failing)
    return True, status


def healthcheck(settings, clock=None):
    now = (clock or (lambda: datetime.datetime.now(UTC)))()
    try:
        text = settings.health_path.read_text()
    except OSError:
        print('health report missing')
        return 1
    healthy, reason = evaluate_report(text, now, settings.health_max_age)
    print(reason)
    return 0 if healthy else 1


# --------------------------------------------------------------------------- #
# Monitor loop
# --------------------------------------------------------------------------- #


class Monitor:
    def __init__(self, settings, database_factory=Database, popen=subprocess.Popen, clock=None,
                 disk_usage=shutil.disk_usage, wal_size=wal_bytes, stat=os.stat, sleep=None):
        self.settings = settings
        self.database_factory = database_factory
        self.popen = popen
        self.clock = clock or (lambda: datetime.datetime.now(UTC))
        self.disk_usage = disk_usage
        self.wal_size = wal_size
        self.stat = stat
        self.stop = threading.Event()
        self._sleep = sleep or self.stop.wait
        self.child = None
        self.slow_checks = {}
        self.slow_due_at = None
        self.last_status = {}
        self.role = None
        self.journal = Journal(settings.journal_path, settings.journal_max_bytes, settings.journal_backups)
        self.state = load_state(settings.state_path, self.clock(), settings)
        self.stabilizer = Stabilizer(settings, self.state['checks'], self.journal)
        self.journal.write(at=_iso(self.clock()), event='start', node=settings.node_name,
                           resumed=bool(self.state['checks']))

    # -- pgBackRest --------------------------------------------------------- #

    def info_command(self):
        s = self.settings
        return [s.pgbackrest_binary, '--config=' + str(s.pgbackrest_config), '--stanza=' + s.stanza,
                '--log-level-console=off', '--log-level-file=off', '--output=json', 'info']

    def run_info(self):
        """(exit code, stdout bytes). Output is returned for parsing only."""
        if self.stop.is_set():
            return 143, b''
        self.child = self.popen(self.info_command(), stdin=subprocess.DEVNULL,
                                stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        if self.stop.is_set():
            self.request_stop()
        try:
            try:
                output, _ = self.child.communicate(timeout=self.settings.info_timeout)
            except subprocess.TimeoutExpired:
                self.child.kill()
                self.child.communicate()
                return 124, b''
            return self.child.returncode, output or b''
        finally:
            self.child = None

    # -- ticks --------------------------------------------------------------- #

    def fast_tick(self, now):
        checks, role = check_database(self.settings, self.database_factory, now, self.state['memory'])
        if role != self.role:
            LOG.info('Role: %s', role or 'unknown')
            self.journal.write(at=_iso(now), event='role', role=role)
            self.role = role
        checks.append(check_disk(self.settings, now, self.disk_usage))
        checks.append(check_wal(self.settings, now, self.wal_size))
        return checks

    def slow_tick(self, now):
        checks = []
        code, output = self.run_info()
        checks.append(backup_check(self.settings, code, output, now))
        del output  # parsed above; never logged or stored
        for label, path in self.settings.mac_recovery_files:
            checks.append(recovery_file_check(label, path, self.settings.mac_recovery_max_age, now, self.stat))
        return checks

    def tick(self):
        now = self.clock()
        observed = self.fast_tick(now)
        if self.slow_due_at is None or now >= self.slow_due_at:
            self.slow_due_at = now + datetime.timedelta(seconds=self.settings.slow_seconds)
            for check in self.slow_tick(now):
                self.slow_checks[check.name] = check
        observed.extend(self.slow_checks.values())
        reported = self.stabilizer.apply(observed, now)
        self.log_transitions(reported)
        report = self.build_report(reported, observed, now)
        write_report(self.settings.health_path, report)
        self.save_state(now)
        return report

    def save_state(self, now):
        self.state['saved_at'] = _iso(now)
        write_report(self.settings.state_path, self.state)

    def log_transitions(self, checks):
        for check in checks:
            previous = self.last_status.get(check.name)
            if previous == check.status:
                continue
            self.last_status[check.name] = check.status
            level = {OK: logging.INFO, WARNING: logging.WARNING, UNKNOWN: logging.WARNING,
                     CRITICAL: logging.ERROR}[check.status]
            LOG.log(level, 'Check %s: %s -> %s (%s)', check.name, previous or 'new', check.status, check.reason)

    def build_report(self, checks, observed, now):
        return {'schema': 1, 'node': self.settings.node_name, 'generated_at': now.isoformat(),
                'role': self.role, 'status': worst(check.status for check in checks),
                'observed_status': worst(check.status for check in observed),
                'checks': {check.name: check.to_json() for check in checks}}

    # -- lifecycle ---------------------------------------------------------- #

    def request_stop(self, *_):
        self.stop.set()
        child = self.child
        if child is not None and child.poll() is None:
            child.terminate()

    def loop(self):
        LOG.info('Monitoring %s every %ss (backups every %ss); expected standbys: %s', self.settings.node_name,
                 self.settings.fast_seconds, self.settings.slow_seconds,
                 ', '.join(self.settings.expected_standbys) or 'none')
        while not self.stop.is_set():
            try:
                self.tick()
            except Exception as error:  # keep the sidecar alive; details are not secrets
                LOG.error('Tick failed: %s', type(error).__name__)
            self._sleep(float(self.settings.fast_seconds))
        LOG.info('Stopped')


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    logging.basicConfig(level=logging.INFO, stream=sys.stdout,
                        format='%(asctime)sZ %(levelname)s %(message)s')
    logging.Formatter.converter = __import__('time').gmtime
    settings = Settings()
    if argv == ['--healthcheck']:
        return healthcheck(settings)
    if argv:
        print('usage: pointfinder-monitor [--healthcheck]')
        return 2
    monitor = Monitor(settings)
    signal.signal(signal.SIGTERM, monitor.request_stop)
    signal.signal(signal.SIGINT, monitor.request_stop)
    monitor.loop()
    return 0


if __name__ == '__main__':
    sys.exit(main())
