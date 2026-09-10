# Component Inventory

Component: OnboardingExperience / StoryIllustration
Status: canonical
Location: `web/src/components/onboarding/OnboardingExperience.tsx`, `StoryIllustration.tsx`
Modes: Auth / Onboarding. `/welcome` in browser and native; also the native
anonymous home. Anonymous visitors choose participant or organizer; signed-in
operators and joined players retain their own entry and exit actions.
States: role choice; organizer account/tour gate; four participant and three organizer illustrated chapters; landing; Back, Next, Skip, replay and role changes; tappable progress
dots; horizontal swipe (vertical scroll/pinch retained); keyboard focus moves to
the new heading; image loading, failed image with retry, reduced motion,
preferences unavailable, late preference reads, EN/PT/DE, light/dark, safe areas,
small phones and landscape. Long copy can scroll vertically rather than overlap art.

Transparent diorama art blends directly into the theme canvas, with no image card,
frame or tinted backdrop. It occupies a separate region above copy on phones,
beside it on larger screens; use contain to keep every subject intact.
Controls never overlay character faces. Use canonical buttons and semantic tokens.
Images are decorative; all instructional text and navigation are localized DOM.
There is no WebGL import, autoplay, sensor use or image-dependent navigation gate.
Only a brief CSS entrance transition animates, disabled for reduced motion.
Eight generated WebP scenes live in `web/public/onboarding/stories/` and are bundled
with Tauri for offline use. Source images/prompts and retired public 3D assets are
preserved in `artifacts/onboarding-stories-v1/`; Blender work remains available.

Participant: join → map → checkin → challenge. Organizer: plan (including bases and
challenges) → teams → live. The final landing retains the `compass` state name for
compatibility, with the last illustration. The welcome choice reuses the exploring
scene; the organizer gate and merged planning chapter use the bases scene. Dots navigate chapters only;
landing actions always require an explicit click. Choosing a role never changes
authentication, routes, permissions or game state.

Existing persistence remains: anonymous completion/Skip stores `{ version: 2, role }`
in the platform v2 preference; choosing alone stores nothing. A late read cannot
undo interaction; stalled reads unblock after 1.2 s. Existing completed visitors
retain their landing. Anonymous organizer completion still hands off to the next
registration/sign-in. Operator completion/skip uses the account `introduction`
progress row and its existing retry behavior. First-game handoff creates nothing
by itself. Joined players retain Back to your game. Native participants get `/join`;
browser participants get store download links; organizers get account actions or
their dashboard. Help and Tutorials retain replay entry points.

Test IDs: existing role, gate, tour, landing, dashboard, player-back, back/next/skip/
replay IDs remain. `onboarding-dot-1`–`4` are new. `onboarding-scene` now identifies
the image region (`data-state` loading/ready/error); `onboarding-autoplay` is retired.
Preview: `/dev/visual-system?onboarding=choice`, `?onboarding=gate`, or
`?onboarding=1`–`5` for participants or `1`–`4` for organizers (chapters and landing); `&role=organizer`,
`&mode=operator|player` retain their meanings. Previews never persist completion.
Block `/onboarding/stories/*` to inspect image recovery.

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

Component: DocumentsScreen / DocumentScreen
Status: canonical
Location: `web/src/features/player/DocumentsScreen.tsx`, `web/src/features/player/DocumentScreen.tsx`
Modes: Player Field
States: loading, empty, error with retry (only when nothing is shown yet),
cached offline (file rows become focusable `aria-disabled` buttons reading
"Needs a connection", documents still open), storage off ("Unavailable right
now"), file opening (busy), document missing, long names (truncated rows,
wrapping title). Document bodies use `dark:prose-invert`.
Notes: Lists what the team may see now: resources shared with players plus
embeds behind the team's check-ins and submissions, in backend order. Files
open in a new tab in the browser and through the system opener on native; a
link older than 45 minutes is refreshed first because presigned URLs expire.
Documents render inline through `RichContent`. Reached from the map header
(`player-documents-btn`). Test ids: `documents-list`, `documents-empty`,
`documents-offline-hint`, `document-<id>`, `document-body`,
`document-missing`.

Component: BrandMark / BrandLockup / BrandTile
Status: canonical
Location: `web/src/components/brand/BrandMark.tsx`
Modes: All. Public website, auth, welcome world, operator shell, player settings.
States: mark alone (16–96 px), mark with the localized wordmark, reversed mark
on the brand tile, `tone="brand"` (theme-aware positive/reversed one-color) and
`tone="current"` (inherits the surrounding text color), informative (`role="img"`,
named “PointFinder”) or `decorative` (hidden when adjacent text names the brand),
both themes.
Notes: Path data comes only from the generated `web/src/generated/brandMark.ts`
(source `design-system/brand/pointfinder-mark.svg`); screens must not carry
their own copy, and `make design-system-check` flags drift. Never use it for
pins, headings, scan actions or loading/sync state; functional compass and map
icons keep their meanings. Emits no ids, titles or descriptions. Storybook
`Brand/BrandMark`; harness section “Brand mark, lockup, tile and small sizes”.
See `brand.md` for placement rules and the export pipeline.

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

Component: BillingCycleToggle  
Status: canonical  
Location: `web/src/components/ui/billing-cycle-toggle.tsx`\
Modes: Public / Marketing, Admin / Organization / Billing  
States: monthly selected, yearly selected, long translated labels  
Notes: The only billing-cycle segmented control. Shared by the landing pricing
card and `BillingTab`, so both offer the same choice with the same affordance.
Its `monthly` / `yearly` value is presentation; `CHECKOUT_CYCLE` in
`web/src/lib/pricing.ts` maps it to the `monthly` / `annual` cycle the checkout
API expects. Prices are never literals: `formatPrice` renders them through
`Intl.NumberFormat` in the reader's language. Preview: Core/BillingCycleToggle.

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

## Public homepage (2026-09-08)

Mode: Public / Marketing. Route `/` on the browser build (native builds open
the welcome world instead). Source: `web/src/features/public/LandingPage.tsx`
with `web/src/features/public/landing/`. Scoped styles live in the "Public
website" block of `web/src/index.css`.

Component: LandingHeader
Status: canonical (public site only)
Location: `web/src/features/public/landing/LandingHeader.tsx`
Modes: Public / Marketing
States: desktop nav, phone menu (closed / open, Escape returns focus to the
toggle, closes on link click and when the viewport crosses `md`), language
select, theme toggle (writes the same `pointfinder-theme` preference as the
app), login, Get started
Notes: Always evergreen so it sits on the forest hero. Test ids
`landing-menu-toggle`, `landing-menu`, `landing-language`,
`landing-theme-toggle`. Exports `BrandMark`, `LanguageSelect`, `ThemeToggle`.

Component: Artwork
Status: canonical (public site only)
Location: `web/src/features/public/landing/Artwork.tsx`
Modes: Public / Marketing
States: loaded, failed (the description replaces the picture as text, test id
`landing-artwork-fallback`, optional "Screenshot unavailable" label)
Notes: Every homepage picture goes through it with explicit dimensions and a
usable alt. Only the hero is eager / high priority; the rest is lazy.

Page structure and palette:

- Personal pricing opens on Monthly (€3.99/month), with Monthly first in the
  billing toggle and an annual-savings offer. Selecting Yearly shows €30/year
  and the saving against twelve monthly payments; all copy is localized. The
  toggle is the canonical `BillingCycleToggle`, and both amounts come from
  `web/src/lib/pricing.ts`, so the operator billing tab offers exactly the same
  two prices. The club card quotes no price: it links to the shared contact
  address in `web/src/lib/contact.ts`.
- Five bands: forest hero (`.landing-dark`), cream three-step explanation
  (`.landing-cream`), evergreen organizer band with the pointing guide and the
  real Command workspace as independent layers, compact pricing (theme-aware),
  and the forest call to action whose feet hold the footer.
- Below `md`, hero actions sit at the bottom with space after the introduction
  to keep the scouts' faces clear. A bottom scrim supports the action note;
  translated copy and wrapping buttons expand the hero without clipping.
- `.landing-page` re-maps the semantic surface tokens to the marketing palette
  (`dataColor.atlasCream*`, `atlasEvergreen*`, `atlasInk`, `atlasMist`,
  `atlasMint`) so canonical buttons, badges and cards keep their shape. The
  evergreen and cream bands are the same in both themes; only the pricing band
  follows the app theme. See `design-system/decisions.md`.
- Mascot clothing artwork is owned by `artifacts/landing-mascot-v2/`; original scenery
  and workspace assets remain in `artifacts/landing-illustrated-v1/`. Artwork is imported to
  `web/public/landing/illustrated/`. The workspace screenshot shows a fictional
  game in Costa de Lavos, Portugal, and carries an OpenStreetMap / CARTO
  attribution caption (test id `landing-map-attribution`).
- Get started keeps the 220 ms fade into `/welcome` (immediate under reduced
  motion, modified clicks untouched); pricing goes to `/welcome?role=organizer`;
  the club card, login, store, FAQ and privacy routes are unchanged.
- Coverage: `web/src/features/public/LandingPage.test.tsx` and
  `web/e2e/homepage.spec.ts` (phone menu from the keyboard, three languages,
  both themes, 320–1600 px without horizontal overflow, reduced motion, images
  blocked, hero crop keeps the whole scene, every illustration is the imported
  file).

Component: OrgSettingsSection  
Status: canonical  
Location: `web/src/features/org/OrgSettingsSection.tsx`\
Modes: Admin / Organization / Billing  
States: unchanged name (save disabled), empty name (save disabled), saving,
saved, failed rename, creator danger zone, delete confirm, failed delete.
Notes: Club rename and delete, on the members page so every membership
decision sits on one surface. Rename needs `MANAGE_PERMS` or the creator;
delete is the creator's alone and goes through the shared
`ConfirmDeleteDialog`. A successful delete switches the workspace back to
personal and returns to the dashboard. `MemberPermissionsDialog` beside it now
composes the canonical `Dialog`, so it traps focus, closes on Escape and
reports a failed save. Test ids: `org-settings`, `org-name-input`,
`org-rename-save`, `org-rename-saved`, `org-danger-zone`, `org-delete-btn`,
`member-permissions-dialog`, `member-permissions-save`.

## Sales-led clubs (2026-09-09)

Mode: Admin / Organization / Billing. A club is agreed with us, stood up by an
admin, and invoiced; its own members read what it has paid for and manage their
membership. Dense, calm, recoverable: every write says what it will do before
it does it, and a refusal stays where the values were typed.

Component: ClubLimitsFields
Status: canonical
Location: `web/src/features/admin/ClubLimitsFields.tsx` with
`web/src/features/admin/clubLimits.ts`
Modes: Admin / Organization / Billing
States: value (number input), unlimited, tier default, on/off for the
location-check-in flag, invalid number (inline message, save blocked),
disabled while saving
Notes: The agreed limits of a club deal, one row per quota override key, used
unchanged by the creation dialog and the club detail. `clubLimits.ts` owns the
standard deal and the mapping in both directions: a number caps the limit,
"unlimited" sends an explicit JSON `null`, "tier default" omits the key. Byte
limits are entered in gigabytes. `unmanagedOverrides` keeps a per-deal key the
form cannot express so a save does not drop it. Test ids
`club-limits`, `club-limit-<key>-mode`, `club-limit-<key>-value`.

Component: NewClubDialog
Status: canonical
Location: `web/src/features/admin/NewClubDialog.tsx`
Modes: Admin / Organization / Billing
States: empty (submit disabled), invalid limit (submit disabled), submitting,
failed (inline error), created-with-attached-admin, created-with-invitation
Notes: Opened from "New club" on the admin organizations list. Carries the
club's name, its administrator's email, an optional term end and internal note,
and the limits pre-filled with the standard deal. The result step says which of
the two paths the administrator took and offers to open the club. Test ids
`admin-new-club`, `new-club-dialog`, `new-club-name`, `new-club-admin-email`,
`new-club-term-end`, `new-club-note`, `new-club-submit`, `new-club-error`,
`new-club-result`, `new-club-open`.

Component: IssueInvoiceDialog
Status: canonical
Location: `web/src/features/admin/IssueInvoiceDialog.tsx`
Modes: Admin / Organization / Billing
States: incomplete (submit disabled), confirmation line, sending, failed
(inline error, dialog stays open so the amount is not retyped)
Notes: Bills a club for an agreed term. The amount is entered in euros and sent
in cents; the confirmation line spells out the amount, the days until due and
the months of term, because submitting sends a real invoice. Backend refusals —
`INVOICE_STRIPE_NOT_CONFIGURED`, `INVOICE_NO_BILLING_CONTACT`,
`INVOICE_STRIPE_CALL_FAILED`, `INVOICE_AMOUNT_INVALID` — are localized through
the shared error catalog. Test ids `admin-org-issue-invoice`,
`issue-invoice-dialog`, `issue-invoice-amount`, `issue-invoice-description`,
`issue-invoice-due-days`, `issue-invoice-term-months`, `issue-invoice-confirm`,
`issue-invoice-submit`, `issue-invoice-error`.

Component: OrgInvoiceList
Status: canonical
Location: `web/src/components/billing/OrgInvoiceList.tsx`
Modes: Admin / Organization / Billing
States: empty, draft / open / paid / void / uncollectible, due date, paid date,
no due date, missing hosted URL or PDF (the link is simply absent)
Notes: A club's invoices as both the admin panel and the club's own billing tab
show them. Read-only — an invoice's life belongs to Stripe. Amounts and dates
go through `Intl` in `web/src/lib/clubBilling.ts`. The `testId` prop names the
copy: `admin-org-invoices` in the admin panel, `club-invoices` on the billing
tab.

Component: ClubTermSummary
Status: canonical
Location: `web/src/components/billing/ClubTermSummary.tsx`
Modes: Admin / Organization / Billing
States: active, payment overdue, in grace period, frozen, cancelled; with a
paid-until date or "No paid term"
Notes: States the two facts a club's members need — its status and the date it
is paid through — at the top of the members page and on the billing tab's club
block. It only states them: the warnings that act on the same status stay with
`BillingWarningBanner` and `FrozenBlocker`. Test ids `org-members-term`,
`billing-club-term`.

Component: ClubMembershipActions
Status: canonical
Location: `web/src/features/org/ClubMembershipActions.tsx`
Modes: Admin / Organization / Billing
States: leave with confirm, failed departure, creator transfer with confirm,
no other member to hand the club to, failed transfer
Notes: The two halves of "what can I do about my own membership", on the
members page beside every other membership decision and exclusive by design:
the creator cannot leave, so they are offered the transfer that would let them.
A successful departure switches back to the personal workspace. Both confirms
are the shared `ConfirmDeleteDialog`. Test ids `club-leave`, `club-leave-btn`,
`club-leave-error`, `club-transfer`, `club-transfer-target`,
`club-transfer-btn`.

Admin panel and club detail:

- The admin organizations list gains "New club" and both lists gain prev/next
  over their page of 50, with the range they are showing; changing a search
  returns to the first page. Test ids `admin-users-pagination`,
  `admin-orgs-pagination`, each with `-prev`, `-next` and `-range`.
- The club detail replaces its raw JSON textarea with the limits form plus an
  "advanced" disclosure showing the resolved JSON read-only
  (`admin-org-overrides-json`). Name, tier, status, term end and note save in
  one PATCH (`admin-org-name`, `admin-org-tier`, `admin-org-status`,
  `admin-org-term-end`, `admin-org-note`, `admin-org-save`, `admin-org-saved`),
  and ownership transfers to an existing member (`admin-org-transfer`).
- A pending club invitation on the dashboard can be declined as well as
  accepted (`org-invite`, `org-invite-accept`, `org-invite-decline`,
  `org-invite-error`).
- Coverage: `web/src/features/admin/NewClubDialog.test.tsx`,
  `web/src/features/admin/AdminOrgDetail.test.tsx`,
  `web/src/features/org/ClubMembership.test.tsx`,
  `web/src/features/dashboard/PendingOrgInvites.test.tsx`, and the club cases
  in `web/src/features/profile/BillingTab.test.tsx`.
