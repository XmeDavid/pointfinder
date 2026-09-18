# Database monitoring sidecar (read-only)

Status: **deployed on both production database hosts**, using the local
`pointfinder-patroni:16.15-4.1.5-production-monitor-r2` image (September 17).
All 105 tests passed locally and inside Linux on each host; live read-only SQL
checks also passed for the primary and standby.
The monitor itself sends no notifications. The separately deployed
`../alerting/` worker now forwards status transitions to email.

**September 17 hardening (deployed through Dokploy on both hosts).** After the
review in `docs/monitoring-review-2026-09-17.md` the monitor gained a
primary-side `standbys` check, a standby `replication` check that measures
lag against the sender's reported WAL end instead of the local receive
position, persistence and recovery confirmation for every check, a persisted
state file and a bounded transition journal. A prompt `archive_restore` check
detects removal of the standby's archive-fallback command. Additional regression
tests cover idle-to-busy transitions, failed reconnect loops, and recovery
confirmation across severity changes and blind gaps. The desired member list
is explicit in both production manifests. See
`docs/monitoring-repair-2026-09-17.md` for the incident and rollout record.

## What it is

A small Python sidecar (`monitor.py`) that sits next to each production
Patroni container, runs as uid 999 from the start, and observes. It never
writes to PostgreSQL, never runs any pgBackRest command except `info`, never
calls the Patroni or Dokploy APIs and never restarts anything. It produces one
artefact: a secret-free `/state/health.json`, plus a `--healthcheck` mode that
turns that file into a Docker health status.

| File | Purpose |
| --- | --- |
| `monitor.py` | The sidecar and its `--healthcheck` entry point. |
| `test_monitor.py` | Unit tests with fake database, process launcher, clock and filesystem. |
| `Dockerfile` | Overlay on `pointfinder-patroni:16.15-4.1.5-production-pgbackrest-r2` that copies the script and creates `/state`. |
| `monitoring-sidecar.example.yml` | Compose shape for the Hetzner host; adapt the PGDATA mount for Rainer. |

Run the tests from the repository root:

```
python3 -m unittest discover -s deploy/ha/monitoring -v
```

## Checks

Every 60 s (`FAST_SECONDS`), one short read-only SQL session over the shared
socket as `scout` (`default_transaction_read_only=on`, 5 s statement timeout):

| Check | Source | ok / warning / critical |
| --- | --- | --- |
| `sql` | connect + `pg_is_in_recovery()` | unreachable → critical (only the exception class is recorded) |
| `connections` | client backends vs `max_connections` | ≥ 80 % warning, ≥ 95 % critical |
| `archiver` (primary only) | `pg_stat_archiver` | `archive_mode` not `on` → critical; `last_failed_time` newer than `last_archived_time` → critical. A failure older than the last success is history and stays ok, so `failed_count` alone never alarms. |
| `standbys` (primary only) | `pg_stat_replication` rows for every name in `EXPECTED_STANDBYS` (this node excluded) | expected standby absent → warning, absent for `STANDBY_ABSENT_CRITICAL_SECONDS` (900) → critical; connected but not `streaming` (`startup`, `catchup`, …) → warning; no reply for `RECEIVER_SILENCE_WARN_SECONDS` (120) → warning; `pg_current_wal_lsn() − replay_lsn` ≥ 64 MiB or `replay_lag` ≥ 300 s → warning; ≥ 1 GiB → critical. Positions not visible → unknown. Unexpected connections are listed, never alarmed. With no expected standbys configured the check is ok and says so. |
| `replication` (standby only) | `pg_stat_wal_receiver` status, `latest_end_lsn`, `last_msg_receipt_time`; `pg_last_wal_replay_lsn()` | receiver absent/not streaming → warning, for `STANDBY_ABSENT_CRITICAL_SECONDS` (900) → critical; streaming but `latest_end_lsn` is `0/0` or below the replay position → warning (*sender position not confirmed*: a reconnect is not a recovery); no message from the sender for 120 s → warning; `latest_end_lsn − replay_lsn` ≥ 64 MiB → warning, ≥ 1 GiB → critical; WAL pending and the replay LSN unchanged for `LAG_WARN_SECONDS` (300) → warning, for `REPLAY_STALL_CRITICAL_SECONDS` (900) → critical. With zero bytes pending neither the replay LSN nor the replay timestamp has to move, so an idle standby on a quiet primary is ok as long as keepalives keep arriving. `receive_lag_bytes` (receive − replay) is reported for information only: it goes negative on every reconnect. |
| `archive_restore` (standby only) | whether `restore_command` is nonempty (the command itself is never collected) | missing → prompt critical, even while streaming is healthy; this prevents silent loss of the archive-fallback configuration |
| `disk` | `statvfs` of PGDATA | < 20 % free warning; < 10 % or < 2 GiB free critical |
| `wal` | sum of files under `PGDATA/pg_wal` | ≥ 2 GiB warning, ≥ 8 GiB critical (archive stalls grow this) |

Every 300 s (`SLOW_SECONDS`):

| Check | Source | ok / warning / critical |
| --- | --- | --- |
| `backup` | `pgbackrest … --output=json info` (60 s timeout) | stanza status ≠ 0 → critical; no successful backup → critical; newest successful backup older than 36 h (`BACKUP_MAX_AGE_HOURS`) → critical; `info` failing or unparseable → unknown |
| `mac_recovery_<label>` (optional) | mtime of a mounted `last-success.json` written by `s3-recovery-runner.py` | missing or older than 2 h (`MAC_RECOVERY_MAX_AGE_SECONDS`) → warning |

The pgBackRest output is parsed in memory and dropped; nothing from it other
than timestamps and the stanza status code reaches the report or the log.

Overall status is the worst check (`ok < warning < unknown < critical`).

`latest_end_lsn` is the WAL end the sender put in its last data or keepalive
message, i.e. the primary's position as of that message, so the standby sees
its true primary-to-replay distance without contacting the primary. The
monitor never reads the peer's socket; each node reports its own view and the
two reports together cover both directions.

## Persistence, recovery confirmation and the journal

Every raw observation goes through a stabilizer before it is reported:

| Direction | Rule | Default |
| --- | --- | --- |
| Gets worse, ordinary | reported once the degraded observation has held for `PERSIST_SECONDS` | 180 s (`wal`: `WAL_PERSIST_SECONDS` 600 s; `backup`, `mac_recovery_*`: `SLOW_PERSIST_SECONDS` 360 s, i.e. two consecutive slow polls) |
| Gets worse, *prompt* | reported on the tick it is observed | SQL unreachable; disk critical; WAL critical; connections critical; `archive_mode` off; replay lag ≥ `LAG_CRITICAL_BYTES` on either side; standby absent / receiver not streaming for `STANDBY_ABSENT_CRITICAL_SECONDS`; replay stalled for `REPLAY_STALL_CRITICAL_SECONDS` |
| Gets better | reported once the improvement has held for `RECOVERY_CONFIRM_SECONDS` | 180 s (`replication`, `standbys`: `REPLICATION_RECOVERY_SECONDS` 300 s) |

The hold timer starts at the first tick that observes the change and survives
level changes within the degraded range (a `backup` that goes unknown and
then critical is reported after 360 s in total, not 720). While a change is
pending the report keeps the previous status and shows the raw one:
`"status": "ok", "observed_status": "critical", "reason": "archive_command
failing; last failure 0m ago [unconfirmed 1m]"`. `--healthcheck`, the alert
pusher and the overall `status` all use the reported status; `observed_status`
at the top level is the worst raw one for operators reading the file.

Setting every window to `0` restores the previous immediate behaviour.

An absent, unconfirmed or unusable stream shares a continuous unavailability
timer: brief failed reconnects cannot reset escalation. The primary likewise
keeps counting while a peer reconnects without usable replay positions.
Replay-stall time starts only when pending WAL is confirmed, not during an
idle period. Large confirmed lag stays critical even if sender messages stop.
Every improving status needs its own full confirmation window: time spent
warning cannot count as time spent OK.

Detection latency with defaults (monitor alone; the pusher's own windows add
to these, see `../alerting/README.md`):

| Event | Reported after |
| --- | --- |
| PostgreSQL down, disk critical, WAL ≥ 8 GiB | ≤ 60 s (next tick) |
| Standby reconnects far behind (lag ≥ 1 GiB, the Rainer case) | ≤ 60 s |
| Expected standby missing | warning after 180 s, critical after 15 min |
| Receiver absent / not streaming on the standby | warning after 180 s, critical after 15 min |
| Replay stalled with WAL pending | warning after 5 min, critical after 15 min |
| `archive_command` failing | 180 s (a single failed push that succeeds on retry is never reported) |
| WAL ≥ 2 GiB | 10 min sustained; shorter excursions are absorbed, sustained retention pressure is still reported |
| `pgbackrest info` failing / unknown | two consecutive slow polls, ≈ 6 min (one timeout is never reported) |
| Any recovery | 180 s of confirmed ok; 300 s for replication and standbys |

State that must outlive a restart is in `/state/monitor-state.json` (schema 1):
per-check reported/observed status with the pending-change timers, the last
replay LSN and when it last advanced, since when the receiver has not been
streaming, and per-expected-standby `absent_since`. On start the file is
reloaded; if it is older than `HEALTH_MAX_AGE_SECONDS` the pending timers are
cleared (a change has to be confirmed again) while reported statuses,
absence timers and the replay position are kept. A replay LSN that is equal
across a restart is hard evidence of no progress, so a stall keeps counting.
A malformed file logs one warning and starts fresh. A gap between observations
longer than `HEALTH_MAX_AGE_SECONDS` also resets recovery confirmation; blind
time does not establish health. Pending-WAL and unusable-stream timers are
retained across short restarts.

`/state/transitions.log` is the bounded incident history: one JSON line per
observed transition, reported transition, role change and start
(`{"at": …, "check": "replication", "layer": "observed", "previous": "ok",
"status": "warning", "reason": "…"}`), rotated at `JOURNAL_MAX_BYTES` (1 MiB)
keeping `JOURNAL_BACKUPS` (2) older files. It carries the same strings as the
report and nothing else. Read it with
`docker exec <monitor> cat /state/transitions.log`.

## health.json

```json
{"schema": 1, "node": "production-hetzner", "generated_at": "…Z", "role": "primary",
 "status": "ok", "observed_status": "ok",
 "checks": {"sql": {"status": "ok", "reason": "reachable", "observed_at": "…", "role": "primary",
                    "observed_status": "ok", "reported_since": "…"},
            "archiver": {"status": "ok", "reason": "archiving, last success 3m ago",
                         "archive_mode": "on", "failing_now": false, …},
            "standbys": {"status": "ok", "reason": "1 of 1 expected standbys streaming; production-rainer 0 bytes behind",
                         "expected": ["production-rainer"], "unexpected": [],
                         "standbys": {"production-rainer": {"state": "streaming", "replay_lag_bytes": 0, …}}},
            "backup": {"status": "ok", "reason": "newest backup 9h12m ago", "age_seconds": 33120, …},
            …}}
```

Schema stays 1: the new keys are additions, every consumer of `status`,
`reason` and `observed_at` keeps working. On a standby the `replication`
check's `lag_bytes` is now the sender-to-replay distance (it used to be
receive-to-replay, which is `receive_lag_bytes` now).

Written atomically (temp file + fsync + rename) into `/state`, the only
writable mount. `--healthcheck` exits non-zero when the file is missing,
unparseable, older than `HEALTH_MAX_AGE_SECONDS` (default 3 × 60 s) or its
status is `critical` or `unknown`, invalid, or timestamped over a minute in the future.
Warnings keep the container healthy so
that a wobbly Mac link alone does not flap the service. An unreadable backup
status is unknown and intentionally unhealthy.

## Logs

Transition-only. A line is written when a check changes *reported* status
(`Check archiver: ok -> critical (archive_command failing; last failure 0m ago)`),
when the role changes, at start and at stop. Raw flaps that never get reported
are in the journal, not the log. Lines contain status names, the
monitor's own reason strings, node names, counts and ages. SQL text, exception messages,
subprocess output, paths from pgBackRest and credentials are never logged.
A tick that fails unexpectedly logs only the exception class and the loop
continues.

## Runbook

**Container unhealthy.** Read the report, it names the failing checks:

```
docker exec <monitor> cat /state/health.json
```

Then, by check:

- `sql` critical: PostgreSQL is not answering on the shared socket. Check the
  Patroni container state and `patronictl list` before anything else; the
  monitor does not distinguish a restart from a crash.
- `archiver` critical: `archive_command` is failing *now*. Look at
  `/var/log/pgbackrest` in the Patroni container for `archive-push` errors
  (S3 reachability, credentials, stanza mismatch). Watch `wal`: it grows until
  archiving recovers, and the primary stops when the disk fills.
- `wal` warning/critical without an `archiver` failure: replication slot
  retention or a paused standby; check `pg_replication_slots` and the standby.
- `disk` critical: free space first, then find the cause (`wal`, bloat, logs).
- `backup` critical with a fresh archive: the backup sidecar on the primary is
  not running or is failing. Its own logs and `pgbackrest info` from the
  sidecar tell which. `unknown` means `info` itself failed; the repository
  may be unreachable from this host. A reported `unknown` means two
  consecutive polls failed; a single timeout only shows as
  `observed_status`.
- `standbys` warning/critical (primary): an expected peer is absent, not
  streaming, silent or behind. The reason names the peer and, for absence,
  for how long. Confirm with `patronictl list` and the peer's own report.
  Critical after 15 min of absence means redundancy has been lost for that
  long; do not treat the peer as a failover target until its own
  `replication` check is ok again.
- `replication` warning (standby): not streaming, sender position not yet
  confirmed, sender silent, behind, or replay stalled. `streaming, sender
  position not confirmed` right after a reconnect is normal for one tick; if
  it persists, the sender is refusing the stream (for example a removed WAL
  segment: look at the PostgreSQL log for `requested WAL segment … has
  already been removed`). Critical with a large `lag_bytes` right after a
  reconnect is the stale-replica case: the stream is up but nothing can be
  replayed. Fix the catch-up path (archive `restore_command` or reseed);
  the check only reports ok after 300 s of confirmed streaming with the lag
  under 64 MiB and, when WAL is pending, a moving replay LSN.
- `mac_recovery_*` warning: the Mac private recovery copy is stale. That copy
  is the only off-Hetzner recovery path; treat it as a real gap, not noise.

**Reading a pending change.** `observed_status` differs from `status` while
the stabilizer waits; the reason ends in `[unconfirmed Nm]` or
`[recovering Nm]`. Nothing needs doing unless it becomes reported, but the
journal shows how often the raw observation flaps.

The monitor takes no action itself. Nothing in this directory should ever be
extended to restart, promote, expire or restore.

**Report stale but container running.** The loop is alive but a tick is
taking longer than 3 × 60 s; the only blocking call is `pgbackrest info`
(60 s timeout) and the SQL session (5 s). Check the container log for
`Tick failed` lines.

**Stopping.** `SIGTERM` sets a stop flag, terminates a running `pgbackrest
info` and returns from the loop within one tick. `stop_grace_period: 30s`
is ample.

## Deployment reference (applied; do not blindly rerun)

1. Build the overlay on each database host:
   `docker build -t pointfinder-patroni:16.15-4.1.5-production-monitor-r2 deploy/ha/monitoring`.
2. Merge `monitoring-sidecar.example.yml` into the host Compose stack. The
   service reuses the existing `pg-socket` volume, mounts PGDATA read-only and
   the existing uid-999 `pgbackrest-postgres.conf` copy read-only. `/state` is
   a named volume. Root filesystem read-only, all capabilities dropped,
   `/tmp` tmpfs for pgBackRest's lock path.
   Set `POINTFINDER_MONITOR_EXPECTED_STANDBYS: production-hetzner,production-rainer`
   on **both** hosts: the monitor drops its own `PATRONI_NAME` from the list,
   so the primary, whichever node that is, expects the other one. Without it
   the `standbys` check reports ok with `no expected standbys configured`.
   No other new value is required; every window and threshold has a default.
   `/state` must stay a persistent volume (it now holds `monitor-state.json`
   and the journal); a `tmpfs` there would lose absence timers on restart.
3. Optionally, on the host that also carries the Mac recovery state, mount the
   `snapshot-state` directories read-only and set `MAC_RECOVERY_FILES`.
4. Verify: `docker inspect --format '{{.State.Health.Status}}' <monitor>`
   and the report contents. Then run the outage tests (owned elsewhere):
   stop archiving, fill `pg_wal`, pause the standby, stop the backup sidecar
   for > 36 h equivalent by lowering `BACKUP_MAX_AGE_HOURS`.

## Alert integration

Implemented September 10: option 2 below is deployed on both hosts. See
`../alerting/README.md`. Alerts and recovery messages go to
`mail@davidsbatista.com`, with persistent deduplication, retry backoff and a
12-email/hour cap per host. The monitor remains credential-free.
Dokploy's separate native Resend channel covers its own enabled events, not
these custom health reports. Historical alternatives follow.

The original signals were Docker health status and the container log.
Options, cheapest first; pick one separately:

1. **Dokploy container health notifications.** Dokploy already watches
   container health for its own notification channels (email/Discord/Telegram
   /Slack). If the monitor's `unhealthy` state is surfaced there, no new code
   is needed; this must be verified in the Dokploy UI, not assumed.
2. **A tiny pusher next to the monitor** that reads `health.json` on change
   and posts to a webhook (ntfy, Telegram bot, email relay). It needs one
   outbound secret; keep it out of the monitor itself so the monitor stays
   secret-free and read-only.
3. **Uptime Kuma / healthchecks.io dead-man switch** pinged from the pusher
   on every `ok` tick; silence means trouble even when the whole host is gone,
   which the two options above cannot report.

Whichever is chosen, alert on transitions (the log already models them) and
route `warning` and `critical` differently so a stale Mac copy does not page
like a failing archiver.

## Settings

All via `POINTFINDER_MONITOR_*`. Thresholds: `CONNECTIONS_WARN_RATIO` 0.8,
`CONNECTIONS_CRITICAL_RATIO` 0.95, `DISK_WARN_FREE_RATIO` 0.2,
`DISK_CRITICAL_FREE_RATIO` 0.1, `DISK_CRITICAL_FREE_BYTES` 2 GiB,
`WAL_WARN_BYTES` 2 GiB, `WAL_CRITICAL_BYTES` 8 GiB, `LAG_WARN_BYTES` 64 MiB,
`LAG_CRITICAL_BYTES` 1 GiB, `LAG_WARN_SECONDS` 300, `BACKUP_MAX_AGE_HOURS` 36,
`MAC_RECOVERY_MAX_AGE_SECONDS` 7200. Topology and escalation:
`EXPECTED_STANDBYS` (comma-separated member names, self excluded; default
empty), `STANDBY_ABSENT_CRITICAL_SECONDS` 900, `REPLAY_STALL_CRITICAL_SECONDS`
900, `RECEIVER_SILENCE_WARN_SECONDS` 120. Persistence: `PERSIST_SECONDS` 180,
`WAL_PERSIST_SECONDS` 600, `SLOW_PERSIST_SECONDS` 360,
`RECOVERY_CONFIRM_SECONDS` 180, `REPLICATION_RECOVERY_SECONDS` 300. Journal:
`JOURNAL_MAX_BYTES` 1048576, `JOURNAL_BACKUPS` 2. Intervals and paths:
`FAST_SECONDS` 60, `SLOW_SECONDS` 300, `SQL_TIMEOUT_SECONDS` 5,
`INFO_TIMEOUT_SECONDS` 60, `HEALTH_MAX_AGE_SECONDS` 180, `STATE_DIR`,
`PGDATA`, `SOCKET_DIR`, `PG_USER`, `PG_DBNAME`, `PGBACKREST_BINARY`,
`PGBACKREST_CONFIG`, `STANZA`, `MAC_RECOVERY_FILES`, `NODE_NAME`.

## Limitations

- Node-local. The primary now knows whether its expected standby is connected
  and how far behind it is, and the standby knows its distance from the
  sender, but neither knows whether etcd has quorum or whether HAProxy routes
  to the right primary. Two reports plus Patroni's own view remain the full
  picture.
- `EXPECTED_STANDBYS` relies on Patroni setting `application_name` to the
  member name in `primary_conninfo`, which it does by default. A standby
  connected under another name is listed under `unexpected` and does not
  satisfy the expectation.
- The `scout` role must see `pg_stat_replication` and `pg_stat_wal_receiver`
  details (superuser or `pg_read_all_stats`); it is the cluster superuser
  today. If the columns come back NULL the checks report `unknown` rather
  than ok.
- `wal` sums file sizes on every fast tick; with a few hundred segments this is
  milliseconds, with tens of thousands it is not. Raise `FAST_SECONDS` if
  `pg_wal` is ever allowed to grow that far.
- The `Database` psycopg2 wrapper, `main()` and signal wiring are not
  unit-tested; every check, the report, the healthcheck evaluation, transition
  logging, the slow-check cadence, the `info` timeout, stop handling, the
  stabilizer, state persistence across restarts and journal rotation are.
- Tests ran on Python 3.9 locally; the image runs the Patroni virtualenv's
  Python 3.13. No 3.10+ syntax is used.
