# Replication and monitoring repair — September 17, 2026

This is the implementation record following
[the seven-day monitoring review](monitoring-review-2026-09-17.md).
All timestamps here are UTC. No application release, billing change, paid
service, port forwarding, quorum change, or credential rotation is part of
this repair.

## Root cause and database change

Rainer was absent long enough for the Hetzner primary to recycle required
WAL. The standby had no `restore_command`, even though the missing segment
was present in the encrypted pgBackRest S3 repository. Increasing the primary's
2 GiB slot retention cap would only postpone this failure and increase disk risk.

`deploy/ha/repair-replication-archive.py enable` saved the previous dynamic
Patroni configuration privately on Hetzner and added only:

```yaml
postgresql:
  recovery_conf:
    restore_command: >-
      pgbackrest --config=/run/pgbackrest/pgbackrest.conf
      --stanza=pointfinder-production --log-level-console=off
      archive-get "%f" "%p"
```

Read-back validation asserted that every other dynamic setting was unchanged.
The shared DCS setting applies to either node when it is a standby and survives
ordinary service restarts. Its desired value is also recorded in the repository
and repair helper. The archive-enablement helper now sets and verifies
both `archive_command` and `restore_command`, avoiding this omission on a
future setup. Existing live configuration must be changed through DCS, not
only the bootstrap section of a Patroni configuration file.

An actual archive-get of the first missing segment succeeded as PostgreSQL's
uid 999. Its temporary 16 MiB local probe file was removed afterward; the S3
source was not changed. At 18:36 the real standby began retrieving and
replaying the missing archive chain automatically. There was no reinitialization,
PGDATA overwrite, forced promotion, primary restart, or timeline change.

At **18:49:43**, both SQL endpoints confirmed streaming, with receive and replay
positions equal on Rainer (`2A/3E000308`) and **zero primary-to-replay lag** on
Hetzner. The `production_rainer` slot was active and `reserved`. Catch-up took
approximately 14 minutes. This was a real recovery across the previously
missing archive chain, not just a synthetic test or a receiver reconnect.

## Monitoring repair and verified rollout

Both production database Dokploy stacks now run `production-monitor-r2` and
`production-alerting-r2` (full image prefix `pointfinder-patroni:16.15-4.1.5-`).
Rainer was updated first at 19:03, then Hetzner at 19:04. Both deployments
finished with healthy monitoring and alert-delivery containers. PostgreSQL and
backup container IDs and start times were unchanged on both hosts.

Changes:

- The primary checks the explicitly configured expected standby and its true
  primary-to-replay lag. Either node can assume this monitoring role after a
  legitimate failover.
- The standby compares replay with the sender's advertised WAL end. A negative
  local receive-minus-replay distance is informational, not proof of recovery
  or failure. It checks recent sender messages and actual replay progress.
- Missing or unusable streams escalate after 15 minutes. Failed reconnects
  cannot continually reset that timer. Confirmed large lag is critical promptly.
- Missing standby archive-retrieval configuration is a prompt critical, even
  if streaming currently works, to catch recurrence of the configuration gap.
- Ordinary warnings and transient archive/backup-info failures have persistence
  windows. WAL warning remains at 2 GiB, but must persist for ten minutes;
  disk exhaustion and large WAL/replication failures are not silenced.
- Recovery requires sustained healthy observations. Idle time does not count
  as replay-stall time; degraded time and blind gaps do not count as healthy
  recovery time. The pusher adds short warning debounce and recovery confirmation.
- Per-check continuity survives short restarts. A secret-free transition journal
  is retained in each existing monitor-state volume, rotated at 1 MiB with two
  older files. Email retry/idempotency behavior remains covered by tests.

Verification:

- **105 monitor tests and 41 alerting tests** passed locally and inside
  network-disabled Linux containers on **each** database host.
- **Six deployment-scope tests** passed. The rollout helper rejects changes
  to Patroni, backups, volumes, networking and unreviewed service configuration.
- New-image read-only SQL smoke checks passed against both actual databases
  before deployment, including expected-peer matching and archive configuration.
- A real archive-gap recovery passed, and subsequent SQL samples continued to
  show streaming with zero or negligible live-write lag on unchanged timeline 12.
- Post-rollout reports are OK, show fresh backup observations and an active
  expected standby; email outboxes have no pending messages. Existing delivery
  history was retained rather than reset. No test emails were sent.
- Both websites and both API health endpoints returned HTTP 200 after rollout.
  External monitoring showed 2,074 recorded cycles and all seven checks OK.
- Running script SHA-256 values match the reviewed local sources on both hosts:
  monitor `4b3cd235c073e58bc40f515f48a5446cb225aa5f02f971f1a4d61dcace42f4ef`;
  pusher `dceaf6a9cb6342b1ec5a1127e9f56fd2e5991632a34d08b00c70d2782f96149e`.
- Final acceptance at **19:09:33 UTC**: both reported and raw status OK;
  zero lag independently reported from both sides; second post-rollout
  backup checks successful (19:08:45 Rainer, 19:09:29 Hetzner); journals contain
  20/16 entries; state persisted; both email queues empty. Last delivery
  timestamps remained before rollout, so no new installation-noise emails
  were sent. Replication had remained recovered for approximately 20 minutes.

Claude Code Fable 5.1 (high effort) implemented the initial bounded monitoring
changes. Codex reviewed them, fixed additional edge cases, added regression
tests, performed the database repair and verified/deployed both images.

`deploy-monitoring-repair.py` stores private pre-change Dokploy records and
validates the narrow diff before applying it. Previous `r1` images and state
volumes remain available for rollback. Reverting monitor code would not revert
the separate, essential Patroni archive-retrieval setting. The unrelated
control-plane backup pusher was not changed in this incident repair.

## Future outage runbook

1. Check the primary's `pg_stat_replication` and the configured expected
   standby's actual primary-to-replay lag. A connected receiver by itself
   does not establish that the standby is caught up or safe to promote.
2. If the returning standby says a WAL segment was removed, check
   `SHOW restore_command`, Patroni's shared dynamic configuration, and the
   standby's archive-recovery progress. Archive replay can legitimately be
   ahead of its historical last *streamed* receive LSN.
3. Verify the existing pgBackRest configuration is readable as uid 999 and
   can retrieve the required segment. Never print the configuration, cipher
   passphrase, S3 key, or authentication file. Do not run recovery diagnostics
   by writing directly into live PGDATA.
4. Allow archive replay to progress. Confirm both Patroni and SQL eventually
   show steady streaming and small primary-to-replay lag. Keep the failover
   eligibility limit and fencing enabled throughout.
5. If the required archive chain has expired, is unavailable, or is corrupt,
   escalate for a reviewed standby reseed. Do not force promotion or delete
   a data directory automatically. Backups are not a license to overwrite a
   possibly newer database.

## Remaining boundaries

- Automatic catch-up requires a complete, accessible, decryptable retained
  WAL chain. This does not guarantee recovery from arbitrarily long outages.
- Replication remains asynchronous; this change does not promise zero lost
  acknowledged writes during a primary failure.
- The cause of the September 16 physical-host outage is not established.
  VM 102's `onboot=1` and reset watchdog are configured and unchanged.
- Two quorum voters remain at the home site. Losing both Macs is still a
  separate quorum/fencing design issue; this repair does not bypass quorum.
- Application availability, replication readiness, and backup recoverability
  are separate signals and must not be inferred from one green heartbeat.
