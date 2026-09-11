# Vision review against the repository

Reviewed: 2026-09-09; identity/session and XP baseline updated on 2026-09-10. This is a code-informed planning baseline, not a runtime audit or proof of platform parity. The XP backend is present on the redesign branch; its frontend integration is underway and is not a release claim. Recheck the implementation when starting a feature. The [vision](vision.md) describes intent; the [roadmap](roadmap.md) describes proposed slices.

## Clarifications to the original transcript

| Original framing | Repository context | Consequence for the plan |
|---|---|---|
| Players are mostly stateless | `Player` rows persist and reference a team, game, device ID and display name. A row may carry `user_id`, with one participation per account per game. Credential/session recovery, account-aware joining and `/api/account/me` already exist. The shared player app holds an account session beside its player session. | Reuse these foundations when unifying navigation; preserve player rows, queues and shared progress during claiming/recovery. PF-03 now supplies a separate XP/profile read model, not a replacement participation list. |
| Unified users | Registered `User` accounts (`admin`, `operator`, `participant`), organizations and memberships exist. Account and player sessions coexist, while each API request still uses its appropriate principal. Claiming links a participation rather than swapping its principal. | The remaining work is the unified user journey, not inventing a second identity system. Preserve operator/player permissions, platform-native credential storage and guest access; account sign-out and leaving a game are distinct actions. |
| Anyone with a game code joins | Current joining resolves a **team** join code; a device already on another team in the same game is rejected. | A common solo/public game join flow is new work. Preserve current team codes and joining contracts. |
| Add activity files and native documents | `ResourceType` already includes `file` and `document`; resources and folders can be scoped to games or organizations. Resource services, storage quotas, uploads, rich document editing, and sharing controls exist. | Extend the current resource product. A future activity-wide container is separate work. |
| Expand unlocking to files | Resource embeds already connect resources to bases/challenges, and the player file list aggregates shared resources with resources associated with check-ins/submissions. | File exposure has a partial gameplay foundation. Clarify and harden its semantics rather than invent a second file-unlock system. |
| Three file visibility levels | `sharedWithPlayers` is a boolean; embeds provide another exposure path. There is no explicit three-audience policy on the resource entity. | “Not shared” must not be treated as proof of strict operator-only access. Define one consistent audience/access contract for all delivery paths. |
| Challenges belong to bases | A `Challenge` belongs to a `Game`; `Assignment` connects bases, teams and challenges. The unified build UI presents pairs without merging the entities. | Global challenge work is primarily availability, submission and authorization independent of base visits, not moving challenge ownership out of a base table. |
| Draft → Published → Active → Archived | `GameStatus` is `setup`, `live`, `ended`, with supported return-to-setup/reset behavior and scheduling elsewhere. | Keep publication and independent run completion separate. Do not rename lifecycle values or substitute archiving for ending. |
| Long-running is a new game type | The key missing behavior is independent completion/results and long-lived operation, not a special duration label. | Compose modes and scheduling. Open-ended operation alone does not establish support for permanent trails. |
| Players see scores and leaderboards | Operator standings expose game points. Player snapshots still omit them. The imported XP backend exposes live platform XP and a private account profile; placement is published only after the game ends. | Use the explicit XP/result contracts without adding game points or live standings to player snapshots. Public profiles and broader result visibility still need a product policy. |
| Pro features attach to the operator | Personal subscriptions and organization plans already resolve quotas according to game ownership. | Preserve account/workspace ownership semantics; do not grant a game new entitlements just because any invited operator has Pro. Player participation allowance is a distinct future policy. |
| NFC game platform | The current shared product also has QR and location check-in paths; legacy native coverage differs. | Describe the direction as location-based activities. Joining, check-in proof, and native platform support remain distinct concerns. |

## Source map

Paths below are relative to the repository root. These are useful starting points, not an exhaustive implementation inventory.

- Identity and joining: `backend/src/main/java/com/prayer/pointfinder/entity/Player.java`, `entity/User.java`, `service/PlayerJoinService.java`, `service/PlayerAccountService.java`, `controller/AccountController.java`, `security/JwtTokenProvider.java`, `security/JwtAuthenticationFilter.java`; shared account sessions in `web/src/app/player/account.ts` and `web/src/app/player/services.tsx`.
- XP and private results: `backend/src/main/java/com/prayer/pointfinder/xp/XpService.java`, `xp/XpLevels.java`, `repository/XpAwardRepository.java`, `dto/response/XpProfileResponse.java`, `dto/response/XpRewardResponse.java`, and migration `V76__xp_ledger.sql`; shared client contracts in `packages/api/src/types.ts` and `packages/api/src/endpoints.ts`.
- Team-oriented progress and configuration: `entity/Team.java`, `entity/CheckIn.java`, `entity/Submission.java`, `entity/Assignment.java`, `entity/TeamVariable.java`, `service/ChallengeAssignmentService.java` under the same backend package.
- Lifecycle and readiness: `entity/GameStatus.java`, `entity/GameStatusTransition.java`, `service/GameService.java`; check-in configuration in `entity/Base.java` and `entity/CheckInMethod.java`.
- Resources: `entity/Resource.java`, `entity/ResourceType.java`, `entity/ResourceFolder.java`, `entity/ResourceEmbed.java`, `service/ResourceService.java`, `service/ResourceEmbedService.java`, `controller/PlayerResourceController.java`.
- Resource UI: `web/src/features/org/ResourceBrowser.tsx`, `web/src/components/editor/ResourcePicker.tsx`, `web/src/features/player/DocumentsScreen.tsx`, `web/src/features/player/usePlayerDocuments.ts`, `web/src/features/player/components/RichContent.tsx`, `web/src/lib/api/resources.ts`.
- Challenges and unlocks: `entity/Challenge.java`, `entity/UnlockTrigger.java`, `service/SubmissionService.java` in the backend package, plus the assignment and resource-embed paths above.
- Score visibility: `backend/src/main/java/com/prayer/pointfinder/dto/response/PlayerSnapshotResponse.java`, `PlayerChallengeResponse.java` and `CheckInResponse.java` in that same response directory; operator standings in `web/src/features/results/Standings.tsx`.
- Entitlements and ownership: `service/QuotaService.java`, `service/GameAccessService.java`, `security/FrozenAccountFilter.java`, `entity/UserSubscription.java`, `entity/Organization.java`, `entity/OrgMembership.java` in the backend package.
- Broader references: [business logic](../business-logic.md), [frontend ownership and rollout](../frontend-consolidation.md), and [visual system](../visual-system/README.md). Some older sections of the business-logic reference describe earlier platform coverage or readiness rules; actual code and focused checks must settle conflicts.

## Constraints that matter before implementation

### Team progress is each member's progress

Team IDs are part of the existing check-in, submission, score, assignment, and variable model. Product intent is that this shared progress counts as every member's progress in the game, including shared completion and results in each member's history. Account linking should preserve that relationship to the shared source of progress rather than create independent copies that can diverge. Audit attribution still records who acted; it does not restrict who receives progress. Game-defined points remain contextual to that game rather than becoming a cross-game currency. A solo implementation that reuses teams must account for late-created assignments and team variables, and for readiness rules that currently assume teams already exist before going live.

Account and player authentication also interact differently with billing restrictions. `FrozenAccountFilter` currently distinguishes `User` and `Player` principals. Account linking must deliberately preserve the intended ability to participate when organizer billing changes; simply replacing the player principal with the user principal could change access mid-event.

### Identity and XP contracts now available

PF-01/02 support linking a guest in place, recovering the same participation with credentials or an account session, and joining while signed in. Conflicting participations are rejected and recovered explicitly; rows are not merged. The shared app retains its account session independently of the active game, and per-phone push registrations support more than one device. These foundations do not prove the redesigned playing/organizing journey or legacy native parity.

PF-03 now has an append-only ledger and three useful read endpoints: `/api/account/profile` for the signed-in account, `/api/player/games/{gameId}/reward` for that participation, and `/api/games/{gameId}/end-summary` for an authorized operator. Team check-ins and base completions award each eligible current member; XP and visible levels advance during play. Placement and game-completion awards finalize at the shared game end. Game points remain private to operator APIs.

The creator factor uses the level derived from finalized XP and is frozen at go-live. It deliberately does not use unsettled live XP to seed another game's multiplier. Resetting progress reverses the cycle; reopening without reset preserves earned XP and the stored result. A single-team field may earn live action XP that is reversed when the game ends ineligible. The profile and reward screen must reflect these changes without presenting a pending placement as final.

The profile's history contains award-bearing cycles, so `/account/me` remains the source for all joined games, including those without XP. Deleted games can leave history with a null game ID; result details can be absent after team deletion. Do not assume every history row can reopen a game. The ledger is not an independent participation lifecycle: personal completion and repeated independent runs still need PF-05.

For ongoing-game progress, use the player-visible progress projection, which filters hidden, locked and inactive-stage bases. The broader game-data base list also carries hidden unlock targets and geofence metadata and must not become the denominator shown to a player. Account participation summaries currently contain no visible/completed base counts.

### Publication and discovery on the redesign branch

An opt-in event-game slice now adds V77 `game_publications`, publisher controls inside existing Game Settings, and authenticated discovery inside Home. The listing title is the game name (renames follow automatically); the public summary, area label and optional location are authored deliberately; game descriptions, bases, teams and codes are not exposed. Setup games list as upcoming; live games may admit new accounts to one explicitly chosen team. Existing participants recover their original team. Search, featured, pagination and opt-in nearby use the Explore API. Public admission and publication mutations serialize with game lifecycle changes. This is not solo play or independent completion, and does not establish moderation, admin UI, uploaded artwork, database-scale nearby search or native device parity. See the [contract](../specs/2026-09-10-game-discovery.md).

### Existing resource exposure is not the target audience policy

`PlayerResourceController.getPlayerFiles` derives resource exposure from base check-ins and challenge submissions. Its challenge collection does not require an approved submission, and `ResourceEmbedService.syncChallengeEmbeds` combines description, content and completion-content references. These semantics are not automatically equivalent to “complete this challenge to unlock this file.”

`ResourceEmbedService.getDownloadUrlForPlayer` takes the team since 2026-09-10 and applies the same visibility rule as the list (shared, or embedded behind the team's check-ins and submissions). `enrichHtmlForPlayer` still has no player/run parameter and resolves any referenced resource. Before extending restricted resources further, review authorization across controllers, embeds, snapshots, downloads and signed URLs together and cover the intended boundaries with focused tests.

The player app has a Documents screen since 2026-09-10 (`web/src/features/player/DocumentsScreen.tsx`) that lists visible resources, opens files and renders documents inline, with the list cached for offline reading. Files still need a connection to open. Organization-scoped resources do not reach players. Verify the unlock journey independently before marking PF-11 delivered.

### New modes need deliberate compatibility

Traditional readiness checks, per-team assignment uniqueness, location/presence validation, offline idempotency, reset archives, and audited rescue actions cannot be bypassed merely to enable solo or global challenges. A focused specification must identify which rules remain universal and which vary by mode, preserving defaults for existing games and clients.

An individual completing a run must not mutate the game's global status. Finalized results must also account for operator review and queued actions. No new status enums, migrations, or result schema are chosen by this document.

Game configuration also travels through import/export and practice/tutorial scenarios. Future mode fields need a compatibility story across those consumers, not just a settings screen and database column. Existing base unlocking is evaluated in player progress with game trigger settings and operator overrides; it is not already a general-purpose condition-to-content engine.

### Activities and publication are new product boundaries

No first-class multi-game activity container or public Explore capability was identified in this review. Existing organization membership and game stages do not establish either. In particular, `ActivityEvent` is an audit/event record, not an activity containing games.

Public summaries should have their own intentional data contract. Existing player or operator snapshots are not suitable public listing payloads by default. Publishing, admission, participation and gameplay eligibility should be evaluated independently.

## Scope of this change

The original vision review added documentation and entry-point guidance. This baseline now also records the identity/session foundations and XP backend present in the repository. The shared frontend is being integrated on the redesign branch; this update does not mark PF-03, the broader redesign or any later roadmap capability released. Existing feature gates and platform verification requirements remain in force.
