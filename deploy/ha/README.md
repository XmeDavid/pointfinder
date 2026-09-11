# HA rollout assets

See [the availability plan](../../docs/high-availability-plan.md) for architecture and rollout gates.

## Latest verified state — September 10 (supersedes historical entries below)

### Automatic production releases completed

User confirmed billing finished. Full CI `34454464035` passed and automatically
released master `6f9be220` through the immutable relay. Both Swarm updates
completed, backend/frontend each healthy on Hetzner and Arthur. V66/V67 applied;
the temporary Flyway out-of-order override was removed from saved configuration
and both running backends, and a second same-image rollout passed normal startup.
Both domains are healthy and reject unsigned Stripe webhook requests with 400.

`POINTFINDER_DEPLOY_ENABLED=true`; failed-CI bypass remains false. Dokploy
direct auto-deploy hooks remain off intentionally: CI owns automatic releases.
Legacy PointFinder relay bypass routes were removed; StockDraft was preserved.
The isolated release canary verified failure/success correlation and was removed.
Claude Code performed a read-only billing migration review; Codex independently
tested V66/V67 SQL on an isolated production-backup restore and verified the
actual production containers. No real billing transaction was initiated.
Current digests, backups and remaining non-release maintenance are recorded in
[OPERATIONS.md](OPERATIONS.md). Earlier paused-billing/release notes are historical.

### Email alerts activated

The approved recipient is `mail@davidsbatista.com`. Dokploy's native Resend
notification is configured and the user confirmed its test arrived. Separate
alert-pusher sidecars are healthy on both database hosts, managed in their
existing Dokploy Compose stacks. They forward local monitor status transitions
and recovery, including missing/stale reports, with persistent deduplication,
bounded retries and rate limiting. The existing Resend key is mounted as a
protected file; neither database nor application configuration was changed.
All 28 alert-worker tests passed locally and in Linux. A synthetic real-email
alert/recovery pair and restart deduplication passed; the Mac installation test
also verifies its own outbound delivery path. This is not independent total-
host/site outage monitoring. See [alerting/README.md](alerting/README.md).

### September 10, final maintenance acceptance

See [OPERATIONS.md](OPERATIONS.md) for the current runbook and deferred gates.
Real Hetzner power loss passed: Rainer promoted about 62 seconds after power-off;
all four public website/API endpoints recovered about 102 seconds after power-off
and stayed healthy while Hetzner remained off. The first drill exposed a missing
watchdog device after boot; the explicit softdog-before-Docker systemd dependency
fixed it, and the repeated hard-power drill verified automatic startup and rejoin.
The peer partition drill triggered a watchdog reboot, with no simultaneously
writable primaries observed. Each Mac VM was separately stopped and restarted;
public service checks passed. These were guest tests, not whole-site power tests.

Authenticated WebSocket clients on both domains reconnected during a rolling
backend restart and converged to state version 64. Synthetic game/users were
removed. This is not a complete native/offline UI journey test.

Final checks: all three managers Ready; backend/frontend 2/2; all tunnel and
etcd services running; Hetzner primary and Rainer streaming with zero lag on
timeline 12; both database monitors and both hourly recovery workers healthy;
both websites and API health endpoints HTTP 200. TeamSpeak's container returned.

HA source is integrated into master at `6f9be220`; full CI `34450640054` passed
and immutable images published. Production digests are unchanged. Billing and
automatic releases remain disabled pending the billing owner's coordinated
rollout and release-path activation test. `b977bc1b` fixed private GHCR access
using the existing credential. No new key was requested.

Read-only monitoring is deployed on both database hosts (58 tests passed).
External alert delivery awaits a destination. Claude Code implemented its
bounded foundation; Codex reviewed, corrected and verified it in Linux.
A private Dokploy control-plane export was copied to the Mac and checksum-
validated; it is a one-time root-only export, not a scheduled or restore-tested
Dokploy recovery service. Hetzner S3 is the sole live media store by decision;
Garage remains private recovery storage, with no port forwarding required.
The legacy upload volume and append-only recovery history are retained.

Everything below is historical evidence, not a current outstanding-task list.

### September 10, 07:10 UTC: independent Mac restore and CI guardrails

Both Garage recovery workers are live under the existing Dokploy Compose and
healthy: hourly version-preserving uploads plus encrypted database-backup
copies. The backup worker uses the user-authorized existing general S3 key in
a protected mount; the upload worker retains its narrower application key.
Image `pointfinder-s3-recovery:20260910-r3`; three snapshot tests passed in Linux.
First backup manifest at 07:00:04 UTC contains 48 entries / 13,624,304 verified
bytes. No source data or archive versions were deleted.

Reconstructed 41 current encrypted repository objects from that Mac manifest
into protected `/srv/pointfinder-s3/backup-snapshot-state/restore-rehearsal-b21e347f1352`.
PITR to `2026-09-10 06:45:40.683376+00` passed with **Docker networking disabled**,
using only that local repository and the preserved encryption key. Result:
production system ID, 69 successful migrations, 46 public tables. Containers
`pf-s3-restore-c7cea6263c` and `pf-s3-restore-c7cea6263c-files` are stopped;
volume `pf-s3-restore-c7cea6263c-data` is retained and contains real data.
This verifies database recovery independently of Hetzner S3. It does not make
the Garage archive an immediately usable production upload bucket.

CI guardrails are pushed on master at `eb9a5694`; full CI run `34448334953`
was in progress at this checkpoint (not yet a green-CI claim). Publishing
requires all backend/frontend/Android gates to pass. Both
`POINTFINDER_DEPLOY_ENABLED` and the old failed-CI bypass variable are false.
Relay repository `XmeDavid/dokploy-action-relay` commit `c4bef26` is deployed;
16 Go tests/race checks, vet and workflow actionlint passed. The live
authenticated release endpoint returned `403 release disabled`, as intended.
Legacy relay routes, including StockDraft, were preserved.

The deployed HA-only source is now preserved separately at `b66f97db`, branch
`codex/pointfinder-ha-deployed-baseline`. Production app digests are unchanged;
pending billing remains unactivated. Integrate that HA source with the billing
owner's work before enabling future master releases. Relay key mount/target
configuration and real Docker-source release/status correlation still need
activation testing. The relay's GitHub-source deployment overwrote its custom
title with the commit message; do not assume Docker-source titles behave the
same without a dedicated test.

The Mac media-serving endpoint is blocked on home inbound HTTPS/CGNAT details.
Free Cloudflare Tunnel is not a suitable unrestricted video/large-file S3
delivery path under its current documented terms. Existing Hetzner direct-S3
delivery remains unchanged. Full host/partition/client drills and operational
alerts/retention remain explicit completion gates.

### September 10, 06:50 UTC: encrypted backups and PITR are live

The user-authorized existing general S3 key is in use; no new credential was
required and shared-key permissions were not changed. Both Patroni containers
now run the backup-capable r2 image, with a shared per-host PostgreSQL socket
volume and a primary-only backup sidecar managed by the same Dokploy Compose.
`archive_mode=on`, encrypted pgBackRest archive-push and `archive_timeout=60s`
are active. The first full backup completed at **06:44:47 UTC** on Rainer.
Weekly fulls (Sunday) and daily differentials are scheduled at 03:30 UTC.

An isolated synthetic PITR rehearsal passed (`pf-pitr-test-3ad204a8-*`): the
before-target row remained, the after-target row did not, and recovery promoted
to timeline 2. A **real encrypted S3 backup** was then restored to
`2026-09-10 06:45:40.683376+00` in separate unpublished container
`pf-s3-restore-d93d8b686b`, using volume `pf-s3-restore-d93d8b686b-data`.
It matched production system ID, 69 successful migrations and 46 public tables.
Production replication and archive-push were explicitly disabled in that test.
All restore-test containers are stopped and retained; the real restored data
must be protected like production data. No live PGDATA was restored over.

Controlled switchovers to Rainer and back succeeded. Hetzner is primary and
Rainer streams on **timeline 6 with zero lag**. Both domains returned 45/45
HTTP-200 health probes during the first switch/rollout window (90 total).
The initial failback request sent to the standby was rejected with 412;
submitting it through the active leader succeeded. This avoids the known
container-to-own-Tailscale-port hairpin issue. These remain controlled
switchovers, not full power-loss/partition exercises. Hetzner's archive check
passed with nine archived items and zero failures at the checkpoint.

Connection exhaustion mitigation: two backends had 42 live sockets while
PostgreSQL retained 78 JDBC sessions behind the routers. Rolled out Hikari
minimum-idle 2, maximum-pool-size 20, keepalive-time 60000 ms and max-lifetime
600000 ms, preserving the pinned HA image and unrelated runtime environment.
Saved only those overrides in Dokploy without deploying pending billing env.
After both replacements were healthy, terminated exactly 38 idle, transaction-
free router sessions predating rollout at 06:32:12 UTC. No active transaction
was terminated. Database sessions totaled 17 after failback. The precise
underlying routing/idle-timeout mechanism was not proven; continued observation
is needed to confirm no recurrence.

Fresh pre-change logical dump is retained on both hosts:
`pointfinder-20260910T063830Z.dump`, SHA-256
`d202c79d46cea3269a91ef66d83d6fac676d305693f1bd9a2cb94619a3294f33`.
The rebuilt pgBackRest r2 image on Hetzner is
`sha256:5e44f413a3bb178d096665c4996d953d1c3d42c5f09cbf89efc1c423285a6747`;
the earlier unused build had been removed by image cleanup. Containerd on
Rainer reports its manifest ID instead of the classic image config ID.

Still outstanding: CI immutable-release deployment, full storage serving-
bucket failover/failback, full host/partition/reconnect tests, operational
alerts/retention and the legacy upload-volume retirement gate. Historical
backup-pending statements below are superseded by this section.

- Backend and frontend each run two healthy replicas, one on Hetzner and one on Arthur. The HA-only backend excludes pending billing migrations V66/V67; V68–V71 are applied. Billing remains unactivated. See `docs/ha-application-readiness.md` for focused test evidence.
- Both `.ch` and `.pt` production apex/API/www routes use the same Cloudflare Tunnel with two health-supervised connectors. Per-task HAProxy checks avoid sending requests to unhealthy app tasks. Sequential proxy-loss tests withdrew each connector in about 8–9 seconds, with the peer serving both domains, and all services were restored. This is not a full host/partition or authenticated WebSocket reconnect test.
- GHCR holds immutable backend, preserved frontend and tunnel-supervisor images. Dokploy stores their pinned images and registry credentials; automatic deployment remains disabled until release gates and pending environment changes are reconciled. Do not activate saved billing environment through an ordinary deploy accidentally.
- Database routing uses the private overlay aliases `patroni-hetzner` and `patroni-rainer`, avoiding failed Tailscale self-hairpin connections. Three managers are Ready; two database routers and three etcd voters are running.
- TeamSpeak 3 was preserved on the main Hetzner host through Dokploy compose `2xnMu2VYVFpIFhTx3O_nY`; the user confirmed voice at `ts.davidsbatista.com`. Its consistent private archive is retained root-only on Hetzner and Rainer at `/var/backups/teamspeak-migration/teamspeak3-20260910.tar.gz`. SHA-256: `3bf353a87ed7ec1f4a8a5ab050fb48e8cba51c117df4ae2b1d23be90890c9acd`. The unrelated, unused TeamSpeak 6 definition remains untouched; starting it could conflict on ports.
- Old worker server `120211056`, Swarm node `6msn2s2xlm6vuqk5eoere177v`, and separately billed primary IPv4 `99347551` were retired after migration and the voice check. Server and IP deletion were verified. They cannot be recovered in place; TeamSpeak recovery uses the retained archive. Legacy upload volume remains retained.
- Rainer VM 102 now has a separate 64 GiB `scsi1` disk (`local-lvm:vm-102-disk-1`, serial `pointfinder-s3-recovery`, filesystem UUID `a90df539-c996-4afe-b939-6b9f05cbff10`) mounted at `/srv/pointfinder-s3`. The existing OS/database disk was not changed. The escaped systemd mount unit is supplied here. Garage bind mounts refuse to create a missing data directory, avoiding silently filling the OS disk if the recovery disk is absent.
- Garage 2.3.0 is deployed through Dokploy compose `3RCOsaJA0xX3GeRhpdJo2`, app `compose-program-virtual-sensor-qkslhw`, pinned in `garage-recovery.yml`. Only S3 port 3900 on Rainer's Tailscale IP is published. Credentials/config stay in protected host files. Authenticated write/read and anonymous GET/list denial passed. It is a single-node *additional recovery copy*, not redundant primary storage. Garage lacks native object versioning; `s3-recovery-snapshot.py` archives source versions under immutable identities and publishes a manifest only after all copied bytes are download-verified. Three focused tests pass. Initial copy is in progress; no scheduled mirror or restore acceptance is claimed yet.

Remaining gates: encrypted scheduled PostgreSQL backups/WAL PITR and restore exercise; completed and scheduled Mac storage copy with recovery drill; CI test/publish/deploy gates; full host/partition/reconnect exercises; monitoring/runbooks and legacy-volume retention gate. Whole-Mac-location loss still loses two of three quorum voters. Historical sections below describe earlier stages and are not current status.

### Storage continuation, 22:33 UTC September 9

Credential decision superseding the later historical request below: the user
authorized using the existing **local general S3 key** for database backups.
No new backup key is required. The application key remains denied backup-bucket
access. `prepare-pgbackrest-secrets.py` stages the general key and a generated
encryption passphrase in protected files on both database hosts, preserving a
mode-0600 local recovery copy. Shared-key permissions are not modified.

The initial Garage archive completed: **314 versions / 2,108,158,576 verified bytes**. Manifest: `manifests/pointfinder-prod-uploads-202609/20260909T223026Z-6e4140a5-887d-4b78-84ed-7f8ee0caedd5.json`. `test-garage-restore.py` recovered one live object through this saved manifest into a synthetic S3 key, verified its original SHA-256 and removed only that synthetic key. All archived versions were already download-verified; this additional test is one-object restoration, not full application failover.

The same Dokploy compose now runs an hourly recovery job using local image `pointfinder-s3-recovery:20260910-r2`. First in-container cycle and the subsequent freshness-check rollout both succeeded with all 314 versions. The job is healthy; its health check requires a successful cycle within two hours. It uses the existing restricted application upload key, not the S3 administrator key. Recovery writes are append-only, no source/destination deletion is propagated. It refuses new work below its free-space threshold. The current implementation does not prune history; monitor capacity and manage retention deliberately. No alert delivery is configured by this health check.

Garage's single-node data occupies about 941 MiB after compression at this checkpoint. Its disk is not a substitute for off-site copies. The archive preserves key/version metadata in private manifests rather than providing a ready-to-serve bucket with original object keys. Production S3 failover therefore still requires a deliberate manifest restore into an empty serving bucket, public HTTPS/presigned-URL configuration, write fencing and application endpoint changes; it is **not automatic**. A full serving-bucket recovery drill and reverse-sync/failback runbook remain outstanding. Do not delete the legacy cloud upload volume yet.

A fresh logical database dump, `/var/backups/pointfinder-ha/pointfinder-20260909T222706Z.dump`, is retained on both database hosts with matching SHA-256 `dfb2fed52a2f4125e54dfd7c6e905f27d94184a1881207bf9901dc1e17e6952e`; archive-list validation passed. This exact dump has not been restore-tested. The prior restore-tested dump remains retained.

Claude Code Fable 5.1 (medium) implemented the bounded `pgbackrest/` foundation, reviewed and refined locally. The pgBackRest 2.59.1 image built on Hetzner; 24 unit tests passed locally and inside Linux. No production Patroni image/config/restart or archive-mode change was applied. A separate backup key was requested as `POINTFINDER_BACKUP_S3_ACCESS_KEY` / `POINTFINDER_BACKUP_S3_SECRET_KEY` in `/Users/xmedavid/.env`, to be restricted with bucket policies before deployment. Encrypted S3 integration, scheduler privilege-drop/real PostgreSQL checks, and time-targeted restore remain required. Recovery credentials/encryption material must never be printed or committed.

## Credential incident remediation — September 9

After the user rotated the exposed Resend key, switched saved backend `MAIL_PASSWORD` to `${{project.MAIL_PASSWORD}}` and resolved that project value into the existing runtime. Rotated the exposed PostgreSQL `scout` password and JWT signing secret. Updated both hosts' bind-mounted Patroni auth files in place, updated their generated local configurations, and authenticated a Patroni reload without restarting PostgreSQL. The backend service update changed only these three variables, preserving the exact running image and leaving pending billing configuration untouched.

Verified both PostgreSQL endpoints accept the replacement password and explicitly reject the old password. Hetzner remains primary and Rainer remains replica on timeline 4, with no pending restart. Both public API health endpoints returned HTTP 200/UP. JWT rotation invalidates previous sessions. Mail delivery itself has not been tested by sending a message, and revocation of the old Resend key is user-confirmed rather than independently checked.

`rotate-exposed-credentials.py` keeps recovery material root-only under `/var/backups/pointfinder-ha/production-adoption/credential-rotation-20260909.json`; do not print it. Older protected snapshots retain historical credentials and must remain protected. The retired standalone Dokploy database metadata was not changed and must never be used to start that database against live Patroni PGDATA. Verification uses a temporary host-network Python client container: connecting from the database container to its own published Tailscale port failed, so that hairpin connection is not used as an authentication check.

## Correction and both-domain tunnel verification — latest continuation

The previous claim that the runtime had switched to S3 was incorrect: `enable-s3-runtime.py` originally added the five S3 connection fields but omitted `STORAGE_TYPE`. A live inspection confirmed that flag was absent and the running `/uploads` directory still had zero files. Corrected the script to set `STORAGE_TYPE=s3`, guard the exact preserved image name and save a root-only pre-change service specification under `production-adoption/before-s3-<timestamp>.json`. Applied the corrected update and verified both the service specification and new running container report `s3`, with Docker update status completed. Public API health returned UP afterward. Historical statements below must be interpreted with this correction.

Before this correction, tested the S3 SDK jars extracted from the preserved application JAR using `S3ReleaseProbe.java` in a resource-limited temporary JDK container (Temurin digest `sha256:6ea5548706b60ac0a602eaf48af74792cbab012d90e811ca8db6184b16b5c3d6`). The application's path-style upload and virtual-host-style presigned GET with Content-Disposition both passed a byte comparison. Credentials were passed through stdin; signed URLs were not printed. Probe key `_verification/release-sdk-d8e9f708-52f9-481e-8edf-bd6693b00d96` was normally deleted, leaving versioned test data pending precise cleanup. This SDK test does not claim a complete authenticated user upload journey.

Extended ingress source and HAProxy host ACLs to both `.ch` and `.pt`. HAProxy config is now `pointfinder-ingress-haproxy-v2`. New `.pt` canary CNAME ID `a8a7dcb91d674dcefd11313f667becb4`; existing `.pt` BIC exception now includes its exact canary hostname. Both test hosts use the same tunnel and the same pair of host-specific proxies. Production apex/API DNS remains on the existing origin; neither domain's production traffic is using the tunnel yet. Website browser protection still applies to Python's default user agent, while the exact API/canary exceptions permit API clients.

A read-only Claude Fable 5.1 audit identified remaining multi-replica blockers: chunk data is local despite S3 final-file storage; STOMP/native event delivery and operator presence are process-local; scheduled jobs lack distributed coordination; login/join/broadcast lockouts and realtime metrics are local; thumbnail generation assumes local media. These require application work before scaling. For event delivery use a durable outbox/replay design; NOTIFY alone is not durable. See the planned invariants in `docs/high-availability-plan.md`.

Security incident: an earlier tool response displayed the backend's existing database password, JWT signing secret and mail-provider key. Their values are deliberately not recorded here. The user was notified and asked to revoke/replace the mail key in Dokploy. Database/JWT rotation must be coordinated across live backend, Patroni credentials and saved Dokploy configuration; JWT rotation invalidates existing sessions. No exposed values have been repeated in subsequent output.

## S3 provisioning and initial copy — September 9

Credential isolation follow-up: located the new `POINTFINDER_S3_ACCESS_KEY` / `POINTFINDER_S3_SECRET_KEY` pair in Dokploy's **project-level** variables, not backend runtime. Verified it differs from the administrative key. `s3_app_permissions.py` applied explicit deny policies only to this application's key: all actions on the backups bucket, and bucket-policy/ACL/versioning/lifecycle/CORS/deletion/retention administration plus permanent object-version deletion on uploads. Application upload/read/normal delete tests passed; backup listing and uploads-policy reading returned 403; administrative policy access and backup listing remain available. Synthetic test object versions and their delete marker were removed by the administrator key. No application restart or S3 endpoint cutover occurred.

These are bucket policies, not an IAM-scoped key: new buckets in the same Hetzner project inherit broad default key access unless separately protected. This script refuses to proceed when additional buckets or unexpected policies exist. Generated policies include the access-key identifier in the principal ARN and must not be printed or committed. The original `s3_storage.py verify` deliberately rejects nonempty policies; use the dedicated permissions verifier for this post-policy state. Administrative credentials already in shared Dokploy project variables still require a later scoped secret-store cleanup; this policy does not remove access to those variables from Dokploy administrators.

The user approved the revised temporary migration overlap (EUR 26.31/month-equivalent, expected final EUR 17.97), including S3 at EUR 6.49 before VAT. Created **pointfinder-prod-uploads-202609** and **pointfinder-prod-backups-202609** in FSN1 (`https://fsn1.your-objectstorage.com`). Both have private ACLs, no bucket policy, and versioning Enabled. Write/read, previous-version recovery and anonymous GET/list denial tests passed; only synthetic test versions were deleted afterward. Sources: `s3_storage.py`. Bucket creation visibility was briefly delayed, so the helper now waits for bucket existence before setting versioning; the partially created first bucket was reconciled explicitly, not recreated.

No default at-rest encryption is provided by this service. The backups bucket remains empty until client-side encryption/recovery-key management is configured. Separate buckets are not credential isolation: the current project-wide credentials can access both, and application-specific permission scoping remains a cutover gate. No automatic retention deletion or irreversible object-lock policy was configured.

Pre-copy finding: the preserved running backend image `sha256:18beb9572e7130c9c06b37a9ea301264d6492749568bb2c6e5a9a6ed6fa2af0a` has only its secrets bind mount, no upload mount, and `/uploads` contains zero files. The retained legacy volume at `/mnt/HC_Volume_104744479/uploads` contains 348 files, 2,387,823,170 bytes, including 34 internal-session files. No source symlinks were found. This discrepancy requires reconciliation before any backend restart/cutover; an empty runtime directory does not mean there is no historical media.

`copy-legacy-uploads.py` copies non-internal files under that exact source to the uploads bucket, preserves relative keys, verifies every downloaded object's SHA-256, refuses mismatched existing objects, checks source size/mtime stability and never deletes source data. Credentials arrive over SSH stdin and are not persisted. The one-off Python runtime `/opt/pointfinder-s3-migration` is on Hetzner; installing python3.12-venv restarted fail2ban, not containers. This is migration tooling, not a scheduled application service. The preserved application JAR was saved root-only at `/var/backups/pointfinder-ha/production-adoption/preserved-app.jar`; it contains the S3 configuration/service classes. No new application release, billing change or storage endpoint switch has occurred.

Initial copy completed successfully: **314 files / 2,108,158,576 bytes** copied and downloaded for full SHA-256 comparison. All 314 matched; source data was not deleted. The 34 internal-session files were deliberately excluded and retained locally. This is a verified copy, not an application cutover or completed S3-only migration.

The preserved backend is now configured in its running Swarm service with `STORAGE_TYPE=s3`, FSN1 endpoint/region and the uploads bucket, using the separate Dokploy project variable pair. The image and all existing environment values were preserved; this was a Docker API service update, not a repository build or normal Dokploy rebuild. The new task started successfully, Flyway validated all 65 migrations, database connectivity remained healthy and `/actuator/health` returned UP. No S3 application upload was generated during this change, because creating synthetic business records would alter production data; the S3 key’s upload/read/delete behavior was already verified against a synthetic object and the 314-file copy.

The old local upload volume remains mounted nowhere by the backend service but is retained at `/mnt/HC_Volume_104744479/uploads` for rollback/reconciliation. Do not delete it until an application-level read test, signed-URL validation, chunk-session decision and rollback window are completed. The service currently reports one healthy replica; this is an S3 cutover on the existing single backend, not yet multi-backend HA.

## Cloudflare ingress proxies — September 9 continuation

Added two pinned HAProxy services to the existing Cloudflare ingress Dokploy stack, using separate per-host tunnel overlays. Each connector resolves `origin` to its own host's proxy, not a shared cross-host proxy VIP. Only the proxies join `dokploy-network`. Config `pointfinder-ingress-haproxy-v1` comes from `ingress-haproxy.cfg`; no published ports or application deployment changes. Proxy health checks use the existing frontend and backend Swarm services, which still each have **one Hetzner application task**. This is not local application preference or application host-failure tolerance yet.

The canary now routes through the proxy instead of cloudflared's static responder. `/api-health` forwards only to the existing public actuator health endpoint; `/frontend-check` forwards to the public frontend root; `/` returns a static marker. Other paths return 404 and non-GET/HEAD methods return 405. Proxied canary responses carry the ingress-node header and `Cache-Control: no-store`. Production `.ch` host routing is prepared in HAProxy but not present in Cloudflare tunnel ingress or DNS; production traffic is unchanged. HAProxy supports WebSocket tunnel timeouts, but authenticated realtime journeys have not been tested.

Resolved Python 403 responses: Cloudflare returned error 1010 only for the Python user agent, with Browser Integrity Check enabled. Created configuration ruleset `5ba306b631a1499dbea3e14beb295357`, rule `6904daf2e5364bc681b264ac3302ce04`, disabling **only BIC** for exact hosts `api.pointfinder.ch` and `tunnel-check.pointfinder.ch`. Source `cloudflare-api-client-rule.json`. No other configuration rules existed. WAF, application authentication and the website's BIC remain unchanged. Python checks subsequently returned 200 on both hosts. To roll back this exception, disable/remove this exact rule, not the zone's unrelated security settings.

Verification: HAProxy validation passed on the application network. Stopped only the Hetzner connector and obtained API health UP and frontend HTTP 200 through the Arthur proxy, verified by the response header. Restored it, stopped only Arthur's connector, and repeated successfully through Hetzner's proxy. Both connectors were restored to one replica. These are connector-loss tests with a healthy single application origin, not application or proxy-loss tests.

Production cutover remains gated on connector withdrawal when its proxy or usable origins fail, application redundancy, and request/authentication/WebSocket acceptance tests. S3 remains unprovisioned pending approval of the revised temporary migration cost; no paid storage change was made.

The `.pt` zone subsequently became active, and its API showed the same error 1010. Created equivalent BIC-only exception for exact host `api.pointfinder.pt` in zone `a2b84677589c7f3dff25f546ce80632b`, ruleset `717ca90a09534342a2d972a3f892bd1a`, rule `0b9e35374e14431db2a558daffeb8743`. The `.ch` JSON source was reused with its expression replaced by `http.host eq "api.pointfinder.pt"`. No `.pt` tunnel route or DNS record was changed.

## Cloudflare tunnel foundation — September 9, 19:19 UTC

Deployed Dokploy production **Cloudflare ingress**, compose ID `Nw9KpAQorIMUQEHt9CWGb`, stack `pointfinder-cloudflare-ekucrt`. Services `hetzner` and `arthur` are individually pinned to their corresponding managers, one replica each. Source: `cloudflare-tunnel.yml`; cloudflared 2026.8.3 is digest-pinned, non-root/read-only, limited to 128 MiB and 0.5 CPU per connector. No ports are published. The dedicated overlay uses MTU 1200 and is not connected to the application or database networks.

Cloudflare account `6b282f8befa2b4d39ad911e7e674885f`, tunnel `87cdb8c2-e8d3-4dae-9052-32d4def29e23` (`pointfinder-ingress`), remotely managed. Authentication uses the existing **Bearer API token**, not Global API Key/email authentication. `cloudflare_api.py` only returns responses to callers; tunnel-token responses must never be printed. The connector-only credential was streamed directly into Swarm secret `pointfinder-cloudflare-tunnel-v1`, mounted read-only for UID 65532; it is absent from source, command arguments and application environment.

Only the isolated `tunnel-check.pointfinder.ch` route is configured, returning static HTTP 200; unmatched routes return 404. Configuration source: `cloudflare-tunnel-ingress.json`. Its newly created proxied CNAME record is `6168bc4df2a2a85c2e4c95ff44d4bb18`, zone `405c58517409faaacf14cef9c15da6ae`. Existing apex, wildcard, www and API production routing were not changed. No business data is exposed by this canary.

Both connectors registered four Cloudflare connections each. Sequentially scaled only the Hetzner connector, then only the Arthur connector, to zero and restored each to one. In each single-connector state, Cloudflare reported healthy with one active client, and three unique-query curl HTTPS probes returned 200. An initial Python urllib probe returned 403 and was aborted with the connector restored; its cause was not established, so these checks do not demonstrate every client/WAF path. The curl baseline response was DYNAMIC, not a cached object.

This verifies connector redundancy for a static canary, **not application or host-outage resilience**. Health-aware origin proxies, withdrawal when no origin is usable, application replicas, full request/WebSocket tests and production DNS cutover remain outstanding. Keep live DNS unchanged until those gates pass. To undo this foundation, stop this Dokploy stack and remove only its canary record; the production records do not need rollback. Retain the tunnel and secret until intentionally retiring the integration.

## Current production state — September 9, 18:26 UTC

Production database HA is live. Hetzner is primary; Rainer is a streaming physical standby on timeline 4 with zero reported lag at verification. The application release is unchanged; only its JDBC hostname changed. S3, application replicas, redundant ingress and scheduled PITR backups are **not** complete. Sections below are a chronological record and include superseded standalone/rehearsal states.

| Dokploy resource | ID | Runtime |
| --- | --- | --- |
| PostgreSQL HA - Hetzner | `ACeC7DfXK2PRHryUCOaCr` | Compose `pointfinder-pg-hetzner-vv3yw0` |
| PostgreSQL HA - Rainer | `c7lBmLSFdmFxVhKdweTNN` | Compose `pointfinder-pg-rainer-0u6pju`, server `ZVwJvhxUQkLeUVeo8HhtN` |
| Database routing | `92aFlfLcp7_9oonm1WHjE` | Swarm `pointfinder-db-routing-ucqtbw_router`, two replicas, one per Hetzner/Arthur |
| Retired standalone database — do not start | `sZ2pG7X4w_1tJVHqLwKqO` | `pointfinder-database-bt29ko`, 0 replicas, Dokploy idle |

Sources: `patroni-production-hetzner.yml`, `patroni-production-rainer.yml`, `database-router.yml`, `database-haproxy.cfg`. Production image `pointfinder-patroni:16.15-4.1.5-production-r1`, ID `sha256:133e6a68e2e56ec48b35ce0ce8692ed71098c87530959fbf54e8176a65a7e5e1`, was built on Hetzner and transferred identically to Rainer. HAProxy base is digest-pinned. The production-only launcher rejects empty Hetzner PGDATA, wrong PostgreSQL major version and wrong existing system identifier. Rainer initializes only by cloning the established production cluster; no initdb bootstrap is permitted.

Stable endpoints bind only to each host's Tailscale IP: PostgreSQL `15432`, Patroni `18008`. Both routers use `/primary` health checks and close sessions to a server marked down. Backend runtime and saved Dokploy `SPRING_DATASOURCE_URL` now use `pointfinder-db-router:5432`; other environment values and preserved image `sha256:18beb9572e7130c9c06b37a9ea301264d6492749568bb2c6e5a9a6ed6fa2af0a` remain unchanged. Pending billing references remain saved but were not activated by an application deployment.

### Cutover and verification

- Prepared root-only credentials at `/etc/dokploy/pointfinder/ha-secrets/` on both database hosts. Preserved the existing `scout` superuser/password and created dedicated `pf_replicator`. Saved original service specifications, PostgreSQL configuration and global roles under `/var/backups/pointfinder-ha/production-adoption` on Hetzner. Do not print these files.
- Fresh pre-cutover dump `pointfinder-20260909T181951Z.dump` on Hetzner and Rainer has SHA-256 `0d50db5b20e96942a5c76322b77a181fb868d66b59c235f90626df112a48dd74`.
- Stopped both rehearsal databases, set Arthur's saved replica count to zero and Rainer's restart policy to no. Retained their data. Do not redeploy them while production owns the watchdog devices.
- Installed persistent softdog module/udev configuration on Hetzner, mapping UID-999-accessible `/dev/watchdog0` into the production container. Rainer retains its tested i6300ESB watchdog. Required watchdog timeout is 30 seconds with a 60-second Patroni TTL.
- Stopped the old PostgreSQL through Dokploy, verified zero replicas/no running task and removed postmaster PID through clean shutdown, then deployed Patroni against the **same** Hetzner PGDATA. Production system identifier remains `7605372262247206949`; `wal_log_hints=on`, 100 connections and 128 MiB shared buffers. Data checksums remain off.
- The primary became writable at approximately `18:21:51Z`; backend was healthy after its JDBC-only rollout. Rainer completed physical base backup and was streaming by `18:22:25Z`. Initial missing-slot messages cleared when Patroni created `production_rainer`.
- Production switchover to Rainer succeeded at `18:23:26Z`. A temporary validation write committed through the router while the Mac was primary; it reached Hetzner. Public API health was UP at checks. Switched back to Hetzner at `18:24:11Z`; both reached timeline 4. All 40 public table counts matched and 65 migration records were retained. Temporary `pointfinder_ha_validation.probe` and its schema were explicitly dropped afterward; no business tables were removed.
- Post-cutover dump `pointfinder-20260909T182508Z.dump` on both hosts has SHA-256 `1ce116e1683c0d8c5676a9b7ff1b3cc271b5ca9249dd957f2e7ed6ac29044f4a`. Restored successfully into isolated, network-disabled `pointfinder-postcutover-restore` using tmpfs; 40 public tables and 65 migration records verified. That diagnostic container is stopped. The updated manual backup helper supports the production Compose databases as well as the legacy rollback service.

Automatic failover is enabled through Patroni, but actual production tests here were **controlled switchovers**, not another destructive host/partition exercise. The earlier authenticated rehearsal measured partition/fencing/promotion at 94 seconds. Do not claim an end-to-end Hetzner outage is tolerated yet: the application still has one backend and ingress remains unchanged. Async replication can lose recent acknowledged writes. Physical streaming is not a substitute for scheduled backups/WAL archiving; these are still outstanding.

### Rollback safety

Do not simply start the retired database: it shares PGDATA with the active Patroni primary. First establish which production node is writable, preserve any newer writes, and synchronize/switch to Hetzner if possible. Pause the production cluster, disable both production Compose restart policies/deployments, stop both Patroni containers and verify their watchdogs are disarmed and no PostgreSQL process owns the volume. Only then evaluate restoring the saved PostgreSQL configuration and starting the retained standalone service. Never start a stale Hetzner copy if Rainer contains newer committed data.

`switch-database-endpoint.py rollback` changes only the preserved backend's JDBC hostname back to the old service; saved Dokploy environment must also be reconciled. It intentionally refuses a different application release. Preserve the current data and all recovery files; restarting the old service is an explicit recovery operation, not normal deployment. Prefer repairing the HA configuration to reverting it once new writes have occurred.

`docker.sources` is the Debian 12 amd64 Docker apt repository definition used for the new guest. Install Docker's official signing key at `/etc/apt/keyrings/docker.asc` before using it. This file does not configure or enroll a Swarm.

## Execution record: September 9, 2026

- Created Proxmox VM 102 `pointfinder-ha` on `rainer` using the official Debian 12 generic cloud image.
- Allocated 2 vCPU, 2 GiB fixed RAM, 24 GiB thin-provisioned system disk on `local-lvm`; bridge `vmbr0`, DHCP, boot on host startup.
- Initial LAN lease: `192.168.0.236`. MAC: `BC:24:11:C2:A7:D5`. DHCP may change; verify through the Proxmox guest agent before connecting.
- SSH user `debian`, sudo access, existing `vectr` public key. No password or private key was copied into the VM.
- Installed Docker CE 29.8.0, Compose plugin, Tailscale 1.102.3 and QEMU guest agent. Existing nodes remain on their previous Docker versions; compatibility and coordinated upgrades still need validation.
- Enabled UFW: SSH from the LAN and Tailscale; Swarm TCP 2377, TCP/UDP 7946 and UDP 4789 on Tailscale only. Incoming traffic denied by default. Docker-published ports require separate audit before deploying workloads.
- Tailscale enrollment and Swarm join completed after the account owner's browser approval. No transient enrollment URL or credential is stored in git.
- The new manager initially joined with `--availability pause`; it is now Active for the pinned etcd voter and isolated database rehearsal. Both advertise and data-path addresses use Tailscale. Existing production placement constraints remain intact.
- No production PostgreSQL standby, S3 instance or additional production application replica has been deployed yet. The etcd quorum is deployed; database rehearsal status is recorded below.

## Baseline observations

### Backup and restore gate completed

Created a custom-format logical backup at `/var/backups/pointfinder-ha/pointfinder-20260909T150942Z.dump` on Hetzner, with mode restricted by umask 077. Copied the same archive to the same path on VM 102. Both copies have SHA-256 `5cbc0b88761f40ac4dee63a304bfbf89a6e130a81bc54c8081e6b2cd8db3a040`.

Restored it successfully with `pg_restore --exit-on-error` into PostgreSQL 16 on VM 102. The test container had `--network none`, no published ports, 384 MiB RAM and one CPU. All 40 public tables' exact row counts matched the live primary at verification, including 65 migration records. The test container `pointfinder-restore-check` is now stopped; its restored data is retained for audit. This is a successful logical restore, not a PITR or physical-standby test. The dump omits ownership and ACLs; it is an application-data backup, not a complete cluster-role/configuration backup.

`backup-pointfinder.sh` reproduces the protected dump on the primary host; `verify-database.sql` produces table-level counts without returning business records. No scheduled backup job has been enabled yet.

Primary replication settings: `wal_level=replica`, ten WAL senders, ten replication slots, no existing replication slots, archive mode off. Changed `max_slot_wal_keep_size` from unlimited to 2 GiB through ALTER SYSTEM and a configuration reload, without restarting PostgreSQL. A sufficiently lagging standby will need reseeding after retained WAL is removed; this limit is not an absolute bound on all WAL disk usage. Verify disk alerts before enabling replication.

At initial baseline, both existing Swarm managers were Ready and all seven services were 1/1. PointFinder's internal `/actuator/health` returned `UP`; PostgreSQL accepted connections and contained 40 public-schema tables. These checks do not verify business records against a historical baseline or complete an application journey. Business-journey validation remains a production-cutover gate; the logical backup/restore gate above has since passed.

Proxmox was quorate with three votes and quorum two. `rainer` reported about 8 GiB available RAM before this guest was added. Existing guests' configured maximum memory is already overcommitted; do not expand the new guest or assign database/S3 workloads without another capacity check.

No existing VM, server, volume, application or database was removed during this stage. The source cloud image and public-key provisioning file remain in `rainer`'s local template directory for audit/reuse. No paid cloud resource was created.

## Database quorum deployed through Dokploy

Dokploy `Pointfinder / production / Database quorum`, compose ID `cc8bE2tgk_g2q2gnMXH8_`, owns Swarm stack `pointfinder-quorum-ltydfj`. Source: `etcd-stack.yml`. Three etcd 3.7.1 services are pinned individually to Hetzner, Arthur and VM 102, with separate persistent volumes, 256 MiB memory limits and 0.5 CPU limits. VM 102 is now Active to run its voter.

The private overlay `pointfinder-quorum-ltydfj_database-tailscale` has MTU 1200, no published etcd ports and all three peers use their Tailscale addresses. Transport encryption comes from Tailscale. Docker's additional ESP encryption failed across this network and was removed; temporary ESP firewall exceptions were also removed. The earlier unused `database-quorum` overlay has not been manually deleted.

The container startup check deliberately does not require quorum, because filtering unhealthy tasks from Swarm DNS prevented static peer bootstrap. Container 1/1 status is therefore insufficient: use `etcdctl endpoint health` against all three endpoints to check actual quorum. No non-HA application should be attached to this network; review client authentication/access isolation when Patroni is connected.

All three endpoints passed committed-proposal health checks. A fault exercise scaled the Rainer voter to zero and explicitly verified its container had stopped, then successfully wrote, read and deleted a temporary validation key through the remaining quorum. Restored its desired replica count to one afterward. Production PostgreSQL is not yet using this quorum and was not restarted.

`dokploy_api.py` accesses the API through an SSH forward to localhost port 33007, loading the existing credential in memory and printing only selected metadata. Set raw source with `compose.update`: `compose.create` initially retained a GitHub default. The current source is raw and stack mode; update the existing compose ID instead of creating duplicates.

## Next actions

### Authenticated quorum verified (18:07 UTC)

Subsequent partition exercise: disconnected only Rainer's rehearsal container from its overlay at `18:07:36Z`, with a 90-second host reconnect timer. At `18:07:51Z`, local PostgreSQL refused connections because it was shutting down. The watchdog reset VM 102; it returned by `18:08:19Z` with boot ID `12dc7dcc-1cfb-4011-9f61-fdef43f2e77a` and watchdog bootstatus 32. PostgreSQL remained stopped while detached. The transient reconnect timer did not survive the reboot, so the network was manually restored after checking promotion.

Arthur's logs confirm automatic promotion at `18:09:10.302Z`, 94 seconds after disconnection and before manual reconnection. etcd changed leader at `18:08:05Z`; lease extension after an etcd leadership change is consistent with the observed delay. An initial interpretation that the lease was stuck was incorrect: the later renewed lease belonged to the newly promoted Arthur. Both nodes recovered on timeline 12 at zero reported lag. This measured case meets the 120-second rehearsal target, not a 60-second guarantee.

Failback exposed a separate issue: Patroni's `DnsCachingResolver` caches addresses for 600 seconds and patches urllib3 connections, so its long-running process retained Rainer's pre-reconnect container address while a fresh HTTP client could reach the new one. Two switchovers were safely rejected with 412/no-good-candidates due to the stale REST endpoint. Rainer's r5 source adds `POINTFINDER_API_ADDRESS` and publishes its authenticated control API only at Tailscale `100.75.57.44:18009`. Verify after deployment; production should use stable per-host Tailscale control endpoints rather than ephemeral overlay task addresses.

The r5 deployment subsequently passed: inspected Docker's actual port binding as `100.75.57.44:18009`, and controlled switchover to Rainer succeeded at `18:14:10Z`. Both databases returned to timeline 13 with Arthur streaming at zero reported lag and Rainer's watchdog active. Quorum authorization/health checks passed again, and the public production API remained UP. No production database cutover has occurred.

Production adoption baseline inspected: PostgreSQL system identifier `7605372262247206949`; existing superuser/replication-capable role `scout` (not `postgres`); 100 connections; 128 MiB shared buffers; checksums and wal_log_hints off. Preserve current SCRAM remote authentication and the authoritative bind `/mnt/HC_Volume_105155434/pgdata`. Enable wal_log_hints at the planned restart before relying on rewind; do not use the rehearsal launcher directly against production or assume a `postgres` database role exists.

Enabled etcd authentication with a root recovery account and separate `rehearsal` and `production` accounts restricted to `/pointfinder-ha/pointfinder-rehearsal/` and `/pointfinder-ha/pointfinder-production/`. `etcd-access.py` provisions credentials in root-only files on Hetzner and supports explicit prepare/enable/verify/disable modes. Root recovery credentials were copied securely to Rainer at `/var/backups/pointfinder-ha/etcd-auth-recovery.json`; do not display either file. Authentication complements the existing private overlays/Tailscale encryption; it does not add etcd peer mTLS.

Both rehearsal nodes now use image `pointfinder-patroni:16.15-4.1.5-r4` (Rainer manifest `sha256:440e0462ffc5c8dd42eb909ae995fb6cd61f21bf5c2817ed20364aa786d1ecdb`). The image only adds optional `/run/secrets/etcd_auth` configuration over r3. Rainer has a root-only bind mount; Arthur uses Swarm secret `pointfinder-etcd-rehearsal-v1`. Dokploy sources were reconciled. During the paused rollout, PostgreSQL required explicit starts because maintenance mode intentionally suppresses automatic starts; both nodes resumed normally afterward.

Verified all three endpoints with authenticated committed health checks, both scoped clients' own-namespace read/write/delete, denied cross-namespace reads and denied anonymous reads. Controlled switchover then succeeded to Rainer with its watchdog active; Arthur streams on timeline 11 at zero reported lag. Maintenance mode is off. Existing anonymous `etcdctl endpoint health` commands now need credentials; use the verification helper without printing its credential files. Production PostgreSQL remains standalone pending adoption/routing/fencing integration.

### Engine alignment and preserved release (17:16 UTC)

Upgraded Hetzner, Arthur and Rainer serially to Docker CE/CLI 29.8.0 and containerd 2.3.5. All three managers are Ready; Hetzner is leader after Arthur's controlled engine stop. All three etcd endpoints passed committed-proposal health checks after recovery. Arthur currently leads the isolated PostgreSQL rehearsal on timeline 10; Rainer streams with zero reported receive/replay lag and its watchdog is correctly inactive as a replica. Older version/state statements below are historical.

Before the Hetzner stop, preserved the exact running backend/frontend images with local `ha-preserved-20260909t170552z` tags and retained their current runtime environment. Persisted frontend placement on Hetzner as well. Backend image ID remains `sha256:18beb9572e7130c9c06b37a9ea301264d6492749568bb2c6e5a9a6ed6fa2af0a`; health returned `UP`. No application build or Dokploy application deployment was triggered, and pending billing changes remain excluded by explicit user instruction.

Root-only engine/configuration rollback files and old package versions are under `/var/backups/pointfinder-ha/engine-20260909T170552Z` (Hetzner), `engine-29.8.0` (Arthur), and `engine-29.8.0-20260909T171438Z` (Rainer). Hetzner also has a fresh logical dump `pointfinder-20260909T170552Z.dump`, SHA-256 `222e220b2a9aa30638fcf51fb53d9f55dda6a1f00f3041ecb6b892d803a2f38a`; archive listing passed, but this latest dump has not yet been copied off-host or restored. The earlier restore-tested backup remains retained.

Rainer's first upgrade preparation aborted before stopping Docker because Tailscale's direct DNS mode had no upstream resolvers. Systemd-resolved could resolve through DHCP DNS. Backed up `/etc/resolv.conf` to `/var/backups/pointfinder-ha/resolv.conf-before-resolved`, linked it to `/run/systemd/resolve/stub-resolv.conf`, and restarted tailscaled. Both public DNS and Arthur's MagicDNS name then resolved; Tailscale now integrates with resolved's per-link DNS. The failed preparation directory is retained, not overwritten. See [Tailscale Linux DNS guidance](https://tailscale.com/docs/reference/linux-dns).

The latest dump was subsequently copied off-host to Rainer at the same path; its SHA-256 matched. This does not replace a restore test of that particular dump.

The user confirmed `HETZNER_API_KEY` and `CLOUDFLARE_API_KEY` in the existing external `.env`, with full permissions. Keep usage narrowly scoped and values in memory. Cloudflare bearer-token verification returned HTTP 401/error 1000; no Cloudflare email was configured under the checked names. Requested `CLOUDFLARE_EMAIL` if this is a Global API Key, plus separate `HETZNER_S3_ACCESS_KEY` and `HETZNER_S3_SECRET_KEY`. Hetzner's Cloud API token is not an S3 credential pair.

Hetzner non-rebooting watchdog access test passed through Dokploy Compose `J9zXdIlQYd7jtVOEGCVxA`, app `pointfinder-hetzner-watchdog-lggufk`, using the identical r3 image transferred from Rainer. Verified kernel initialization with `soft_noboot=1`, timeout 10 seconds, nowayout off, and inactive device before running a 12-second probe as UID 999. The probe exited zero and disarmed the device; its stored authorization is disabled and the module was unloaded afterward. This is access/expiry testing only, not a verified Hetzner reset or production fencing guarantee. Production adoption remains gated on real fencing and partition tests.

### Hetzner watchdog reset test (17:32 UTC)

After explicit user approval for the production-host outage, verified exact Hetzner server `114836804` (`dokploy-master`), both remaining managers and all etcd members healthy, Docker/Tailscale enabled at boot, and the original database volume mounted. Loaded softdog with reboot enabled, timeout 15 seconds and nowayout off. Dokploy staging Compose `rtGUz2UQp9zLvNqImqjaR` (`pointfinder-hetzner-reset-1gnqtf`) ran the one-shot UID-999 reset probe with `restart: no`; source is `hetzner-watchdog-reset.yml`.

Probe started at `17:32:20.504Z`; SSH confirmed it armed with a 15-second timeout at `17:32:32Z`. Subsequent SSH to the verified administrative hostname timed out, then returned at `17:33:00Z` with boot ID changed from `1c6a53bb-d44e-4ea2-88a7-3502670119ae` to `44f30072-8592-4cf5-8038-0d55d368fa5a`. A separate IP-based sampling loop did not produce successful SSH samples and must not be used to infer the outage duration. No API power operation or ordinary reboot command was issued.

During the outage Arthur became Swarm leader; both Mac etcd endpoints continued committing health proposals. After boot, all three managers returned Ready, all three etcd endpoints passed health checks, all seven production services returned 1/1, Dokploy HTTP returned 200/healthy, and backend health returned UP with its exact preserved image unchanged. The standalone Stock Draft containers and Traefik restarted; Stock Draft database health passed, but its business workflow was not tested. The original database mount recovered (Linux block-device name changed, mount path retained). Rehearsal replication remained timeline 10 with zero reported lag.

The reset container stayed exited with restart policy `no`; its stored authorization flag was disabled and read back. Softdog is not loaded after reboot. This validates the Hetzner softdog reset and service recovery path, not integrated production Patroni fencing, kernel/hypervisor-stall coverage, partition races or complete HA. Billing remains untouched.

Public HTTPS checks after recovery also passed: both `pointfinder.pt` and `pointfinder.ch` returned HTTP 200, and both API `/actuator/health` endpoints returned UP with certificate validation enabled.

### Cross-session deployment audit

After the user asked to check Claude's concurrent work, inspected its recent project-session operation history, Git changes and live infrastructure. Claude added five backend environment references to existing project variables (Stripe credentials/prices and the quota flag), pushed application changes and triggered deployments. It subsequently stated that it had paused Dokploy work. Its attempted placement update used lowercase `constraints` and was rejected; it did not successfully alter placement.

The replacement backend tasks were rejected on Arthur and VM 102 because `/etc/dokploy/pointfinder/secrets` exists only on Hetzner. The original Hetzner backend remained running and healthy. This exposed a pre-existing rollout gap: host constraints had been applied directly to the Swarm service but were absent from Dokploy's saved application configuration. Saved and read back `placementSwarm: {"Constraints": ["node.hostname == davidsbatista", "node.role == manager"]}` on application `NTaYSoOkFkXakwG13jeAY`. This metadata-only correction did not redeploy or restart the backend.

All five referenced project variables exist, and the quota variable parses as a boolean; values were not printed. This is reference validation, not a Stripe checkout or billing-enforcement acceptance test. The pending billing configuration and webhook fix were not deployed by this audit. Dokploy's deployment status `done` did not prove that a replacement Swarm task became healthy: inspect task rejection/rollback state and the actual running revision before declaring a release successful.

Live audit: all seven production services 1/1, backend health `UP`, all three managers Ready with Tailscale manager addresses, all three etcd endpoints healthy, Rainer rehearsal leader and Arthur streaming on timeline 9 with zero reported lag, Rainer watchdog active at 30 seconds. No evidence of Claude changing the HA Compose stacks, etcd, watchdog, Swarm membership or database storage was found in the inspected operation history. This is not a full business-journey regression test.

### Patroni rehearsal passed; production migration remains gated

Dokploy `Pointfinder / staging / Database HA rehearsal`, compose ID `4b3-q7GX7A5k6pNjKB9Fz`, owns stack `pointfinder-patroni-rehearsal-taowjs`. Source: `patroni-rehearsal-stack.yml`. These are isolated restored production records, not a live standby and not connected to application traffic. No database or Patroni API port is published. The containers share only the private quorum overlay and a separate DCS scope `/pointfinder-ha/pointfinder-rehearsal`.

- Built PostgreSQL 16.15 / Patroni 4.1.5 image `pointfinder-patroni:16.15-4.1.5-r2` on VM 102 and transferred the identical image to Arthur over SSH. Both report image ID `sha256:9a89633944af5bf26d3ba241a8f54b8a2a002a4acee31cc579593be6af8207f8`. The PostgreSQL base is digest-pinned; `patroni/requirements-resolved.txt` records the resolved Python dependencies. A registry-backed, reproducible production build is still needed.
- `prepare-patroni-rehearsal.py` cloned the stopped restore volume into `pointfinder-patroni-rehearsal-primary`, leaving the original restore intact. It provisioned separate rehearsal credentials through Swarm secret `pointfinder-patroni-rehearsal-auth-v1`; a root-only recovery copy remains at `/var/backups/pointfinder-ha/rehearsal-auth.json` on VM 102. Neither contains production credentials. The preparation container is stopped.
- Patroni adopted the cloned database without initializing an empty cluster. The launcher is deliberately rehearsal-only and rejects empty-primary adoption. Do not repurpose it directly for production: production authentication, pg_hba rules, connection limits, service discovery and fencing require a distinct configuration.
- Initial replica startup exposed incorrect permissions on a fresh Docker volume. Image r2 explicitly sets PGDATA mode 0700; the subsequent physical standby started successfully.
- All 40 public table counts matched between primary and physical standby. A test-only `ha_rehearsal.probe` table verified new writes flowing from Rainer to Arthur.
- Controlled switchover to Arthur succeeded. Rainer rejoined as a streaming replica, received another probe write and reported zero replay lag.
- At `2026-09-09T15:42:25Z`, froze only Arthur's rehearsal database container with `docker pause`, with a 150-second host timer to unpause it as a recovery safeguard. Rainer was observed promoted and writable at `15:43:21Z` (within 56 seconds). It retained both earlier probe rows and accepted a third.
- Manually unfroze Arthur and cancelled the recovery timer. Arthur demoted, rejoined as a streaming replica on timeline 5 and received all three probe rows, with zero reported lag. This exercise did not require a divergent-data pg_rewind and does not validate that recovery path.
- Final intended rehearsal state: Rainer leader, Arthur streaming replica, one container each, 512 MiB/1 CPU limits. VM 102 had approximately 1.35 GiB available RAM during rehearsal. All seven production services stayed 1/1; production backend health returned `UP`.

**Safety gate:** This proves adoption, physical replication, controlled switchover and promotion after a frozen-container failure, not complete split-brain protection. Watchdog mode is explicitly off in the rehearsal. Hetzner currently exposes no `/dev/watchdog`; VM 102 has no Proxmox watchdog configured. Hetzner's installed Swarm service CLI offers no device mapping option, so a normal Swarm service cannot simply use Compose's `devices` setting for Patroni's watchdog. Do not enable production automatic promotion until fencing and process/network-partition tests pass.

The user approved the adjustment: keep PostgreSQL under Dokploy but use host-specific Docker Compose deployments with narrowly mapped watchdog devices; retain Swarm for the application and quorum services. No production host was rebooted during the initial replication rehearsal. Subsequent VM-102-only watchdog work is recorded below.

### Compose and hardware-watchdog integration

- Registered the existing VM 102 as Dokploy server `ZVwJvhxUQkLeUVeo8HhtN`, `PointFinder HA (Rainer)`, without running a server installer or altering Swarm membership. Reused Dokploy's existing SSH public key, restricting the new root authorized-key entry to the Hetzner Tailscale address and disabling SSH forwarding. `register-rainer.py` preserves other authorized keys and avoids duplicate server registrations.
- Dokploy's Compose deployment actually ran the non-rebooting watchdog probe as UID 999, without privileged mode and without networking. Compose ID `TwJ4OWGI4c22-TTlhOmeu`. Kernel logs confirmed `soft_noboot=1`, expiry and `Reboot ignored`; the device was disarmed and the software-watchdog module unloaded. The stored probe configuration is now deliberately disabled against accidental reuse.
- Added Proxmox watchdog `model=i6300esb,action=reset` to VM 102. Its original Debian cloud kernel lacked that driver. Installed Debian `linux-image-6.1.0-53-amd64` / `linux-image-amd64`, retaining the cloud kernel for rollback. `/etc/default/grub.d/99-pointfinder-kernel.cfg` selects the verified generic kernel; update this selection deliberately when applying kernel upgrades.
- The one-shot Dokploy reset probe (`JDhq81PoZBc8NqGbV6ZZg`) armed the hardware watchdog for 15 seconds. The guest rebooted, its boot ID changed, and `/sys/class/watchdog/watchdog0/bootstatus` returned 32 (watchdog card reset). The device returned inactive. The probe has no restart policy and its stored authorization flag is now disabled. Neither probe should be rerun casually.
- `70-pointfinder-watchdog.rules` grants only UID/GID 999 access to the identified i6300ESB device. Compose maps `/dev/watchdog0` to `/dev/watchdog` in the container. No whole-host privileged container is required.
- Created private attachable overlay `pointfinder-ha-clients` with MTU 1200 for Compose clients. Attached each etcd member one at a time, verifying all three endpoints healthy between changes, and reconciled the definition in Dokploy. Existing peer network remains non-attachable; there are still no published database/quorum ports. Network membership is restricted operationally to these infrastructure services; etcd client authentication remains a production gate.
- Rainer's rehearsal database now runs in Dokploy Compose `sNkoto-4nXObXl9GBBjFL`, app name `pointfinder-patroni-rainer-lx1zxn`, source `patroni-rainer-rehearsal-compose.yml`. Its former Swarm service is 0/0 and must remain stopped to prevent two containers mounting the same PGDATA. Arthur's rehearsal node remains in Swarm with both private networks attached.
- Image r3 on Rainer is `sha256:523a092cc5275b50708d7beb83b514baa78380867fbe0ea7040a288c78aa381f`. Patroni requires the watchdog, with `safety_margin=-1`: the observed active watchdog timeout is 30 seconds against the cluster's 60-second lease. A controlled switchover to this Compose node succeeded and the other node resumed streaming.
- VM restarts exposed a temporary Swarm leadership interruption which recovered without force-new-cluster or manual membership repair. Production backend health stayed `UP` at checks. Investigate manager reconvergence and the remaining Docker-version mismatch before production cutover; a healthy snapshot alone does not clear this gate.
- Integrated fencing test: stopping container PID 1 initially stopped only Patroni's supervisor; its child still owned the watchdog and kept the lease alive. Restored the supervisor, identified the actual watchdog file-descriptor owner, and stopped that process at `16:08:28Z`, verifying Linux process state `T`. PostgreSQL itself remained writable and committed probe row 6. The VM became unreachable at `16:08:54Z`, and returned with a new boot ID plus watchdog bootstatus 32; guest boot time was `16:08:56Z`. Thus the actual watchdog-owner stall triggered a reset in approximately 26 seconds, before the configured 60-second lease interval. Earlier supervisor-only attempts were negative controls, not successful fencing tests.
- The Compose database restarted automatically, recovered and reacquired leadership before Arthur promoted. Both nodes reached timeline 9, with Arthur streaming at zero reported lag and all six probe rows present. This validates this stall/reset/recovery scenario, not a standby-promotion scenario; the earlier frozen-container test separately demonstrated promotion. Hetzner fencing, network partitions, lease-race cases, divergent-timeline rewind and production routing remain unvalidated.

References: [Patroni existing-data adoption](https://patroni.readthedocs.io/en/latest/existing_data.html), [watchdog safety](https://patroni.readthedocs.io/en/latest/watchdog.html), [Swarm service options](https://docs.docker.com/reference/cli/docker/service/create/), [Dokploy deployment modes](https://docs.dokploy.com/docs/core/docker-compose).

### Tailscale enrollment and quorum completed

The user approved Tailscale enrollment. `pointfinder-ha` is `100.75.57.44`, Swarm node `jlr7o5jkbozspm5bu31vu761d`, joined as a manager in Pause availability. Three managers were verified Ready/Reachable, with Arthur elected leader. Both advertise and data-path addresses were explicitly set to the new Tailscale address.

Docker 29.8.0 could not initially join through the 27.5.1 Hetzner manager because of TLS ALPN enforcement. Joining through Arthur succeeded. The new VM was then downgraded to Docker CE/CLI 29.6.1 to match Arthur; Hetzner remains 27.5.1. A coordinated version upgrade remains required before broader rollout.

A controlled test stopped Docker on the new, workload-free manager, with a timed recovery configured beforehand. The remaining managers successfully committed a temporary node-label update and all seven production services remained 1/1. Docker was restored and the temporary label removed. This tests loss of the new manager only; leader loss, overlay traffic and location partitions remain untested.

The third manager is now Active and hosts its etcd voter and the isolated Patroni rehearsal. It does not yet host production PostgreSQL or S3.

1. Verify leader-loss and overlay behavior after resolving the remaining Docker version mismatch in a controlled maintenance window.
2. Register any needed Dokploy remote-management access without running an installer that initializes a separate Swarm.
3. Resolve the database fencing/deployment-mode gate above, validate the live application baseline, then adopt production PostgreSQL and seed its real standby. The logical restore and isolated Patroni rehearsal are complete; production HA is not.
4. Obtain scoped Cloudflare and S3 access before those stages.
