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
