# Open work

## TODO checklist

Check off completed tasks here. Each reference opens the detailed scope below. Items starting with “Decide”, “Define”, “Verify” or “Test” keep unresolved choices and checks explicit.

### Fix lost work and interrupted sessions

- [x] Save base edits before creating or opening its challenge. [OW-04](#ow-04)
- [x] Recover drafts after navigation, crashes or failed saves; show save status. [OW-04](#ow-04)
- [x] Prevent duplicate challenges when a creation request has an uncertain outcome. [OW-04](#ow-04)
- [ ] Reproduce and fix the installed iOS app returning Home after switching apps. [OW-38](#ow-38)
- [x] Let an organizer signed in through the player entry reach Organize. [OW-01](#ow-01)

### Simplify everyday organizing

- [x] Show the last organized game on Home when there is no active playing game. [OW-30](#ow-30)
- [x] Move challenge description into the metadata section. [OW-31](#ow-31)
- [x] Put accepted answers next to the automatic-checking toggle. [OW-02](#ow-02)
- [x] Add variable suggestions, editable answer chips and translated labels. [OW-02](#ow-02)
- [ ] Open documents in a full-screen mobile viewer, with an Edit action. [OW-08](#ow-08)
- [ ] Use a full-screen mobile document editor and large desktop modals. [OW-08](#ow-08)
- [x] Show only failed readiness checks; show just Go live when ready. [OW-39](#ow-39)
- [ ] Use Build / Monitor / Review as the main operator modes. [OW-32](#ow-32)
- [ ] Put leaderboard/results access inside Monitor, keeping exports accessible. [OW-32](#ow-32)
- [ ] Add Build shortcuts that open the correct content-panel section. [OW-36](#ow-36)
- [ ] Replace mobile content tabs with one section chooser; keep tabs on wide screens. [OW-36](#ow-36)
- [ ] Verify location check-in is restricted to the owning Pro/paid Club plan. [OW-37](#ow-37)

### Extend challenges and stages

- [ ] Add game content language and show it when discovering or joining games. [OW-33](#ow-33)
- [ ] Make base order configurable per stage, preserving existing games. [OW-40](#ow-40)
- [x] Make trigger-based stages actually activate from gameplay. [OW-21](#ow-21)
- [ ] Define multiple-choice grading, retries and feedback; add the challenge type. [OW-34](#ow-34)
- [ ] Define quiz attempts, team answers, passing thresholds and rewards. [OW-35](#ow-35)
- [ ] Build quizzes with multiple rich questions and per-question points. [OW-35](#ow-35)
- [ ] Allow a quiz to be the challenge at a base. [OW-35](#ow-35)
- [ ] Allow game-wide quizzes that unlock after completing a base. [OW-35](#ow-35)

### Joining, discovery and shared documents

- [ ] Add team-size limits. [OW-05](#ow-05)
- [ ] Define lobby membership and safe rules for moving players between teams. [OW-05](#ow-05)
- [ ] Add a shared lobby with operator, automatic and player-choice team placement. [OW-05](#ow-05)
- [ ] Add admin controls for featuring games. [OW-06](#ow-06)
- [ ] Add public-game reporting/removal and uploaded listing artwork. [OW-06](#ow-06)
- [ ] Decide how to represent game areas for nearby discovery; implement that model. [OW-07](#ow-07)
- [ ] Scale discovery queries and refresh listings when publication changes. [OW-07](#ow-07)
- [ ] Make organization resources available to eligible game participants. [OW-08](#ow-08)
- [ ] Refresh shared documents when organizers change them. [OW-08](#ow-08)
- [ ] Decide whether players can save files for offline use. [OW-08](#ow-08)
- [ ] Define resource audiences and completion-based unlocks; apply access rules consistently. [OW-09](#ow-09)

### Field use, media and release checks

- [ ] Add browser QR scanning and define browser presence rechecks. [OW-03](#ow-03)
- [ ] Define camera-only challenges and supported media formats, including HEIC. [OW-10](#ow-10)
- [ ] Show upload progress for each file. [OW-10](#ow-10)
- [ ] Decide whether to support arrival detection while the app is in the background. [OW-11](#ow-11)
- [ ] Complete missing visual previews and review remaining styling inconsistencies. [OW-12](#ow-12)
- [ ] Refresh the store graphic, printed signs, social previews and exports with the current brand. [OW-13](#ow-13)
- [ ] Check native icons on devices and decide dark/tinted icon variants. [OW-13](#ow-13)
- [ ] Test real-phone account recovery, offline replay, push, check-in, sharing and accessibility. [OW-15](#ow-15)
- [ ] Verify the deployed landing-page and service-worker cache fixes. [OW-16](#ow-16)
- [ ] Recheck outstanding issues in the legacy apps while they remain supported. [OW-17](#ow-17)

### Backend and operational follow-ups

- [x] Record searchable game lifecycle audit events. [OW-14](#ow-14)
- [ ] Detect uploads stalled mid-transfer and give operators useful recovery actions. [OW-18](#ow-18)
- [ ] Decide when old single-request uploads can be retired safely. [OW-18](#ow-18)
- [ ] Fill meaningful native/E2E test gaps. [OW-19](#ow-19)
- [ ] Rehearse failure recovery and decide remaining infrastructure resilience work. [OW-20](#ow-20)
- [ ] Use generated thumbnails in the UI or stop generating unused ones. [OW-22](#ow-22)
- [ ] Provide a supported way to inspect and recover failed realtime events. [OW-23](#ow-23)
- [ ] Make realtime health figures cover all servers, or clearly label their scope. [OW-24](#ow-24)
- [ ] Decide whether unchanged snapshots should skip sending the full response. [OW-25](#ow-25)
- [x] Reconcile unused event types and inconsistent error codes. [OW-26](#ow-26)
- [ ] Verify and decide security controls on the HA ingress route. [OW-27](#ow-27)
- [ ] Verify the external uptime monitor runs automatically and delivers alerts. [OW-28](#ow-28)
- [ ] Restore a full-stack CI smoke gate and decide legacy Android's release-gate role. [OW-29](#ow-29)

### Longer-term product plans

These remain planned capabilities, after the nearer-term fixes above.

- [ ] Support solo participation. [PF-04](roadmap.md#capability-register)
- [ ] Let teams or individuals complete their own run while the game stays live. [PF-05](roadmap.md#capability-register)
- [ ] Support persistent trails with repeatable runs and durable history. [PF-06](roadmap.md#capability-register)
- [ ] Decide whether to introduce paid participation allowances. [PF-09](roadmap.md#capability-register)
- [ ] Add base-independent global challenges. [PF-12](roadmap.md#capability-register)
- [ ] Group games and shared information into multi-game activities. [PF-13](roadmap.md#capability-register)
- [ ] Add event-specific branding. [PF-14](roadmap.md#capability-register)
- [ ] Decide public profiles, achievements and whether organizers may compete in their own ranked games. [Details](#longer-term-planned-capabilities)

---

## Detailed scope and evidence
Consolidated documentation audit and owner testing feedback, 2026-09-12. Includes all 14 points from the owner's latest list. This register captures work and proposed sequencing; it is not an instruction to implement every item at once. **Missing** = no implementation found; **Partial** = a working foundation with a specific gap; **Decision** = behavior needs agreement; **Verify** = requires a fresh test or operational evidence; a user-reported symptom is identified explicitly even when its cause is unconfirmed. IDs are stable for merging feedback. Paths are relative to the repository; backend paths start at `backend/src/main/java/com/prayer/pointfinder/` unless stated otherwise.

## Proposed delivery order

The owner's mobile feedback leads the next product work. Preserve the other audit findings; an urgent reproduced access/security or reliability issue can interrupt this order.

1. **Protect continuity:** base/challenge draft loss (OW-04), reproduce/fix installed-iOS resume (OW-38), account-entry continuity (OW-01). These support every longer authoring or quiz flow.
2. **Simplify existing work:** challenge metadata/answer placement (OW-31/02), document viewer/editor (OW-08), failing-only readiness (OW-39), Home organizer continuation (OW-30), and paid-location gate verification (OW-37).
3. **Unify navigation:** Build/Monitor/Review and content-section shortcuts/chooser together (OW-32/36). Preserve routes and all existing results/review capabilities; expand the same UX on desktop.
4. **Extend game authoring:** content language (OW-33); stage-specific ordering together with working stage triggers (OW-40/21); multiple-choice question support (OW-34). Resolve each feature's backend contract before its dependent UI.
5. **Build on those foundations:** base-bound quizzes, then game-wide quizzes and completion unlocks (OW-35, PF-12). Lobby/capacity and broader resource audiences remain their own parallel product tracks.

For implementation, Codex owns UX/UI iteration; scoped backend contracts can go to Fable while frontend work proceeds. This consolidation itself does not dispatch implementation or request a UI handoff.

## Product and UX loose ends

### OW-01

**One account entry for playing and organizing.** Organize is available to organizer/admin accounts signed in through player entry. Entering it exchanges the account bearer for a separate operator session through `/api/account/organizer-session`, with a fresh server role check and native secret storage/browser refresh cookie. Participants remain refused. Failed exchanges offer retry; signing out or switching accounts during an exchange prevents adoption.

Status: Implemented; backend, component and browser/native-artifact smoke tests pass. Physical-device session checks remain OW-15.

### OW-02

**Answer checking as one coherent editor.** Accepted answers sit directly under the automatic-checking switch, before player instructions, and hide without being discarded when checking is off. Chips support in-place editing, keyboard/pointer suggestions for existing team-variable keys, and English/Portuguese/German labels. Pending input commits on blur, Save or editor exit; an earlier autosave cannot replace a chip being edited. Discard/use-latest clears pending chip input too. Unknown-variable warnings, rich-editor variable creation and per-team previews remain.

Status: Implemented in the shared browser/Tauri frontend; focused editor/input tests and browser/native-artifact smoke coverage. Base-description previews remain optional follow-up.

### OW-03

**Browser camera QR and presence flow.** `web/src/platform/qr.ts` refuses browser scanning. Define and implement the secure-browser QR path and how browser players satisfy challenges requiring an NFC presence recheck. Native NFC/QR code already exists; do not label all scanning missing.

Status: Missing / Decision.

### OW-04

**Preserve drafts when moving base → challenge.** Base and challenge editors persist account/game/entity drafts through the platform storage adapter and save valid changes in the background. Creating or opening a challenge waits for base validation and saving, including edits typed during the request. Errors retain the draft; recovery, discard, retry and changed-server-version choices are visible. Local storage failure is distinct from confirmed server saving. Refetched server changes are detected against the draft baseline; this is not server-side optimistic locking.

Empty-challenge creation persists a retry key before sending; V84 enforces one challenge per game/key, including concurrent retries. A pending operation retains the created challenge through link failure/reload. Creation and linking remain separate requests. Publishing, lifecycle transitions and deletion remain explicit.

Status: Implemented; focused persistence/editor tests, backend concurrency tests and browser/native-artifact smoke tests pass.

### OW-05

**Team capacity and lobby admission (PF-07).** No capacities/shared lobby/operator placement/automatic placement/player team choice yet. Sequence capacity → lobby → placement modes; preserve current team codes/QR and keep publication independent. Decide awaiting representation (player without team vs separate admission; avoid a fake lobby team), guest recovery, all-teams-full behavior, team deletion, who edits admission, and mid-game moves. Moves require explicit XP/roster rules and stale offline-action attribution; resolve current team server-side, refresh tokens through authenticated APIs, never send JWTs over realtime. Solo is a separate PF-04 decision.

Status: Decision / Missing.

### OW-06

**Operable public discovery (PF-07/08).** Admin list/feature/unfeature APIs exist, but no curation UI; reporting/removal moderation and uploaded listing artwork remain absent. `service/GamePublicationService.java`, `ExploreService.java`, `web/src/features/user-home/DiscoverySection.tsx`. Public profiles/achievements and XP-multiplier administration are separate optional work, not implied by discovery featuring.

Status: Partial.

### OW-07

**Area-based nearby discovery.** Publication UI saves no pinpoint, while nearby/map discovery depends on optional coordinates. Agree an area/approximate-location model so new listings can appear nearby without implying games occupy one point. `ExploreService` still filters/sorts/pages in memory; move this into bounded database queries when scale warrants. Listing changes have no realtime invalidation.

Status: Decision / Partial.

### OW-08

**Documents: read first, then edit.** Owner: tapping an organizer document opens a full-screen viewer on mobile, a large modal on desktop, with an explicit Edit action; editing uses the same generous surface and returns to reading on save. Reuse ResourceBrowser, rich renderer/editor and canonical modal/focus handling; retain permission, upload/sharing controls and draft recovery. `ResourceBrowser.tsx` currently expands editing inline in the list. Related audit gaps remain: organization-scoped player resources, realtime sharing refresh, and an explicit offline-file policy. Cached document bodies already work; file bytes are not stored offline. PF-10.

Status: Partial / Decision.

### OW-09

**Resource audiences and completion unlocks (PF-11).** Current access is shared flag + check-in/submission exposure, not approval/completion. Define player/operator/activity audiences and when a team unlocks content across lists, embeds, snapshots, signed URLs and caches. Nested HTML enrichment is already constrained to the visible resource map; do not reopen the fixed unrestricted-enrichment finding.

Status: Decision.

### OW-10

**Media capture and upload feedback.** `web/src/platform/media.ts` offers camera/library with no per-challenge camera-only policy or HEIC conversion. `packages/game-core/src/queue.ts` persists uploaded bytes, but `SyncBanner.tsx` exposes aggregate queue/failed actions, not per-file progress. Choose supported media/capture policy and finish useful transfer feedback.

Status: Partial / Decision.

### OW-11

**Background arrival detection.** Foreground location/dwell/claim code exists; background geofencing was deliberately deferred. Specify battery, permissions and reliability expectations before enabling it. `packages/game-core/src/arrival.ts` and player runtime.

Status: Missing / Decision.

### OW-12

**Visual coverage and map density.** Generated tokens, canonical panels/statuses and visual harness already exist. Complete useful missing fixtures from the [preview matrix](../visual-system/preview-matrix.md), then validate actual mobile journeys, both themes, long EN/PT/DE copy, focus and reduced motion. Team clustering is already implemented in `web/src/components/map/TeamMarkers.tsx`; the advisory audit now reports 16 findings (12 raw-color matches and four local surface styles), some intentional QR/tag fixture colors. Triage those instead of reviving the historical refactor list.

Status: Partial / Verify.

### OW-13

**Finish brand rollout.** The retained store feature graphic still uses the old compass mark and NFC-only wording. Refresh it from the approved mark/current product, then validate current store requirements. Printable signs, social previews and exports need deliberate brand adoption; native icons need device/store inspection. Legacy iOS dark/tinted icon variants remain a design decision. See [brand](../visual-system/brand.md) and [release checklist](../store-submission/release-checklist.md).

Status: Partial / Verify.

### OW-14

**Queryable lifecycle audit.** Tutorials teach go-live/revert, but lifecycle changes still need a durable game-level audit trail beyond logs. Existing team activity events and publication events do not substitute for this; preserve actor/reason/cutoff and avoid inventing a fake team to store it. `service/GameService.java`, `entity/ActivityEvent.java`.

Shipped 2026-09-16: `game_lifecycle_events` (V80) records every transition with actor, reason (`operator`, `scheduled_end`, `practice_expired`) and prior/new status; `GET /api/games/{id}/lifecycle-events` reads it.

Status: Implemented.

### OW-30

**Resume organizing from Home.** With no active playing game, Home offers the last accessible game actually opened in the current workspace. A bounded local history stores only game IDs, scoped by account and workspace. A fresh authorized lookup supplies the name/status and skips deleted or inaccessible entries; failed lookups offer retry. Active play stays primary, and a fresh ended-game snapshot yields to organizing. Discovery remains the fallback. Account-entry organizers can open the card through the existing separate operator-session exchange.

Status: Implemented and covered by history/account-race tests and browser/native-artifact smoke tests. Recency is local to this device; cross-device recency remains future work.

### OW-31

**Challenge description belongs in metadata.** The short description now sits below the title in challenge metadata, outside the long Player instructions section. Its player-facing use, test ID and save payload are unchanged.

Status: Implemented; editor and responsive browser/native-artifact smoke coverage.

### OW-32

**Three operator modes: Build, Monitor, Review.** Combine activity and leaderboard/results navigation: leaderboard is a reachable control within the monitoring/activity surface. Preserve detailed results, exports and ended-game access; moving navigation must not remove those capabilities. The workspace currently has `build`, `command`, `review`, `results` modes. Reuse existing surfaces and update route/test/tutorial consumers if internal identifiers change; copy need not rename domain modes.

Status: Partial.

### OW-33

**Game content language.** Add organizer-declared language for user-generated game/challenge content and show it where players choose/join a game, including discovery. This is separate from the app's EN/PT/DE interface preference; it does not promise automatic translation. No game-language field was found in `entity/Game.java`. Support an honest unknown value for existing games; decide multilingual content before claiming multiple translated versions. Include import/export and public metadata.

Shipped 2026-09-16: `games.content_language` (V81, ISO 639-1, blank = unknown) on game, explore, publication, join and snapshot responses plus import/export. The organizer field and the discovery/join display are still open.

Status: Backend implemented; UI missing.

### OW-34

**Multiple-choice challenges.** Existing `AnswerType` supports only text/file/none. Reuse rich question content/media and answer rendering/validation across standalone challenges and future quiz questions. Proposed first slice: one correct choice; single versus multiple correct selections, manual grading, retry and feedback policy still need definition. Use stable option identities, server grading and protected answer keys; preserve submission review, offline replay, game scoring and shared team credit.

Shipped 2026-09-16: `single_choice` and `multiple_choice` (V83) with stable option ids, server all-or-nothing grading, the answer key never sent to players, and one attempt per team and base (`CHOICE_ALREADY_ANSWERED`). Retries, partial credit and feedback stay with quizzes (OW-35). The option editor and player picker are still open.

Status: Backend implemented; UI missing.

### OW-35

**Quizzes (PF-15).** A collection of rich questions using text/multiple choice and images, with organizer-defined question points and a minimum passing score. A quiz can be a base's challenge or a game-wide objective, initially hidden and unlocked by completing a base. Reuse question authoring/grading instead of constructing artificial bases/assignments for every question. Define attempts/resume, team-shared answers versus an individual's draft, retries, optional manual review and threshold finalization. Distinguish quiz pass scoring, game-point awards and platform XP; passing must not accidentally award a base multiple times. Build multiple choice → base-bound quiz → game-wide availability (PF-12) and completion unlocks. Question/result visibility must not leak answer keys or hidden content.

Status: Missing / Decision.

### OW-36

**Direct entry to a calmer content panel.** In Build, expose shortcuts for bases, challenges, teams, stages, tags/codes and documents that open the existing drawer at that section. Use recognizable icons with labels/accessibility, not an unexplained icon strip. On mobile replace the drawer's crowded tab strip with the active section icon/name and one section chooser; at sufficient width retain visible tabs. Preserve list/detail back paths, selection, drafts and tutorial anchors. `web/src/features/build/ContentDrawer.tsx`, `web/src/stores/workspace.ts` already support `openDrawer(tab)`.

Status: Partial.

### OW-37

**Location check-in is a paid organizer capability.** Owner confirms Pro-only intent. Existing QuotaService already gates base/default creation, updates, import and go-live by the game's owning personal plan or organization plan, with explicit admin overrides; players do not need Pro. `QUOTA_ENFORCEMENT_ENABLED` defaults to false, and disabled enforcement intentionally allows all plans. Verify target environment settings and truthful upgrade affordances rather than adding a second frontend-only gate. Preserve the existing paid Club entitlement unless the owner separately changes organization packaging.

Status: Partial / Verify.

### OW-38

**Installed iOS app returns to Home after app switching.** Native startup now restores the previous authorized route after session hydration. Workspace selections are scoped by account/game, and operator/player map cameras are restored by identity/game. New navigation or gestures win over delayed storage reads; deep links and sign-out take precedence. Resume never replays a saved tag proof or changes the offline queue. Base/challenge drafts use OW-04 recovery.

Status: Restart behavior reproduced and covered by route/workspace/map regression tests. **Installed-iPhone verification remains open:** the affected build and original ordinary-background versus process/WebView-restart cause are unconfirmed; the paired-device connection timed out. Verify foreground return, OS termination/relaunch, expired auth and deep links on the installed build (OW-15). The checklist remains unchecked until that evidence exists.

### OW-39

**Readiness shows only blockers.** Setup lists only failed/missing checks, each opening the relevant editor or settings. Once ready, the checklist and progress ring disappear and Go live is offered directly. Loading and failed queries have distinct states and retry; relevant non-blocking notes remain visible. A failed launch keeps setup mode, shows the server error and refreshes checks. Only successful server validation switches to Monitor. Tutorial copy and preview fixtures reflect the simplified behavior; reduced motion is respected.

Status: Implemented; focused readiness tests and browser/native-artifact smoke coverage. Server go-live contracts are preserved.

### OW-40

**Stage-scoped base order.** Owner wants an exploratory stage followed by a linear stage, so enforce order at stage scope rather than across the entire game. Current `Game.enforceBaseOrder` and BaseOrderService apply globally. Define routes within each stage, un-staged/no-stage games, overlapping active stages, hidden prerequisites and transitions (OW-21); stage activation is distinct from visiting a route. Preserve existing ordered games through explicit migration/default behavior, plus import/export, snapshot hints, offline prerequisite ordering and setup-only structural changes. Suggested compatibility: retain a default route for games without stages and map existing ordering into stage settings when stages are introduced. Exact migration semantics require a focused contract.

Shipped 2026-09-16 (owner chose stage scope): `stages.enforce_base_order` (V82, backfilled from the game flag). A stage is one route numbered from 1; bases without a stage keep the game flag as the default route. Flag and structural route changes are setup-only once any route is enforced. Player data carries `stageId` and `routes[]`; the legacy pair is sent only for a single enforced route. The stage toggle in the editor is still open.

Status: Backend implemented; UI missing.


## Longer-term planned capabilities

Keep the existing PF IDs in the [roadmap](roadmap.md): **PF-04** solo participation; **PF-05** independent team/run completion; **PF-06** persistent/replayable trails; **PF-09** participation entitlements (only after approval); **PF-12** base-independent global challenges; **PF-13** multi-game activities; **PF-14** event branding; **PF-15** quizzes using shared question types (OW-34/35). These remain future product work, not regressions. Completion needs review/offline/leave/reset semantics before persistent runs or paid allowances. Operator participation in their own ranked game also remains a policy decision; current XP excludes creator participation.

## Verification gates

### OW-15

**Real-phone release journeys.** Expired account/player sessions, claim/conflict/recovery, secure storage, per-device push, force-stop/offline media replay, camera/gallery/video/denials, NFC/QR cold start, location/dwell/hidden bases, share/save, safe areas, keyboard and accessibility. Browser simulations and successful builds do not establish hardware parity. Include genuine WebSocket update assertions and required-presence journeys missing from current browser/native-shell E2E fixtures. Verify that needs-attention upload counts lead to useful operator recovery actions. Exact groups are in the [release checklist](../store-submission/release-checklist.md).

Status: Verify.

### OW-16

**Production landing/cache release.** Local nginx fixes exist for service-worker cache headers and missing-image 404s, but the September 11 audit did not establish the deployed revision or corrected normal URLs on both domains. Verify release/image, ordinary `sw.js` and HTML coherence, update activation and image errors. Purge only affected URLs if needed; never clear user storage/queued actions as the default recovery.

Status: Verify.

### OW-17

**Legacy app maintenance gaps.** The March gap list predates shared Tauri UI and many fixes. Recheck only shipping legacy journeys: readiness, validation/translated errors, expired upload recovery, localization, and operator navigation/review. Android presence gates and failed-queue retention, variable authoring and realtime code now exist; old missing-feature counts are not reliable. Retirement waits on OW-15, not cosmetic parity in every legacy screen.

Status: Verify.


## Audit disposition

All 54 visible docs files plus 12 ignored plan files and five ignored agent-state logs were inspected/inventoried. Removed specs, audits, handoffs and operational duplicates are recoverable from Git history where tracked; the pre-cleanup local snapshot is outside the repository. The logs contained tooling state, not product requirements. This pass checked implementation paths, not every old finding through runtime reproduction; uncertain claims stay **Verify**.

- Account/session/participation, XP, unified UX, discovery and player-documents specs → current [repository baseline](repository-context.md), compact [contracts](contracts.md), PF register and OW-01/05–09/15. Corrected stale “frontend not integrated”, V74 still pending, and end-only live-XP claims.
- Check-in, ordered-base, tutorial and realtime specs plus their implementation plans → implemented baseline/contracts; OW-03/04/11/14/15. The old missing reveals-base editor is now implemented. Route completeness is structural, not a forgotten readiness checkbox.
- Variable-authoring spec/plan → OW-02; most editor/preview/readiness work exists. The old register map-walk animation was superseded by the illustrated landing/auth direction; do not resurrect it as unfinished required UX.
- Native handoff, validation, phone review, media rollout, frontend consolidation, realtime/mobile and pre-release checklist → OW-03/10/11/15/17, platform ownership and release checks. Old machine-specific tooling failures and version-specific pass counts are not ongoing defects.
- Landing cache review → OW-16. Visual docs → current guidance, OW-12/13; removed the historical visual audit and “no harness/token source” readiness document. Store graphic retained but flagged as stale, not submission-ready.
- Backend/API/business/infrastructure and historical audit material → contracts, operations references and the backend follow-ups below. Historical compile failures fixed by the later test repair are not current failures. Applied migrations retain their historical spec comments unchanged to preserve Flyway checksums; those names refer to Git history, not current guidance. The root `TODO` remains a separate older note; its player-limit and all-games-for-admin claims are already contradicted by `PlayerJoinService` quota enforcement and `GameService.getAllGames` workspace filtering. Reproduce its navigation/billing complaints before carrying them into the owner's list.

## Backend and maintenance follow-ups

### OW-18

**Active-upload stalls and legacy upload retirement.** `GameSchedulerService` detects completed uploads left unlinked, not transfers stalled while active. Choose an active-stall threshold/recovery signal without deleting recoverable work. Decide when the legacy single-request upload endpoint can retire after shipping-client compatibility is checked.

Status: Missing / Decision.

### OW-19

**Remaining test coverage from the codebase audit.** Legacy Android instrumentation/Compose journey coverage has no `androidTest` source tree; E2E platform parity remains incomplete. Existing unit and Maestro coverage is useful, but does not close those gaps. Prioritize shipping journeys and the Tauri release checklist rather than adding tests that merely mirror implementation.

Status: Partial.

### OW-20

**Operational limits and rehearsals.** Use `deploy/ha/OPERATIONS.md` for existing multi-replica rollout, backups, restore and fencing evidence. Rehearse full authenticated native/offline reconnect and control-plane recovery as appropriate; component tests do not prove them. The two-location quorum risk and a third independent location remain architecture choices. Hetzner S3 is the live media store; Garage is a recovery archive, not unfinished automatic media failover.

Status: Verify / Decision.

### OW-21

**Trigger-based stage activation.** `TransitionType.trigger` and trigger-base settings exist, but no check-in/submission path activates a stage from that trigger. `StageService.activateStage` has no such caller; `BaseOrderService` only validates dependencies. Define the trigger semantics and implement the flow, or stop offering an inert option while preserving stored-data/API compatibility.

Shipped 2026-09-16: `StageService.openTriggeredStagesAfterCommit` activates trigger stages after the unlocking commit, from approved/correct submissions, mark-completed, or check-in when the game unlocks on check-in. Activation is idempotent.

Status: Implemented.

### OW-22

**Use generated thumbnails.** `service/ThumbnailService.java` produces `_thumb.jpg` objects, but no current frontend/API consumer was found. Serve authorized thumbnails in media/review lists or stop generating unused assets; preserve original files.

Status: Partial.

### OW-23

**Outbox failure recovery tooling.** Failed events can become retained dead-letter rows with a metric, but there is no supported inspection/replay UI/script or alert on that counter. Decide whether SQL-only intervention suffices; otherwise add a bounded, auditable operator procedure. `realtime/RealtimeOutboxRepository.java`, `service/jobs/ScheduledJobs.java`.

Status: Partial / Decision.

### OW-24

**Realtime health across replicas.** `RealtimeMetricsService` reports the responding process's sockets/counters. Aggregate fleet health or explicitly label the scope so two replicas do not produce misleading operator totals.

Status: Partial.

### OW-25

**Conditional snapshot responses.** The proposed `snapshot?lastSeenVersion=N` → 204 optimization is not implemented in `GameSnapshotController`. Optional bandwidth work; current full snapshots already provide correctness. Specify client/version semantics before adding it.

Status: Missing / Decision.

### OW-26

**Reserved event/error contracts.** `team_join` is not emitted; `STAGE_HAS_BASES`/`STAGE_ALREADY_ACTIVE` are not raised (deletion detaches bases, activation is idempotent). Some upload/audit/WebSocket codes are raw strings outside `ErrorCode`. Decide which are intentional reservations versus contract drift; synchronize consumers and tests rather than deleting enums blindly.

Shipped 2026-09-16: `team_join` is emitted on a first join; the two unraised stage codes were removed; upload codes live in `ErrorCode` with translations. `WS_ACCESS_DENIED` stays a STOMP frame code by design.

Status: Implemented.

### OW-27

**Security assumptions on HA ingress.** HAProxy sends API traffic directly to Spring, bypassing nginx's actuator deny and extra edge rate-limit zones. Spring still restricts non-health actuator endpoints to ADMIN, and application limiters remain in force. Decide whether HA ingress needs equivalent edge controls or whether the current posture is intentional; verify actual routes on both domains. This is a source-inferred difference, not an observed unauthenticated exposure. `deploy/ha/ingress-haproxy.cfg`, `config/SecurityConfig.java`.

Status: Decision / Verify.

### OW-28

**External uptime monitor scheduling.** The September 10 operations record says Cloudflare Cron Triggers did not fire; manual monitor tests did not prove scheduling. Verify provider scheduling/delivery and consider its shared failure domain with ingress/Resend. `deploy/ha/OPERATIONS.md` is the evidence source; no live probe ran in this audit.

Status: Verify.

### OW-29

**Restore a full-stack CI smoke gate.** `.github/workflows/ci.yml` still comments out `e2e-smoke`; local `e2e/run.sh smoke:web` remains available. Restore the gate when stable, with real WebSocket-delivered updates and required-presence flows represented. Decide legacy Android's release-gate role alongside the maintained-app retirement policy, not by assuming those apps are already retired.

Status: Decision / Partial.
