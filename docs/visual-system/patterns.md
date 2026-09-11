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

## Native safe areas

Player Field and Operator Setup/Command maps paint to the viewport edges. Keep
their controls in a separate inset layer: player map header/footer use the shared
safe gutters; operator overlays use `workspace-controls`. Reserve the 56px mobile
navigation row above the bottom inset. Do not pad the map or give an inner
workspace another viewport height after its parent has already reserved space.

`web/src/platform/safeArea.ts` initializes the four `--native-safe-*` measurements
from the device plugin and updates them on native layout changes, resize, and
foreground. The shared `--safe-*` CSS variables fall back to browser `env()` values.
UIKit scroll auto-insetting is disabled so CSS consumes the insets once; Android
reports only system-bar/cutout overlap with the WebView, in CSS pixels. Do not use
fixed estimates of notch or navigation-bar heights, or treat the keyboard as a
hardware safe area.

Ordinary full-page content uses `safe-area` or `safe-page`; fixed navigation uses
`safe-bottom-nav`; full-screen drawers and dialogs own their own insets. Include
left/right insets for landscape. Geometry checks and screenshots for portrait
iPhone, Android three-button navigation, and landscape iPhone live in
`web/e2e/operator-mobile.spec.ts`. These simulate inset values; physical device
testing remains required for OS/WebView integration.

### Phone operator workspace

The mobile bar divides its available width evenly among dashboard, modes, native
NFC, and profile. Language selection lives inside the profile menu, which opens
outside the scrolling rail and clamps to the viewport safe area. Setup readiness
and the content-panel action share a stacked layout on phones so they cannot
overlap. Drawer actions wrap separately from its scrollable tab row. Bases,
challenges, teams, and stages use `ListDetailLayout` to show one pane at a time on
phones and preserve the split view on desktop. Include a setup-game fixture with
the native NFC button; a browser-only live-game fixture misses these states.

## Guided Tutorial

Tutorials teach by doing, in the real operator UI, on a **practice game** the
operator can keep or delete at the end. A tutorial never touches a game made
for a real event: the first-game tutorial has the operator create its practice
game through the real dialog, and the advanced scenarios get one created and
seeded by the server on Start. Practice games carry a "Practice" badge in the
top bar and on the dashboard card, and the closing coach mark offers Keep and
Delete. A scenario is an ordered list of steps; each step spotlights one
existing element by its `data-testid` and explains what it does and what else
the screen offers.

Non-blocking is the rule. The scrim dims with the lighter tour scrim token, it
never intercepts a click, and the operator can ignore the bubble, wander to
another mode, and come back. Steps advance when real state changes — a base
exists, a field has a value, a mutation succeeded — not because someone pressed
Next. Next exists only for steps that are pure explanation. A step that is
already satisfied is skipped rather than asked for again; an explanation the
operator has not read is never skipped. Typed input counts only once it settles
for half a second, so the bubble never moves on mid-word. The bubble takes
focus only when nothing else holds it; a field being typed in or a control just
pressed keeps focus, and a polite live region announces the new step instead.
Pausing to the pill freezes the run: steps finished behind it are picked up on
resume. A click on the spotlit
element is recorded together with the DOM it produced, so a step that waits for
"printed and closed the sheet" cannot complete in the instant before the sheet
opens; a saved entity lands in the query cache from the server's response
before the refetch, so a guard keyed on the saved value reads it at once.

Prepare, do not perform. A step may reveal its anchor — switch mode, open or
close the drawer (the drawer's scrim covers the readiness panel, the mode rail
and settings), expand the readiness panel, open settings, select an entity —
and nothing else. It never creates a base, links a tag, saves a form, or changes game
status. The operator performs every domain action themselves, which is the whole
point of teaching on a real game.

Never point at nothing. An anchor that is rendered but sits outside the viewport
(a form field below the fold of a drawer) is scrolled into view once per step
before anything else happens. If the anchor is not rendered at all, the bubble
collapses to the pill; resuming from the pill returns to the step's screen and
re-runs the step's prepare to bring the anchor back. Anchors are tracked through
DOM mutations and for a short settle window after any trigger, so a drawer that
springs open is followed, not guessed.

On phones the bubble is a sheet above the 56 px tab bar, capped in height with
internal scroll, so the longest German step copy scrolls instead of clipping its
buttons. It takes the edge that leaves the anchor uncovered, or the dialog the
anchor lives in (a create form's buttons must stay reachable), moving to the top
when only the top edge clears it or when the anchor fills most of the screen; on
desktop it floats beside the anchor and flips against the viewport and the
safe-area insets. The spotlight lives on `z-[70]`; the coach popup and resume pill live on
`z-[71]`, above the dimming layer regardless of portal mount order. Both sit
above drawers and menus, below toasts.

## Operator editor density

Keep single-field settings visible; a disclosure header must not consume as much
space as the field it hides. Reserve compact summaries for larger optional editors,
without repeating the section title inside. Show dependent fields beside the
control that enables them, preserving entered values when hidden. Create a base
directly and continue in its existing editor. Use player-facing concepts such as
Challenge in base editing, rather than the underlying assignment terminology.
An item-level Print action prints that item; Print all belongs at collection level.

Base QR previews are buttons that open the shared `QrCodeViewer`. The viewer
uses the canonical dialog focus trap in a body portal, keeps the code black on
white in both themes, and saves a PNG through the platform share/download adapter.
NFC writing stays in the selected base editor on capable native clients; browser
clients explain the capability limit inline instead of sending the operator to
search another page. Route and Assignments share a wrapping action row.
