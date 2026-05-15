# Web Tailwind Contract

Tailwind is the web implementation layer for the PointFinder visual system. It
is not the design system by itself.

Agents must use Tailwind through semantic tokens, shared components, and
documented variants. Do not use Tailwind as an open-ended paint box.

## Core Rule

Use Tailwind for layout and token application. Use components for product
meaning.

Good:

```tsx
<div className="bg-card text-card-foreground border border-border rounded-lg" />
<Button variant="default">Go live</Button>
<StatusBadge status="pending" />
```

Avoid:

```tsx
<div className="bg-lime-400 text-slate-950 border-zinc-700 rounded-2xl shadow-xl" />
<span className="px-2 py-1 rounded-full bg-yellow-500/20 text-yellow-400" />
```

## Allowed Tailwind Categories

These utility categories are generally allowed in page and component code:

- Layout: `flex`, `grid`, `block`, `hidden`, `contents`.
- Positioning: `relative`, `absolute`, `fixed`, `inset-*`, `top-*`, `left-*`.
- Sizing: `w-*`, `h-*`, `min-*`, `max-*`, `aspect-*`.
- Spacing: `p-*`, `px-*`, `py-*`, `m-*`, `gap-*`, `space-*`.
- Typography structure: `text-sm`, `font-medium`, `uppercase`, `tabular-nums`, `truncate`.
- Responsive variants: `sm:`, `md:`, `lg:`, `xl:`.
- State variants: `hover:`, `focus-visible:`, `disabled:`, `aria-*`, `data-*`.
- Token-backed color classes: `bg-card`, `text-foreground`, `border-border`, etc.

These categories need extra scrutiny:

- Raw palette colors: `bg-green-500`, `text-slate-400`, `border-zinc-800`.
- Arbitrary values: `bg-[#123456]`, `rounded-[17px]`, `shadow-[...]`.
- One-off opacity/blur/elevation combinations.
- Large radius values on operational UI.
- Repeated inline badge, card, panel, marker, or status styling.

## Raw Palette Rule

Do not use raw Tailwind palette colors in authenticated product UI unless one of
these is true:

1. The color is inside a central token/theme file.
2. The color is inside a reusable component variant that has been documented.
3. The color is part of a temporary chart/prototype and has a TODO or issue to tokenize.

Screen-level code should not contain classes like:

```text
bg-green-500 text-yellow-400 border-slate-700 from-purple-600 to-blue-600
```

Use semantic token classes instead:

```text
bg-primary text-primary-foreground border-border text-warning text-success
```

## Semantic Mapping

Use this mapping when translating visual-system tokens to Tailwind classes.

| Visual token | Tailwind class |
|---|---|
| `color.surface.canvas` | `bg-background` |
| `color.surface.panel` | `bg-card` |
| `color.surface.subtle` | `bg-muted` or `bg-secondary` |
| `color.surface.overlay` | `bg-card/95 backdrop-blur-xl border border-border` through a shared panel component |
| `color.text.primary` | `text-foreground` |
| `color.text.secondary` | `text-muted-foreground` |
| `color.text.inverse` | `text-primary-foreground` or component-specific inverse token |
| `color.action.primary` | `bg-primary text-primary-foreground` |
| `color.action.secondary` | `bg-secondary text-secondary-foreground` |
| `color.border.default` | `border-border` |
| `color.focus.ring` | `focus-visible:ring-ring` |
| `color.status.pending` | `text-warning`, `bg-warning/10`, `border-warning/30` |
| `color.status.completed` | `text-success`, `bg-success/10`, `border-success/30` |
| `color.status.checkedIn` | `text-info`, `bg-info/10`, `border-info/30` |
| `color.status.rejected` | `text-destructive`, `bg-destructive/10`, `border-destructive/30` |
| `color.status.unknown` | `text-muted-foreground`, `bg-muted`, `border-border` |

If a Tailwind class does not exist for a visual token, add the token to
`web-admin/src/index.css` before using it.

## Status Styling Must Be Centralized

Do not hand-build status badges in screens.

Good:

```tsx
<StatusBadge status="live" />
<SubmissionStatusBadge status={submission.status} />
<BaseProgressBadge status={progress.status} />
```

Allowed internally inside a shared status component:

```tsx
const statusStyles = {
  pending: "bg-warning/10 text-warning border-warning/30",
  completed: "bg-success/10 text-success border-success/30",
}
```

Avoid in screen code:

```tsx
<span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-amber-400">
  Pending
</span>
```

## Panel And Card Rule

Panel chrome must come from shared layout components.

Use:

- `GlassPanel`
- `SlideDrawer`
- `FloatingBar`
- future `InspectorPanel`
- future `SurfacePanel`

Avoid copying:

```text
bg-card/95 backdrop-blur-xl border border-border rounded-xl shadow-lg
```

If multiple surfaces need the same chrome, create or extend a shared component
variant.

## Radius Rule

Use token-backed Tailwind radius classes:

| Use | Class |
|---|---|
| compact controls | `rounded-sm` or `rounded-md` |
| default panels/cards | `rounded-lg` |
| major mobile sheets | `rounded-xl` |
| pills/status dots only | `rounded-full` |

Avoid `rounded-2xl`, `rounded-3xl`, and arbitrary radius in authenticated
product UI unless the visual-system docs are updated for that pattern.

## Shadow And Blur Rule

Use shadow and blur only through shared components or documented variants.

Allowed:

- Map overlays through `GlassPanel` or future overlay components.
- Modal/dialog shadows from shared dialog components.
- Focus rings from primitives.

Avoid:

- Screen-local `shadow-xl`, `shadow-2xl`, or arbitrary shadows.
- Applying `backdrop-blur-xl` to ordinary cards.
- Nested glass panels.

## Component Variant Rule

Repeated Tailwind class combinations belong in component variants.

Use `class-variance-authority` or an equivalent local pattern for primitives and
shared product components.

Good:

```tsx
const badgeVariants = cva("inline-flex items-center border text-xs", {
  variants: {
    tone: {
      pending: "bg-warning/10 text-warning border-warning/30",
      success: "bg-success/10 text-success border-success/30",
    },
  },
})
```

Avoid duplicating the same class list across screens.

## Arbitrary Value Rule

Arbitrary values are allowed only for:

- Precise map/canvas integration.
- Third-party component fixes.
- One-off geometry that cannot be tokenized.

They must be rare and should include a short comment if the reason is not
obvious.

Avoid:

```text
w-[473px] bg-[#09130f] shadow-[0_18px_60px_rgba(...)]
```

Prefer:

```text
w-[min(420px,calc(100vw-2rem))] bg-card shadow-overlay
```

when corresponding tokens/utilities exist.

## File Ownership

Token definitions:

- `web-admin/src/index.css`

Primitive components:

- `web-admin/src/components/ui/`

Layout components:

- `web-admin/src/components/layout/`

Map components:

- `web-admin/src/components/map/`

Shared status/product components:

- `web-admin/src/components/status/`
- `web-admin/src/components/patterns/`

Feature-only components:

- `web-admin/src/features/*/components/`

Do not add cross-feature visual components directly inside a feature folder.

## Review Checklist For Tailwind Changes

Before finishing a web UI change, check:

- Are all colors semantic token classes?
- Are status styles centralized?
- Are repeated class combinations extracted?
- Is panel/card chrome coming from a shared component?
- Are radius, shadow, and blur choices token/component-backed?
- Are arbitrary values necessary?
- Would another agent know which component or variant to reuse?
