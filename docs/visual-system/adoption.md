# Adoption And Refactor Workflow

This visual system should guide new work immediately, but existing UI can move
toward it gradually.

## Adoption Strategy

Use three tracks:

1. New features follow the visual system from the start.
2. Touched existing screens move closer to the visual system as part of normal work.
3. Dedicated refactor passes extract shared components and replace local styling.

Avoid broad visual rewrites without a harness or screenshot baseline. They are
hard to review and easy for agents to regress.

## Priority Order

Refactor in this order:

1. Shared tokens and primitives.
2. Status badges and status colors.
3. Map markers and map overlays.
4. Player offline/sync/check-in states.
5. Operator command panels.
6. Setup forms and readiness patterns.
7. Review/results surfaces.
8. Public/auth polish.

This order reduces the most damaging drift first: status meaning, live map
clarity, player trust, and reusable component structure.

## Definition Of Done For New UI

New UI is considered visually acceptable when:

- It identifies the correct product mode.
- It uses semantic tokens.
- It composes existing components or extracts reusable ones.
- It handles relevant states: loading, empty, error, disabled, selected, offline/sync, and long text.
- It uses accessible labels for icon-only controls.
- It works in supported themes.
- It works at the relevant screen sizes.
- It does not expose operator-only data to players.
- It has a preview, harness state, or screenshot path when the component is reusable or visually significant.

## Refactor Pattern

When cleaning an inconsistent area:

1. Inventory repeated visuals and state variants.
2. Name the product concepts.
3. Extract the smallest reusable component first.
4. Replace one screen or panel at a time.
5. Add states to the harness/previews when available.
6. Remove old local styling only after the replacement is in use.

Good refactors should reduce inline styling and make future feature work easier.

## Token Migration

Current platform tokens are partial. During migration:

- Add missing semantic tokens before using a new color or shape.
- Map platform-native names to visual-system names in comments if needed.
- Do not rename every existing token in one pass unless the change is isolated and well-tested.
- Prefer semantic aliases over raw value churn.

Example:

```text
color.status.pending -> web --color-warning / iOS pfPending / Android PfPending
```

## Component Migration

When replacing local UI with components:

- Keep public behavior stable.
- Preserve `data-testid`, accessibility identifiers, and test tags unless tests are updated in the same change.
- Keep API/data fetching in screens or hooks.
- Move visual state mapping into product components.
- Avoid changing business logic during visual refactors.

## Harness Migration

The desired web harness should become the review surface for this system.

First harness targets:

- Buttons and badges.
- Empty, loading, and error states.
- Status badges.
- Base and team markers.
- Stats bar.
- Activity feed.
- Leaderboard row.
- Inspector panel.
- NFC scan prompt.
- Sync/offline banners.

Native equivalents should use SwiftUI previews and Compose previews for the same
product concepts.

## Visual Review Questions

Ask these during review:

- Does this look like PointFinder, or like a generic admin template?
- Is the map still the anchor where spatial context matters?
- Can a stressed operator find the next problem quickly?
- Can a player understand what to do outdoors with one glance?
- Are status colors being used semantically?
- Would this survive German copy?
- Would another agent know what component to reuse next time?

## When To Update This System

Update the visual system when:

- A new product mode appears.
- A new status meaning appears.
- A new reusable pattern appears.
- A platform needs a different native expression of the same concept.
- Existing guidance proves wrong in implementation.

Do not update it for one-off screen decoration. The system should stay small
enough to follow.
