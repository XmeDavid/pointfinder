# PointFinder availability rollout

Date: 2026-09-09/10. Status: rollout in progress. Production PostgreSQL runs under Patroni on Hetzner with a streaming Rainer standby (timeline 6, zero lag at verification), authenticated three-member etcd quorum, required watchdogs and two database routers. Two backend and frontend replicas run across Hetzner and Arthur; both `.ch` and `.pt` route through redundant health-supervised tunnels. Cross-backend authenticated chunk uploads and proxy-withdrawal tests passed. Encrypted pgBackRest backups/WAL archiving and hourly Mac copies of both uploads and encrypted backups are live. Real PITR passed independently from Hetzner S3 and from the Mac archive with networking disabled. TeamSpeak was migrated and voice confirmed; the old worker and its billed IPv4 are deleted. CI test gates and immutable-image publishing are committed; the new relay is deployed but releases remain disabled to protect pending billing work. Full host/partition/reconnect exercises, public Mac S3 serving/failback, operational alerting and legacy-volume retirement remain open. Do not start the retired standalone database or stopped rehearsal stacks. See [application readiness](ha-application-readiness.md) and [the execution record](../deploy/ha/README.md); historical sections below are not a current inventory.

### Current completion gates

Final September 10 release update: the release-activation gate is closed.
Full CI `34454464035` automatically released combined HA/billing master
`6f9be220`, and both hosts' actual images/health and completed Swarm updates
were verified. V66/V67 applied, temporary Flyway override removed and normal
startup verified. Email alert workers are deployed on both database hosts.
Earlier paused-release statements below are historical; the
[operations runbook](../deploy/ha/OPERATIONS.md) is the current reference.

September 10 final maintenance update (supersedes the opening historical status):
Hetzner hard-power loss, peer-partition watchdog fencing, each Mac guest outage,
and authenticated WebSocket reconnect passed. Database promotion took about
62 seconds and public recovery about 102 seconds after Hetzner power-off.
Hetzner is again primary; Rainer streams on timeline 12 with zero lag. Local
database/backup monitoring is deployed and healthy. See the current
[operations runbook](../deploy/ha/OPERATIONS.md) for evidence and limitations.

- **Storage decision closed:** the user accepts Hetzner S3 as the only live media store and temporary media interruption if that service fails. Garage on the Mac remains private recovery storage, reached over Tailscale. No public Garage endpoint, R2, home port forwarding or media failover is required. Hourly copies have a nominal one-hour recovery-point exposure, longer after failed copies. A Hetzner server outage does not inherently imply a Hetzner S3 outage.
- **Release activation:** HA source is integrated at master `6f9be220`; full CI `34450640054` and immutable publishing passed. `POINTFINDER_DEPLOY_ENABLED` remains false. Relay `c4bef26` is live with releases disabled. Coordinate pending billing V66/V67 and saved environment with its owner, then configure and verify real digest release/status correlation before activation. Do not deploy the combined image as an infrastructure-only update.
- **Disruptive acceptance passed:** hard Hetzner failure and partition fencing, both Mac VM outages and live STOMP reconnect were exercised in the authorized window. Physical Mac/site power loss and full native/offline journeys were not tested. Dokploy and TeamSpeak are single-host services and were interrupted during Hetzner testing.
- **Operations:** backup retention is configured, but independent alerts and Mac archive garbage collection are not. The append-only Mac archive stops copying at its disk-space guard rather than deleting recovery data. Retain the old upload volume until the recovery/retention gate is closed.

## Objective and decisions

Application-readiness update (September 9): the backend changes are implemented
and verified, including real socket tests against two application instances and
an HA-only release build based on `e01aa214`. The release baseline passed 191
focused tests, followed by 2 S3-pagination regressions. It is now deployed to
both production application hosts. See
[application readiness](ha-application-readiness.md) for evidence, artifact and
deployment requirements. Two-replica S3/API verification has passed; full
host/partition/client recovery and storage-disaster-recovery gates remain.

Run PointFinder across the existing Hetzner server and Intel Mac minis, keeping the cloud bill below EUR 20/month where possible. Use Dokploy to manage application and infrastructure containers, Docker Swarm for placement, Tailscale for private networking, and Cloudflare Tunnel replicas without purchasing managed load balancing. Self-host PostgreSQL replication and failover; use Hetzner Object Storage plus a Mac-hosted S3 disaster-recovery copy. Eventually place one Mac in Portugal for a third independent location.

Automatic recovery may interrupt requests and WebSockets. Clients must reconnect and safely retry. Asynchronous replication can lose recent acknowledged writes after an unrecoverable primary failure; it is not a perfect synchronous mirror.

## Observed baseline

From the September 9 investigation and repair; recheck before implementation:

- Hetzner `davidsbatista` / `dokploy-master`: CX33, Swarm manager, Tailscale `100.113.30.54`.
- `arthur`: VM 200 on Proxmox `wadlow`, 4 vCPU, 8 GiB RAM, 80 GiB virtual disk; now a reachable Swarm manager at `100.107.153.73` and the elected leader at last verification.
- `dokploy-worker-1`: CX23, Swarm worker, reported down. Its IPv4 does not auto-delete with the server.
- Two managers currently require both votes. They do not yet provide manager failure tolerance.
- All seven production services returned to 1/1 following repair. Dokploy HTTP returned 200. This is not an end-to-end PointFinder validation.
- Dokploy UI, its PostgreSQL/Redis, PointFinder PostgreSQL and backend are pinned to `davidsbatista` because they use local volumes, bind mounts or secrets. Retain these constraints until each workload is deliberately migrated.
- Original Hetzner database volumes remain authoritative. The repair briefly scheduled Dokploy components on Arthur with fresh local volumes; those unused volumes were left in place. Audit ownership before cleanup.
- `arthur`'s QEMU guest agent is inactive; fix as a separate guest-management maintenance step.
- `wadlow` has approximately 192 GiB LVM storage; `rainer` approximately 419 GiB. These are pool capacities, not promises of allocatable guest capacity. Check thin provisioning, snapshots and commitments.
- `rainer` already hosts `1realtr` and `1realtr-os` and used about 25 GiB of its approximately 31 GiB usable RAM. Capacity is a rollout gate. `base` is the intermittently available PC and cannot be a required voter.

## Target placement

| Physical host | Guest / role | Planned services |
|---|---|---|
| Hetzner | Existing server; Swarm manager and etcd voter | Dokploy control plane; PointFinder backend/frontend; PostgreSQL/Patroni initially primary; local proxies and tunnel connector |
| Mac `wadlow` | Existing `arthur`; Swarm manager and etcd voter | Backend/frontend replica; local proxies and tunnel connector; optional resource-limited builds |
| Larger Mac `rainer` | New Linux VM; Swarm manager and etcd voter | PostgreSQL/Patroni standby; S3 replica; backup/replication jobs; other workloads only if capacity allows |

The new guest name and resource allocation are implementation choices after inventory. Budget initially around 2 vCPU and 2–4 GiB for the guest, but validate measured PostgreSQL, S3 and etcd demands before accepting it. A voter alone is lightweight; a database and object store require additional resources. Do not assume these all fit because the voter fits.

No full Dokploy installation is needed on every guest. Join the common Swarm and manage its services from the existing Dokploy instance. Docker, Tailscale, Linux, Proxmox and disks remain below Dokploy. Managed Hetzner S3 is external to Dokploy.

Use explicit per-host constraints for stateful services. Give each etcd member a stable identity and local persistent disk; never deploy an undifferentiated three-replica etcd service. The same rule applies to PostgreSQL and S3. Swarm quorum, etcd quorum and Proxmox quorum are three independent mechanisms.

## Networking and ingress

- Keep Swarm control, gossip and overlay data on Tailscale: TCP 2377, TCP/UDP 7946, UDP 4789. Keep these closed on the public interface. Verify peer ACLs, routes, MTU and bidirectional overlay traffic.
- Retain and repair certificate validation for administrative endpoints. Prior diagnostic TLS bypasses are not the desired permanent configuration.
- Run the same Cloudflare Tunnel on Hetzner and Arthur, each connecting to its own local proxy. Use host placement and local endpoint binding so a connector cannot accidentally depend on Hetzner's routing mesh.
- Use HAProxy for application health checks and local-backend preference, with the other backend as fallback over Tailscale. Preserve required Traefik routing and avoid duplicate/conflicting listeners.
- Tunnel replicas provide connection redundancy, not application health steering. If a connector's proxy cannot reach any usable backend, arrange tested connector withdrawal/supervision so it cannot continue attracting requests indefinitely. Account for failure of the proxy itself.
- Test WebSocket reconnect, HTTP retries, DNS, native app endpoints and frontend caching. No promise that existing connections survive failover.
- Upload large media directly to S3 using scoped signed requests where possible; validate Cloudflare upload limits and media-delivery terms before routing object traffic through the tunnel.

## Backend and deployments

- Audit all process-local state before enabling two active backends: authentication, sessions, rate limits, caches, scheduled jobs, upload sessions, locks, event publication, WebSocket subscriptions and idempotency.
- Use durable database records/outbox and distributed job locking where appropriate. PostgreSQL NOTIFY can wake consumers but cannot be the sole durable event delivery mechanism. Ensure clients attached to either replica receive events and recover missed updates.
- Prefer no new Redis dependency initially. Dokploy's own Redis remains separate. If the application audit requires Redis, explicitly design its recovery and quorum rather than silently adding a single shared Redis bottleneck.
- Move persistent uploads to S3 and provision identical application secrets securely on eligible nodes before lifting current backend placement constraints.
- Deploy the same immutable image digest to both replicas. Since all hosts are x86_64, a single build can serve them all. Use a resource-limited build on a Mac and a registry such as GHCR; verify quotas and credentials. Keep CI tests as deployment gates.
- Apply database migrations once, with compatible rolling releases and defined rollback boundaries. Preserve existing offline queue, audit and authentication invariants.
- Spread backend/frontend replicas across Hetzner and Arthur with explicit placement; two replicas on the same host do not satisfy the plan.

## PostgreSQL

- Keep PostgreSQL 16 initially. Adopt the existing Hetzner data into a tested Patroni configuration; seed a physical standby on `rainer`. Do not initialize over the existing database. The user approved host-specific Dokploy Docker Compose deployments for PostgreSQL on September 9 so Patroni can receive narrowly mapped watchdog devices. Application and etcd services remain in Swarm.
- Start with asynchronous streaming over Tailscale, replication-slot/WAL disk limits and lag monitoring. The planned tradeoff is availability without waiting for a home connection on every write. Record measured recovery time and data-loss exposure; do not guarantee a fixed loss bound without enforcement.
- Deploy three etcd voters, one per physical machine, independently of database roles. Swarm managers do not substitute for these voters.
- Route database connections through a local HAProxy on each application host, using Patroni's primary/leader health endpoint. A standby's open PostgreSQL port is not proof that it can accept writes.
- Enable automatic promotion only after quorum, leader lease expiry and old-primary fencing/demotion are tested under network partitions and process stalls. Verify watchdog support in the guest/container setup; do not assume a Swarm restart is fencing.
- Fail back deliberately: rewind or reseed the former primary, let it catch up, then perform a controlled switchover if desired. Do not automatically create two writable primaries.
- Maintain scheduled base backups and WAL archiving for point-in-time recovery, with a tested restore and retention that fits the storage budget. Replication alone also copies accidental deletions.

## Object storage

- Hetzner Object Storage is initially authoritative. Select and pin a maintained S3-compatible implementation for `rainer` (MinIO was the proposed candidate; verify current distribution, maintenance and licensing before adoption).
- Mirror objects asynchronously using verified compatible replication tooling. Account for updates, deletions, versions, multipart uploads and checksums; do not assume Hetzner offers native replication into MinIO.
- Put database backups in separately permissioned storage with retention/versioning or immutability where supported. Replication deletion must not erase the only recoverable backup.
- Hetzner S3 is the sole live object store. During an object-storage outage, media may be unavailable; the user explicitly accepts this. Garage is a private disaster-recovery archive, not a second live endpoint. No public Mac S3 failover/failback is planned.
- For permanent object loss, restore from a verified Mac manifest into replacement private storage, validate checksums/access and deliberately reconfigure the application. Retain originals and avoid conflicting writers during recovery.
- Remove the legacy 30 GB upload volume only after migration reconciliation, a restore/read test, rollback retention and confirmation that no container still mounts it.

## Failure domains and recovery targets

| Failure | Expected result after acceptance tests |
|---|---|
| One backend process | Local proxy selects healthy backend; affected clients reconnect |
| Hetzner server | Two Macs retain quorum; standby may promote; Mac backend serves traffic; Dokploy UI unavailable until restored |
| Arthur / `wadlow` | Hetzner plus `rainer` retain quorum; Hetzner serves traffic |
| `rainer` | Hetzner plus Arthur retain quorum; primary remains available, but standby and S3 copy are unavailable |
| Entire current Mac location / home network | Two of three voters lost; Swarm cannot manage changes and safe PostgreSQL writes may stop. Existing containers alone do not guarantee application availability |
| Hetzner S3 service | Media functionality is interrupted until S3 recovers; Mac archive supports recovery after permanent data loss |
| Accidental deletion or corruption | Restore from retained backups; replicas are insufficient |

Three machines at two locations cannot guarantee majority availability after loss of either location. To tolerate any single location loss, use three independent locations with one voter at each. When Portugal is available, redesign both voter placement and data-replica placement; simply adding a fourth voting node is not the target. Proxmox's own quorum and guest startup behavior during partitions must also be tested; Swarm does not repair Proxmox quorum.

Initial targets: demonstrate backend recovery within 60 seconds and database recovery within 120 seconds in controlled tests, then record actual timings. These are acceptance targets, not current guarantees or a zero-data-loss promise.

## Ordered rollout and acceptance gates

1. **Inventory and baseline:** verify services, application journeys and database contents after the connectivity repair. Reconcile live Dokploy settings into versioned deployment definitions, including host constraints. Check disk/RAM headroom, existing backups, credentials and Proxmox quorum. Audit unused Arthur volumes without deleting unverified data.
2. **Third host:** create the Linux guest on `rainer` with measured resource limits; install Docker/Tailscale, join as third manager and verify 2-of-3 quorum. Align supported Docker versions in a separate controlled maintenance step. Keep stateful placement pinned.
3. **Backups and PostgreSQL:** establish and restore-test backups, deploy etcd, configure Patroni and seed the standby. Test manual switchover and failback before enabling automatic promotion and fencing.
4. **S3 migration:** provision the paid Hetzner S3 service and local replica; migrate/reconcile uploads; implement signed URLs and durable multipart/session state; test reads and recovery. Retain old storage during validation.
5. **Application concurrency:** implement the audit findings, durable events and job coordination; provision secrets; deploy two identical replicas and verify cross-replica behavior.
6. **Ingress:** provision Cloudflare Tunnel replicas and local health-aware proxies. Test backend/proxy/connector failures before production DNS cutover; retain a documented rollback route.
7. **Failure exercises:** inject one failure at a time, including link partitions, manager loss, database-primary loss, lagging replica and object-store unavailability. Record availability, replication lag, data integrity, reconnect behavior, recovery time and rollback results. Restore normal operation after each exercise.
8. **Retirement:** inspect `dokploy-worker-1` for unique workloads/data, remove it from Swarm, delete the exact Hetzner server and its separately billed IPv4 after migration validation. Delete the old upload volume only after its retention gate. Recalculate actual invoices.
9. **Operations:** add disk/WAL/replication/quorum/certificate monitoring, update and restore procedures, and a Dokploy recovery runbook. Schedule checks only when separately requested. Consider Portugal as the next availability upgrade.

## Cost envelope and access

Planning estimate using rates inspected September 9, including 8.1% VAT:

| Item | Monthly estimate |
|---|---:|
| CX33 | EUR 9.18 |
| One public IPv4 | EUR 0.54 |
| Existing 20 GB PostgreSQL volume | EUR 1.24 |
| Hetzner S3 base allowance | EUR 7.02 |
| Cloud total after worker and upload-volume retirement | **EUR 17.97** |
| Retain 30 GB upload volume during migration | + EUR 1.85 |

This is a planning estimate, not a verified invoice: check existing-contract rates, snapshots/backups, replication egress and quota overages. The official rendered Hetzner Object Storage page was verified on September 9 at EUR 6.49 excluding VAT, correcting the earlier EUR 4.99 assumption. During overlap, retaining the worker and both volumes while adding S3 is approximately EUR 26.31/month at current list rates; actual partial-month charges and legacy server rates may differ. The user approved this temporary overlap and the new S3 charge. Two private, versioned FSN1 buckets have now been created; see the execution record. Cloudflare paid Load Balancing and managed PostgreSQL are excluded.

Mac hardware, disks, existing internet, domain renewals and electricity are separate. At an assumed 20–30 W and EUR 0.20–0.30/kWh, each continuously running Mac costs about EUR 2.88–6.48/month in electricity; incremental use on already-running Macs may be lower. The cloud budget can fit below EUR 20; an all-inclusive budget is not assured.

Tailscale EUR 0 assumes eligibility under the existing plan: its Personal plan is for non-commercial use. Check PointFinder's eligibility before relying on it. Paid networking, registry/CI usage or additional storage would require revisiting the estimate.

Existing access: Hetzner API, Proxmox API, Dokploy API and SSH to Arthur/Hetzner were available during investigation. Keep credentials in their existing secret stores and never embed them here. Verify SSH/provisioning access for the new guest. Cloudflare tunnel/DNS permissions and S3 credentials/bucket access still need verification; the Hetzner Cloud API token alone must not be assumed to grant S3 access. Implementation should document exact missing scopes without asking for broad account credentials.

## References

- [Dokploy deployment options](https://docs.dokploy.com/docs/core/deployment-options)
- [Docker Swarm administration and quorum](https://docs.docker.com/engine/swarm/admin_guide/)
- [Cloudflare Tunnel replicas and routing](https://developers.cloudflare.com/tunnel/routing/)
- [Cloudflare Tunnel configuration](https://developers.cloudflare.com/tunnel/configuration/)
- [Patroni replication modes](https://patroni.readthedocs.io/en/latest/replication_modes.html)
- [Patroni watchdog](https://patroni.readthedocs.io/en/latest/watchdog.html)
- [Hetzner Object Storage overview](https://docs.hetzner.com/storage/object-storage/overview/)
- [Tailscale pricing and eligibility](https://tailscale.com/pricing)
