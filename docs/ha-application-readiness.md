# Application readiness for two active backends

September 10 final update: master `6f9be220` (combined HA and completed billing)
is now deployed through successful full CI run `34454464035`. Both backend and
frontend replicas are healthy on both application hosts; V66/V67 applied and
all V1–V71 migrations are successful. Normal Flyway startup was verified after
removing the temporary out-of-order override. CI automatic releases are enabled;
direct Dokploy hooks remain disabled to prevent bypassing test gates.
The opening HA-only/billing-paused status below is historical. See the current
[operating runbook](../deploy/ha/OPERATIONS.md) for deployed digests and evidence.

Date: 2026-09-09. Status: HA-only release deployed to Hetzner and Arthur,
one healthy backend per host. PostgreSQL now has V68–V71 in addition to V65;
V66/V67 remain absent. Update September 10: the HA-only release source is
preserved at `b66f97db`, and its HA changes are integrated into master at
`6f9be220`. Full CI run `34450640054` passed and published immutable images.
Production remains on the pinned HA-only image; pending billing is unactivated.
The maintenance window verified Hetzner hard failure, peer partition fencing,
each Mac guest failure and live authenticated STOMP reconnect on both domains.
Both clients converged to state version 64 after a rolling backend restart;
temporary game/users were cleaned up. Full native/offline UI journeys were not
rehearsed. See [the operating runbook](../deploy/ha/OPERATIONS.md).

Production rollout evidence (21:35–21:48 UTC):

- Fresh custom-format backup before migrations:
  `/var/backups/pointfinder-ha/pointfinder-20260909T213500Z.dump`,
  SHA-256 `375d2db5d5026fe6cae97ec8e70db0aef667d46eb234f3ea189ae903c6203ae8`.
- Image `pointfinder-backend-v4djml:ha-3aa57d3ba874` overlays the verified JAR
  on the preserved production runtime; rollback image remains available.
  Hetzner's classic image store reports config ID
  `sha256:4672e58da36f9ea03f3ba4c344f998429038257188d89e7262467940feb30736`;
  Arthur's containerd store reports manifest digest
  `sha256:2a8f598ac6d42a9d27e96b78e1fdb6a1dc537f318c6e7715316d582d4aef034d`.
  Runtime config and all 12 filesystem layer hashes were compared and match.
- First startup automatically rolled back before migration: Hetzner's DB
  router could not hairpin through its own Tailscale published PostgreSQL port.
  Both routers now join `pointfinder-ha-clients`, resolve Patroni containers
  directly, and health-check `/primary`. Hetzner-local authenticated routing
  and direct primary/standby queries passed. Stop-first updates avoid the
  max-one-task-per-node/start-first scheduling deadlock.
- Retried deployment passed health checks and completed its rollback monitor.
  Both replicas use stable service/slot instance IDs, stop-first updates,
  and one replica per labeled application host. Settings saved in Dokploy.
- A temporary non-login operator used a signed test token to create a seeded
  practice game through the API. Normal go-live validation passed; player
  joined through the real public authentication endpoint. Authenticated PNG
  chunk upload, completion, retry, and exact S3 byte comparison passed first
  on Hetzner, then with requests alternating across both real backend tasks.
  This validates player authentication, not operator password login.
- Test game/player/operator were removed through scoped cleanup. Only their
  32 S3 object versions/delete markers were permanently removed; no production
  media was deleted. Obsolete `chunk-sessions/` versions now expire after seven
  days; current chunks and final-media history are unaffected.
- Backend/frontend automatic GitHub deploys are paused intentionally. Saved
  pending billing environment values were not activated. A repeatable registry
  release pipeline remains necessary before re-enabling normal deployment.

The September 9 evidence below predates the September 10 outage/reconnect
acceptance above; two healthy replicas alone do not prove all failure scenarios.

Codex verification: the HA-only patch also compiled and passed **191 tests,
zero failures/errors/skips**, on the isolated release worktree
`/Users/xmedavid/dev/pointfinder-ha-release`, based on
`e01aa214a6fae651c4801e431f9d5150ae895869`. The built JAR contains V65 and the
four HA migrations V68–V71, but not the pending billing migrations V66/V67.
Only the S3 integration test's constructor needed adapting to omit the newer
billing `QuotaService` argument; the main working tree retains that argument.

This includes `TwoBackendSocketIntegrationTest`, independently written and
run by Codex: two full Spring application contexts with separate HTTP servers,
brokers and instance identities share the test database. Authenticated HTTP
mutations through either server reach real STOMP and plain mobile WebSocket
clients on both. Closing/restarting B leaves A serving; B then reads the
updated state and resumes fanout. These are real sockets and independent
application contexts in one test JVM, not a production host-failure exercise.

Re-run the full focused suite and build with
`bash deploy/ha/test-application-readiness.sh /Users/xmedavid/dev/pointfinder-ha-release`.
The script accesses only isolated local test services and does not deploy.

Final pagination regression: `ObjectStoragePaginationTest` passed **2 tests,
zero failures/errors/skips**, separately on both worktrees. It verifies that
completion sees chunks beyond S3's first 1,000-object listing page. The release
JAR was rebuilt afterward at
`/Users/xmedavid/dev/pointfinder-ha-release/backend/build/libs/pointfinder-0.0.1-SNAPSHOT.jar`;
SHA-256 `3aa57d3ba874187b657162d53e370bbc0c9bbfa07774c76b08b9f652a35f58cd`.
The 191-test baseline run plus these 2 tests total 193 distinct passing tests,
not a claim that all repository tests ran.

Claude Code Fable 5.1 (high effort) performed the implementation handoff;
Codex reviewed it, required the failure/recovery corrections, added the real
socket and pagination tests, and independently verified the release worktree.

### Original deployment handoff (rollout status above)

- Publish/load one immutable image built from the isolated HA release; this JAR
  is built but no image was published or deployed in this step.
- Provision identical application secrets and distinct stable `APP_INSTANCE_ID`
  values on Hetzner and Arthur. Use stop-first replacement per identity so old
  and new consumers cannot concurrently own the same cursor or presence rows.
- Apply the additive migrations in the reviewed rollout; keep the later billing
  migration ordering requirement below visible to the billing owner.
- Keep `STORAGE_TYPE=s3` and chunk store `auto`/`s3`; provision and bound scratch
  disk, and add noncurrent-version lifecycle retention only for chunk objects.
- Validate the real Hetzner S3 authenticated upload journey, then enable the
  second production replica and perform routing/reconnect/failure exercises.
  Local PostgreSQL/MinIO tests do not substitute for those infrastructure gates.

This document is the implementation and evidence record for the acceptance
gates in `deploy/ha/application-acceptance.md`. It does not replace them.

## What changes when a second replica starts

The correctness-critical shared state identified by the audit in
`docs/high-availability-plan.md` now uses shared storage and coordination.
Actual socket objects and per-process realtime metrics remain local; fleet
metrics aggregation is an operations follow-up, not shared session storage:

| Concern | Before | Now |
|---|---|---|
| Upload chunks | Files under the instance's upload volume | `ChunkStore`: S3 objects under `chunk-sessions/<session>/` when object storage is on, local files otherwise |
| Upload completion | Unlocked read-modify-write | Row lock on the session; expiry sweep uses `SKIP LOCKED`; assembly in a bounded local temp file |
| Thumbnails | Read and write the local upload volume | Fetched from and written back to the bucket through temp files; local mode unchanged |
| Realtime events | In-process STOMP broker and mobile hub only | `realtime_outbox` row in the mutation's transaction; every instance delivers to its own sockets |
| Operator presence | `ConcurrentHashMap` per process | `operator_presence` rows with per-instance heartbeat and expiry |
| Login, join, broadcast-code limits | `ConcurrentHashMap` per process | `rate_limit_buckets`, one atomic upsert per attempt |
| Scheduled jobs | `@Scheduled` on every process | `scheduled_job_leases`; one claim per tick across instances; idempotent bodies |
| Billing sweeper | `@Scheduled` on every process | Same lease, applied by an aspect around the untouched method |

Instance identity comes from `app.instance-id` (`APP_INSTANCE_ID`). It must
be stable across container recreation and distinct per replica: it names
the outbox cursor a restarted instance resumes from and the presence rows
and job leases it owns. The fallback to the container hostname is only for
development: under Swarm the hostname is the task's container id and changes
on every recreation, which turns each restart into a fresh consumer that
cannot replay what it missed. Set it from the Swarm template
`{{.Service.Name}}-{{.Task.Slot}}` (slot numbers are stable for a replicated
service) or pin one literal per placement constraint.

## Migrations

`V68__scheduled_job_leases.sql`, `V69__rate_limit_buckets.sql`,
`V70__operator_presence.sql`, `V71__realtime_outbox.sql`. All additive,
new tables only, no changes to existing tables, no checksum changes to
earlier migrations. They reference `games` and `users` only; nothing from the
billing migrations V66 and V67.

Applying them to a V65 database works with Flyway's defaults. If the HA
release ships before the billing release, the billing release must then set
`spring.flyway.out-of-order=true` for one deployment so V66 and V67 can apply
after V68 to V71. Reverse order needs nothing.

Rollback boundary: the code before this change ignores these tables. Rolling
the image back leaves them in place and unused. Dropping them is a separate,
manual step.

## Uploads

Design: `backend/src/main/java/com/prayer/pointfinder/service/upload/`.

- `ChunkStoreConfig` picks `S3ChunkStore` when `app.storage.type=s3`
  (default `app.uploads.chunk.store=auto`); `local` forces the filesystem
  store. Chunk objects live under `chunk-sessions/`, outside the per-game
  media prefix, so deleting a game's media never touches in-flight chunks.
- Every state change to a session (chunk accepted, completion, cancel,
  clear, expiry, and the expiry check on read) first takes the session's row
  lock and re-reads the row under it (`EntityManager.refresh` with
  `PESSIMISTIC_WRITE`; a plain lock would keep the pre-wait state in the
  first-level cache). After waiting for a competing transaction the decision
  is made on the committed row.
- `uploadChunk` validates on the unlocked copy, stores the bytes, then locks
  and re-checks status and expiry before recording the chunk with an
  `ON CONFLICT DO UPDATE` upsert. Parallel chunk uploads of one session
  serialise only on that short bookkeeping. A chunk that arrives after the
  session completed or expired is rejected and its bytes go to the orphan
  sweep; it never re-creates chunk rows or touches the completed state.
- `completeSession` under the lock either returns the existing result
  (`completed`) or assembles once. The final object key is
  `<gameId>/<sessionId>.<ext>`, so a retry after a failed commit overwrites
  the same object instead of leaving another one; `FileAccessService` and
  the URL patterns already accept any UUID name.
- Chunk bytes are deleted only in `afterCommit` of the transaction that made
  them obsolete. A rollback (deadlock, timeout, commit failure) keeps the
  chunks for the still-active session; a crash between commit and delete
  leaves objects for the orphan sweep.
- Assembly streams chunks into a temp file under `app.uploads.temp-path`
  (default the JVM temp directory), validates the content as before, stores
  it, and deletes the temp file on every exit path.
- `expireStaleSessions` selects expired ids with `FOR UPDATE SKIP LOCKED`,
  so it never expires a session mid-completion and never overwrites a
  `completed` status. Completion of an already expired session fails with
  `UPLOAD_SESSION_EXPIRED`, as before.
- `sweepOrphanChunkStorage` (hourly, coordinated) deletes chunk storage for
  sessions that are not `active`, bounded to 1000 sessions per run and
  walking the key space from a cursor that advances between runs, so a
  bounded run cannot re-list the same active sessions forever. Active
  sessions are never touched.
- The media bucket is versioned. A delete leaves a delete marker and keeps
  the chunk versions as noncurrent objects, so "deleted" chunk bytes do not
  free space until a lifecycle rule expires noncurrent versions under
  `chunk-sessions/`. That rule belongs to the bucket configuration (Codex's
  scope); until it exists, chunk storage is reclaimed logically, not
  physically.
- Sessions in flight when a deployment switches stores keep working: a chunk
  missing from the new store is reported through the existing
  `UPLOAD_INCOMPLETE` recovery path and the client re-uploads it.

Thumbnails: `ThumbnailService.generateThumbnailInObjectStorage` downloads
the source to a temp file, renders, uploads `<name>_thumb.jpg` next to it,
and removes both temp files. It skips videos, missing sources, and existing
thumbnails. `SubmissionService` now passes the game id and lets the service
resolve the location. Pre-existing and unchanged: no client requests
thumbnails today and `FileAccessService` only serves URLs stored on a
submission, so thumbnails are generated but not served.

## Realtime events

Design: `backend/src/main/java/com/prayer/pointfinder/realtime/`.

- `GameEventBroadcaster` builds the same envelopes as before. With the
  outbox enabled it only records them through `RealtimeOutboxWriter` (row
  insert plus `pg_notify`, joining the caller's transaction); there is no
  direct dispatch. A failure to write the row fails the mutation. A
  rolled-back transaction leaves no row and therefore no delivery anywhere.
  With the outbox disabled the broadcaster dispatches directly after commit,
  the single-instance behaviour.
- `RealtimeOutboxConsumer` on every instance, the producer included, polls
  the table and dispatches every row to its own sockets. All sockets on all
  instances therefore see one committed order, and a crash between commit
  and dispatch loses nothing: the row is still in the table when the
  instance comes back. The producer wakes its own consumer right after
  commit, so local latency stays close to commit.
- The cursor is the inserting transaction id, not the row id. Row ids are
  allocated at insert time, so a slow transaction can commit a lower id after
  a faster one committed a higher id; a max-id cursor would skip it. Each
  poll reads `pg_current_snapshot()`: every transaction below its `xmin` has
  finished, so the cursor advances to `xmin`. Visible rows above `xmin` are
  delivered immediately and remembered until the cursor passes them.
- `RealtimeOutboxRunner` runs the poll loop (default every second) and a
  raw `LISTEN realtime_outbox` connection outside the Hikari pool that only
  wakes the loop early. NOTIFY is never the delivery path.
- Failures: a row counts as delivered only after the dispatch returned. A
  failed dispatch holds the cursor at that row's transaction and every
  following poll retries it, until the row reaches the end of the retention
  window; then it is copied to `realtime_outbox_dead_letters` with its
  error and attempt count, counted (`realtime.outbox.dead_lettered`), and
  released. Nothing is dropped silently; dead letters are kept 30 days for
  inspection and are never replayed automatically.
- Cursors persist per instance in `realtime_outbox_cursors`. A restarted
  instance resumes from its cursor and replays what it missed while down,
  bounded by retention. Rows delivered ahead of the cursor before the
  restart may be delivered once more. Snapshot-relevant events carry
  `stateVersion`, so clients treat duplicates and gaps as a snapshot refresh
  signal. Transient presence/location events do not carry a state version.
- Retention: a consumer dead-letters a failing row once it is older than
  `app.ha.outbox.retention-minutes` (10); cleanup deletes rows only after
  retention plus `cleanup-grace-minutes` (10), so the row is still there
  when the consumer gets to it (tested). Cursors are deleted after
  `cursor-retention-hours` (24), dead letters after 30 days, by a coordinated
  job every minute. Event deletion is batch-bounded; cursor/dead-letter
  deletion uses age cutoffs.
- Ordering: the transaction-id window only decides which rows are safe to
  pass; within a poll rows are delivered in outbox id order. A row is
  inserted after its transaction bumped the game's `state_version` under
  the game row lock, so for one game a higher id is a higher version,
  whereas transaction ids are assigned at transaction start and can reverse
  two concurrent bumps (tested). Every socket on every instance receives
  events from the same consumer path. `stateVersion` remains the recovery
  contract for reconnects and replays.

Rollback: `app.ha.outbox.enabled=false` restores local-only delivery.

## Presence

Design: `backend/src/main/java/com/prayer/pointfinder/websocket/presence/`.

- One row per STOMP session subscribed to a game topic. `getOperators`
  groups rows by user, ignoring rows not refreshed within
  `app.ha.presence.ttl-seconds` (45).
- The tracker keeps the list of sessions this instance owns.
  `OperatorPresenceMaintenance.heartbeat` re-asserts that list every 15
  seconds with a batch upsert, so rows that expired during a pause or a
  database outage come back while the sockets are still open. Register,
  unregister and heartbeat share one lock, so a heartbeat cannot resurrect
  a session that was unregistered meanwhile.
- The coordinated `presence.expireStale` job deletes rows older than the
  TTL in batches of 500 and re-broadcasts presence for the affected games,
  so a crashed node's operators disappear on both nodes' clients. A
  graceful shutdown removes the instance's rows immediately.
- Indexes: `(game_id, last_seen_at)` for reads, `(instance_id)` for the
  heartbeat, `(last_seen_at)` for expiry.

Rollback: `app.ha.presence.store=memory`.

## Rate limits

Design: `backend/src/main/java/com/prayer/pointfinder/service/ratelimit/`.

- `JdbcRateLimitStore.hit` is one `INSERT ... ON CONFLICT DO UPDATE ...
  RETURNING`. The conflict branch takes the row lock, so concurrent attempts
  serialise and every increment counts. Window reset and lockout are decided
  inside the statement.
- Every store call runs in `REQUIRES_NEW`, so a failed login's record
  survives the login transaction's rollback.
- Policies are unchanged: login 10 failures per 15 minutes per email, join
  10 per minute per IP and 20 per device with the same-pair rule, broadcast
  code 5 failures per minute then a 15-minute lockout, success resets.
- A store error is not a bypass. `LoginAttemptService` and
  `PlayerJoinRateLimiter` throw `RateLimitStoreUnavailableException`, mapped
  to `503`; `BroadcastCodeThrottle` denies the STOMP connect.
- Cleanup: coordinated job every 5 minutes deletes buckets untouched for
  `app.ha.rate-limit.retention-hours` (24), 5000 rows per run.

Rollback: `app.ha.rate-limit.store=memory`.

## Scheduled jobs

Design: `backend/src/main/java/com/prayer/pointfinder/service/jobs/`.

- `ScheduledJobCoordinator.run(name, lease, body)`: an atomic
  `INSERT ... ON CONFLICT DO UPDATE ... WHERE leased_until IS NULL OR
  leased_until < now RETURNING` claims the job; the loser gets no row. The
  body then runs inside one transaction that first takes
  `pg_try_advisory_xact_lock(7001, hashtext(name))`. The lease decides who
  starts; the advisory lock guarantees at most one instance is executing:
  if a lease expires under a slow run and the other instance claims it, the
  lock is still held and the claimant skips (`skipped_active`). The
  transaction's timeout is the lease length, so a stuck job rolls back and
  is retried instead of holding the lock forever. `@Transactional` job
  bodies join this transaction, so their database work is covered by the
  lock end to end. Completion releases the lease; failure releases it and
  records the error so the next tick retries; a crash leaves the lease to
  expire. A body that outlived its lease is reported
  (`jobs.lease_overrun`). Claim and release run in `REQUIRES_NEW`.
- `ScheduledJobs` owns every `@Scheduled` trigger that must run once across
  the fleet: practice-game expiry, auto-end, stage activation, the three
  token purges, upload-session expiry, needs-attention detection, orphan
  chunk sweep, rate-limit cleanup, presence expiry, outbox cleanup.
- Transitions are idempotent on top of the lock: `autoEndGames`,
  `expirePracticeGames` and `activateScheduledStages` use conditional
  updates that re-check the state and the due time at update time
  (`... WHERE status = 'live' AND end_date < now`, `... WHERE is_active =
  false AND transition_type = 'scheduled' AND scheduled_at <= now`) and
  broadcast only when the row changed. Two overlapping runs produce one
  transition and one event, and an operator who rescheduled between the
  job's query and its update is not overwritten. Upload-session expiry uses
  `SKIP LOCKED`, so overlapping sweeps expire each session once and send
  one give-up push.
- Per-instance by nature and unchanged: `MobileRealtimeHub.cleanupStaleSessions`
  (local sockets), the presence heartbeat, the outbox poll.

Billing: `SubscriptionLifecycleService.sweepExpiredTermsAndGracePeriods`
keeps its own hourly `@Scheduled` trigger and its source is untouched.
`BillingSchedulerCoordinationAspect` wraps that method on the Spring proxy
at highest precedence and routes the call through the same coordinator
(job `billing.subscriptionLifecycleSweep`, 10-minute lease). The sweep's own
`@Transactional` joins the coordinator's transaction, so its work runs under
the advisory lock: with two replicas the sweep executes on one instance at a
time, also when a lease has expired under a slow run. Its body is
state-based (`find by status ... set status`, invite expiry is a status
update with no email), so it is idempotent on top of that.

Rollback: `app.ha.jobs.coordinated=false` restores per-process scheduling.

## Configuration summary

All under `app.ha` in `backend/src/main/resources/application.yml`, each with
an environment variable of the same shape (`APP_HA_OUTBOX_ENABLED`, and so
on). Every default is safe for a single instance. `app.uploads.temp-path`
and `app.uploads.chunk.store` are new under `app.uploads`.
`app.instance-id` (`APP_INSTANCE_ID`) defaults to the hostname.

## Evidence

Run with `make test-backend-docker` semantics (Gradle inside the test
container, Testcontainers PostgreSQL 16 and MinIO reached through the host
gateway). The exact command used:

```
docker compose -f docker-compose.test.yml run --rm backend-test ./gradlew test \
  --tests 'com.prayer.pointfinder.integration.ha.<each class, listed individually>' \
  --tests '*GameSchedulerServiceTest' --tests '*ChunkedUploadServiceTest' \
  --tests '*LoginAttemptServiceTest' --tests '*GameEventBroadcasterTest' \
  --tests '*OperatorPresenceTrackerTest' --tests '*ThumbnailServiceTest' \
  --tests '*PlayerJoinServiceTest' --tests '*BroadcastServiceTest' \
  --tests '*StompSessionMetricsListenerTest' --tests '*MobileRealtimeHubMetricsTest' \
  --tests '*RealtimeOutboxWriterTest' --tests '*FileStorageServiceTest' \
  --tests '*SubmissionUploadLinkageTest' --tests '*SubmissionFlowIntegrationTest' \
  --tests '*JoinAndFileAccessSecurityIntegrationTest' --tests '*GameStateVersionConcurrencyTest'
```

Result: `BUILD SUCCESSFUL`, 190 tests, 0 failures, 0 errors, 0 skipped
(Docker 29.2, PostgreSQL 16 and MinIO `RELEASE.2023-09-04` via Testcontainers,
2026-09-09). Three pre-existing full-context integration tests were included
as regression evidence for the API, authorization and file-access contracts.

| Test class | Tests | Skipped | Failures | Errors |
|---|---:|---:|---:|---:|
| `integration.GameStateVersionConcurrencyTest` | 2 | 0 | 0 | 0 |
| `integration.SubmissionFlowIntegrationTest` | 1 | 0 | 0 | 0 |
| `integration.ha.BillingSweepCoordinationIntegrationTest` | 1 | 0 | 0 | 0 |
| `integration.ha.ChunkedUploadS3IntegrationTest` | 11 | 0 | 0 | 0 |
| `integration.ha.JdbcRateLimitStoreIntegrationTest` | 10 | 0 | 0 | 0 |
| `integration.ha.OperatorPresenceIntegrationTest` | 5 | 0 | 0 | 0 |
| `integration.ha.RealtimeOutboxIntegrationTest` | 13 | 0 | 0 | 0 |
| `integration.ha.ScheduledJobCoordinatorIntegrationTest` | 11 | 0 | 0 | 0 |
| `realtime.RealtimeOutboxWriterTest` | 5 | 0 | 0 | 0 |
| `service.BroadcastServiceTest` | 33 | 0 | 0 | 0 |
| `service.ChunkedUploadServiceTest` | 12 | 0 | 0 | 0 |
| `service.FileStorageServiceTest` | 8 | 0 | 0 | 0 |
| `service.GameSchedulerServiceTest` | 25 | 0 | 0 | 0 |
| `service.LoginAttemptServiceTest` | 7 | 0 | 0 | 0 |
| `service.PlayerJoinServiceTest` | 4 | 0 | 0 | 0 |
| `service.SubmissionUploadLinkageTest` | 4 | 0 | 0 | 0 |
| `service.ThumbnailServiceTest` | 6 | 0 | 0 | 0 |
| `websocket.GameEventBroadcasterTest` | 14 | 0 | 0 | 0 |
| `websocket.MobileRealtimeHubMetricsTest` | 4 | 0 | 0 | 0 |
| `websocket.OperatorPresenceTrackerTest` | 9 | 0 | 0 | 0 |
| `websocket.StompSessionMetricsListenerTest` | 5 | 0 | 0 | 0 |

What the HA classes prove, by acceptance gate:

- Uploads (`ChunkedUploadS3IntegrationTest`): chunks accepted alternately on
  two service instances, a fresh instance completing on the other side,
  final bytes byte-identical to the source, chunk objects and rows removed
  after commit; duplicate chunk on both instances idempotent; concurrent
  completion on both instances yields one object and one `fileUrl`; a
  rolled-back completion keeps every chunk and the retry stores the same
  deterministic key; a late chunk after completion is rejected without
  touching rows; the expiry sweep skips a session whose row is locked by a
  completion and expires it afterwards only while still active; a completed
  session is never expired; another team's player is rejected on either
  instance; the orphan sweep removes forgotten sessions' chunks, spares
  active ones, and its cursor reaches later sessions across bounded calls;
  thumbnails round-trip through the bucket with no temp files left.
- Realtime (`RealtimeOutboxIntegrationTest`, `RealtimeOutboxWriterTest`):
  a committed event reaches the sockets of both instances exactly once; a
  rolled-back transaction emits nothing; a lower-id row that commits late is
  delivered; repeated polls never redeliver; a restarted consumer resumes
  from its persisted cursor without skipping; operator and team audiences
  keep their destinations; the broadcaster writes the row with the
  mutation's state version and not on rollback; a transient dispatch
  failure is retried without skipping later rows; a failing row is retried
  on every poll and never dropped early; a row still failing at retention is
  dead-lettered durably and the stream continues; a producer crash between
  commit and dispatch loses nothing; same-game events are delivered in
  state-version order under an interleaving where transaction-id order would
  reverse them; cleanup never deletes a failing row before it can be
  dead-lettered; a failed row write fails the mutation and never dispatches.
- Presence (`OperatorPresenceIntegrationTest`): sessions aggregate across
  instances; disconnecting one session keeps the same user's session on the
  other node; a node that stops heart-beating expires and reconnect restores;
  the heartbeat re-inserts rows lost while the socket stayed open and never
  resurrects an unregistered session; graceful shutdown removes only that
  instance's sessions.
- Rate limits (`JdbcRateLimitStoreIntegrationTest`): alternating hits share
  one allowance; 40 concurrent hits all count; window expiry; lockout set on
  the limiting hit and cleared after it passes; reset; a login failure is
  recorded despite the login transaction's rollback; login block aggregates
  and success resets across instances; join limiter alternation and the
  same-pair rule; broadcast-code lockout across instances; bounded stale
  deletion.
- Jobs (`ScheduledJobCoordinatorIntegrationTest`,
  `BillingSweepCoordinationIntegrationTest`): concurrent ticks run a job
  once; sequential ticks both run; a crashed holder's lease expires and the
  other instance claims; failure releases and records the error; an expired
  lease under a slow run does not allow a second active run (advisory lock);
  the job body runs inside the coordinator's transaction; lease overrun is
  reported; overlapping auto-end, stage activation (with a reschedule in
  between) and upload-expiry runs produce one transition, one event, one
  expiry per session; the billing sweep runs under the lease and is skipped
  while another instance holds it, without changes to its source.
- Migrations: every class above boots the full application on a fresh
  PostgreSQL through Flyway V1 to V71 with `ddl-auto: validate`.

## What the tests do not prove

- Two JVMs. "Node A" and "node B" are two service, consumer, store or
  coordinator objects over one database and one bucket, driven in their own
  transactions. That exercises the shared state and locking exactly as two
  processes would, but not process startup, the LISTEN reconnect loop under
  a real network drop, or two HTTP listeners behind a proxy. The
  two-context socket test (`TwoBackendSocketIntegrationTest`, Codex's) is the
  evidence for that gate; run it after this change set.
- Authenticated end-to-end journeys through HTTP and WebSocket clients on
  both instances. The tests are component tests with real PostgreSQL and
  MinIO; they are not a full application journey.
- Hetzner Object Storage specifically. MinIO was used; the code uses only
  `PutObject`, `GetObject`, `HeadObject`, `ListObjectsV2` with prefix and
  delimiter, and `DeleteObjects`.
- The preserved production image. This tree includes billing work beyond the
  candidate boundary; see the release note below.

## Release boundary note

The candidate production boundary is `e01aa214`. Relative to it this
working tree also carries the billing wave (V66, V67, `QuotaService` wiring
including the file-size cap in `ChunkedUploadService.createSession`). The HA
change set was written so its hunks in `ChunkedUploadService` stay clear of
the quota lines; when applying HA alone onto the candidate, drop the
`QuotaService` field and the `enforceFileSizeLimit` call from that file and
the `quotaService` constructor argument in `ChunkedUploadServiceTest` and
`ChunkedUploadS3IntegrationTest`.

## Remaining gates

- Run two application instances (separate JVMs) against one database and
  one bucket and repeat the acceptance checks over HTTP and WebSockets.
- Establish the reviewed release boundary and build one immutable image.
- Provision the S3 credentials and `APP_INSTANCE_ID` (or rely on the
  container hostname) on both nodes before lifting the placement constraint.
- Object storage must be enabled in production before the second replica:
  with `app.storage.type=local` the chunk store is local and two replicas
  would need a shared upload volume.
