# Database monitoring sidecar (read-only)

Status: **deployed on both production database hosts**, using the local
`pointfinder-patroni:16.15-4.1.5-production-monitor-r1` image. All 58 tests passed
locally and in Linux; both monitors are healthy after outage acceptance tests.
The monitor itself sends no notifications. The separately deployed
`../alerting/` worker now forwards status transitions to email.

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
| `replication` (standby only) | receive LSN − replay LSN, `pg_stat_wal_receiver` | receiver absent/not streaming → warning; ≥ 64 MiB behind or (bytes > 0 and replay timestamp ≥ 300 s old) → warning; ≥ 1 GiB → critical. With zero bytes pending the replay timestamp is ignored, so an idle standby on a quiet primary is ok. |
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

## health.json

```json
{"schema": 1, "node": "production-hetzner", "generated_at": "…Z", "role": "primary",
 "status": "ok",
 "checks": {"sql": {"status": "ok", "reason": "reachable", "observed_at": "…", "role": "primary"},
            "archiver": {"status": "ok", "reason": "archiving, last success 3m ago",
                         "archive_mode": "on", "failing_now": false, …},
            "backup": {"status": "ok", "reason": "newest backup 9h12m ago", "age_seconds": 33120, …},
            …}}
```

Written atomically (temp file + fsync + rename) into `/state`, the only
writable mount. `--healthcheck` exits non-zero when the file is missing,
unparseable, older than `HEALTH_MAX_AGE_SECONDS` (default 3 × 60 s) or its
status is `critical` or `unknown`, invalid, or timestamped over a minute in the future.
Warnings keep the container healthy so
that a wobbly Mac link alone does not flap the service. An unreadable backup
status is unknown and intentionally unhealthy.

## Logs

Transition-only. A line is written when a check changes status
(`Check archiver: ok -> critical (archive_command failing; last failure 0m ago)`),
when the role changes, at start and at stop. Lines contain status names, the
monitor's own reason strings, counts and ages. SQL text, exception messages,
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
  may be unreachable from this host.
- `replication` warning: the standby is not streaming or is behind. Confirm on
  the primary (`pg_stat_replication`) and Patroni (`patronictl list`).
- `mac_recovery_*` warning: the Mac private recovery copy is stale. That copy
  is the only off-Hetzner recovery path; treat it as a real gap, not noise.

The monitor takes no action itself. Nothing in this directory should ever be
extended to restart, promote, expire or restore.

**Report stale but container running.** The loop is alive but a tick is
taking longer than 3 × 60 s; the only blocking call is `pgbackrest info`
(60 s timeout) and the SQL session (5 s). Check the container log for
`Tick failed` lines.

**Stopping.** `SIGTERM` sets a stop flag, terminates a running `pgbackrest
info` and returns from the loop within one tick. `stop_grace_period: 30s`
is ample.

## Deployment shape (not applied)

1. Build the overlay on each database host:
   `docker build -t pointfinder-patroni:16.15-4.1.5-production-monitor-r1 deploy/ha/monitoring`.
2. Merge `monitoring-sidecar.example.yml` into the host Compose stack. The
   service reuses the existing `pg-socket` volume, mounts PGDATA read-only and
   the existing uid-999 `pgbackrest-postgres.conf` copy read-only. `/state` is
   a named volume. Root filesystem read-only, all capabilities dropped,
   `/tmp` tmpfs for pgBackRest's lock path.
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

## Limitations

- Node-local only. It does not know whether *both* hosts are healthy, whether
  etcd has quorum or whether HAProxy routes to the right primary. Two reports
  (one per host) plus Patroni's own view are needed for that picture.
- `wal` sums file sizes on every fast tick; with a few hundred segments this is
  milliseconds, with tens of thousands it is not. Raise `FAST_SECONDS` if
  `pg_wal` is ever allowed to grow that far.
- The `Database` psycopg2 wrapper, `main()` and signal wiring are not
  unit-tested; every check, the report, the healthcheck evaluation, transition
  logging, the slow-check cadence, the `info` timeout and stop handling are.
- Tests ran on Python 3.9 locally; the image runs the Patroni virtualenv's
  Python 3.13. No 3.10+ syntax is used.
