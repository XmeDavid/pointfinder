# Product Modes

Use product modes to decide layout density, tone, components, and priorities.
Every UI change should identify its mode before implementation.

## Public / Marketing

Purpose: explain PointFinder and create confidence before login.

Visual direction:

- Editorial, cartographic, field-atlas inspired.
- Brand-forward but still literal about the product.
- May use compass, route, NFC, tag, and map motifs.
- May use larger typography and richer visual storytelling.

Rules:

- The product must be visible above the fold: NFC bases, map, operators, mobile play, or field-game setup.
- Avoid generic outdoor imagery that could belong to any camping app.
- Do not imply player features that do not exist, such as public player leaderboards.
- Calls to action should match real routes and product behavior.

Primary messages:

- Build NFC field games.
- Place bases on a map.
- Let teams scan and solve.
- Run the game live.

## Auth / Onboarding

Purpose: get the right person into the right post-login world.

Visual direction:

- Focused, calm, trusted.
- More atmosphere than admin screens, less than marketing.
- Clear split in action choices, but still one app.

Rules:

- Login and join flows must clearly distinguish operator login from player join.
- Avoid large amounts of explanatory copy.
- Make error states specific and recoverable.
- Do not make the user guess whether they are joining as a player or signing in as an operator.

## Player Field Mode

Purpose: help players explore, scan NFC tags, solve challenges, and trust sync.

Visual direction:

- Simple, high contrast, touch-first.
- Map and NFC actions dominate.
- Status language is friendly and direct.
- One primary action per screen whenever possible.

Rules:

- Large touch targets and readable text are mandatory.
- Offline, pending sync, failed sync, and game-not-live states must be visible.
- NFC scanning must feel central and trustworthy.
- Players should not see operator-only data: other-team scores, full leaderboards, operator notes, hidden admin tags, or review internals.
- Use challenge titles and player-facing content, not operator-oriented base names, when solving.

Canonical surfaces:

- Player join.
- Map.
- Check-in scan.
- Base detail.
- Challenge solve.
- Submission result.
- Notifications.
- Settings.

## Operator Setup Mode

Purpose: create and validate a game before it goes live.

Visual direction:

- Structured, form-forward, map-aware.
- Medium density.
- Clear validation and readiness.

Rules:

- Prefer guided creation and grouped panels over sprawling forms.
- Show what is missing before an operator goes live.
- Bases, challenges, teams, stages, tags, variables, assignments, and NFC linking must use reusable management components.
- Destructive actions need clear confirmation and consequence text.
- Advanced configuration should be available without overwhelming the default flow.

Canonical surfaces:

- Game creation.
- Base/challenge setup.
- Team setup.
- Assignments.
- Stages.
- Tags.
- Variables.
- NFC writing.
- Readiness checklist.
- Settings.

## Operator Command Mode

Purpose: run a live game and recover from problems quickly.

Visual direction:

- Dark or high-contrast map-first workspace.
- Dense but stable overlays.
- Live status and stale data are obvious.
- Action panels float over map context.

Rules:

- Preserve the map as the spatial anchor.
- Panels should be compact, scan-friendly, and collapsible where needed.
- Live, pending, stale, rejected, completed, and no-signal states must be distinguishable by color, shape/icon, and text.
- Rescue actions must be available from the context where the operator needs them.
- Avoid decorative animation and unnecessary layout shifts.

Canonical surfaces:

- Live map.
- Activity feed.
- Stats strip.
- Leaderboard for operators.
- Team inspector.
- Base inspector.
- Notification sender.
- Manual check-in.
- Mark completed.
- Unlock override.

## Review Mode

Purpose: evaluate submissions accurately and consistently.

Visual direction:

- Dense, readable, auditable.
- Media-friendly.
- Clear decisions and feedback.

Rules:

- Pending items must be easy to find.
- Submission content, challenge context, team identity, status, feedback, points, and history should be visible or one click away.
- Approve/reject actions must be visually distinct and safe from accidental activation.
- Resolved variable values and expected answers must be clear where applicable.

## Results Mode

Purpose: understand outcomes after or during a game.

Visual direction:

- Analytical and export-friendly.
- Tables, rankings, charts, and breakdowns may be denser.

Rules:

- Results must be explainable: points, completed challenges, rejected/pending work, and team breakdowns should be traceable.
- Export and broadcast actions should not be buried.
- Avoid celebratory visuals that obscure actual standings or data quality.

## Admin / Organization / Billing

Purpose: manage accounts, organizations, quotas, billing, and system-level data.

Visual direction:

- Quiet, conventional, predictable.
- Low decoration.
- Strong tables/forms and clear navigation.

Rules:

- Do not use field-game atmosphere where trust and account clarity matter more.
- Quotas and billing states must be human-readable.
- Permission boundaries must be obvious.
- Admin-only actions must be clearly separated from operator game actions.
