# Refactor Readiness

This document narrows the remaining work needed before starting a serious visual
refactor. The visual language is ready to adopt. The goal now is to make it hard
for agents to implement it inconsistently.

## Current Readiness

Ready now:

- Product modes are defined.
- Visual principles are defined.
- Token meanings are defined.
- Component structure rules are defined.
- Web Tailwind usage is constrained.
- Adoption/refactor workflow is defined.
- Agent checklist exists.
- Shared agent instructions point to this system.

Not fully ready yet:

- There is no web visual harness.
- There is no formal cross-platform token source of truth.
- Some shared web components still need to be created or normalized.
- Existing screens still contain visual drift.

This means new UI can follow the system today, but broad refactors should start
by creating the smallest enforcement surface first.

## Minimum Before A Major Web Refactor

Before refactoring large authenticated web surfaces, complete these items:

1. Create a dev-only visual harness route/page.
2. Add canonical examples for buttons, status badges, panels, empty states, and map markers.
3. Create or normalize `StatusBadge` components for game, submission, base progress, sync, and NFC states.
4. Create or normalize shared panel components for standard panels, floating map overlays, and inspectors.
5. Add a small token gap pass in `web-admin/src/index.css` so documented semantic classes exist.
6. Add a short component inventory listing which existing components are canonical and which are legacy.

These are the practical guardrails that keep a refactor from becoming another
round of locally styled screens.

## Minimum Before Native Visual Refactors

Before broad iOS or Android visual refactors:

1. Map the semantic status colors to platform theme names.
2. Add shared status badge components.
3. Add shared empty/loading/error state components.
4. Add previews for NFC scan, sync banner, base marker, team marker, and status badges.
5. Confirm player screens do not expose operator-only concepts.

Native refactors can proceed screen by screen once these common pieces exist.

## Recommended First Refactor Slice

Start with web because it is the current visual north star and easiest to
inspect quickly.

Slice 1:

- Add the visual harness.
- Add `StatusBadge` primitives/product variants.
- Add `SurfacePanel` or normalize `GlassPanel`.
- Add `InspectorPanel`.
- Put `StatsBar`, `ActivityFeed`, `Leaderboard`, and representative map markers into the harness.

Slice 2:

- Refactor command-mode overlays to use the shared panel/status components.
- Replace screen-local status colors with badge variants.
- Verify desktop and mobile widths.

Slice 3:

- Refactor build/setup drawers and readiness states.
- Normalize forms, empty states, and destructive actions.

Slice 4:

- Bring player-facing native surfaces into parity for status, sync, NFC, and empty/error states.

## Component Inventory Format

Use this lightweight format when auditing components:

```text
Component: StatusBadge
Status: canonical | needs refactor | legacy
Location: web-admin/src/components/status/StatusBadge.tsx
Modes: Operator Command, Review, Player Field
States: live, setup, ended, pending, completed, rejected, unknown
Notes: Uses semantic Tailwind tokens only.
```

The inventory can start as `docs/visual-system/component-inventory.md` once the
first harness/components exist.

## Refactor Gate

For each refactor PR or agent task, require:

- Product mode named in the task or PR notes.
- Components reused/extracted instead of local styling.
- No new raw Tailwind palette classes in authenticated web UI.
- Status colors centralized.
- Relevant harness/preview state added when touching reusable visuals.
- Tests or screenshots appropriate to the changed surface.

## Stop Conditions

Pause and update the visual system before continuing if:

- A new status meaning is needed.
- A new repeated panel/card style appears.
- A component needs different behavior across platforms.
- A screen needs to expose information that may violate player/operator data boundaries.
- The refactor requires changing business behavior, not just presentation.
