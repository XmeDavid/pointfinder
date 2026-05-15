# Agent Checklist For UI Work

This checklist is for AI agents and humans touching visual code.

## Before You Edit

1. Identify the product mode:
   - Public / Marketing
   - Auth / Onboarding
   - Player Field
   - Operator Setup
   - Operator Command
   - Review
   - Results
   - Admin / Organization / Billing
2. Read the relevant visual-system document.
3. Search for existing components before creating new UI.
4. Check platform equivalents if the concept exists on another platform.
5. Confirm whether the data is player-facing or operator-only.
6. For web UI, read `web-tailwind.md` and use semantic Tailwind classes only.

## While Implementing

Follow these rules:

- Use semantic tokens.
- Use existing primitives and layout components.
- Extract reusable product components.
- Keep screens as composition.
- Do not add hard-coded hex colors outside theme/token files.
- On web, do not use raw Tailwind palette classes in authenticated product UI.
- Do not add one-off radius, shadow, blur, or badge styles.
- Do not create nested cards or nested glass panels.
- Do not invent new status meanings.
- Do not expose operator-only data to players.
- Use icons from the platform icon library.
- Add accessible labels for icon-only controls.
- Handle loading, empty, error, disabled, selected, and long-text states where applicable.
- Respect dark mode and reduced motion.
- Design for English, Portuguese, and German strings.

## Component Extraction Rule

Extract a component when:

- It appears twice.
- It has a product name.
- It has state variants.
- It combines color, icon, and text.
- It is likely to need platform parity.
- It would otherwise require substantial inline styling.

## Status Color Rule

Use these meanings:

- Green: primary, live, completed, approved, correct.
- Blue: checked in, active info, team/base location signal.
- Amber: pending, submitted, sync queued, caution.
- Red: rejected, failed, destructive, blocked.
- Purple/indigo: operator override or secondary category.
- Gray: inactive, unknown, disabled, archived, no signal.

If you need a new status, update `tokens.md` and the relevant components first.

## Map UI Rule

For any map-based UI:

- Preserve spatial context.
- Use shared map markers.
- Keep floating panels compact.
- Make selected objects obvious.
- Avoid panel overlap on mobile and desktop.
- Do not hide critical markers behind permanent panels.

## Player UI Rule

For player-facing UI:

- Keep one primary action visible.
- Show offline/sync state.
- Make NFC scan/check-in central when relevant.
- Use player-facing challenge text.
- Hide operator notes, other-team data, full leaderboard, audit internals, and admin tags.

## Operator UI Rule

For operator-facing UI:

- Prioritize live clarity and recovery.
- Make pending/stale/failed states easy to scan.
- Keep rescue actions contextual and intentional.
- Preserve auditability.
- Prefer dense, stable panels over decorative cards.

## Review Before Finishing

Check:

- Does this follow the correct product mode?
- Did I reuse or extract components?
- Are tokens used consistently?
- Are all relevant states covered?
- Does it work in dark and light themes?
- Does it work at mobile and desktop widths where applicable?
- Are labels accessible?
- Are translated strings likely to fit?
- Did I update the visual system if I introduced a new pattern?

## Verification Expectations

For web UI:

- Run typecheck and lint for changed code.
- Run affected tests.
- When the visual harness exists, add or update the harness state.
- For significant visual changes, capture desktop and mobile screenshots.

For iOS:

- Add or update SwiftUI previews for reusable visual components.
- Run affected tests/build checks when practical.

For Android:

- Add or update Compose previews for reusable visual components.
- Run affected tests/build checks when practical.

## If The Existing Code Conflicts

Do not copy inconsistent old styling just because it exists. Prefer this order:

1. Existing component that matches the visual system.
2. Small refactor of an existing component toward the visual system.
3. New reusable component following the visual system.
4. Screen-local styling only for truly one-off layout glue.

If a large refactor would be needed, keep the current change small but document
the drift in the PR or task notes.
