# Variable Autocomplete & Auto-Validation UX — Design

**Date:** 2026-04-17
**Status:** Draft — awaiting user review
**Scope:** web-admin + iOS operator + Android operator
**Author:** David (via brainstorming session)

## Summary

Bring variables to first-class UX in three places:

1. **Rich text editor**: Slack-`@`-style `{{` autocomplete popup + toolbar picker button, variables render as atomic pill tokens.
2. **Auto-validated answers (`correctAnswer`)**: replace web's comma-separated input with a chip array (parity with iOS/Android), with variable-aware autocomplete on the add-chip field.
3. **Preview as team**: toggle in the editor and always-on resolution in operator SubmissionDetail, so operators can see exactly what a given team was expected to answer.

The backend already resolves `{{key}}` references per team at submission time (`SubmissionService.java:132-146` → `TemplateVariableService.resolveTemplates`). This design is primarily a UX and safety layer on top of that existing capability, plus a readiness check to catch undefined references before go-live.

## Context

### What works today

- Backend stores `Challenge.correctAnswer` as `List<String>` (JSON array, V11 migration), each item a template string.
- `TemplateVariableService.resolveTemplates(List<String>, gameId, challengeId, teamId)` substitutes `{{key}}` per team at submission time, then `SubmissionService` compares with `trim().equalsIgnoreCase`. Challenge-scoped variables override game-scoped.
- Go-live readiness (`TeamVariableService.validateVariableCompleteness`) verifies that every *defined* key has a row for every team.
- iOS and Android have a **modal variable picker** (curly-braces toolbar button) that inserts `<span class="variable-tag">{{key}}</span>` into the WebView-based rich text editor. Android also has a `CreateVariableDialog` for inline creation.
- Web-admin: TipTap v3 rich text editor with **no variable UX at all**; `correctAnswer` is a single `<Input>` parsed by `split(',')`.

### Gaps

- Operators have no discoverability: the fact that `correctAnswer` supports `{{key}}` templates is buried in docs. No autocomplete, no picker on the `correctAnswer` field on any platform.
- Web has the worst variant: comma-separated plain text input, no variable awareness anywhere (editor or answer field).
- A typo like `{{secrt}}` instead of `{{secret}}` silently compares against the literal string — no visual, save-time, or readiness check flags it.
- Operator review (`SubmissionDetail.tsx`) shows the raw `{{secret}}` when investigating a rejected submission. No way to see what the team's expected answer actually resolved to.
- No way to preview challenge content as a specific team before going live.

### Key references

- Backend: `backend/src/main/java/com/prayer/pointfinder/service/SubmissionService.java:132-146`, `service/TemplateVariableService.java`, `service/TeamVariableService.java:132-167`, `entity/Challenge.java:41-50`.
- Web: `web-admin/src/components/editor/RichTextEditor.tsx:169-187`, `features/build/ChallengeDetail.tsx:81-186,309-340,605-640`, `features/review/SubmissionDetail.tsx:320-326`.
- iOS: `ios-app/dbv-nfc-games/Features/Operator/RichTextEditorView.swift:160-200,489-641`, `Features/Operator/ChallengeEditView.swift:24,70,163-181,342-358`.
- Android: `android-app/feature/operator/src/main/kotlin/com/prayer/pointfinder/feature/operator/RichTextEditorScreen.kt:208-453,545-549`, `feature/operator/.../ChallengeEditScreen.kt:106-181,428-456,760-789`.
- Docs: `docs/business-logic.md:203-235,882-927`, `docs/api-reference.md:368-386,1159-1200`.

## Goals

- Single, consistent pattern for inserting a variable: **autocomplete on `{{` + toolbar picker button**, on every surface that accepts variables (content, completionContent, correctAnswer).
- Variables render as atomic, visually distinct pills in the editor on all three platforms.
- Operators can preview challenge content and `correctAnswer` as any team.
- Operators can see the team-resolved expected answer on SubmissionDetail to debug rejects.
- Undefined-key references are caught visually (editor), at save time (client form), and at go-live (server readiness).

## Non-goals

- No schema changes. `{{key}}` stays the wire format.
- No change to backend matching semantics (`trim().equalsIgnoreCase`). No regex, no fuzzy match in this design.
- No feature flag. Tokenization is a pure rendering change over the existing canonical form.
- No player-facing preview. Only operators get preview affordances.
- No new submission-review UI on iOS/Android operator apps (today's review happens on web; noted, not a regression).
- Player-facing challenge rendering on iOS/Android remains as-is — content is already resolved server-side in `PlayerService.getGameData`.

## Design

### 1. Foundations (data model)

- **Wire format unchanged.** `content`, `completionContent`, `correctAnswer[*]` continue to be strings containing `{{key}}` where desired.
- **Pill is rendering-only.** On load, each client tokenizes `{{key}}` into a pill node. On save, pills serialize back to `{{key}}`.
- **Available keys source.** Each client already loads game-level + challenge-level variables via `GET /api/games/{gameId}/team-variables` and `GET /api/games/{gameId}/challenges/{challengeId}/team-variables`. The union of keys is the autocomplete suggestion set. No new endpoint.
- **Preview resolver runs client-side.** Simple `{{key}} → value` substitution using the already-loaded variable list; no new backend call. Semantics match the backend because it's the same textual substitution, and we only use this for visual preview — submission matching still runs through the backend's `TemplateVariableService` as today.

### 2. Authoring UX

#### 2.1 Web — TipTap Mention extension

- Install `@tiptap/extension-mention` + `@tiptap/suggestion` in `web-admin/package.json`.
- Define a `VariableMention` extension in `web-admin/src/components/editor/extensions/VariableMention.ts`:
  - `char: '{{'` (TipTap supports multi-character triggers via custom matcher).
  - `HTMLAttributes: { class: 'variable-tag' }` (reuse the shared pill CSS class).
  - `renderHTML` / `parseHTML` round-trip: the node renders as `<span class="variable-tag" data-variable-key="secret">{{secret}}</span>`; serialization to plain text yields `{{secret}}` (via TipTap's `renderText`).
- Suggestion renderer: a shadcn `Command` palette popover, keyboard-navigable, filtered by prefix. Last item when no exact match: **"Create variable `{{typed}}`"** — opens an inline dialog to define the key and per-team values via existing `useVariableMutations` hook, then inserts the pill.
- Toolbar gets a "{ }" button that opens the same suggestion list at the cursor (no `{{` typing required).
- Wire `RichTextEditor.tsx` to accept a `variableKeys: string[]` + `onCreateVariable` prop; `ChallengeDetail.tsx` passes them from `useVariables`.

#### 2.2 iOS — WKWebView + native overlay

- Keep the existing `curlybraces` toolbar button and `VariablePickerSheet` (`RichTextEditorView.swift:160-200,332-355`) — don't regress working UX.
- Add a JS listener inside the `contentEditable` iframe: on `input` events, detect that the caret has just passed `{{` (two open braces with no intervening close). Post a `webkit.messageHandlers.variableTrigger` message with `{ partial: 'sec', x: caretX, y: caretY }`.
- Swift side renders a native SwiftUI `List` overlay positioned at the caret. On select, bridge calls `insertHTML('<span class="variable-tag" contenteditable="false">{{key}}</span>&nbsp;')` — the exact same span the picker sheet already produces.
- Escape key / tapping outside dismisses. Backspace past the `{{` also dismisses.
- "Create variable..." last item opens the existing `TeamVariablesManagementSheet` prefilled with the partial.
- **Atomic pill**: the inserted span already has `contenteditable="false"` — one backspace deletes the whole pill, no half-edit state.

#### 2.3 Android — Compose + WebView overlay

- Same shape as iOS. Existing `VariablePickerDialog` (`RichTextEditorScreen.kt:383-418`) and toolbar button stay.
- JS side posts via `JavascriptInterface.onVariableTrigger(partial: String, x: Float, y: Float)`. Compose side renders a `DropdownMenu` overlay anchored to the caret.
- `CreateVariableDialog` (`:420-453`) is reused for the "Create variable..." path.
- `insertHTML` already produces the same span shape — the only change is adding `contenteditable="false"` in the WebView HTML template so pills are atomic (iOS and Android share the inner HTML template).

#### 2.4 `correctAnswer` chip input

- **Web**: replace the comma-separated `<Input>` in `ChallengeDetail.tsx:334-340` with a chip array component matching iOS/Android's mental model. Each chip is a string (literal, variable pill, or mixed). Clicking a chip edits it; X removes it. Add-chip is a single-line input that supports the same `{{` autocomplete popover as the rich text editor.
- **iOS**: replace the `.alert(..., isPresented: $showAddAnswerAlert)` add-chip TextField (`ChallengeEditView.swift:342-351`) with an inline `VariableAwareTextField` that invokes the same overlay used in the rich editor. Chips already render as FlowLayout — keep.
- **Android**: replace the `AlertDialog` with a single `OutlinedTextField` (`ChallengeEditScreen.kt:760-789`) with an inline autocomplete popover variant. Chips already render as `AssistChip`s — keep.
- **Mixed content allowed**: a chip may contain `"{{prefix}}-FOX"` — rendered as `[prefix]-FOX` with the pill inline in the chip surface. Backend matching (`trim().equalsIgnoreCase` on fully-resolved string) already supports this.

### 3. Review & preview

#### 3.1 Editor "Preview as team" toggle

- Each rich text editor surface gets a header bar: **`[ Edit | Preview ]`** plus a team dropdown when Preview is active.
- Edit mode: pills render as tokens, surface is editable.
- Preview mode: pills resolve inline to the selected team's values, surface is read-only, literal text renders as-is. Team dropdown is live — switching re-renders.
- Default team when entering Preview: the first team alphabetically in the game (stable, no surprises).
- Unresolved keys render as **`⚠ {{unknownKey}}`** with red underline and tooltip "No variable defined for this team" (covers both globally undefined keys and keys missing for the selected team).
- Same toggle applies above the `correctAnswer` chip list: Edit mode shows chips with pills; Preview mode shows chips with the resolved string per the selected team.

#### 3.2 SubmissionDetail auto-resolved expected answer

Current: `SubmissionDetail.tsx:320-326` shows raw `correctAnswer` including `{{secret}}`.

New layout:
```
Expected (raw):                 {{secret}}
Expected (resolved for Foxes):  FOX, fox, 🦊
Team answered:                   fix
Result:                          rejected
```

- Always shown, no toggle — operator already knows the submitting team in context.
- If the team has no value for a referenced key, show `⚠ Variable "secret" not defined for this team` in place of the resolved row.
- Applies to both auto-validated and manually-reviewed submissions (operators see the expected answer either way).

### 4. Safety — undefined-key defense in depth

**Layer 1 — Visual (editor)**
- A pill whose key isn't in the game's variable set renders with a red border, warning icon, and tooltip: "Variable `foo` is not defined. Create it or remove this reference."
- Same treatment in Preview mode when the selected team doesn't have a value for the key.

**Layer 2 — Save-time (client form)**
- Before the challenge edit form submits, scan `content`, `completionContent`, and each `correctAnswer` item for `{{key}}` references.
- If any reference an undefined key, show a blocking confirmation modal listing offenders with "Fix" (focuses the first offender) and "Create variables now" (opens bulk-create dialog) buttons, plus "Save anyway" for the operator-override path.
- Clients, not backend, enforce this (UX guard, not a schema constraint).

**Layer 3 — Go-live (server readiness)**
- Extend `TeamVariableService.validateVariableCompleteness` (`TeamVariableService.java:132-167`) to additionally scan every challenge's `content`, `completionContent`, `correctAnswer[*]` for `{{key}}` references and verify each referenced key has a row for every team.
- New error code in `ErrorCode` enum: `VARIABLE_REFERENCE_UNDEFINED` with payload `{ challengeId, referencedKey, missingForTeams: [...] }`.
- Surfaces in the readiness checklist; blocks `setup → live` transition.

## Backend changes (minimal)

- Extend `TeamVariableService.validateVariableCompleteness` with challenge-reference scanning (reuses the existing `{{key}}` regex from `TemplateVariableService`).
- Add `VARIABLE_REFERENCE_UNDEFINED` to the `ErrorCode` enum and document in `docs/api-reference.md` Error Codes appendix.
- No new migration, no new entities, no new endpoints.

## Testing

### Backend (`backend/src/test/`)
- `TemplateVariableServiceTest`: verify existing `resolveTemplates(List<String>, ...)` handles mixed literal + variable strings (`"{{prefix}}-FOX"`), empty list, repeated keys, unknown keys left as-is.
- `TeamVariableServiceTest`: extend completeness tests with challenge-reference scanning; new case where `{{foo}}` appears in content but `foo` has no rows → `VARIABLE_REFERENCE_UNDEFINED`.
- `GameServiceTest`: go-live transition fails with `VARIABLE_REFERENCE_UNDEFINED` when a challenge references an undefined key.
- E2E smoke (`e2e/api`): operator defines `{{secret}}` per team, creates challenge with `correctAnswer = ["{{secret}}"]`, each team's submission auto-validates against its own value.

### Web (`web-admin/src/**/*.test.tsx`)
- `RichTextEditor.test.tsx`: mention suggestion list renders; `{{` triggers popover; pill serializes to `{{key}}` on save; `{{key}}` in initial content parses to pill; undefined-key pill renders with warning state.
- `ChallengeDetail.test.tsx`: chip array renders correctAnswer; add-chip autocomplete; save-time undefined-key warning modal; preview toggle switches pill tokens to resolved strings for selected team; mixed literal+pill chip renders + persists.
- `SubmissionDetail.test.tsx`: resolved-expected-answer row appears; shows `⚠ Variable ... not defined for this team` when team lacks a key.

### iOS (`ios-app/dbv-nfc-gamesTests/`)
- Unit test on the autocomplete JS→native bridge: typing `{{s` posts the correct payload; selecting a key invokes the expected `insertHTML`.
- Snapshot test on the native overlay at a fixed caret position.
- Integration: `ChallengeEditView` preview toggle renders resolved values for a given team.

### Android (`android-app/feature/operator/**/test/`)
- Unit test on the JavascriptInterface bridge (same shape as iOS).
- Compose test on the `DropdownMenu` overlay positioning and key selection.
- Integration: `ChallengeEditScreen` preview toggle renders resolved values.

### Parity check
- Run the cross-platform parity audit (on the memory-listed priority list) over 6 surfaces: web editor, web correctAnswer, iOS editor, iOS correctAnswer, Android editor, Android correctAnswer.
- Verify go-live readiness surfaces the new error on all three clients.

## Rollout

- No feature flag. Tokenization is a pure rendering change over canonical `{{key}}` — old content auto-tokenizes on load; new content saves as `{{key}}`.
- Order of landing (suggested, not prescriptive):
  1. Backend: extend readiness validation + new error code.
  2. Web: TipTap Mention extension + chip input + preview toggle + SubmissionDetail resolve.
  3. iOS: JS trigger bridge + native overlay + chip input preview toggle.
  4. Android: mirror iOS.
- Docs in the same changeset: `docs/business-logic.md` Variables + Auto-validate sections, `docs/api-reference.md` Error Codes appendix.

## Decisions noted during brainstorm

- **Scope**: full parity on web + iOS + Android in one spec (user preference: "at least B" → chose full parity).
- **Pill-based (not plain-text) approach**: chosen for discoverability and atomic-edit safety.
- **Preview surfaces**: both editor and SubmissionDetail.
- **Autocomplete "Create variable..." last item**: yes, matches Android's current `CreateVariableDialog` pattern.
- **Mixed literal+pill chips in correctAnswer**: yes, for flexibility; backend already supports it.
- **Client-side preview resolver, not a new backend endpoint**: same textual substitution logic; keeps preview instant and avoids network chatter.

## Open items / follow-ups (not in this spec)

- Operator SubmissionDetail on iOS/Android: today submission review is web-only. Not a regression, but a future parity item.
- Player-facing preview: out of scope; players never edit, and server already resolves content before sending to players.
- Per-team preview for `base.description` / other variable-accepting surfaces: the same tokenization will work, but is not in the scope of this spec. Add in a follow-up wave if desired.
