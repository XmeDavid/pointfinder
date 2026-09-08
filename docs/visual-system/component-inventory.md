# Component Inventory

Component: OnboardingExperience
Status: canonical
Location: `web/src/components/onboarding/OnboardingExperience.tsx`
Modes: Auth / Onboarding. One welcome world at `/welcome` (browser and native;
also the native anonymous home), in three audiences (`mode`): `anonymous`
visitors, signed-in `operator`, joined `player`. The public website itself is
unchanged; its Get started fades into the role choice (no map pan or zoom) and pricing opens the organizer gate (`?role=organizer`).
States: role choice (participant left, organizer right); organizer gate
(anonymous: Create an account / Sign in / See how it works first; operator:
Take a quick tour / Go to my dashboard); six chapters per role that play on
their own with a Pause / Resume auto-play toggle, or advance manually; landing per audience (participant: Join in the native app, iOS / Android downloads on the website; anonymous organizer: Create an
account + Sign in; operator: Create my first game when the dashboard is empty
and no `first-game` row exists, else Go to my dashboard; player: Back to your
game); Back to the choice from the first chapter and Change role (anonymous
only), Skip from any chapter, replay, language changes in place, loading and
failed graphics per branch, retry, static reduced motion, unavailable
preference storage, auto-play paused (after Back or the toggle), backgrounded
mid-pause, long German copy, both themes and safe-area-aware phone /
landscape layout.
Notes: The decorative 3D world fills the viewport. Localized DOM copy and canonical
buttons sit over the world on semantic canvas scrims; no text is baked into the
scene. Choosing "participating" opens the participant animation before the platform-specific
landing. Native builds offer `/join`; browser visitors get App Store and Google Play
links, including phone browsers. Joined players retain Back to your game. Settings
keeps the story under Help; choosing
"organizing" opens the gate on the organizer world's first frame, so nobody has
to register before watching. The choice only picks which story is told
(`branch` prop on the scene: `choice`, `participant`, `organizer`); it never
changes authentication, routes or permissions. Organizer chapters use short
chapter-specific transition labels (Place bases, Connect challenges, Invite teams,
Go live, Review results) that are educational only; nothing is created or set live.
Anonymous completion or Skip stores `{ version: 2, role }` under the v2 platform
key/value preference (never authentication storage) and, for the organizer story,
a one-shot handoff that the next registration or sign-in on the device claims;
choosing a role alone stores nothing, and earlier single-story visitors see the
role choice once. Late preference reads never override an interaction, and a
stalled read unblocks after 1.2 s. Operator completion, skip and "Go to my
dashboard" on the gate write the account's `introduction` row through
`web/src/features/introduction/progress.ts` (server-side, per account; a failed
write is owed locally and retried at the next sign-in); the first-game CTA starts
the guided tutorial on the dashboard and creates nothing itself. A branch change
shows the new branch's still until the renderer reports ready again and gives a
failed renderer a fresh attempt. Stills: `role-choice.webp`, `step-1..6.webp`,
`organizer-step-1..6.webp`, `step-7.webp` (compass). Test ids:
`onboarding-role-participant`, `onboarding-role-organizer`,
`onboarding-change-role`, `onboarding-gate-create-account`,
`onboarding-gate-watch`, `onboarding-tour-start`, `onboarding-tour-skip`,
`onboarding-landing-create-account`, `onboarding-first-game`,
`onboarding-dashboard`, `onboarding-dashboard-link`, `onboarding-player-back`,
`onboarding-autoplay` (`aria-pressed` true while chapters play on their own,
false while paused), plus the existing back / next / skip / replay ids;
`data-mode` and `data-step` (`choice`, `gate`, chapter ids, `compass`) on the root.
Auto-play (`useChapterAutoplay.ts`): with live animation, a chapter advances
to the next one 2.5 s after the renderer reports that its hold pose has been
drawn (`onSettled(frame)` from `sceneRuntime.ts` through `OnboardingScene`;
reports for any other frame, branch or renderer attempt are ignored, and the
hold drawn on the organizer gate counts for the first chapter that shares its
frame). It only ever moves chapter → chapter → landing: it never chooses a
role, leaves the gate, presses a landing action or changes a route. Back
pauses so the reader can reread; the toggle, choosing a role, Change role and
replay set it playing again; manual Next stays available and restarts the
wait; a language change restarts the wait for the new copy; backgrounding
(`platform/lifecycle`) cancels the wait and returning starts a full fresh one.
Reduced motion, previews, loading and failed renderers stay manual and hide
the toggle.
The world uses skinned characters from the reusable Blender asset library;
loading and reduced motion use matching rendered stills. Bone textures are
disposed on scene exit.
Motion policy (`sceneMath.ts`, `sceneMotion.ts`): chapter hops use three times the
authored 24 fps with a duration capped at 1.2 s of story time, eased in and out so every hold
pose is reached gently; the same plan runs forwards, backwards, for the compass
handoff and for Skip, which still only fades the scene on screen. Story time follows rendered wall
time but advances at most 0.25 s per drawn frame, so a slow renderer stretches a
hop rather than skipping its gestures. Runtime policy (`scenePerformance.ts`,
`sceneRuntime.ts`): drawing is paced at 30 fps; world materials stay opaque and
single-pass except during the world fade (both shader variants are warmed at
load); the pixel ratio starts at min(device, 1.5) and steps down to 1 (never lower,
the characters lose their detail) only when the median of six consecutive world
frames exceeds 50 ms, never back up (`data-pixel-ratio` on the scene host reports the current value).
Preview: `/dev/visual-system?onboarding=choice` for the role screen,
`?onboarding=gate` for the organizer account choice (`&mode=operator` for the
signed-in tour offer), `?onboarding=1` through `?onboarding=7` for participant
chapters, `?onboarding=1&role=organizer` (any 1–7) for organizer chapters, and
`&mode=operator|player` on any chapter or `7` for those audiences' controls;
fixtures never read or write onboarding completion or account progress. Use
browser reduced-motion settings for static frames and block `/onboarding/*` to
inspect graphics recovery.

Component: IntroductionCard
Status: canonical
Location: `web/src/features/introduction/IntroductionCard.tsx`
Modes: Operator / Tutorials library
States: not watched yet, watched, skipped (badge hidden while progress is
loading or failed; the Watch button always works), Watch / Watch again.
Notes: "How PointFinder works" leads the tutorials library and replays the
organizer story at `/welcome?play=organizer`. It is the account's
`introduction` row, shared with the guided tutorials' cache entry but never a
scenario card, a practice game or a first-game decision. Test ids:
`tutorial-introduction-card`, `tutorial-introduction-status`,
`tutorial-introduction-watch`.

Component: IntroductionPrompt
Status: canonical
Location: `web/src/features/player/components/IntroductionPrompt.tsx`
Modes: Player / Map
States: offered once after joining (hidden when the participant story was
already watched on the device, after Not now, after opening, or when
preferences cannot be read).
Notes: A SurfacePanel under the map header; it never blocks the map, a pending
tag or a queued action. Opens `/welcome?play=participant`, whose landing and
chapters lead back to the game. Settings keeps the story under Help
(`settings-how-it-works`). Test ids: `player-intro-prompt`,
`player-intro-prompt-open`, `player-intro-prompt-dismiss`.

Component: WelcomeCompass
Status: canonical
Location: `web/src/components/compass/WelcomeCompass.tsx`
Modes: Auth / Onboarding
States: native magnetic heading and physical tilt, spring-back touch drag, slow
idle turn (browser / unavailable / stale heading), background paused, reduced
motion static, light/dark, small phones. Decorative and hidden from assistive
technology; its cardinal letters are artwork, not navigation or player data.
Notes: Ports the legacy native rose geometry using existing semantic colors.
The scoped perspective and sonar rings belong to this onboarding illustration.
Sensors use `web/src/platform/orientation.ts`; no sensor/location permission
prompt or network access is introduced. Native sensors stop on page exit,
background and reduced motion. Vertical touch scrolling remains available.
Preview: `/dev/visual-system`, animated and static side by side.

Seed inventory for the first web visual-system remediation slice. This is not a
full audit; it records the canonical foundation added before larger refactors.

Component: StatusBadge  
Status: canonical  
Location: `web/src/components/status/StatusBadge.tsx`\
Modes: Operator Setup, Operator Command, Review, Results, Admin / Organization / Billing  
States: info, success, warning, destructive, muted, override  
Notes: Base status badge primitive. Uses semantic Tailwind tokens only.

Component: GameStatusBadge  
Status: canonical  
Location: `web/src/components/status/GameStatusBadge.tsx`\
Modes: Operator Setup, Operator Command, Results, Dashboard  
States: setup, live, ended  
Notes: Canonical decision for this slice: setup is info/blue, live is success/green, ended is muted/gray.

Component: SubmissionStatusBadge  
Status: canonical  
Location: `web/src/components/status/SubmissionStatusBadge.tsx`\
Modes: Review, Operator Command  
States: pending, approved, correct, rejected  
Notes: Centralizes submission review status color semantics.

Component: BaseProgressBadge  
Status: canonical  
Location: `web/src/components/status/BaseProgressBadge.tsx`\
Modes: Operator Command, Player Field  
States: not visited, checked in, submitted, completed, rejected  
Notes: Keeps checked-in as info/blue and submitted as warning/amber.

Component: SyncStatusBadge  
Status: canonical  
Location: `web/src/components/status/SyncStatusBadge.tsx`\
Modes: Operator Command, Player Field  
States: online, offline, sync pending, sync failed  
Notes: Web badge foundation only; native sync banners still need parity work.

Component: NfcStatusBadge  
Status: canonical  
Location: `web/src/components/status/NfcStatusBadge.tsx`\
Modes: Operator Setup, Player Field  
States: linked, missing  
Notes: Shared web badge for NFC availability/link state.

Component: OverrideBadge  
Status: canonical  
Location: `web/src/components/status/OverrideBadge.tsx`\
Modes: Operator Command  
States: override  
Notes: Uses the new semantic override token.

Component: ActivityEventBadge  
Status: canonical  
Location: `web/src/components/status/ActivityEventBadge.tsx`\
Modes: Operator Command  
States: check in, submission, approval, rejection  
Notes: Centralizes live activity event tones and labels.

Component: LocationSignalBadge  
Status: canonical  
Location: `web/src/components/status/LocationSignalBadge.tsx`\
Modes: Operator Command  
States: active, stale, no signal  
Notes: Centralizes operator location freshness semantics for leaderboard and map-adjacent UI.

Component: SurfacePanel  
Status: canonical  
Location: `web/src/components/layout/SurfacePanel.tsx`\
Modes: Authenticated product UI  
States: default, elevated, padding variants  
Notes: Default operational panel chrome with `rounded-lg`.

Component: OverlayPanel  
Status: canonical  
Location: `web/src/components/layout/OverlayPanel.tsx`\
Modes: Operator Command, map overlays  
States: padding variants  
Notes: Owns `bg-card/95`, border, overlay shadow, and backdrop blur for floating map/content panels.

Component: InspectorPanel  
Status: canonical  
Location: `web/src/components/layout/InspectorPanel.tsx`\
Modes: Operator Command, Operator Setup  
States: surface, overlay, title, subtitle, actions, footer, close action  
Notes: Shell only. Feature-specific inspector content should compose inside it in later slices.

Component: EmptyState  
Status: canonical  
Location: `web/src/components/feedback/EmptyState.tsx`\
Modes: All web modes  
States: default, compact, optional icon, optional action  
Notes: Existing component extended with className and density support.

Component: ErrorState  
Status: canonical  
Location: `web/src/components/feedback/ErrorState.tsx`\
Modes: All web modes  
States: message, optional retry  
Notes: Simple reusable error state for panels and screen regions.

Component: LoadingState  
Status: canonical  
Location: `web/src/components/feedback/LoadingState.tsx`\
Modes: All web modes  
States: labeled loading  
Notes: Simple reusable loading state for panels and screen regions.

Component: GlassPanel  
Status: legacy  
Location: `web/src/components/layout/GlassPanel.tsx`\
Modes: Operator Command, map overlays  
States: overlay surface  
Notes: May remain for existing map-overlay usage. New operational panels should prefer `SurfacePanel`; new floating overlays should prefer `OverlayPanel`.

Component: GameCard local status badge  
Status: needs refactor  
Location: `web/src/features/dashboard/GameCard.tsx`\
Modes: Dashboard  
States: setup, live, ended  
Notes: Migrated to `GameStatusBadge`; card shell itself remains feature-local.

Component: TopBar local status badge  
Status: needs refactor  
Location: `web/src/features/workspace/TopBar.tsx`\
Modes: Operator Setup, Operator Command, Review, Results  
States: setup, live, ended  
Notes: Migrated to `GameStatusBadge`; remaining mode-tab styling can be considered later.

Component: StatsBar  
Status: canonical  
Location: `web/src/features/command/StatsBar.tsx`\
Modes: Operator Command  
States: teams, pending, progress, elapsed, location visibility, notification action  
Notes: Uses `OverlayPanel` for command stat tiles and semantic warning/destructive pending tones.

Component: ActivityFeed  
Status: canonical  
Location: `web/src/features/command/ActivityFeed.tsx`\
Modes: Operator Command  
States: filtered, empty, export, pending review action, event types  
Notes: Uses `OverlayPanel`, `EmptyState`, and centralized activity event badges.

Component: Leaderboard  
Status: canonical  
Location: `web/src/features/command/Leaderboard.tsx`\
Modes: Operator Command  
States: collapsed, expanded, empty, selected team, active, stale, no signal  
Notes: Uses `OverlayPanel`, `EmptyState`, and centralized location signal semantics.

Component: BaseInspector  
Status: canonical  
Location: `web/src/features/command/BaseInspector.tsx`\
Modes: Operator Command  
States: selected base, NFC linked/missing, challenge list, team progress, rescue action entry  
Notes: Uses `InspectorPanel`, `BaseProgressBadge`, `NfcStatusBadge`, and `EmptyState`.

Component: TeamInspector  
Status: canonical  
Location: `web/src/features/command/TeamInspector.tsx`\
Modes: Operator Command  
States: selected team, rescue actions, success feedback, mobile sheet  
Notes: Uses `InspectorPanel`, `OverrideBadge`, and shared button/status primitives.

Component: BaseMarker  
Status: needs refactor  
Location: `web/src/components/map/BaseMarkers.tsx`\
Modes: Player Field, Operator Setup, Operator Command  
States: not visited, checked in, submitted, completed, rejected, hidden, selected, NFC missing  
Notes: Web marker colors now use semantic marker token classes in `components/map/markerStyles.ts`; full cross-platform marker parity remains future work.

Component: TeamMarker  
Status: needs refactor  
Location: `web/src/components/map/TeamMarkers.tsx`\
Modes: Operator Command  
States: active, stale, no signal, selected, clustered  
Notes: Web stale/no-signal styling now uses semantic tokens; clustering and cross-platform parity remain future work.

Component: PlayerFieldStatusBanner
Status: canonical
Location: `ios-app/dbv-nfc-games/Components/PlayerLiveComponents.swift`, `android-app/feature/player/.../PlayerLiveComponents.kt`
Modes: Player Field
States: info, pending/queued, success, danger, unknown
Notes: Native parity component for sync, presence, base progress, and submission feedback.

Component: PlayerMapHeader
Status: canonical
Location: `ios-app/dbv-nfc-games/Components/PlayerMapComponents.swift`, `android-app/feature/player/.../PlayerMapComponents.kt`
Modes: Player Field
States: live, notifications, refreshing, long game title
Notes: Compact semantic map overlay with native 44pt+ actions and accessible labels.

Component: PlayerMapLegend
Status: canonical
Location: `ios-app/dbv-nfc-games/Components/PlayerMapComponents.swift`, `android-app/feature/player/.../PlayerMapComponents.kt`
Modes: Player Field, map-adjacent operator compatibility
States: all base progress meanings, light/dark, long localized copy
Notes: Horizontally scrolls to preserve map context and avoid localization clipping.

Component: PlayerDetailMessage
Status: canonical
Location: `ios-app/dbv-nfc-games/Components/PlayerMapComponents.swift`, `android-app/feature/player/.../PlayerMapComponents.kt`
Modes: Player Field
States: locked, offline/no cache, empty assignment, caution
Notes: Canonical non-action detail state; never renders operator or scoring information.

Component: OperatorStatTile / OperatorConnectivityBanner
Status: canonical
Location: `ios-app/dbv-nfc-games/Components/OperatorLiveComponents.swift`, `android-app/feature/operator/.../OperatorLiveComponents.kt`
Modes: Operator Command
States: default, pending risk, progress success, offline/stale sync
Notes: Compact live-operational metrics and connection context using semantic adaptive roles.

Component: OperatorSubmissionCard / OperatorStatusBadge
Status: canonical
Location: `ios-app/dbv-nfc-games/Components/OperatorLiveComponents.swift`, `android-app/feature/operator/.../OperatorLiveComponents.kt`
Modes: Operator Command, Review
States: pending, approved/correct, rejected, media, long answer, long localized copy
Notes: Owns review-queue hierarchy and status semantics while review commands remain screen-owned.

Component: OperatorRescueActionButton / OperatorOverrideBadge
Status: canonical
Location: `ios-app/dbv-nfc-games/Components/OperatorLiveComponents.swift`, `android-app/feature/operator/.../OperatorLiveComponents.kt`
Modes: Operator Command
States: manual check-in, mark completed, grant override, remove override, audited override active
Notes: Wrap-safe 44pt+ controls. Confirmation dialogs and audit-producing API calls remain outside the component.

Component: OperatorMapLegend
Status: canonical
Location: `ios-app/dbv-nfc-games/Components/PlayerMapComponents.swift`, `android-app/feature/operator/.../OperatorLiveComponents.kt`
Modes: Operator Setup, Operator Command
States: all base progress meanings, light/dark, long localized copy
Notes: Scroll-safe map overlay preserving spatial context and status parity.

Component: SetupReadinessPanel
Status: canonical
Location: `ios-app/dbv-nfc-games/Components/SetupBuilderComponents.swift`, `android-app/feature/operator/.../SetupBuilderComponents.kt`
Modes: Operator Setup
States: ready, needs attention, partial, long localized copy, light/dark, Dynamic Type/font scale
Notes: Persistent five-part launch explanation. Screen-owned validation remains the authority for enabling launch.

Component: SetupSpatialSummary
Status: canonical
Location: `ios-app/dbv-nfc-games/Components/SetupBuilderComponents.swift`, `android-app/feature/operator/.../SetupBuilderComponents.kt`
Modes: Operator Setup
States: base count, NFC coverage, assignment count, map transition
Notes: Connects the readiness workspace directly to the existing native map-centered base editor.

Component: SetupResourceRow / SetupLaunchButton
Status: canonical
Location: `ios-app/dbv-nfc-games/Components/SetupBuilderComponents.swift`, `android-app/feature/operator/.../SetupBuilderComponents.kt`
Modes: Operator Setup
States: configured, attention, neutral configuration, disabled launch, enabled launch
Notes: Native 44pt+ management and lifecycle controls. Management screens, confirmation dialogs, launch command, and test identifiers remain screen-owned.

Component: GameLibraryCard / GameLibrarySummary
Status: canonical
Location: `ios-app/dbv-nfc-games/Components/GameLibraryComponents.swift`, `android-app/feature/operator/.../GameLibraryComponents.kt`
Modes: Operator game library
States: setup, live, ended, long title/description, light/dark, Dynamic Type/font scale
Notes: Operational lifecycle overview and game entry using the same semantic status meanings as command and setup.

Component: GameLibraryWorkspaceChip
Status: canonical
Location: `ios-app/dbv-nfc-games/Components/GameLibraryComponents.swift`, `android-app/feature/operator/.../GameLibraryComponents.kt`
Modes: Operator game library, organization workspace switching
States: selected personal workspace, selected organization, unselected, member/game detail, long localized copy
Notes: Native horizontal workspace selector; selection and data loading remain screen-owned.

Component: ManagementResourceRow / ManagementListSummary
Status: canonical
Location: `ios-app/dbv-nfc-games/Components/ResourceManagementComponents.swift`, `android-app/feature/operator/.../ResourceManagementComponents.kt`
Modes: Operator Setup, teams/resources
States: base NFC linked/missing, hidden base, challenge answer type/points/location, stage transition/active state, filtered counts, long localized copy
Notes: Canonical dense native row and list context for bases, challenges, stages, and future assignment/resource screens.

Component: ManagementTeamRow
Status: canonical
Location: `ios-app/dbv-nfc-games/Components/ResourceManagementComponents.swift`, `android-app/feature/operator/.../ResourceManagementComponents.kt`
Modes: Operator Setup, team management
States: user-defined team color, join code, copy action, copied confirmation, long team name
Notes: Team color remains user data. Navigation, clipboard mutation, feedback, creation, variables, and edit/delete flows remain screen-owned.

Component: ManagementEmptyState
Status: canonical
Location: `android-app/feature/operator/.../ResourceManagementComponents.kt`
Modes: Native operator management
States: no resources, no filtered results, optional description
Notes: Compose parity wrapper; SwiftUI management screens retain native `ContentUnavailableView`.

Component: ManagementAssignmentRow
Status: canonical
Location: `ios-app/dbv-nfc-games/Components/ResourceManagementComponents.swift`, `android-app/feature/operator/.../ResourceManagementComponents.kt`
Modes: Operator assignments
States: all teams, team-specific assignment, user-defined team color, points, destructive delete, long challenge/team names
Notes: Grouping, create pickers, duplicate validation, confirmation, haptics, and assignment API commands remain screen-owned.

Component: VariableCompletenessSummary
Status: canonical
Location: `ios-app/dbv-nfc-games/Components/ResourceManagementComponents.swift`, `android-app/feature/operator/.../ResourceManagementComponents.kt`
Modes: Operator team variables, challenge variables
States: no variables, partial values, complete values, many teams
Notes: Derived read-only context for variable editors. Variable keys, normalized team maps, validation, autocomplete references, and save commands remain editor-owned.

Component: ManagementEditorSummary
Status: canonical
Location: `ios-app/dbv-nfc-games/Components/ResourceManagementComponents.swift`, `android-app/feature/operator/.../ResourceManagementComponents.kt`
Modes: Operator base, challenge, and stage editors
States: create/edit, ready/incomplete, location/NFC/visibility, points/answer type, transition/assigned bases, long localized copy
Notes: Persistent read-only editor context. Native fields, validation, map interaction, rich text, destructive confirmation, API commands, and automation identifiers remain screen-owned.

Component: ResultsSummary / ResultsStat
Status: canonical
Location: `web/src/components/results/ResultsSummary.tsx`
Modes: Results, Billing, Administration
States: neutral metric, success, pending attention, responsive two/four-column layout
Notes: Shared operational metric hierarchy; result derivation, billing calculations, and admin queries remain feature-owned.

Component: BroadcastPanel
Status: canonical
Location: `web/src/components/broadcast/BroadcastPanel.tsx`
Modes: Public live viewer
States: titled/untitled, map, podium, team list, base grid, empty, mobile/desktop
Notes: Owns broadcast surface chrome and responsive containment while realtime, polling, privacy filtering, and map behavior remain feature-owned.

Component: ManagementNotificationRow
Status: canonical
Location: `ios-app/dbv-nfc-games/Components/ResourceManagementComponents.swift`, `android-app/feature/operator/.../ResourceManagementComponents.kt`
Modes: Operator notifications
States: all teams, specific team, unknown team, relative timestamp, long message
Notes: Sending, targeting, refresh, API commands, and automation identifiers remain screen-owned.

Component: OrganizationWorkspaceSummary
Status: canonical
Location: `ios-app/dbv-nfc-games/Components/ResourceManagementComponents.swift`, `android-app/feature/operator/.../ResourceManagementComponents.kt`
Modes: Organization management
States: tier, member count, no/live games, long name/slug
Notes: Permissions, invitations, removal confirmation, and membership APIs remain screen-owned.

Component: QrScannerOverlay
Status: canonical
Location: `web/src/features/player/components/QrScannerOverlay.tsx`
Modes: Auth / Onboarding, Player Field
States: scanning, cancel, join caption, base check-in caption
Notes: Tauri windowed-camera chrome with a safe-area-aware Back action and transparent scan target. The caller supplies `caption` and an optional `testId`; the default test id stays `player-qr-scanner` and the Back action keeps `player-join-scan-back-btn`. Camera permission and scanner lifecycle remain in the platform boundary.

Component: NfcLinkControl
Status: canonical
Location: `web/src/components/nfc/NfcLinkControl.tsx`
Modes: Operator Setup
States: unlinked, linked, writing, success, write failure, audit-link failure
Notes: Reusable Tauri NFC write-and-link action used by the NFC content tab and individual base details. Native writing stays in the platform boundary and the server link remains audited.

## Shared base primitives (2026-09-04)

Component: BaseSequenceBadge
Status: canonical
Location: `web/src/components/status/BaseSequenceBadge.tsx`
Modes: Operator Setup, Operator Command, Player Field
States: numbered, unnumbered, long route number, light/dark, localized accessible label
Notes: A base's one-based route number is separate from its progress or NFC state.
Used beside existing status components in lists, details, and map markers.
Preview: `/dev/visual-system`. See `docs/specs/2026-09-05-enforced-base-order.md`.

Component: BaseRouteNotice
Status: canonical
Location: `web/src/features/player/components/BaseRouteNotice.tsx`
Modes: Player Field
States: next base, previous base required, completed route, hidden destination,
provisional offline frontier, unavailable route authority, long localized copy
Notes: Recovery links and titles use visible player progress only. Hidden bases
can be referenced by route number without disclosing their identity or location.
Preview: `/dev/visual-system`.

Component: ChallengeDetail — Reveals bases
Status: canonical
Location: `web/src/features/build/ChallengeDetail.tsx` (section `unlocks-section`)
Modes: Operator Build
States: needs pin and location bound (hint), no hidden bases (hint), toggles per hidden
base (aria-pressed), saved with the challenge
Notes: Mirrors the backend rule that unlock targets need a pinned, location-bound
challenge and hidden target bases; the challenge's own base is never offered. Test ids:
`unlocks-bases`, `unlocks-base-{baseId}`, `unlocks-hint`.

Component: QuickFilters
Status: canonical
Location: `web/src/components/data/QuickFilters.tsx`
Modes: Operator Build (Bases and Challenges drawer tabs)
States: no group with options (renders nothing), single-select row (radiogroup
with an "All" radio), multi-select row (toggle chips), coloured tag chips (tag
colour with WCAG-derived text when pressed; theme text plus a colour dot when
not, since the palette is readable only as a background), nothing chosen (no
Clear), something chosen (Clear resets every row and keeps focus on the row),
long labels (chips truncate), 24 px minimum hit target
Notes: Bases offers a Stage row only when the game has stages (ordered by
`orderIndex`, membership from `Stage.baseIds`, plus "No stage" when a base
belongs to none) and a Tags row when the game has tags; Challenges offers Tags.
Tag chips match any chosen tag; the stage chip and the search combine with
them. The tabs prune a chosen id that no longer has a chip, so a deleted tag or
a vanished "No stage" never keeps filtering. The tab shows `bases.noResults` /
`challenges.noResults` when filters empty a non-empty list. Test ids:
`quick-filters`, `filter-{group}-all`, `filter-{group}-{optionId}`,
`filter-stage-none`, `quick-filters-clear`. Storybook: `Data/QuickFilters`.

Component: ChallengePicker
Status: canonical
Location: `web/src/components/data/ChallengePicker.tsx`
Modes: Operator Build (assignment grid cells, base sheet on phones)
States: empty ("—"), chosen, dimmed (column the base does not use), disabled
(read-only game, write in flight), open list with search, row meta (points,
answer type, location-bound, pinned, tag dots), rows that cannot be picked with
the reason ("At {base}"), no match, "No challenge" row
Notes: Replaces the native select in assignment cells so a challenge is
findable in a game with dozens: the trigger keeps the cell's test id and
carries `data-value`; the list opens as a dialog (a bottom sheet on phones).
Test ids: `{testId}`, `challenge-picker-search`, `challenge-option-none`,
`challenge-option-{challengeId}`, `challenge-picker-empty`. Storybook:
`Data/ChallengePicker`.

Component: AssignmentGrid
Status: canonical
Location: `web/src/features/build/assignments/AssignmentGrid.tsx`
Modes: Operator Build (table from the md breakpoint up, base list plus per-base sheet below it)
States: empty (no bases, no challenges), all-teams base, per-team base, mixed
grid, converting per-team to all-teams (confirm), refused write (inline reason),
read-only after the game ended, long team and challenge names, phone (horizontal
scroll with sticky base column)
Notes: Rows are bases in route order; columns are "All teams" plus one per team;
each cell is a native select with only the challenges unused in that column.
Every change sends the complete next list through the bulk-set endpoint.
`ChallengeAssignmentSection` and `BaseAssignmentSection` are the same model seen
from one challenge or one base. Test ids: `assignment-grid`,
`assignment-cell-{baseId}-{all|teamId}`, `assignment-grid-error`.

The base primitives (Button, Badge, Alert, Card, Input, Textarea, Label, FormLabel,
Select, Switch, Tabs, Dialog, ConfirmDeleteDialog, DropdownMenu, Collapsible,
Tooltip, Skeleton, Toast) live in `web/src/components/ui/`, with the toast hook
in `web/src/hooks/useToast.ts`. Storybook runs with `bun run storybook` at the
repository root. Both browser and Tauri targets use these same components and
`web/src/theme/theme.css`; generated variables come from
`web/src/generated/design-tokens.css`. Product components live in the same
frontend and should be reused across features.
## Phone drawer list/detail (2026-09-05)

Component: ListDetailLayout
Status: canonical
Location: `web/src/components/layout/ListDetailLayout.tsx`
Modes: Operator Setup
States: list, selected detail, empty/loading/error list content, desktop split view
Notes: Phones show one pane at a time with a localized Back action. Desktop keeps
the list beside the detail. Selection and mutations remain feature-owned. Used
by bases, challenges, teams, and stages. Preview: `/dev/visual-system`.

## Check-in methods (2026-09-05)

Component: CheckInMethodBadge
Status: canonical
Location: `web/src/components/status/CheckInMethodBadge.tsx`
Modes: Operator Setup, Operator Command
States: NFC, QR, LOCATION; badge and icon-only variants; small and medium sizes
Notes: New status meaning for this slice — NFC is info/blue (tag and base signal),
QR is override/indigo (secondary category), LOCATION is success/green (presence
proven). Icons are lucide `Nfc`, `QrCode` and `MapPin`; they are intentionally
not added to `design-system/icons.json`, whose generators also feed the legacy
Swift and Compose apps that cannot play QR or location bases. Icon-only usage
always carries a localized `aria-label`. Preview: `/dev/visual-system`.
See `docs/specs/2026-09-05-check-in-methods-design.md`.

Component: CheckInVerificationBadge
Status: canonical
Location: `web/src/components/status/CheckInMethodBadge.tsx`
Modes: Operator Command
States: claimed (warning/amber), operator (override/indigo); verified renders nothing
Notes: A VERIFIED row is the norm and would add noise to every feed line, so only
the exceptional verifications are shown. Sits beside `ActivityEventBadge` in the
live feed and beside the method badge in the team inspector proof block.
Preview: `/dev/visual-system`.

Component: QrCodeSvg
Status: canonical
Location: `web/src/components/common/QrCodeSvg.tsx`
Modes: Operator Setup
States: encoded, unencodable value (renders nothing), sized, titled/decorative
Notes: Drawn as real SVG elements from the `qrcode` package's synchronous bit
matrix, so nothing is injected as raw HTML and codes render offline. Paints
literal black on white rather than semantic tokens because a QR code must stay
dark-on-light in both themes and on paper — recorded in
`design-system/decisions.md`. Preview: `/dev/visual-system`.

Component: CodesPrintSheet
Status: canonical
Location: `web/src/components/common/CodesPrintSheet.tsx`
Modes: Operator Setup
States: closed, open with one page per code, empty code list, Escape/close chrome
Notes: Body-level portal with a scoped print rule so a single sheet can hide the
rest of the operator workspace without touching the global stylesheet. One page
per code carrying the base name, the code, and the game name. Used by the base
detail (single code) and the Tags & codes tab (all QR bases).

Component: LocationPicker radius ring
Status: canonical
Location: `web/src/components/map/LocationPicker.tsx`, `web/src/components/map/circleGeoJson.ts`
Modes: Operator Setup
States: no radius, radius ring, unplaced base (no ring)
Notes: The check-in radius is drawn as a faint info-toned fill and line from a
GeoJSON polygon approximation. Geometry is a pure, tested function; the map
component stays a thin renderer.

## Player check-in methods (2026-09-05)

Component: LocationCheckInPanel
Status: canonical
Location: `web/src/features/player/components/LocationCheckInPanel.tsx`
Modes: Player Field
States: locating, permission denied with open-settings, far (distance), near but
inexact (accuracy), arrived, sensor unavailable, claim disabled with hint, claim
enabled, claim busy, long localized copy
Notes: Reads the shared player location store; it never starts a watch of its own.
The panel reports, it does not check in: the runtime arrival detector owns the
automatic proof. "I'm here" sends a claimed geo proof with the dwell buffer and is
disabled until the dwell rule passes. Test ids `player-location-panel` and
`player-im-here-btn`. See `docs/specs/2026-09-05-check-in-methods-design.md`.

Component: ArrivalToast
Status: canonical
Location: `web/src/features/player/components/ArrivalToast.tsx`
Modes: Player Field
States: synced named base, synced hidden base discovered, queued offline without a
name, several notices stacked, dismissed, long localized copy
Notes: Rendered once above the router outlet in `TagIntake`, so an arrival that
happens on the map, in the logbook, or at another base is never missed. Notices
come from `web/src/app/player/arrivalNotices.ts`; the component holds no timers and
adds no entrance animation, so reduced-motion behaviour is unchanged. Test id
`player-arrival-notice`.

## Guided tutorials (2026-09-06)

Component: Spotlight
Status: canonical
Location: `web/src/components/tour/Spotlight.tsx`
Modes: Operator Setup, Operator Command
States: no anchor (renders nothing), small control anchor, full-width map anchor,
reduced motion (no fade)
Notes: A body-level portal on the `z-[70]` tutorial layer holding one SVG whose
mask is the viewport minus a rounded rectangle over the anchor rect, padded 8 px.
Fills with `var(--pf-color-surface-tourScrim)`, the lighter tour scrim, so light
and dark both dim without hiding the map. `pointer-events-none` end to end — the
tour dims, it never blocks, and the operator can wander off at any moment. Test
ids `tour-spotlight` and `tour-spotlight-hole`. Preview: Storybook
`Tutorials/Spotlight`. See `docs/specs/2026-09-06-operator-tutorials-design.md`.

Component: CoachBubble
Status: canonical
Location: `web/src/components/tour/CoachBubble.tsx`, `web/src/components/tour/placement.ts`
Modes: Operator Setup, Operator Command
States: default (no buttons — the step completes by doing the thing), ack step
with Next, final step with Got it, with aside, with "I'll do it later", long
German copy, desktop floating (right / left / below collision flipping), desktop
centred (no anchor), mobile bottom sheet, reduced motion, inline (stories and
harness)
Notes: Built on `OverlayPanel` so the blur comes from the canonical surface
rather than a feature file. `role="dialog"`, `aria-live="polite"`, labelled by
its own title. It takes focus when a step starts unless the operator is typing
in a field, in which case the field keeps focus. Escape pauses only while focus
is inside the bubble, so it never fights the drawer and dialogs that also close
on Escape. Placement is the pure `placeBubble` helper — right, else left, else
below, always clamped to the `--safe-*` insets exactly like the floating menu in
`components/ui/dropdown-menu.tsx`. Below `md` it becomes a bottom sheet reserving
the 56 px mobile tab bar, capped at 45dvh with internal scroll so German copy
scrolls instead of clipping. Test ids `tour-bubble`, `tour-bubble-title`,
`tour-bubble-body`, `tour-bubble-aside`, `tour-next`, `tour-later`, `tour-close`.
Preview: Storybook `Tutorials/CoachBubble` and `/dev/visual-system`.

Component: TourPill
Status: canonical
Location: `web/src/components/tour/TourPill.tsx`
Modes: Operator Setup, Operator Command
States: mid-scenario, last step, paused, inline
Notes: The collapsed tour. Shown when the operator paused, or when the current
anchor is not rendered or is fully off screen, so a tutorial never points at
nothing. Bottom centre, clear of the mobile tab bar, on the `z-[70]` layer.
Resuming navigates back to the step's screen if the operator wandered, then
re-runs the step's `prepare`, which is what brings the anchor back. Test ids
`tour-pill`, `tour-pill-resume`. Preview: Storybook `Tutorials/TourPill` and
`/dev/visual-system`.
