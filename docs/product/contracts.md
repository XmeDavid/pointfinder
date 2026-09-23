# Product contracts to preserve

Consolidated from the retired specifications on 2026-09-12 and checked against the current implementation. Exact request fields, enums and limits belong to the controllers/DTOs and `packages/api`, not a parallel endpoint manual. Backend paths below start at `backend/src/main/java/com/prayer/pointfinder/`.

## Identity and shared progress

Guest joining resolves a team code. A registered account can link a guest participation in place or recover its existing participation in that game. Conflicts are rejected and recovered explicitly; never merge player rows. Recovery retires a displaced guest row instead of cascading away its team's check-ins/media. Retired rows do not receive XP or count toward active-player limits. Verification does not gate play.

Account and player sessions coexist and use the appropriate principal per request. Platform secret storage, refresh fencing, offline queues and push registrations must survive navigation. Account sign-out, leaving a game, unlinking a participation and deleting an account are distinct operations. A device/team conflict must not silently switch teams or discard queued actions. Push registrations are per phone (`player_push_tokens`), not one mutable token on a player.

Team progress counts for every member. Actor attribution is for audit; it does not turn team actions into exclusively individual progress. Game points are organizer-defined and stay out of player snapshots. Ownership/workspace quota rules and `FrozenAccountFilter` remain independent of ordinary player participation.

Sources: `service/PlayerAccountService.java`, `PlayerJoinService.java`, `PlayerPushTokenService.java`, `QuotaService.java`; `web/src/app/player/account.ts` and platform session stores.

## Lifecycle, check-in and challenge linking

Lifecycle stays `setup → live → ended`, with explicit supported revert/reset transitions. Publication and individual completion must not replace these values. Go-live validates bases, sufficient challenges, a team, variables, check-in methods, schedule and ordered-route dependencies. It checks location-bound assignments and then auto-assigns uncovered bases; do not claim a separate preflight rejects every unassigned base. NFC linking is method-specific; location check-in also requires a supporting plan. Preserve import/export, practice games and older-client defaults when extending settings.

Assignments connect game-owned challenges to bases and teams. User-facing labels can say **Link challenges** without renaming API/domain entities. A `none` challenge is valid. Presence-to-submit is a client-side gate and must not be described as independent server-attested presence.

NFC/QR proofs and location proofs are different contracts. Location claims carry fix/accuracy/time and claim evidence, with server validation; they are not unconditional manual check-ins. Operator rescue remains separately authorized and audited. Hidden geofences may be carried for detection but must not reveal hidden map destinations. Background geofencing is not implemented.

Enforced base order advances through check-ins, not submission approval. Order is scoped per route: each stage is one route numbered from 1 with its own `enforceBaseOrder` flag, and bases without a stage form the default route governed by the game flag. Within a route the earliest missing check-in determines the next required base, including hidden ones; error hints must not disclose hidden titles/coordinates. Ordering and structural route edits are setup-only. Offline later visits depend on earlier queued visits; a refused premature scan needs a new visit/scan, not automatic later acceptance. Existing manual rescue can record a visit. Clients gate from `routes[]` and the per-base `stageId`; an unknown route must not block. Trigger stages activate after the unlocking commit and activation is idempotent.

Choice challenges (`single_choice`, `multiple_choice`) carry options with stable ids. The answer key never reaches a player response; grading is server-side and all-or-nothing, one attempt per team and base. Editing keeps option ids by position so earlier submissions still resolve.

Sources: `service/GameService.java`, `CheckInVerificationService.java`, `BaseOrderService.java`, `StageService.java`, `ChoiceGrading.java`, `TeamVariableService.java`; `packages/game-core/src/{proof,arrival,geofence,queue}.ts`.

## XP and results

Action XP and visible levels advance while playing. Placements and completion awards finalize at the shared game end. The historical spec's “levels only after ending” language was superseded by the owner. The organizer factor is intentional: experience organizing a game is not equivalent to a brand-new account repeatedly awarding friends.

Formula version 1 lives in `xp/XpLevels.java`: check-in base XP 1, base completion 5, game completion 50. Level n requires rounded `200 × n^1.35` XP. The factor is `min(2, 0.2 + 1.8 × ln(1 + L) / ln(500))`, frozen at go-live from the creator's **finalized** XP level. Live XP cannot amplify a newly created game's factor. Placement uses the saved field, rank and share of opponents beaten; see `placementBase` for rounding and bounds. Discovery featuring is distinct from the XP multiplier.

Awards go to the eligible roster when awarded, including teammates who did not perform the action. Retired rows never earn again. Practice games and creator participation are ineligible; a field ending with only one eligible team reverses live awards. Ledger uniqueness prevents duplicate awards on retries. Reset appends reversals once; reopening without reset preserves the cycle/factor and existing result. Claiming/unlinking updates account attribution. Deleted game/team references may be null in retained history.

Every ending path uses the finalizer under the game lock. Ended games refuse review/rescue writes that could change finalized results. The end-summary pending-review count is advisory; the finalizer establishes the cutoff. Late offline actions do not become earned rewards. The profile is private; `/account/me` lists all participations while XP history contains award-bearing cycles.

Sources: `xp/XpService.java`, `xp/XpLevels.java`, `repository/XpAwardRepository.java`, `integration/XpLedgerIntegrationTest.java` under backend tests.

## Publication and documents

Unlisted is the default. Publication title follows the current game name; summary and place are intentionally authored listing fields. No private bases, teams, join codes, locations or resources may leak into discovery. Current UI saves null listing coordinates. Creator/admin/authorized organization game-admins publish; being a co-operator alone does not grant publishing. Only platform admins curate featuring.

Browsing requires an account. New direct joins require a listed live game and its designated admission team; otherwise use existing team codes. Existing participants recover their original team. Publication changes, admission, team deletion and lifecycle changes serialize through the game lock. Listing mutations are rate-limited and V79 records publication events. A team may carry an optional player limit (1 to 500, V85): a full team refuses new players with `TEAM_FULL`, counted under the game lock, while existing members, device recovery and a lowered limit never remove anyone. A lobby and mid-game reassignment need their own reviewed contract.

Any signed-in account may report a listed game (V86), one open report per account and game; reports on unlisted games are 404 like every other Explore read. Only platform admins read reports, including the reporter's name, and resolve all of a game's open reports at once: dismiss keeps the listing, remove is the ordinary unpublish audited as the admin's action. Publishers never see reports or reporters. Removal is not a moderation hold: the publisher can list the game again.

Player resource list, downloads and nested HTML enrichment use the authorized game/team resource set. Current exposure comes from explicit sharing, base check-ins and challenge submissions, including unapproved submissions; description/content/completion embeds are combined. This is not yet a completion-unlock or three-audience policy. Cached documents can remain readable offline; downloaded/signed content cannot be retrospectively recalled merely by changing sharing. Creating, editing or deleting a game resource sends a content-free `game_config` refresh signal after commit; player document lists refetch on it and poll as a fallback. Organization resources and persistent offline file downloads need separate decisions.

Sources: `service/GamePublicationService.java`, `ExploreService.java`, `PublicationReportService.java`, `PlayerJoinService.java`, `ResourceService.java`, `ResourceEmbedService.java`; `controller/PlayerResourceController.java`.

## Realtime, audit and operations

Role-specific state snapshots are authoritative projections. Player snapshots omit game points, leaderboard, operator notes and other-team data. State versions advance transactionally with relevant mutations; realtime messages are refresh signals and reconnect must converge on a snapshot. Broadcasting waits for commit. Do not treat a disconnected socket as proof that queued work was accepted or reject a valid HTTP response solely because a socket was missed.

Rescue/audit attribution includes actor, reason and prior/new state as implemented. Audit exports are external contracts: preserve schema/version and column compatibility in `service/AuditExportService.java` and the frontend export types. Game lifecycle transitions are recorded in `game_lifecycle_events` with actor, reason and prior/new status, separate from team activity events. Never rewrite applied Flyway migrations just to repair historical documentation comments: checksums are part of deployment compatibility.

Multi-replica behavior uses shared chunks/outbox/presence/limiting/job coordination. Flags and rollout truth live in `config/HaProperties.java`, `deploy/ha/OPERATIONS.md` and `deploy/ha/application-acceptance.md`. Keep retention bounded, fail closed on security-store failure and preserve restart/replay semantics. Runtime validation is separate from code presence.

Billing remains ownership-based. `entity/OrgTier.java` uses the current sales-led club model; keep limits in the quota/deal services and shared client contract. Stripe webhook idempotency lives in `entity/StripeEvent.java` and its handling service, not process memory. Current CI/config/runbooks, rather than old IPs or dated credentials in an audit, define deployment procedure.

## Security boundaries

Browser operator refresh uses the HttpOnly `pf_refresh` cookie; native refresh uses platform secret storage/body tokens. Player browser persistence is a separate contract (`web/src/platform/browser/tokenStore.ts`); do not extend the old “no localStorage refresh token” statement to every session. Account roles and player principals remain distinct. Read TTL, rotation grace and concurrent-session limits from `AuthService`, `PlayerAccountService` and application configuration rather than copying stale constants.

Login, join and broadcast abuse limits use shared database state and fail closed if that state is unavailable. Nginx rate-limit zones and actuator denial apply only where nginx handles the request; HAProxy's direct API route must be assessed separately (OW-27). Outbound-link host handling belongs to the trusted-forwarded-header configuration, not arbitrary request Host values. Errors use the structured envelope including `traceId`, optional `code` and `retryable`; preserve machine codes and status semantics across clients.

For multiple replicas, stable unique `APP_INSTANCE_ID`, shared S3 chunk storage and enabled shared outbox/presence/rate-limit/job coordination are prerequisites. Memory/local rollback options are for a single instance; do not turn them off while continuing a multi-replica deployment. Keep exact flags, TTLs and limits in `application.yml` and the active deployment manifest. CI release provenance and acceptance live beside `.github/workflows/` and `deploy/ha/`; dated runbook evidence is not a fresh deployment claim.
