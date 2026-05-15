# Platform Parity

PointFinder should be consistent by concept, not pixel-perfect. This document
maps shared concepts across web, iOS, and Android.

## Source Of Truth

The backend defines business rules. The visual system defines presentation rules.
Platform implementations must reflect both.

When platforms disagree:

1. Backend behavior wins for rules and permissions.
2. This visual system wins for UI direction.
3. Existing platform-native conventions win for interaction details when they do not conflict.

## Shared Semantic Concepts

| Concept | Web | iOS | Android |
|---|---|---|---|
| Primary action | `Button` primary variant | SwiftUI button style using `pfPrimary` | Material button using theme primary |
| Status badge | Shared status component | Shared SwiftUI status view | Shared Compose status composable |
| Base marker | `BaseMarkers` / map component | `BaseAnnotationView` | Shared map marker composable/view |
| Team marker | `TeamMarkers` | `TeamLocationAnnotationView` | Shared map marker composable/view |
| Sync state | Banner/toast/panel | `SyncStatusBanner`, `SyncQueueSheet` | Sync banner/sheet |
| Empty state | `EmptyState` | Shared empty state view | Shared empty state composable |
| Inspector | Floating panel/drawer | Sheet/navigation detail | Bottom sheet/detail screen |
| NFC scan prompt | Product component | `AnimatedScanView` plus scan CTA | Compose scan prompt plus NFC state |
| Readiness | `ReadinessIndicator` | Desired shared checklist | Desired shared checklist |

If a shared concept has no platform equivalent yet, new work should either add
one or document why it is intentionally platform-specific.

## Color Parity

Current anchors:

- Primary green: web light `#15803d`, mobile/dark `#22c55e`.
- Completed/live: `#22c55e`.
- Checked-in/info: `#3b82f6`.
- Pending/submitted: `#f59e0b`.
- Rejected/error: `#ef4444`.

Each platform should expose these as semantic values, not direct screen-level
hex values.

## Product Mode Parity

### Public / Marketing

Web is the main public marketing surface. Native apps may have lightweight
welcome/onboarding, but should not duplicate the full web landing page.

### Auth / Onboarding

All platforms should clearly offer:

- Player join.
- Operator login.

This supports the "one app, different post-login worlds" model.

### Player Field Mode

All platforms should preserve:

- Map.
- NFC check-in.
- Challenge solve.
- Submission result.
- Offline/sync visibility.
- Settings.

Players should not see full leaderboard or other-team scoring data.

### Operator Setup Mode

Web is the richest setup environment and current north star. Native setup can be
more constrained but should use the same concepts, naming, status colors, and
validation language.

### Operator Command Mode

Web is the strongest live command surface. Native operator live screens should
share the same status semantics and rescue concepts, even when layout differs.

## Platform-Native Rules

### Web

Use web strengths:

- Dense map workspace.
- Hover and keyboard focus.
- Multi-panel layouts.
- Tables and filters.
- Rich text authoring.
- Visual harness and screenshot tests.

Avoid:

- Mobile-only interaction assumptions.
- Large marketing compositions inside authenticated workspace.

### iOS

Use iOS strengths:

- SwiftUI navigation stacks.
- Sheets for focused details.
- SF Symbols.
- System permission patterns.
- Native NFC affordances.

Avoid:

- Web-style dense dashboards squeezed into small screens.
- Custom controls that fight iOS expectations.

### Android

Use Android strengths:

- Material components.
- Compose previews.
- System settings intents for NFC and permissions.
- Bottom sheets and snackbar patterns.

Avoid:

- iOS-only navigation metaphors.
- One-off Material color overrides outside theme tokens.

## Preview And Harness Expectations

Desired direction:

- Web: visual harness route/page with canonical components and states.
- iOS: SwiftUI previews for reusable visual components.
- Android: Compose previews for reusable visual components.

Preview data should use the same canonical scenarios where practical:

- Game in setup, missing NFC.
- Game live with active teams.
- Pending submission.
- Rejected submission.
- Offline player with queued actions.
- Hidden/locked base.
- Stale team location.

## Consistency Checklist

When implementing a feature on one platform, ask:

1. Does another platform already have this concept?
2. Are names and statuses the same?
3. Are colors/tokens the same?
4. Is sensitive operator-only data hidden from players?
5. Does native behavior match user expectations?
6. Is there a preview or harness state for the component?
