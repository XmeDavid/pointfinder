# Design Tokens

Tokens are the shared visual language across platforms. Use semantic tokens in
component code. Raw values belong only in theme/token files.

The current code already has partial token sets:

- Web: `web-admin/src/index.css`
- iOS: `ios-app/dbv-nfc-games/App/Theme/DesignTokens.swift`
- Android: `android-app/app/src/main/java/com/prayer/pointfinder/ui/theme/`

The desired end state is a source-of-truth token file that maps into each
platform. Until then, treat this document as the canonical naming and meaning.
For web implementation details, follow [Web Tailwind Contract](web-tailwind.md).

## Token Naming

Use semantic names, not visual descriptions.

Good:

- `color.action.primary`
- `color.status.pending`
- `color.surface.overlay`
- `radius.panel`
- `space.section`

Avoid:

- `lime500`
- `darkGlass`
- `bigRadius`
- `niceShadow`

## Color Families

### Brand

| Token | Meaning | Current anchor |
|---|---|---|
| `color.brand.primary` | Main PointFinder green | `#22c55e` dark/mobile, `#15803d` web light |
| `color.brand.primaryStrong` | Pressed/strong primary | `#16a34a` |
| `color.brand.primarySoft` | Soft primary background | green with low opacity |
| `color.brand.onPrimary` | Text/icon on primary | white or near-black by contrast |

Primary green is used for main action, success/live emphasis, selected controls,
and brand marks. Do not use arbitrary greens outside this family.

### Status

| Token | Meaning | Current anchor |
|---|---|---|
| `color.status.live` | Live game, active realtime | green |
| `color.status.completed` | Completed/approved/correct | green `#22c55e` |
| `color.status.checkedIn` | Checked in/info active | blue `#3b82f6` |
| `color.status.pending` | Pending review/sync/caution | amber `#f59e0b` |
| `color.status.rejected` | Rejected/error/destructive | red `#ef4444` |
| `color.status.unknown` | Unknown/no signal/inactive | gray |
| `color.status.operatorOverride` | Operator rescue/override | purple or indigo |

Status color must be paired with text, icon, shape, or label. Color alone is not
enough.

### Surfaces

| Token | Meaning |
|---|---|
| `color.surface.canvas` | Full page/screen background |
| `color.surface.panel` | Standard panel/card background |
| `color.surface.overlay` | Floating panels over map/content |
| `color.surface.subtle` | Muted control backgrounds |
| `color.surface.inverse` | Inverse/strong surface |
| `color.surface.map` | Map background/fallback |
| `color.surface.scrim` | Modal/sheet scrim |

Authenticated product UI should not invent one-off panel colors. Map overlays
should use `surface.overlay` with consistent opacity/blur rules by platform.

### Text

| Token | Meaning |
|---|---|
| `color.text.primary` | Main readable text |
| `color.text.secondary` | Secondary supporting text |
| `color.text.muted` | De-emphasized labels/hints |
| `color.text.inverse` | Text on dark/strong surfaces |
| `color.text.disabled` | Disabled text |
| `color.text.danger` | Destructive/error text |

Text contrast must meet WCAG AA for normal body text.

### Borders And Rings

| Token | Meaning |
|---|---|
| `color.border.default` | Standard separators and outlines |
| `color.border.subtle` | Soft dividers inside panels |
| `color.border.strong` | Emphasized panel or selected border |
| `color.focus.ring` | Keyboard focus / focused input ring |

Focus rings must remain visible in both light and dark themes.

## Typography

Use platform-native system fonts for authenticated product UI.

Web:

- Base: Inter/system sans.
- Mono: JetBrains Mono/system monospace for codes, coordinates, timers.
- Display/serif styles may be used on public/marketing only.

iOS:

- Use SwiftUI system typography.
- Use monospaced digits for timers, codes, scores, and coordinates.

Android:

- Use Material typography or app-level typography.
- Use tabular/monospace where numeric scanning matters.

Type scale guidance:

| Role | Use |
|---|---|
| Display | Public hero only |
| Title | Screen or major panel title |
| Section | Group heading in a screen/panel |
| Body | Main content |
| Label | Controls, tabs, badges |
| Meta | timestamps, coordinates, compact stats |

Do not use hero-scale type inside dense operational panels.

## Spacing

Use a 4px grid. Existing platform anchors are close to:

| Token | Value | Use |
|---|---:|---|
| `space.1` | 4px | tiny gaps |
| `space.2` | 8px | item gap |
| `space.3` | 12px | compact padding |
| `space.4` | 16px | screen padding/mobile section gap |
| `space.5` | 20px | medium gap |
| `space.6` | 24px | larger section padding |
| `space.8` | 32px | major separation |

For mobile, default screen padding is 16px. Dense map overlays may use 8-12px
internal spacing.

## Radius

Radius should be restrained. Avoid bubbly shapes in operational UI.

| Token | Value | Use |
|---|---:|---|
| `radius.xs` | 4px | tiny badges, inner controls |
| `radius.sm` | 6px | inputs, compact buttons |
| `radius.md` | 8px | default cards/panels on web |
| `radius.lg` | 12px | sheets, mobile cards |
| `radius.xl` | 16px | primary mobile buttons, major sheets |
| `radius.full` | 999px | pills, avatars, status dots only |

Web operational cards should generally stay at 8px or less unless matching an
existing established component. Native mobile may use 12-16px for platform
comfort.

## Elevation And Blur

Use elevation to clarify layering, not decoration.

| Token | Use |
|---|---|
| `shadow.none` | Inline content |
| `shadow.panel` | Standard panel/card |
| `shadow.overlay` | Floating map panel |
| `shadow.modal` | Dialog/sheet |

Blur rules:

- Map overlays may use subtle backdrop blur on web.
- Do not apply blur to every card.
- Avoid nested glass panels.
- Native platforms should prefer platform materials only when they improve readability.

## Icons

Use platform-standard icon systems:

- Web: lucide-react.
- iOS: SF Symbols.
- Android: Material Icons.

Icon meaning must be stable:

- Map: map/location context.
- NFC/scan: check-in and tag operations.
- Bell: notifications.
- Trophy: results/leaderboard.
- Clipboard/list: review/submissions.
- Hammer/tool: build/setup.
- Zap/activity: command/live mode.
- Gear: settings.

Icon-only controls need accessible labels. Web icon-only controls should have
tooltips when the meaning is not obvious.

## Motion

Motion should communicate state, location, or confirmation.

Allowed:

- Map fly-to on selection.
- Drawer/sheet open and close.
- Small live pulse for active/live status.
- NFC scan animation.
- Toast/feedback entry.

Avoid:

- Continuous decorative motion on operational screens.
- Layout-shifting animation.
- Slow transitions during live operations.
- Motion that ignores reduced-motion settings.

## Data Visualization

Use stable status colors and consistent legends. Charts and stats must be
readable without relying on color alone.

Do not introduce a new chart palette until it is added here and mapped across
platforms.
