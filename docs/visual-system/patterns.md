# Product Patterns

Patterns are larger than components. They describe how common PointFinder tasks
should be structured.

## Map Workspace

Used by operator setup and command surfaces.

Structure:

- Full-screen map as spatial base.
- Top bar for game identity, status, stages, and mode.
- Left or bottom navigation for workspace modes.
- Floating panels for stats, activity, inspectors, and actions.
- Drawers for build/setup content.

Rules:

- Keep map context visible during inspection where possible.
- Panels should have stable dimensions and avoid layout shifts.
- Floating controls should not overlap critical map controls or each other.
- The selected object must be obvious on both map and panel.
- Closing an inspector should restore useful map context when possible.

## Player Check-In

Used by player field mode.

Structure:

- Clear NFC/scan visual.
- Short instruction.
- One primary scan/check-in action.
- Sync/offline status nearby.
- Blocking state when game is not live or NFC is unavailable.
- Success confirmation before navigation to challenge detail.

Rules:

- Do not bury scan behind tabs or secondary controls.
- Treat duplicate check-in success as success.
- Explain NFC failures in actionable language.
- If the action is queued offline, say so clearly.

## Challenge Solve

Structure:

- Player-facing challenge title.
- Optional description/content.
- Answer input based on answer type.
- Presence/NFC re-scan requirement when configured.
- Submit action.
- Submission result and sync state.

Rules:

- Do not show operator notes.
- Do not show points as the primary player motivator unless product direction changes.
- If content includes resolved variables, players should see resolved text, not raw template keys.
- Media upload states must be explicit: selected, uploading, queued, failed, submitted.

## Operator Setup Drawer

Used by web build mode and native setup management.

Structure:

- Tabs or sections for bases, challenges, teams, stages, tags, variables.
- Search/filter for long lists.
- New/create action.
- Detail/edit area.
- Validation and readiness indicators.

Rules:

- Creation should use sensible defaults, then guide editing.
- Advanced assignment and variable behavior must be discoverable but not forced into the first path.
- NFC-linked state is a first-class field for bases.
- Hidden bases and unlocks must use clear state language.

## Readiness Checklist

Used before game goes live.

Structure:

- Checklist of required conditions.
- Pass/fail state per item.
- Counts where useful.
- Link or action to resolve missing items.
- Final go-live action disabled or guarded until ready.

Rules:

- Mirror backend readiness rules.
- Do not show vague "not ready" errors.
- Include variables, assignments, NFC linking, teams, bases, challenges, and location-bound constraints.
- Native platforms may rely on backend enforcement, but the desired direction is visible preflight everywhere.

## Operator Command Overlay

Used while a game is live.

Structure:

- Stats strip: teams, pending, progress, elapsed, location visibility, notify.
- Activity feed: filtered, exportable where useful, inline review shortcuts if safe.
- Leaderboard: operator-only, compact, location staleness aware.
- Inspectors: base/team contextual detail.
- Realtime connection warning.

Rules:

- Live problems should be visible without hunting.
- Pending submissions should be actionable.
- Team location staleness must be distinguishable from active location.
- Rescue actions must be contextual and auditable.
- Avoid covering too much map at once.

## Submission Review

Structure:

- Submission list with status filters.
- Detail panel with team, base, challenge, answer/media, timestamps.
- Expected answer/resolved variable context where applicable.
- Approve/reject controls.
- Feedback and point override when supported.
- History and audit context.

Rules:

- Review decisions must be reversible or clearly final according to backend behavior.
- Dangerous or unusual decisions should require confirmation.
- Media should render in a stable viewer area.
- Empty states should distinguish "no pending" from "no submissions at all".

## Status Badges

Status badges should be small, readable, and semantic.

Required badge concepts:

- Setup.
- Live.
- Ended.
- NFC linked / missing.
- Checked in.
- Submitted / pending review.
- Completed / approved / correct.
- Rejected.
- Offline.
- Sync pending.
- Sync failed.
- Stale location.
- Hidden / locked.
- Operator override.

Rules:

- Use shared status tokens.
- Include text, not just color.
- Use icons when state needs quick scanning.
- Keep labels short.

## Empty States

Empty states are operational guidance, not marketing copy.

Structure:

- Optional icon.
- Short title.
- One-sentence explanation.
- One primary action when there is an obvious next step.

Rules:

- Say what is empty and what to do.
- Avoid humor or decorative copy in operator/admin contexts.
- Empty player states should reassure and guide.

## Error States

Structure:

- What failed.
- Why, if known.
- What the user can do next.
- Retry or navigation action when applicable.

Rules:

- Preserve backend messages when helpful.
- Do not turn permission errors into session-expired errors.
- Failed sync actions should remain visible and retryable.
- Destructive failures should explain what did and did not change.

## Loading States

Rules:

- Use skeletons for stable content regions where layout is known.
- Use spinners for short or unknown waits.
- Do not block the whole screen when a panel-level load is enough.
- Avoid layout jumps between loading and loaded states.

## Destructive Actions

Rules:

- Use red/destructive styling only for destructive actions.
- Separate destructive actions from primary actions.
- Confirm deletion, reset, removal, and irreversible state changes.
- Confirmation copy must name the object and consequence.

## Localization And Long Text

Rules:

- Design for English, Portuguese, and German.
- German labels may be significantly longer.
- Buttons must not clip text.
- Tables/lists should truncate secondary text, not primary identity, unless unavoidable.
- Dynamic values should use tabular numbers where scan speed matters.
