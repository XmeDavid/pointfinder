# Monitoring review — September 10–17, 2026

**Follow-up:** the subsequently authorized repair is recorded in
[monitoring-repair-2026-09-17.md](monitoring-repair-2026-09-17.md).
The findings below preserve the pre-repair state, not the current condition.

Read-only investigation completed September 17 around 18:00 UTC. No service,
database, alert thresholds, notification preferences or infrastructure settings
were changed. Times below are Europe/Zurich (CEST, UTC+2), unless marked UTC.

## Executive finding

Production is serving, backups are succeeding, but database redundancy is
degraded: Rainer's PostgreSQL replica has not resumed replay after an extended
host outage. The email stream combines that real incident with overly eager
warning/recovery transitions. Do not regard the Mac as a ready database
failover target in its present state.

## Email reconciliation

Resend's complete returned history was filtered to the approved recipient,
monitoring subjects and the rolling seven-day window. It corroborates 50
delivered monitoring emails, excluding September 10 installation messages.
Container transition/delivery logs and the external Worker's D1 event history
independently match these counts.

| Cause | Delivered emails | Interpretation |
| --- | ---: | --- |
| Hetzner WAL warning/recovery cycles | 20 | Ten excursions to the 2 GiB warning threshold, then back to about 0.31 GiB, September 16–17. |
| Rainer replication and return-to-service transitions | 14 | Three startup-state messages, one revised warning, and five misleading recovery/re-warning pairs. |
| Rainer backup-info timeouts | 8 | Four approximately four-minute unknown/recovery episodes; not failed scheduled backups. |
| Hetzner transient archiver / backup repository status | 4 | One roughly one-minute archiver incident and one roughly five-minute backup-info incident. |
| External website / host incidents | 4 | Alert/recovery pairs for web-pt and Rainer. |
| **Total** | **50** | 24 Hetzner DB, 22 Rainer DB, four external-monitor messages. |

Two recorded Hetzner email delivery attempts initially failed and were retried;
Resend records the resulting messages as delivered. No duplicate-delivery
explanation is needed to account for the email volume.

## Real incident: Rainer outage and failed catch-up

- September 16: the guest's prior journal ends at 13:10:23; PostgreSQL's last
  replayed transaction is 13:11:01.72588. External monitoring raised missing
  heartbeat at 13:25:48 and cleared it at 22:00:57.
- Rainer's guest booted at 21:57:12. The Proxmox host uptime also begins around
  that time, consistent with a host-level outage/reboot, not just a database
  container restart. The evidence inspected does not establish whether power,
  hardware, maintenance or another cause initiated the outage.
- On September 17 the replica repeatedly reports, every approximately five
  seconds: `requested WAL segment 0000000C00000022000000D5 has already been removed`.
- Replica receive/replay positions remain `22/D5000000` / `22/D50018B8`.
  Patroni reports about 30.9 GB of WAL-position lag. This is WAL address-space
  distance, **not** an estimate of changed application data or data lost.
- The primary is healthy on timeline 12; the standby is not streaming and
  `pg_stat_replication` on the primary had no connected standby at inspection.
- The configured failover lag limit is 1 MiB, so this stale standby is outside
  the normal promotion eligibility limit. Do not force promotion.

Live `restore_command` on the standby is empty. The required segment still
exists in the private S3 repository at:

`pgbackrest/archive/pointfinder-production/16-1/0000000C00000022/0000000C00000022000000D5-55e2cbda9433ff8ed47993877cf44e6d03ff4455.zst`

The object was archived September 16 at 11:11:48 UTC. Its presence was checked
with a read-only listing; a complete catch-up chain was not downloaded or
restored during this diagnostic. Recovery should first verify archive
continuity and configure archive-based catch-up; reseeding the standby is the
fallback if necessary. This missing automatic archive-catch-up path is a gap
in the deployed configuration.

The slot WAL retention cap is 2 GiB, `wal_keep_size` is 128 MiB, and Patroni's
member-slot TTL is not overridden. Neither finite WAL retention nor a live
stream alone guarantees recovery after a long absence. See the official
[PostgreSQL replication configuration](https://www.postgresql.org/docs/16/runtime-config-replication.html)
and [archive recovery configuration](https://www.postgresql.org/docs/16/runtime-config-wal.html).

## Why monitoring is noisy and sometimes misleading

1. `deploy/ha/monitoring/monitor.py:193` measures receive-versus-replay on the
   replica, not primary-versus-replica lag. During brief streaming reconnects
   it reports `streaming, -6328 bytes behind` and OK even though replay remains
   stuck. Five such one-minute OK intervals generated recovery emails followed
   by fresh warnings. A socket reconnect is not a recovered replica.
2. A missing WAL receiver is only WARNING, with no escalation for how long it
   remains absent (`monitor.py:253`). The primary monitor does not independently
   check for its expected standby. Consequently real loss of redundancy is
   understated.
3. The monitor has no persistence/hysteresis for these checks. The email pusher
   coalesces same-severity changes of failing checks, but not warning→OK→warning
   transitions (`alerting/alert_pusher.py:425`). Each flap therefore produces
   another email pair. The 12-per-hour-per-pusher cap is far above this pattern.
4. The 2 GiB WAL warning threshold is reached repeatedly while the replica is
   disconnected. Normal subsequent recycling clears this symptom but does not
   repair replication. Merely increasing the threshold would hide the symptom.
5. One 60-second `pgbackrest info` timeout changes backup health to UNKNOWN
   immediately. Four such checks recovered on the next slow poll. They do not
   establish a missed or corrupt backup.

Claude Code Fable 5.1 (medium effort) supplied an independent, local read-only
code review. These findings were checked against live observations and deployed
scripts; local/deployed monitor and pusher differences are documentation only.
Other hypothetical code-review concerns are not presented as observed incidents.

## What is working

- Both websites and both API health endpoints return HTTP 200 now.
- Backend and frontend each have two running Swarm replicas; three managers
  are Ready, and the three etcd services and heartbeat clients are running.
- The Cloudflare external monitor is executing automatically: over 2,000
  recorded cycles, fresh state and all seven checks currently OK. The previous
  scheduler-verification blocker no longer applies.
- External monitoring recorded web-pt timeouts September 15, with its DOWN
  state from 08:05:45 to 08:15:50. This is an observed probe incident, not proof
  of an exact ten-minute outage for all users. No corresponding API or web-ch
  DOWN transition exists in its retained event history.
- pgBackRest reports repository status OK and a successful scheduled backup
  on every day September 11–17, including the September 13 full. Latest:
  September 17 at 05:30:05. WAL archiving is currently healthy.
- All seven daily encrypted Dokploy backups completed and passed S3 read-back
  verification. Local retention kept seven restore points without errors.
  Last isolated restore rehearsal remains September 10; the monthly interval
  has not elapsed.
- Both Mac recovery mirror status files are fresh again after the reboot;
  the recovery disk has approximately 56 GiB available. Fresh mirrors do not
  mean the live database replica is synchronized.

## Recommended order — not implemented

1. Repair standby catch-up and verify sustained replay progress, small actual
   primary-to-replica lag, and eligibility for safe failover.
2. Configure and test archive fallback after an absence exceeding live WAL
   retention. Keep bounded retention to protect the primary's disk.
3. Add expected-standby/actual-lag checks on the primary and escalate prolonged
   replication loss. Require sustained catch-up before reporting recovery.
4. Add a brief persistence window for transient warnings, recovery hysteresis,
   and a startup grace period for monitor initialization. Preserve immediate
   alerts for clear severe failures; do not just mute all warnings.
5. Retain bounded, persistent incident history so future reviews do not depend
   on Docker log survival. Current health JSON and alert-state JSON are latest
   snapshots, not a full time series; D1's transition log is capped at 200 rows
   (only 13 were present, so no external transition eviction was apparent).
