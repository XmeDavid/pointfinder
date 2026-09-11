# PointFinder infrastructure operations

Verified September 10, 2026, after the authorized maintenance window.

## Storage retirement and cleanup — September 10

Hetzner `upload_volume` 104744479 (30 GB) was safely unmounted, detached and
deleted after fresh SHA-256 verification of all 314 finished media files
(2,108,158,576 bytes) against both live S3 and the Mac Garage archive.
The obsolete fstab entry and project `UPLOADS_PATH` setting were removed.
The live 20 GB `pg_volume` 105155434 remains attached and mounted.

A complete retirement archive, including abandoned chunk sessions, remains
on both trusted hosts as `upload-volume-104744479-final.tar.gz`, SHA-256
`101b2b76fe47c3fb48a0adfbcb069f98b8a0823d5f412b35426295057d15756a`.
Main: `/var/backups/pointfinder-ha/storage-retirement/`.
Mac: `/srv/pointfinder-s3/storage-retirement/`.
The cloud volume itself cannot be undeleted; recovery is from these archives
or the verified live S3/Garage copies. Keep the archives at least 30 days.

Seven completed restore-test containers and five dedicated test volumes were
removed with exact-target and no-other-consumer checks. Test metadata/reports
and actual backup repositories remain. See [RETENTION.md](RETENTION.md).
Historical references below to the retained upload disk and those completed
restore containers are superseded by this section.

## Running arrangement

### Recurring Dokploy recovery — September 10

Dokploy compose `4a7QOggMrpT0Wx-wNpfOm` (Infra: Dokploy encrypted backups)
runs daily at 04:15 UTC. The manifest is `control-plane-production.yml`.
Encrypted exports live in `/var/backups/pointfinder-ha/control-plane-encrypted`,
with verified copies in the private backup bucket's `control-plane/` prefix
and the hourly Mac Garage archive. Local retention is enabled: seven daily,
four weekly, three monthly restore points; Garage remains append-only.

First archive `dokploy-control-plane-20260910T091438Z` passed S3 and Garage
read-back verification and an isolated PostgreSQL restore: 62 tables, 162 rows,
388 configuration files, registry credentials and all mounted Swarm secret
entries. Test containers/volume/tmpfs were removed afterward. Monthly automated
rehearsals repeat database/config/secrets recovery, not Dokploy UI startup or
whole-cluster failover. The companion email worker reports stale/failed backups
and restore failures to the approved infrastructure address.

The passphrase is root-private on main and Rainer at
`/etc/dokploy/pointfinder/ha-secrets/control-plane-backup.passphrase`, with an
operator copy at `/Users/xmedavid/.codex/pointfinder-ha-recovery/control-plane-backup.passphrase`.
Never print it or commit it. Preserve one-time migration exports until their
minimum retention windows expire; no broad prune is installed.

### External monitoring acceptance — provider-blocked

Cloudflare Worker `pointfinder-infra-monitor` and D1
`b2061d61-7651-4542-9465-94491218e142` are deployed. Dokploy stack
`57TZ5opDnnfH67aJe10Wf` runs outbound heartbeat clients on all three hosts.
All clients are healthy and repeatedly accepted. A directly invoked real
Worker cycle passed both websites, both API health endpoints and three host
checks; Resend accepted the installation email with HTTP 200. The temporary
authenticated invocation endpoint and its credential were removed.

Automatic five-minute execution is NOT yet verified: Cloudflare's active
[Cron Triggers incident](https://www.cloudflarestatus.com/incidents/sjs8s0q2x4hw)
explains the missing scheduled invocations. Do not count the manual acceptance
cycle as cron success. After provider recovery, verify real scheduled Worker
events plus advancing D1 `last_run_ms`/`run_count` with
`python3 deploy/ha/deploy-external-monitor.py status`.
No paid plan was enabled and no inbound home ports were opened. This monitor
is outside both sites, but shares Cloudflare with ingress and depends on Resend.

### Application and database placement (verified)

Hetzner (`davidsbatista`, server 114836804) and Arthur run one backend and
frontend replica each, with redundant health-supervised Cloudflare connectors
for both `.ch` and `.pt`. Tailscale carries private traffic; home needs no
inbound ports. Dokploy manages containers; the OS, Docker and watchdog drivers
remain host responsibilities.

PostgreSQL 16 / Patroni runs on Hetzner (preferred primary) and Rainer
(`pointfinder-ha`, VM 102). Three etcd voters and three Swarm managers occupy
Hetzner, Arthur and Rainer. Latest state: timeline 12, Hetzner leader, Rainer
streaming with zero lag. Arthur is VM 200 on Proxmox `wadlow`.

Hetzner S3 is the only live media store. Private Garage on Rainer preserves
hourly upload versions and encrypted database repository copies. S3 outage may
interrupt media; this is accepted, and there is no public Mac S3 failover.

## Safety rules

- Never start retired `pointfinder-database-bt29ko`: it shares live PGDATA.
- Never start stopped Patroni rehearsal stacks alongside production watchdogs.
- Maintain only one voting host at a time. Verify all three voters/managers
  are healthy before deliberately stopping another.
- Never promote PostgreSQL manually without proving the former primary fenced.
  Patroni handles automatic promotion. Let a recovered former leader rejoin as
  a standby, catch up, then deliberately switch back if desired.
- Production billing is active. Release through passing gated CI; do not bypass it.
- Do not print environment files, API records, configuration exports or tokens.
- Do not delete legacy upload storage or recovery history to free space without
  a reviewed retention/recovery decision.

## Routine checks

On the main host, `docker node ls` should show three Ready managers and
`docker service ls` should show backend/frontend 2/2, routers 2/2 and each
etcd/tunnel service 1/1. Retired database/rehearsal services should remain 0/0.

Run `patroni-backup-control.py status` as root on the main host for a narrowly
projected authenticated cluster status. Do not dump the credential files.
Check both public websites and both `/actuator/health` API endpoints.

Database monitor containers are `pointfinder-pg-hetzner-vv3yw0-monitor-1` and
`pointfinder-pg-rainer-0u6pju-monitor-1`. Run their actual health command:

```sh
docker exec <monitor-container> /opt/patroni/bin/python /usr/local/bin/pointfinder-monitor --healthcheck
```

Their `/state/health.json` is secret-free. See `monitoring/README.md` for
thresholds and response steps. It checks local SQL, connection pressure,
disk/WAL, replication, archiving and backup freshness. Rainer also checks
mirror freshness. This is not an independent external uptime alert system;
email workers now forward local monitor transitions to the approved recipient.
They cannot detect their own complete host loss or a total-site outage.

## Recovery and boot dependencies

The main host must load `softdog` before Docker. Installed
`pointfinder-watchdog.service` explicitly loads it (the distribution deny-list
prevented automatic module loading), waits for udev and verifies `/dev/watchdog0`.
Docker's `pointfinder-watchdog.conf` drop-in requires that unit. Do not remove
the dependency or restart PostgreSQL without its correctly owned device.

Rainer's recovery disk mounts at `/srv/pointfinder-s3` by filesystem UUID
`a90df539-c996-4afe-b939-6b9f05cbff10`; device letters can change after reboot.
The supplied systemd mount unit and bind-mount checks prevent silently writing
the recovery archive onto the OS disk.

For planned failback, verify Rainer/Hetzner roles and zero lag, then use
`patroni-backup-control.py switchover production-hetzner` on the main host.
It submits through the current leader. Do not issue this if Hetzner is already
leader. Verify roles, replication and public service afterward.

## Backup custody and restore

pgBackRest encrypts the S3 repository (AES-256-CBC), archives WAL, and schedules
Sunday full/daily differential backups at 03:30 UTC on the primary only.
Retention is four full and seven differential backups. WAL archive timeout is
60 seconds, but it is not a guaranteed loss bound. Both hourly Mac mirrors are
append-only and preserve source versions; they stop at their disk-space guard.
Archive garbage collection is intentionally not automatic.

Keep the encryption passphrase and credentials protected independently of the
repository. Root-only host files are under `/etc/dokploy/pointfinder/ha-secrets`;
the protected local recovery copy is outside this repository. Loss of the
encryption key makes encrypted backups unusable.

Real production PITR was tested from encrypted Hetzner S3 and independently
from the Mac archive with container networking disabled. The tests verified
the production system ID, 69 migrations and 46 public tables. Restore into an
isolated empty volume first; never overwrite live PGDATA. Retained stopped
restore containers/volumes contain real production data and need protection.
Historical fixture assertions must be updated deliberately after new migrations.

A one-time Dokploy export is retained on both trusted hosts:
`dokploy-control-plane-20260910T074306Z.tar.gz`, SHA-256
`53228fb0672affd7eb9838f411bbad4cbd4ba5b9080ed5ba8c72a4fff5ef30aa`.
Main directory: `/var/backups/pointfinder-ha/control-plane`.
Mac directory: `/srv/pointfinder-s3/control-plane-backups`.
It contains secrets: root-only, **not encrypted at rest**, never public or
committed. Dump-list, archive structure and cross-host checksum were checked;
a full Dokploy restore was not exercised and recurring exports are not set up.
`backup-control-plane.py` creates a fresh export when needed.

## Acceptance evidence and limits

- Repeated hard Hetzner power-off passed after fixing watchdog boot ordering:
  promotion about 62 seconds after power-off, all public endpoints recovered
  about 102 seconds after power-off and remained healthy while Hetzner was off.
- Peer isolation caused watchdog reboot and safe rejoin. No simultaneous
  writable primaries were observed; public recovery was about 85 seconds.
- Each Mac VM was stopped/restarted separately; the peer deployment served.
  Physical Mac and entire-site power failures were not rehearsed.
- Authenticated live STOMP clients on both domains reconnected across backend
  rolling restart and converged to state version 64. Synthetic users/game were
  removed. Full native/offline UI journeys remain outside this test.
- Both database monitors and hourly mirrors survived the maintenance tests.

Reports are private under `/Users/xmedavid/.codex/pointfinder-ha-recovery`.
Failures and retries are retained, including the initial watchdog boot failure.
Do not call this zero-downtime or zero-data-loss HA: replication is asynchronous.
Both Macs are at one location, so losing that site loses two of three voters.
Dokploy and TeamSpeak remain single-host services on Hetzner.

## Release handoff and remaining decisions

September 10 activation completed: billing completion was confirmed by the
user. `POINTFINDER_DEPLOY_ENABLED=true`; full master CI run `34454464035`
passed, including both automatic releases of commit `6f9be220`. Both Swarm
updates completed, with one healthy backend and frontend on each application
host, all using the requested immutable images. The failed-CI bypass is false.

Current backend: `ghcr.io/xmedavid/pointfinder-backend@sha256:2a9f18db1f13f70734becc063e803aa793c585f77a29b1c3cd4461985d4978bd`.
Current frontend: `ghcr.io/xmedavid/pointfinder-frontend@sha256:131114138d3d082f09d9158cdb044a894b917c91d0242f48a0c51a411f5f13a4`.
V66/V67 applied successfully; production now has all migrations V1–V71.
The temporary out-of-order override was removed from saved configuration and
both running containers. A second rollout of the same backend image verified
normal Flyway startup and completed its observation window. Billing/Stripe
runtime settings match the approved project values; quota enforcement is on.
Both domains returned HTTP 200 and rejected unsigned Stripe webhooks with 400.
No real charge or checkout was performed by this infrastructure verification.

CI follows the matching Dokploy deployment job; Swarm's own health/rollback
observation can continue after that job reports done. For release acceptance,
run `verify-release-runtime.py` until both updates are completed, not merely
until CI is green. This was done for both rollouts above.
The relay now has its protected API-key mount and only the two fixed production
release targets. Its Docker-source canary demonstrated exact release/status
correlation for failure and success; the isolated app and route were removed.
Legacy PointFinder webhook routes were removed so they cannot bypass CI;
StockDraft's unrelated route is preserved. Dokploy's own `autoDeploy` remains
false deliberately: automatic production deployment is owned by the gated CI
workflow, not direct webhooks.

Pre-release backup `pointfinder-20260910T081454Z.dump` is on both database
hosts, SHA-256 `f76c61200a1cd336318867b647987b37868467efb9c30e5ddfb660200c359806`.
V66/V67 SQL passed on an isolated network-disabled restore with V68–V71 already
present. The synthetic container and its memory-backed data were removed.
`SPRING_FLYWAY_OUT_OF_ORDER=true` was used only for the first rollout and is
now absent. Older PITR rehearsals targeting pre-release times correctly have
69 migrations; later recovery targets must account for the new 71-migration schema.
The refreshed root-only control-plane export
`dokploy-control-plane-20260910T083014Z.tar.gz` is on both trusted hosts;
SHA-256 `6d62ae3ef742223d5ec156b7f3d63a27a0266bcded0859ba71b587105b703548`.
It includes current notification and release configuration and remains
unencrypted at rest, protected by root-only access and SSH transport.
The earlier paused-state handoff below is historical.

The earlier paused-release state has been superseded by the successful
activation above. Do not reapply its disabled release flags or migration
overrides.

Email recipient: `mail@davidsbatista.com`. Dokploy Resend notification
`3J1qYcJ_XPR6tw01g9c25` is configured for build errors, backup events, restarts
and server thresholds; routine deploy/cleanup notifications are disabled.
The user confirmed receipt of its installation test. Separate alert-pusher
sidecars in both database Compose stacks forward custom monitor warnings,
unknown/critical status and recovery, including stale reports. They use
protected `alert-email.json` host files, persistent delivery state, retry
backoff and a 12-email/hour cap per host. See `alerting/README.md`.
The upload volume retirement, archive retention review and recurring encrypted
control-plane backups with isolated database/configuration restore checks are
now complete (see above). Older recovery archives remain deliberately retained.
A full Dokploy UI/Traefik/Swarm disaster-rebuild rehearsal remains distinct from
the automated database/configuration recovery check; it has not been performed.
No new paid load balancer or public home endpoint was introduced.
