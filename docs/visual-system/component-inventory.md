# Component Inventory

Seed inventory for the first web visual-system remediation slice. This is not a
full audit; it records the canonical foundation added before larger refactors.

Component: StatusBadge  
Status: canonical  
Location: `web-admin/src/components/status/StatusBadge.tsx`  
Modes: Operator Setup, Operator Command, Review, Results, Admin / Organization / Billing  
States: info, success, warning, destructive, muted, override  
Notes: Base status badge primitive. Uses semantic Tailwind tokens only.

Component: GameStatusBadge  
Status: canonical  
Location: `web-admin/src/components/status/GameStatusBadge.tsx`  
Modes: Operator Setup, Operator Command, Results, Dashboard  
States: setup, live, ended  
Notes: Canonical decision for this slice: setup is info/blue, live is success/green, ended is muted/gray.

Component: SubmissionStatusBadge  
Status: canonical  
Location: `web-admin/src/components/status/SubmissionStatusBadge.tsx`  
Modes: Review, Operator Command  
States: pending, approved, correct, rejected  
Notes: Centralizes submission review status color semantics.

Component: BaseProgressBadge  
Status: canonical  
Location: `web-admin/src/components/status/BaseProgressBadge.tsx`  
Modes: Operator Command, Player Field  
States: not visited, checked in, submitted, completed, rejected  
Notes: Keeps checked-in as info/blue and submitted as warning/amber.

Component: SyncStatusBadge  
Status: canonical  
Location: `web-admin/src/components/status/SyncStatusBadge.tsx`  
Modes: Operator Command, Player Field  
States: online, offline, sync pending, sync failed  
Notes: Web badge foundation only; native sync banners still need parity work.

Component: NfcStatusBadge  
Status: canonical  
Location: `web-admin/src/components/status/NfcStatusBadge.tsx`  
Modes: Operator Setup, Player Field  
States: linked, missing  
Notes: Shared web badge for NFC availability/link state.

Component: OverrideBadge  
Status: canonical  
Location: `web-admin/src/components/status/OverrideBadge.tsx`  
Modes: Operator Command  
States: override  
Notes: Uses the new semantic override token.

Component: ActivityEventBadge  
Status: canonical  
Location: `web-admin/src/components/status/ActivityEventBadge.tsx`  
Modes: Operator Command  
States: check in, submission, approval, rejection  
Notes: Centralizes live activity event tones and labels.

Component: LocationSignalBadge  
Status: canonical  
Location: `web-admin/src/components/status/LocationSignalBadge.tsx`  
Modes: Operator Command  
States: active, stale, no signal  
Notes: Centralizes operator location freshness semantics for leaderboard and map-adjacent UI.

Component: SurfacePanel  
Status: canonical  
Location: `web-admin/src/components/layout/SurfacePanel.tsx`  
Modes: Authenticated product UI  
States: default, elevated, padding variants  
Notes: Default operational panel chrome with `rounded-lg`.

Component: OverlayPanel  
Status: canonical  
Location: `web-admin/src/components/layout/OverlayPanel.tsx`  
Modes: Operator Command, map overlays  
States: padding variants  
Notes: Owns `bg-card/95`, border, overlay shadow, and backdrop blur for floating map/content panels.

Component: InspectorPanel  
Status: canonical  
Location: `web-admin/src/components/layout/InspectorPanel.tsx`  
Modes: Operator Command, Operator Setup  
States: surface, overlay, title, subtitle, actions, footer, close action  
Notes: Shell only. Feature-specific inspector content should compose inside it in later slices.

Component: EmptyState  
Status: canonical  
Location: `web-admin/src/components/feedback/EmptyState.tsx`  
Modes: All web modes  
States: default, compact, optional icon, optional action  
Notes: Existing component extended with className and density support.

Component: ErrorState  
Status: canonical  
Location: `web-admin/src/components/feedback/ErrorState.tsx`  
Modes: All web modes  
States: message, optional retry  
Notes: Simple reusable error state for panels and screen regions.

Component: LoadingState  
Status: canonical  
Location: `web-admin/src/components/feedback/LoadingState.tsx`  
Modes: All web modes  
States: labeled loading  
Notes: Simple reusable loading state for panels and screen regions.

Component: GlassPanel  
Status: legacy  
Location: `web-admin/src/components/layout/GlassPanel.tsx`  
Modes: Operator Command, map overlays  
States: overlay surface  
Notes: May remain for existing map-overlay usage. New operational panels should prefer `SurfacePanel`; new floating overlays should prefer `OverlayPanel`.

Component: GameCard local status badge  
Status: needs refactor  
Location: `web-admin/src/features/dashboard/GameCard.tsx`  
Modes: Dashboard  
States: setup, live, ended  
Notes: Migrated to `GameStatusBadge`; card shell itself remains feature-local.

Component: TopBar local status badge  
Status: needs refactor  
Location: `web-admin/src/features/workspace/TopBar.tsx`  
Modes: Operator Setup, Operator Command, Review, Results  
States: setup, live, ended  
Notes: Migrated to `GameStatusBadge`; remaining mode-tab styling can be considered later.

Component: StatsBar  
Status: canonical  
Location: `web-admin/src/features/command/StatsBar.tsx`  
Modes: Operator Command  
States: teams, pending, progress, elapsed, location visibility, notification action  
Notes: Uses `OverlayPanel` for command stat tiles and semantic warning/destructive pending tones.

Component: ActivityFeed  
Status: canonical  
Location: `web-admin/src/features/command/ActivityFeed.tsx`  
Modes: Operator Command  
States: filtered, empty, export, pending review action, event types  
Notes: Uses `OverlayPanel`, `EmptyState`, and centralized activity event badges.

Component: Leaderboard  
Status: canonical  
Location: `web-admin/src/features/command/Leaderboard.tsx`  
Modes: Operator Command  
States: collapsed, expanded, empty, selected team, active, stale, no signal  
Notes: Uses `OverlayPanel`, `EmptyState`, and centralized location signal semantics.

Component: BaseInspector  
Status: canonical  
Location: `web-admin/src/features/command/BaseInspector.tsx`  
Modes: Operator Command  
States: selected base, NFC linked/missing, challenge list, team progress, rescue action entry  
Notes: Uses `InspectorPanel`, `BaseProgressBadge`, `NfcStatusBadge`, and `EmptyState`.

Component: TeamInspector  
Status: canonical  
Location: `web-admin/src/features/command/TeamInspector.tsx`  
Modes: Operator Command  
States: selected team, rescue actions, success feedback, mobile sheet  
Notes: Uses `InspectorPanel`, `OverrideBadge`, and shared button/status primitives.

Component: BaseMarker  
Status: needs refactor  
Location: `web-admin/src/components/map/BaseMarkers.tsx`  
Modes: Player Field, Operator Setup, Operator Command  
States: not visited, checked in, submitted, completed, rejected, hidden, selected, NFC missing  
Notes: Web marker colors now use semantic marker token classes in `components/map/markerStyles.ts`; full cross-platform marker parity remains future work.

Component: TeamMarker  
Status: needs refactor  
Location: `web-admin/src/components/map/TeamMarkers.tsx`  
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
Location: `web-admin/src/components/results/ResultsSummary.tsx`
Modes: Results, Billing, Administration
States: neutral metric, success, pending attention, responsive two/four-column layout
Notes: Shared operational metric hierarchy; result derivation, billing calculations, and admin queries remain feature-owned.

Component: BroadcastPanel
Status: canonical
Location: `web-admin/src/components/broadcast/BroadcastPanel.tsx`
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
