# Component Structure

PointFinder UI should be built from reusable components and patterns. Screens
compose components. They should not create visual systems locally.

## Component Layers

Use these layers when deciding where code belongs.

### 1. Primitives

Small reusable building blocks with minimal product meaning.

Web examples:

- `Button`
- `Input`
- `Select`
- `Tabs`
- `Dialog`
- `Badge`
- `Switch`
- `Tooltip`

Native equivalents:

- SwiftUI views or modifiers wrapping common button/badge/input behavior.
- Compose composables wrapping common Material components.

Rules:

- Primitives use tokens.
- Primitives expose variants, not arbitrary style props.
- Primitives do not know about games, bases, teams, or submissions.

### 2. Layout Components

Reusable structure and layering.

Examples:

- `IconRail`
- `TopBar`
- `FloatingBar`
- `SlideDrawer`
- `GlassPanel`
- `InspectorPanel`
- `BottomSheet`
- `SplitPane`

Rules:

- Layout components manage spacing, surface, elevation, and responsive behavior.
- Do not duplicate panel chrome in feature screens.
- Avoid cards inside cards.

### 3. Product Components

Reusable components with PointFinder meaning.

Examples:

- `BaseMarker`
- `TeamMarker`
- `StatusBadge`
- `SyncStatusBanner`
- `ReadinessIndicator`
- `ActivityEventRow`
- `LeaderboardRow`
- `SubmissionReviewCard`
- `NFCScanPrompt`
- `ChallengeAnswerInput`
- `VariableChip`

Rules:

- Product components own state-specific visual rules.
- Product components must be reused across modes where the same concept appears.
- If web, iOS, and Android each need the same concept, document the platform equivalents in `platform-parity.md`.

### 4. Feature Components

Components used by one feature area but still split from the screen.

Examples:

- `BaseDetail`
- `TeamDetail`
- `GameSettingsPanel`
- `NotificationSender`
- `CreateGameDialog`

Rules:

- Feature components may know API/domain concepts.
- Screens should orchestrate data and layout, then pass props down.
- Large feature components should still break down into product components.

### 5. Screens

Route-level or navigation-level containers.

Rules:

- Screens fetch or subscribe to data.
- Screens arrange major regions.
- Screens do not define repeated visual primitives inline.
- Screens should be readable as composition.

## Proposed Web Folder Shape

The current web folder is already close in places. Future work should move
toward this shape:

```text
web-admin/src/components/ui/          primitives
web-admin/src/components/layout/      shells, rails, bars, drawers, panels
web-admin/src/components/map/         maps, markers, overlays
web-admin/src/components/status/      status badges, sync, readiness, live state
web-admin/src/components/patterns/    reusable composed patterns
web-admin/src/features/*/components/  feature-only components
web-admin/src/features/*/             screens and feature entry points
```

Do not create a new cross-feature component inside a feature folder. Promote it.

## Proposed Native Shape

iOS:

```text
Components/                 shared primitives and product components
Components/Status/          status, sync, readiness
Components/Map/             shared map annotations and overlays
Features/<Feature>/         feature screens and local components
App/Theme/                  tokens and theme helpers
```

Android:

```text
ui/components/              shared primitives and product components
ui/components/status/       status, sync, readiness
ui/components/map/          shared map annotations and overlays
feature/<feature>/          feature screens and local components
ui/theme/                   tokens and theme helpers
```

The current native structure may differ. New work should use or move toward
these boundaries when practical.

## Reuse Threshold

Create or extract a component when any of these are true:

- The same visual pattern appears twice.
- The element has a product name: base marker, team row, scan prompt.
- The element has meaningful state variants.
- The element combines icon, color, and text semantics.
- The element is likely to need parity across platforms.
- The element would require more than a few token-based classes/styles inline.

Do not wait for three copies when the product concept is already obvious.

## Component API Rules

Components should expose meaning, not styling internals.

Good:

```tsx
<StatusBadge status="pending" />
<InspectorPanel title="Base Bravo" tone="live" />
<BaseMarker status="completed" selected />
```

Avoid:

```tsx
<Badge className="bg-yellow-500/20 text-yellow-500 rounded-full" />
<div className="bg-card/95 backdrop-blur-xl border ..." />
```

## Required States

For any component that can encounter these states, design and implement them:

- Loading.
- Empty.
- Error.
- Disabled.
- Selected.
- Active/live.
- Pending/syncing.
- Offline/stale.
- Destructive confirmation.
- Long text and translated text.
- Small screen layout.

Do not assume demo data is representative.

## Forms

Form fields should use shared input, label, help text, error text, and action
patterns.

Rules:

- Validation errors should appear near the field.
- Backend error messages should be preserved when useful.
- Required fields should be explicit.
- Long forms should be grouped by task.
- Primary action goes at the end of the flow or sticky footer when appropriate.
- Dangerous actions belong in a separated danger area.

## Lists And Rows

Rows should have stable structure:

- Leading identity: icon, color dot, marker, or avatar.
- Primary label.
- Secondary metadata.
- Status/control on the trailing edge.
- Consistent row height within a list.

Avoid arbitrary card grids for operational lists unless the card contains rich
content that genuinely benefits from more space.

## Map Components

Map markers and overlays are product components, not decorative SVGs.

Rules:

- Base markers and team markers must use shared status tokens.
- Selected, hovered, hidden, stale, completed, rejected, and checked-in states must be stable.
- Marker hit targets must be usable on touch screens.
- Marker labels should not overwhelm the map at low zoom.
- Map overlays should not hide critical markers without a clear way to collapse or move them.

## Review Before Adding Styling

Before adding a class, modifier, color, or shape:

1. Is there a token for this?
2. Is there a component that already owns this pattern?
3. Is this visual decision reusable?
4. Does another platform need the same concept?
5. Will this survive dark mode, localization, and mobile width?
