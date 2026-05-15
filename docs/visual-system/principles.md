# Visual Principles

These principles define the quality bar for PointFinder UI. They apply across
web, iOS, Android, and public pages unless a product mode explicitly narrows
them.

## 1. One Product, Different Worlds

PointFinder is one app. Player and operator experiences should share the same
brand, tokens, icon language, status colors, and interaction quality.

After login, the worlds diverge:

- Players need confidence, simplicity, large touch targets, offline clarity, and direct next actions.
- Operators need density, control, validation, live state, review, rescue actions, and auditability.

Do not make player screens look like a reduced operator dashboard. Do not make
operator screens look like a consumer game interface.

## 2. Map First

The map is not decoration. It is the primary spatial model for games.

When a screen concerns bases, teams, locations, stages, progress, or live
operation, the design should preserve spatial context whenever possible. Panels,
drawers, markers, and inspectors should support the map instead of replacing it.

Use maps for:

- Base placement and selection.
- Team location monitoring.
- Live progress and inspection.
- Spatial rescue decisions.
- Player exploration and base discovery.

Avoid map visuals when the task is primarily administrative, such as profile,
billing, organization members, or account security.

## 3. Field-Ready, Not Decorative

PointFinder should feel like a practical field tool. Visual atmosphere is
welcome when it helps orientation, but decorative effects must never compete
with task clarity.

Prefer:

- Real map context.
- Compass, waypoint, NFC, tag, and route metaphors.
- Subtle texture or cartographic references on public/auth surfaces.
- Direct controls and visible states.

Avoid:

- Generic adventure-game fantasy.
- Stock-like outdoor hero imagery that does not explain the product.
- Decorative gradients, orbs, bokeh, and purely atmospheric panels.
- Screen-local visual effects that cannot be reused.

## 4. Calm Under Pressure

Live games create stress. Operator UI must be calm, legible, and recoverable.

Operator screens should:

- Surface the next operational risk.
- Make live, pending, stale, failed, and blocked states obvious.
- Keep rescue actions accessible but clearly intentional.
- Make review and audit flows traceable.
- Avoid unnecessary animation during live operations.

Motion should confirm state changes, not entertain.

## 5. Progressive Density

Density should match expertise and context.

- Player field mode: low density, large controls, one primary action.
- Operator setup: medium density, structured forms, clear validation.
- Operator command: high density, map-first panels, quick scanning.
- Review/results: high density, filtering, sorting, stable tables/lists.
- Public pages: editorial, explanatory, brand-forward.

Do not use large marketing-style cards inside operational surfaces. Do not use
tiny admin controls in player field flows.

## 6. Semantic Status

Status colors must mean the same thing everywhere.

- Green: primary action, live, success, completed.
- Blue: checked in, informational, active location/status.
- Amber: pending, needs review, syncing, caution.
- Red: rejected, destructive, failed, blocked.
- Purple/indigo: secondary categorical accent, not primary status.
- Gray: inactive, unknown, disabled, archived, no signal.

Never use status colors as arbitrary decoration. If a color communicates state,
the same state must use the same token on all platforms.

## 7. Offline And Sync Are First-Class

Mobile play happens in real fields. Offline and sync states are not edge cases.

Player UI must clearly show:

- Offline mode.
- Pending queued actions.
- Failed sync actions.
- Retriable states.
- Whether a check-in or submission is safely stored.

Operator UI must clearly show:

- Realtime connection problems.
- Last synced or stale data where applicable.
- Stale team location signals.
- When an action is local, pending, or confirmed.

## 8. Accessibility Is Part Of The Design

All UI must be usable under realistic field and event conditions.

Minimum expectations:

- Text contrast meets WCAG AA.
- Color is never the only indicator of state.
- Touch targets are at least 44px on mobile.
- Icon-only buttons have accessible labels and tooltips where appropriate.
- Focus states are visible on web.
- Dynamic text and localization are planned for.
- Long words, translated strings, and large numbers cannot break layout.
- Reduced-motion preferences are respected.

## 9. Native Where It Matters

Consistency does not mean pixel-perfect sameness.

Use the same tokens, status meanings, component taxonomy, and product structure
across platforms. Let platform-native controls handle expected behaviors where
users benefit from them:

- SwiftUI navigation, sheets, lists, and system permissions on iOS.
- Material/Compose patterns, system settings links, and platform dialogs on Android.
- Keyboard, hover, focus, and dense data patterns on web.

## 10. Components Before Screens

Screens should read like composition. If a visual element has a name in the
product language, it deserves a component.

Examples:

- BaseMarker
- TeamMarker
- StatusBadge
- SyncBanner
- ReadinessItem
- InspectorPanel
- ActivityEventRow
- SubmissionReviewCard
- NFCScanPrompt
- EmptyState

Do not bury reusable visuals inside screens. That is how drift starts.
