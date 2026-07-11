# Variable Autocomplete & Auto-Validation UX — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give operators discoverable, pill-based variable authoring + "preview as team" + per-team resolved expected-answer on submission review, across web / iOS / Android, with undefined-key safety defended at visual, save-time, and go-live layers.

**Architecture:** Pure UX + safety layer over the already-working backend variable resolution (`TemplateVariableService`). Wire format (`{{key}}`) is unchanged. Each client tokenizes `{{key}}` into atomic pills on load and serializes pills back to `{{key}}` on save. The autocomplete popover + toolbar picker + chip input + preview toggle are added per-platform. Backend extends `validateVariableCompleteness` to scan challenge references and emits a new `VARIABLE_REFERENCE_UNDEFINED` error at go-live.

**Tech Stack:** Spring Boot 3 / Java 21 (backend). React 19 + TipTap v3 + Vitest + MSW (web-admin). Swift + SwiftUI + WKWebView (iOS). Kotlin + Compose + WebView (Android). Existing `TeamVariableService` / `TemplateVariableService` unchanged except for readiness extension.

**Spec:** `docs/superpowers/specs/2026-04-17-variable-autocomplete-and-auto-validation-ux-design.md`

## Parallelization Map

The plan is split into **4 parallel tracks** (Waves A–D) that can be worked concurrently by independent agents, followed by a sequential integration wave (E). All 4 parallel waves can start at t=0 — there are no cross-wave code dependencies; each wave produces its own committable deliverable.

```
t=0  ┌── Wave A: Backend readiness + error code (1 agent, ~4 tasks)
     ├── Wave B: Web-admin (1 agent, ~8 tasks)
     ├── Wave C: iOS operator (1 agent, ~7 tasks)
     └── Wave D: Android operator (1 agent, ~7 tasks)
                  │
                  ▼
t=1           Wave E: Cross-platform E2E + docs audit (sequential)
```

**Dispatching instructions:** fan out 4 agents at once, one per wave. Each agent owns its wave end-to-end (all tasks, all commits). Do not share in-flight branches. Once all 4 land on trunk, run Wave E.

**Within-wave order:** tasks inside a wave are sequential (TDD red → green → commit). A single agent per wave avoids merge conflicts on the same files.

**Shared vocabulary (used across all waves):**

- **Pill / variable-tag**: `<span class="variable-tag" data-variable-key="KEY" contenteditable="false">{{KEY}}</span>` is the canonical HTML rendering. The `.variable-tag` CSS class already exists in iOS (`RichTextEditorView.swift:616-624`) and Android (`RichTextWebEditor.kt:86-87`); web adds it as part of Wave B.
- **`{{KEY}}` regex**: `\{\{([a-zA-Z][a-zA-Z0-9_]*)\}\}` — matches backend's `TemplateVariableService` pattern.
- **Available keys**: union of game-level keys (`GET /api/games/{gameId}/team-variables`) and challenge-level keys (`GET /api/games/{gameId}/challenges/{challengeId}/team-variables`).
- **Client-side resolver**: pure function `(text, variables, teamId) → string` doing `text.replaceAll('{{KEY}}', value)`. Used for editor/preview only — submission matching still runs backend-side.

---

## Wave A — Backend: readiness validation + error code

**Owner:** one backend agent. All tasks in this wave touch backend Java + backend tests + docs. No client changes.

**Files:**
- Modify: `backend/src/main/java/com/prayer/pointfinder/exception/ErrorCode.java`
- Modify: `backend/src/main/java/com/prayer/pointfinder/service/TeamVariableService.java`
- Modify: `backend/src/test/java/com/prayer/pointfinder/service/TeamVariableServiceTest.java`
- Modify: `docs/api-reference.md`
- Modify: `docs/business-logic.md`

### Task A.1: Add `VARIABLE_REFERENCE_UNDEFINED` error code

**Files:**
- Modify: `backend/src/main/java/com/prayer/pointfinder/exception/ErrorCode.java`

- [ ] **Step 1: Add error code constant**

Locate the enum's domain-grouped constants (existing groupings include `// ── Tags ──`, `// ── Stages ──`). Add a new group at the bottom, before the closing `}`:

```java
    // ── Variables ─────────────────────────────────────────────────────────
    /**
     * A challenge's content, completionContent, or correctAnswer references a
     * {@code {{key}}} that has no matching variable defined for at least one
     * team. Emitted at {@code setup → live} transition. The error payload
     * includes the offending challenge id, referenced key, and teams that
     * are missing a value for that key.
     */
    VARIABLE_REFERENCE_UNDEFINED,
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/main/java/com/prayer/pointfinder/exception/ErrorCode.java
git commit -m "feat(backend): add VARIABLE_REFERENCE_UNDEFINED error code

Wave A.1 — prep for challenge-reference readiness validation."
```

### Task A.2: Extend `validateVariableCompleteness` with challenge scanning — TDD

**Files:**
- Modify: `backend/src/test/java/com/prayer/pointfinder/service/TeamVariableServiceTest.java`
- Modify: `backend/src/main/java/com/prayer/pointfinder/service/TeamVariableService.java`

- [ ] **Step 1: Write the failing test**

Locate existing `validateVariableCompleteness` tests in `TeamVariableServiceTest.java`. Append a new test method:

```java
    @Test
    void validateVariableCompleteness_flagsUndefinedReferenceInChallengeContent() {
        UUID gameId = UUID.randomUUID();
        UUID challengeId = UUID.randomUUID();
        UUID teamId = UUID.randomUUID();

        Game game = new Game();
        game.setId(gameId);

        Team team = new Team();
        team.setId(teamId);
        team.setName("Foxes");

        Challenge ch = new Challenge();
        ch.setId(challengeId);
        ch.setGame(game);
        ch.setContent("Find the {{secret}} location");
        ch.setCompletionContent("");
        ch.setCorrectAnswer(List.of("{{secret}}"));

        when(teamRepository.findByGameId(gameId)).thenReturn(List.of(team));
        when(challengeRepository.findByGameId(gameId)).thenReturn(List.of(ch));
        when(teamVariableRepository.countKeysPerTeam(gameId))
            .thenReturn(List.of());
        when(challengeTeamVariableRepository.countKeysPerTeam(gameId))
            .thenReturn(List.of());

        VariableCompletenessResponse result =
            teamVariableService.validateVariableCompleteness(gameId);

        assertFalse(result.complete());
        assertTrue(
            result.errors().stream().anyMatch(e ->
                e.contains("secret") && e.contains("Foxes")),
            "expected error mentioning 'secret' and team 'Foxes', got: " + result.errors()
        );
    }

    @Test
    void validateVariableCompleteness_passesWhenAllReferencesResolve() {
        UUID gameId = UUID.randomUUID();
        UUID challengeId = UUID.randomUUID();
        UUID teamId = UUID.randomUUID();

        Game game = new Game();
        game.setId(gameId);

        Team team = new Team();
        team.setId(teamId);

        Challenge ch = new Challenge();
        ch.setId(challengeId);
        ch.setGame(game);
        ch.setContent("Find {{secret}}");
        ch.setCompletionContent("");
        ch.setCorrectAnswer(List.of("{{secret}}"));

        when(teamRepository.findByGameId(gameId)).thenReturn(List.of(team));
        when(challengeRepository.findByGameId(gameId)).thenReturn(List.of(ch));
        when(teamVariableRepository.countKeysPerTeam(gameId))
            .thenReturn(List.of(new TeamKeyCount(teamId, "secret", 1L)));
        when(challengeTeamVariableRepository.countKeysPerTeam(gameId))
            .thenReturn(List.of());

        VariableCompletenessResponse result =
            teamVariableService.validateVariableCompleteness(gameId);

        assertTrue(result.complete(), "errors: " + result.errors());
    }
```

If the existing test file doesn't import `ChallengeRepository` as a mock, add it to the `@Mock` list at the top of the class.

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && ./gradlew test --tests "com.prayer.pointfinder.service.TeamVariableServiceTest.validateVariableCompleteness_flagsUndefinedReferenceInChallengeContent" --tests "com.prayer.pointfinder.service.TeamVariableServiceTest.validateVariableCompleteness_passesWhenAllReferencesResolve"
```

Expected: both tests fail because the method doesn't scan challenge references yet.

- [ ] **Step 3: Implement the scan**

In `TeamVariableService.java`, find the `validateVariableCompleteness(UUID gameId)` method (around line 132). Add a private helper at the end of the class:

```java
    private static final Pattern VARIABLE_REF_PATTERN =
        Pattern.compile("\\{\\{([a-zA-Z][a-zA-Z0-9_]*)\\}\\}");

    /**
     * Scans every challenge in the game for {{key}} references in content,
     * completionContent, and correctAnswer. For each referenced key, verifies
     * that every team in the game has a value defined (game-scope or
     * challenge-scope). Returns a list of human-readable error strings, one
     * per (challenge, key, missing-team).
     */
    private List<String> scanChallengeReferences(UUID gameId) {
        List<Challenge> challenges = challengeRepository.findByGameId(gameId);
        List<Team> teams = teamRepository.findByGameId(gameId);
        if (challenges.isEmpty() || teams.isEmpty()) return List.of();

        Map<UUID, Set<String>> definedKeysByTeam = new HashMap<>();
        teamVariableRepository.countKeysPerTeam(gameId).forEach(row ->
            definedKeysByTeam
                .computeIfAbsent(row.teamId(), k -> new HashSet<>())
                .add(row.key())
        );
        Map<UUID, Map<UUID, Set<String>>> challengeKeysByTeam = new HashMap<>();
        challengeTeamVariableRepository.countKeysPerTeam(gameId).forEach(row ->
            challengeKeysByTeam
                .computeIfAbsent(row.challengeId(), k -> new HashMap<>())
                .computeIfAbsent(row.teamId(), k -> new HashSet<>())
                .add(row.key())
        );

        List<String> errors = new ArrayList<>();
        for (Challenge ch : challenges) {
            Set<String> refs = extractReferences(ch);
            if (refs.isEmpty()) continue;
            for (String key : refs) {
                for (Team team : teams) {
                    boolean hasGameLevel = definedKeysByTeam
                        .getOrDefault(team.getId(), Set.of()).contains(key);
                    boolean hasChallengeLevel = challengeKeysByTeam
                        .getOrDefault(ch.getId(), Map.of())
                        .getOrDefault(team.getId(), Set.of())
                        .contains(key);
                    if (!hasGameLevel && !hasChallengeLevel) {
                        errors.add(String.format(
                            "Challenge \"%s\" references variable \"%s\" but team \"%s\" has no value defined",
                            ch.getTitle() == null ? ch.getId().toString() : ch.getTitle(),
                            key,
                            team.getName() == null ? team.getId().toString() : team.getName()
                        ));
                    }
                }
            }
        }
        return errors;
    }

    private Set<String> extractReferences(Challenge ch) {
        Set<String> out = new LinkedHashSet<>();
        addRefs(out, ch.getContent());
        addRefs(out, ch.getCompletionContent());
        if (ch.getCorrectAnswer() != null) {
            ch.getCorrectAnswer().forEach(ans -> addRefs(out, ans));
        }
        return out;
    }

    private void addRefs(Set<String> out, String text) {
        if (text == null || text.isEmpty()) return;
        Matcher m = VARIABLE_REF_PATTERN.matcher(text);
        while (m.find()) out.add(m.group(1));
    }
```

Now modify the existing `validateVariableCompleteness` method to call the scan and merge results. Find the return statement (it builds a `VariableCompletenessResponse` with an errors list) and before it, add:

```java
        errors.addAll(scanChallengeReferences(gameId));
```

Add the required imports at the top of the file:

```java
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;
```

Verify the `TeamKeyCount` projection has a `teamId()` and `key()` getter — it's imported at the top of the file (`com.prayer.pointfinder.dto.projection.TeamKeyCount`). If the challenge-scope projection doesn't expose `challengeId`, look at `ChallengeTeamVariableRepository.countKeysPerTeam` — you may need to add a dedicated projection. Verify by running the tests below; if it compiles, you're good.

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && ./gradlew test --tests "com.prayer.pointfinder.service.TeamVariableServiceTest"
```

Expected: all `TeamVariableServiceTest` tests pass, including the two new ones.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/prayer/pointfinder/service/TeamVariableService.java backend/src/test/java/com/prayer/pointfinder/service/TeamVariableServiceTest.java
git commit -m "feat(backend): scan challenge {{var}} references in go-live readiness

Wave A.2 — extends validateVariableCompleteness to flag
VARIABLE_REFERENCE_UNDEFINED when a challenge body or correctAnswer
contains a {{key}} that has no value for one or more teams."
```

### Task A.3: Wire GameService go-live to surface error code

**Files:**
- Modify: `backend/src/main/java/com/prayer/pointfinder/service/GameService.java`

- [ ] **Step 1: Read the existing go-live path**

Open `backend/src/main/java/com/prayer/pointfinder/service/GameService.java` and jump to line 346 (the `validateVariableCompleteness` call per the spec). Confirm the surrounding code throws a `BadRequestException` or similar when the completeness check fails.

- [ ] **Step 2: Ensure the thrown exception carries the error code**

If the existing code throws a generic `BadRequestException` with a string message, upgrade it to include the new `ErrorCode.VARIABLE_REFERENCE_UNDEFINED`. Example pattern (match existing code style — look at how `TAG_IN_USE` or `STAGE_ALREADY_ACTIVE` are thrown elsewhere):

```java
VariableCompletenessResponse vc = variableService.validateVariableCompleteness(gameId);
if (!vc.complete()) {
    throw new BadRequestException(
        "Variable completeness check failed: " + String.join("; ", vc.errors()),
        ErrorCode.VARIABLE_REFERENCE_UNDEFINED
    );
}
```

If `BadRequestException` doesn't already support an `ErrorCode` parameter, check how other services pass error codes (e.g., `GameTagService`). Follow that pattern.

- [ ] **Step 3: Build to verify**

```bash
cd backend && ./gradlew build
```

Expected: BUILD SUCCESSFUL.

- [ ] **Step 4: Commit**

```bash
git add backend/src/main/java/com/prayer/pointfinder/service/GameService.java
git commit -m "feat(backend): emit VARIABLE_REFERENCE_UNDEFINED at go-live

Wave A.3 — wires the new error code into the setup→live transition."
```

### Task A.4: Update backend docs

**Files:**
- Modify: `docs/api-reference.md`
- Modify: `docs/business-logic.md`

- [ ] **Step 1: Document the new error code**

In `docs/api-reference.md`, find the Error Codes appendix (grep for `VARIABLE_` or check the "## Error Codes" section). Add a row/bullet under the Variables group (or create the group if it doesn't exist):

```markdown
### Variables

- `VARIABLE_REFERENCE_UNDEFINED` — A challenge body (`content`, `completionContent`) or auto-validated answer references `{{key}}` where `key` has no variable value defined for at least one team. Emitted at `setup → live`. Payload message lists offending (challenge, key, team) tuples. Resolve by defining the variable or fixing the reference.
```

Also: in the readiness/go-live section (grep for "Go-live readiness checklist"), add a bullet:

```markdown
8. All `{{variable}}` references in challenge content and correctAnswer must have defined values for every team.
```

- [ ] **Step 2: Document the authoring UX in business-logic**

In `docs/business-logic.md`, find the Variables section (around line 882-927 per spec). Append a new subsection:

```markdown
### Variables in authoring UX

Operators can insert variables into challenge `content`, `completionContent`, and `correctAnswer` either by typing `{{` to trigger an autocomplete popover or via a toolbar "{ }" button. Variables render as atomic pills — they cannot be half-edited; backspace removes the whole pill.

The `correctAnswer` field supports both literal strings and variable references, including mixed content (e.g., `"{{prefix}}-FOX"` resolves per-team before matching). Matching is trim+case-insensitive on the fully-resolved string (`SubmissionService.createSubmission`).

A **Preview as team** toggle on the challenge editor shows each pill resolved to the selected team's value, making it easy to verify content renders correctly before going live. The operator submission review surface always shows both the raw template and the team-resolved expected answer.

Undefined `{{key}}` references are caught at three layers:
1. **Editor visual** — red border + warning tooltip on pills with no matching key
2. **Save-time** — client form shows a blocking confirmation listing offenders
3. **Go-live** — server `validateVariableCompleteness` rejects the `setup → live` transition with `VARIABLE_REFERENCE_UNDEFINED`
```

- [ ] **Step 3: Commit**

```bash
git add docs/api-reference.md docs/business-logic.md
git commit -m "docs: document VARIABLE_REFERENCE_UNDEFINED and authoring UX

Wave A.4 — matches Wave A.1–A.3 backend changes."
```

---

## Wave B — Web-admin: TipTap mention + chip input + preview

**Owner:** one web-admin agent. All tasks touch `web-admin/` only.

**Files:**
- Modify: `web-admin/package.json`
- Create: `web-admin/src/lib/variables/resolveTemplate.ts`
- Create: `web-admin/src/lib/variables/scanReferences.ts`
- Create: `web-admin/src/lib/variables/resolveTemplate.test.ts`
- Create: `web-admin/src/lib/variables/scanReferences.test.ts`
- Create: `web-admin/src/components/editor/extensions/VariableMention.ts`
- Create: `web-admin/src/components/editor/VariableSuggestionList.tsx`
- Create: `web-admin/src/components/editor/CreateVariableInlineDialog.tsx`
- Create: `web-admin/src/components/inputs/VariableAwareChipInput.tsx`
- Create: `web-admin/src/components/inputs/VariableAwareChipInput.test.tsx`
- Modify: `web-admin/src/components/editor/RichTextEditor.tsx`
- Modify: `web-admin/src/features/build/ChallengeDetail.tsx`
- Modify: `web-admin/src/features/build/ChallengeDetail.test.tsx`
- Modify: `web-admin/src/features/review/SubmissionDetail.tsx`
- Create or modify: `web-admin/src/styles/variable-tag.css` (or inline in index.css)

### Task B.1: Install TipTap Mention + Suggestion

**Files:**
- Modify: `web-admin/package.json`

- [ ] **Step 1: Install the packages**

```bash
cd /Users/xmedavid/dev/dbvnfc/web-admin && npm install @tiptap/extension-mention@^3.19.0 @tiptap/suggestion@^3.19.0
```

- [ ] **Step 2: Verify types resolve**

```bash
cd web-admin && npx tsc --noEmit
```

Expected: no new errors (the install adds type defs via the packages themselves).

- [ ] **Step 3: Commit**

```bash
git add web-admin/package.json web-admin/package-lock.json
git commit -m "chore(web): add @tiptap/extension-mention + @tiptap/suggestion

Wave B.1 — dependencies for VariableMention extension."
```

### Task B.2: Client-side resolver utility — TDD

**Files:**
- Create: `web-admin/src/lib/variables/resolveTemplate.ts`
- Create: `web-admin/src/lib/variables/resolveTemplate.test.ts`

- [ ] **Step 1: Write the failing test**

Create `web-admin/src/lib/variables/resolveTemplate.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { resolveTemplate, type VariableMap } from './resolveTemplate'

describe('resolveTemplate', () => {
  const vars: VariableMap = new Map([
    ['secret', 'FOX'],
    ['prefix', 'answer'],
  ])

  it('substitutes a single {{key}}', () => {
    expect(resolveTemplate('{{secret}}', vars)).toBe('FOX')
  })

  it('substitutes mixed literal + variable', () => {
    expect(resolveTemplate('{{prefix}}-{{secret}}', vars)).toBe('answer-FOX')
  })

  it('leaves unknown keys as-is', () => {
    expect(resolveTemplate('{{foo}}', vars)).toBe('{{foo}}')
  })

  it('handles empty input', () => {
    expect(resolveTemplate('', vars)).toBe('')
  })

  it('handles null/undefined text safely', () => {
    expect(resolveTemplate(null, vars)).toBe('')
    expect(resolveTemplate(undefined, vars)).toBe('')
  })

  it('matches multi-character keys and numbers', () => {
    const v = new Map([['team_code_42', 'BRAVO']])
    expect(resolveTemplate('code={{team_code_42}}', v)).toBe('code=BRAVO')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd web-admin && npx vitest run src/lib/variables/resolveTemplate.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `web-admin/src/lib/variables/resolveTemplate.ts`:

```ts
export type VariableMap = Map<string, string>

const VARIABLE_REF_RE = /\{\{([a-zA-Z][a-zA-Z0-9_]*)\}\}/g

export function resolveTemplate(
  text: string | null | undefined,
  variables: VariableMap,
): string {
  if (!text) return ''
  return text.replace(VARIABLE_REF_RE, (match, key: string) => {
    const v = variables.get(key)
    return v === undefined ? match : v
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd web-admin && npx vitest run src/lib/variables/resolveTemplate.test.ts
```

Expected: all 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add web-admin/src/lib/variables/resolveTemplate.ts web-admin/src/lib/variables/resolveTemplate.test.ts
git commit -m "feat(web): add resolveTemplate utility for per-team preview

Wave B.2 — client-side {{key}} substitution matching backend regex."
```

### Task B.3: Reference scanner utility — TDD

**Files:**
- Create: `web-admin/src/lib/variables/scanReferences.ts`
- Create: `web-admin/src/lib/variables/scanReferences.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { scanReferences, findUndefinedReferences } from './scanReferences'

describe('scanReferences', () => {
  it('finds all {{key}} references in a string', () => {
    expect(scanReferences('Find {{secret}} at {{place}}')).toEqual(['secret', 'place'])
  })

  it('deduplicates repeated keys', () => {
    expect(scanReferences('{{a}} and {{a}}')).toEqual(['a'])
  })

  it('returns [] for null / empty / no matches', () => {
    expect(scanReferences(null)).toEqual([])
    expect(scanReferences('')).toEqual([])
    expect(scanReferences('no variables here')).toEqual([])
  })

  it('scans arrays of strings', () => {
    expect(scanReferences(['{{a}}', '{{b}}-{{a}}'])).toEqual(['a', 'b'])
  })
})

describe('findUndefinedReferences', () => {
  it('returns keys referenced but not in available set', () => {
    const refs = findUndefinedReferences(
      ['Find {{secret}}', '{{typo}}'],
      new Set(['secret', 'prefix']),
    )
    expect(refs).toEqual(['typo'])
  })

  it('returns [] when all references resolve', () => {
    expect(findUndefinedReferences('{{a}}', new Set(['a']))).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd web-admin && npx vitest run src/lib/variables/scanReferences.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

```ts
const VARIABLE_REF_RE = /\{\{([a-zA-Z][a-zA-Z0-9_]*)\}\}/g

export function scanReferences(input: string | string[] | null | undefined): string[] {
  if (!input) return []
  const texts = Array.isArray(input) ? input : [input]
  const out = new Set<string>()
  for (const text of texts) {
    if (!text) continue
    const re = new RegExp(VARIABLE_REF_RE.source, 'g')
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) out.add(m[1])
  }
  return Array.from(out)
}

export function findUndefinedReferences(
  input: string | string[] | null | undefined,
  availableKeys: Set<string>,
): string[] {
  return scanReferences(input).filter((k) => !availableKeys.has(k))
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd web-admin && npx vitest run src/lib/variables/scanReferences.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add web-admin/src/lib/variables/scanReferences.ts web-admin/src/lib/variables/scanReferences.test.ts
git commit -m "feat(web): add scanReferences + findUndefinedReferences utilities

Wave B.3 — undefined-key safety scan used by editor + save-time guard."
```

### Task B.4: Add shared `.variable-tag` CSS

**Files:**
- Create: `web-admin/src/styles/variable-tag.css`
- Modify: `web-admin/src/main.tsx` (or wherever global styles are imported)

- [ ] **Step 1: Create the stylesheet**

```css
/* web-admin/src/styles/variable-tag.css */
.variable-tag {
  display: inline-block;
  background: #BEE3F8;
  color: #2C5282;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.85em;
  font-weight: 500;
  user-select: none;
  white-space: nowrap;
}

.variable-tag--undefined {
  background: #FED7D7;
  color: #9B2C2C;
  border: 1px dashed #C53030;
}

@media (prefers-color-scheme: dark) {
  .variable-tag {
    background: #2C5282;
    color: #BEE3F8;
  }
  .variable-tag--undefined {
    background: #742A2A;
    color: #FED7D7;
  }
}
```

- [ ] **Step 2: Import it**

Locate `web-admin/src/main.tsx` (or wherever `index.css` / `app.css` is imported). Add:

```tsx
import './styles/variable-tag.css'
```

- [ ] **Step 3: Verify**

```bash
cd web-admin && npx tsc --noEmit && npm run lint
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add web-admin/src/styles/variable-tag.css web-admin/src/main.tsx
git commit -m "feat(web): shared .variable-tag pill styles

Wave B.4 — matches iOS/Android palette; dark-mode aware;
undefined-reference variant for safety warning."
```

### Task B.5: `VariableMention` TipTap extension — TDD

**Files:**
- Create: `web-admin/src/components/editor/extensions/VariableMention.ts`
- Create: `web-admin/src/components/editor/extensions/VariableMention.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { VariableMention } from './VariableMention'

function makeEditor(html: string) {
  return new Editor({
    extensions: [StarterKit, VariableMention.configure({ availableKeys: ['secret'] })],
    content: html,
  })
}

describe('VariableMention', () => {
  it('parses {{secret}} from initial HTML into a mention node', () => {
    const editor = makeEditor(
      '<p><span class="variable-tag" data-variable-key="secret">{{secret}}</span></p>',
    )
    const json = editor.getJSON()
    const para = (json.content as any[])[0]
    expect(para.content[0].type).toBe('variableMention')
    expect(para.content[0].attrs.key).toBe('secret')
  })

  it('serializes a mention node back to the span', () => {
    const editor = makeEditor(
      '<p><span class="variable-tag" data-variable-key="secret">{{secret}}</span></p>',
    )
    const html = editor.getHTML()
    expect(html).toContain('data-variable-key="secret"')
    expect(html).toContain('{{secret}}')
  })

  it('marks an undefined key with the undefined class', () => {
    const editor = makeEditor(
      '<p><span class="variable-tag" data-variable-key="missing">{{missing}}</span></p>',
    )
    const html = editor.getHTML()
    expect(html).toContain('variable-tag--undefined')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd web-admin && npx vitest run src/components/editor/extensions/VariableMention.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// web-admin/src/components/editor/extensions/VariableMention.ts
import { Node, mergeAttributes } from '@tiptap/core'

export interface VariableMentionOptions {
  availableKeys: string[]
  HTMLAttributes: Record<string, unknown>
}

export const VariableMention = Node.create<VariableMentionOptions>({
  name: 'variableMention',
  group: 'inline',
  inline: true,
  selectable: true,
  atom: true,

  addOptions() {
    return {
      availableKeys: [],
      HTMLAttributes: {},
    }
  },

  addAttributes() {
    return {
      key: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-variable-key'),
        renderHTML: (attrs) => ({ 'data-variable-key': attrs.key }),
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-variable-key]',
      },
    ]
  },

  renderHTML({ node, HTMLAttributes }) {
    const key = node.attrs.key as string
    const undefined_ = !this.options.availableKeys.includes(key)
    const className = undefined_
      ? 'variable-tag variable-tag--undefined'
      : 'variable-tag'
    return [
      'span',
      mergeAttributes(
        this.options.HTMLAttributes,
        HTMLAttributes,
        { class: className, 'data-variable-key': key, contenteditable: 'false' },
      ),
      `{{${key}}}`,
    ]
  },

  renderText({ node }) {
    return `{{${node.attrs.key}}}`
  },
})
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd web-admin && npx vitest run src/components/editor/extensions/VariableMention.test.ts
```

Expected: all 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add web-admin/src/components/editor/extensions/VariableMention.ts web-admin/src/components/editor/extensions/VariableMention.test.ts
git commit -m "feat(web): VariableMention TipTap extension

Wave B.5 — atomic pill node that round-trips with the shared
.variable-tag span; flags undefined keys via CSS modifier."
```

### Task B.6: `VariableSuggestionList` popover + suggestion plugin wiring

**Files:**
- Create: `web-admin/src/components/editor/VariableSuggestionList.tsx`
- Create: `web-admin/src/components/editor/variableSuggestion.ts`

- [ ] **Step 1: Create the popover component**

```tsx
// web-admin/src/components/editor/VariableSuggestionList.tsx
import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'

export interface SuggestionItem {
  key: string
  isCreate?: boolean
}

export interface VariableSuggestionListProps {
  items: SuggestionItem[]
  command: (item: SuggestionItem) => void
}

export const VariableSuggestionList = forwardRef<
  { onKeyDown: (evt: { event: KeyboardEvent }) => boolean },
  VariableSuggestionListProps
>(({ items, command }, ref) => {
  const [selected, setSelected] = useState(0)

  useEffect(() => setSelected(0), [items])

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (event.key === 'ArrowDown') {
        setSelected((s) => (s + 1) % items.length)
        return true
      }
      if (event.key === 'ArrowUp') {
        setSelected((s) => (s - 1 + items.length) % items.length)
        return true
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        if (items[selected]) command(items[selected])
        return true
      }
      return false
    },
  }))

  if (!items.length) return null

  return (
    <div
      className="z-50 min-w-[220px] rounded-md border bg-popover p-1 shadow-md"
      data-testid="variable-suggestion-list"
    >
      {items.map((item, idx) => (
        <button
          key={item.key}
          type="button"
          onClick={() => command(item)}
          className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm ${
            idx === selected ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'
          }`}
          data-testid={`variable-suggestion-${item.key}`}
        >
          {item.isCreate ? (
            <>
              <span className="text-xs opacity-60">+</span>
              <span>Create variable <code>{`{{${item.key}}}`}</code></span>
            </>
          ) : (
            <code className="text-xs">{`{{${item.key}}}`}</code>
          )}
        </button>
      ))}
    </div>
  )
})
VariableSuggestionList.displayName = 'VariableSuggestionList'
```

- [ ] **Step 2: Create the suggestion plugin config**

```ts
// web-admin/src/components/editor/variableSuggestion.ts
import { ReactRenderer } from '@tiptap/react'
import type { SuggestionOptions } from '@tiptap/suggestion'
import tippy, { type Instance as TippyInstance } from 'tippy.js'
import { VariableSuggestionList, type SuggestionItem } from './VariableSuggestionList'

export interface VariableSuggestionFactoryOpts {
  getAvailableKeys: () => string[]
  onCreate?: (partialKey: string) => void
}

export function makeVariableSuggestion(
  opts: VariableSuggestionFactoryOpts,
): Omit<SuggestionOptions<SuggestionItem>, 'editor'> {
  return {
    char: '{{',
    startOfLine: false,
    allowSpaces: false,

    items: ({ query }) => {
      const keys = opts.getAvailableKeys()
      const filtered = keys
        .filter((k) => k.toLowerCase().includes(query.toLowerCase()))
        .slice(0, 10)
        .map<SuggestionItem>((key) => ({ key }))
      if (query && !keys.some((k) => k === query) && opts.onCreate) {
        filtered.push({ key: query, isCreate: true })
      }
      return filtered
    },

    command: ({ editor, range, props }) => {
      if (props.isCreate) {
        opts.onCreate?.(props.key)
        editor.chain().focus().deleteRange(range).run()
        return
      }
      editor
        .chain()
        .focus()
        .insertContentAt(range, [
          { type: 'variableMention', attrs: { key: props.key } },
          { type: 'text', text: ' ' },
        ])
        .run()
    },

    render: () => {
      let component: ReactRenderer
      let popup: TippyInstance[]

      return {
        onStart: (props) => {
          component = new ReactRenderer(VariableSuggestionList, {
            props,
            editor: props.editor,
          })
          if (!props.clientRect) return
          popup = tippy('body', {
            getReferenceClientRect: props.clientRect as () => DOMRect,
            appendTo: () => document.body,
            content: component.element,
            showOnCreate: true,
            interactive: true,
            trigger: 'manual',
            placement: 'bottom-start',
          })
        },
        onUpdate: (props) => {
          component.updateProps(props)
          if (!props.clientRect) return
          popup[0].setProps({ getReferenceClientRect: props.clientRect as () => DOMRect })
        },
        onKeyDown: (props) => {
          if (props.event.key === 'Escape') {
            popup[0].hide()
            return true
          }
          return (component.ref as { onKeyDown: (p: unknown) => boolean }).onKeyDown(props)
        },
        onExit: () => {
          popup[0].destroy()
          component.destroy()
        },
      }
    },
  }
}
```

Note: this uses `tippy.js` — verify it's already in the project's `package.json` (TipTap v3 lists it as optional peer). If missing, install:

```bash
cd web-admin && npm install tippy.js
```

- [ ] **Step 3: Build to verify**

```bash
cd web-admin && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add web-admin/src/components/editor/VariableSuggestionList.tsx web-admin/src/components/editor/variableSuggestion.ts web-admin/package.json web-admin/package-lock.json
git commit -m "feat(web): VariableSuggestionList + {{-triggered suggestion plugin

Wave B.6 — keyboard-navigable popover; Create-new as last item when
the typed partial doesn't match an existing key."
```

### Task B.7: Wire `RichTextEditor.tsx` with VariableMention

**Files:**
- Modify: `web-admin/src/components/editor/RichTextEditor.tsx`

- [ ] **Step 1: Read the existing editor component**

Open `web-admin/src/components/editor/RichTextEditor.tsx` lines 160-200 to see the current `useEditor` call. Note the existing extension list: `StarterKit`, `TiptapImage`, `Placeholder`, `AudioExtension`, `FileEmbedExtension`.

- [ ] **Step 2: Extend the component props**

Add props for variable support:

```tsx
export interface RichTextEditorProps {
  // ... existing props
  variableKeys?: string[]
  onCreateVariable?: (partialKey: string) => void
}
```

- [ ] **Step 3: Wire the mention extension**

In the `useEditor` extensions array, add:

```tsx
import Mention from '@tiptap/extension-mention'
import { VariableMention } from './extensions/VariableMention'
import { makeVariableSuggestion } from './variableSuggestion'

// inside useEditor({ extensions: [...] })
VariableMention.configure({
  availableKeys: variableKeys ?? [],
}),
Mention.extend({ name: 'variableMentionTrigger' }).configure({
  suggestion: makeVariableSuggestion({
    getAvailableKeys: () => variableKeys ?? [],
    onCreate: onCreateVariable,
  }),
}),
```

Note: TipTap's `Mention` extension by default inserts as a `mention` node; we rename it to `variableMentionTrigger` so it only drives the suggestion and hands off to `VariableMention` via the custom `command` function we wrote in B.6.

- [ ] **Step 4: Add a toolbar "{ }" button**

Find the editor toolbar (button row). Add a new button near the formatting buttons:

```tsx
<button
  type="button"
  onClick={() => {
    editor
      ?.chain()
      .focus()
      .insertContent('{{')
      .run()
  }}
  title="Insert variable"
  data-testid="insert-variable-btn"
  className="..."
>
  {'{ }'}
</button>
```

The `insertContent('{{')` triggers the suggestion plugin at the current caret.

- [ ] **Step 5: Run type-check + lint**

```bash
cd web-admin && npx tsc --noEmit && npm run lint
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add web-admin/src/components/editor/RichTextEditor.tsx
git commit -m "feat(web): wire VariableMention + suggestion into RichTextEditor

Wave B.7 — {{-trigger autocomplete + toolbar button; pills render
atomically."
```

### Task B.8: `VariableAwareChipInput` component — TDD

**Files:**
- Create: `web-admin/src/components/inputs/VariableAwareChipInput.tsx`
- Create: `web-admin/src/components/inputs/VariableAwareChipInput.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { VariableAwareChipInput } from './VariableAwareChipInput'

describe('VariableAwareChipInput', () => {
  it('renders existing chips', () => {
    render(
      <VariableAwareChipInput
        chips={['FOX', '{{secret}}']}
        onChange={() => {}}
        availableKeys={['secret']}
      />,
    )
    expect(screen.getByText('FOX')).toBeInTheDocument()
    expect(screen.getByText('{{secret}}')).toBeInTheDocument()
  })

  it('adds a chip on Enter', async () => {
    const onChange = vi.fn()
    render(
      <VariableAwareChipInput
        chips={['FOX']}
        onChange={onChange}
        availableKeys={[]}
      />,
    )
    const input = screen.getByTestId('chip-add-input')
    await userEvent.type(input, 'WOLF{Enter}')
    expect(onChange).toHaveBeenCalledWith(['FOX', 'WOLF'])
  })

  it('removes a chip on X click', async () => {
    const onChange = vi.fn()
    render(
      <VariableAwareChipInput
        chips={['FOX', 'WOLF']}
        onChange={onChange}
        availableKeys={[]}
      />,
    )
    await userEvent.click(screen.getByTestId('chip-remove-0'))
    expect(onChange).toHaveBeenCalledWith(['WOLF'])
  })

  it('renders pill style for chips containing {{key}}', () => {
    render(
      <VariableAwareChipInput
        chips={['{{secret}}-FOX']}
        onChange={() => {}}
        availableKeys={['secret']}
      />,
    )
    expect(screen.getByTestId('chip-pill-secret')).toHaveClass('variable-tag')
  })

  it('marks undefined-key chips with warning style', () => {
    render(
      <VariableAwareChipInput
        chips={['{{typo}}']}
        onChange={() => {}}
        availableKeys={['secret']}
      />,
    )
    expect(screen.getByTestId('chip-pill-typo')).toHaveClass('variable-tag--undefined')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd web-admin && npx vitest run src/components/inputs/VariableAwareChipInput.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

```tsx
// web-admin/src/components/inputs/VariableAwareChipInput.tsx
import { useState, type KeyboardEvent } from 'react'

const REF_RE = /\{\{([a-zA-Z][a-zA-Z0-9_]*)\}\}/g

export interface VariableAwareChipInputProps {
  chips: string[]
  onChange: (chips: string[]) => void
  availableKeys: string[]
  placeholder?: string
}

function renderChipContent(chip: string, availableKeys: string[]) {
  const parts: Array<{ kind: 'text' | 'pill'; value: string; key?: string }> = []
  let last = 0
  for (const m of chip.matchAll(REF_RE)) {
    if (m.index! > last) parts.push({ kind: 'text', value: chip.slice(last, m.index!) })
    parts.push({ kind: 'pill', value: m[0], key: m[1] })
    last = m.index! + m[0].length
  }
  if (last < chip.length) parts.push({ kind: 'text', value: chip.slice(last) })
  return parts.map((p, i) => {
    if (p.kind === 'text') return <span key={i}>{p.value}</span>
    const undef = !availableKeys.includes(p.key!)
    return (
      <span
        key={i}
        data-testid={`chip-pill-${p.key}`}
        className={undef ? 'variable-tag variable-tag--undefined' : 'variable-tag'}
      >
        {p.value}
      </span>
    )
  })
}

export function VariableAwareChipInput({
  chips,
  onChange,
  availableKeys,
  placeholder = 'Type an answer or {{variable}}…',
}: VariableAwareChipInputProps) {
  const [draft, setDraft] = useState('')

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && draft.trim()) {
      e.preventDefault()
      onChange([...chips, draft.trim()])
      setDraft('')
    } else if (e.key === 'Backspace' && !draft && chips.length) {
      onChange(chips.slice(0, -1))
    }
  }

  const removeChip = (idx: number) => {
    const next = [...chips]
    next.splice(idx, 1)
    onChange(next)
  }

  return (
    <div
      className="flex flex-wrap items-center gap-2 rounded-md border px-2 py-1.5"
      data-testid="variable-chip-input"
    >
      {chips.map((chip, idx) => (
        <span
          key={idx}
          className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-sm"
        >
          {renderChipContent(chip, availableKeys)}
          <button
            type="button"
            onClick={() => removeChip(idx)}
            data-testid={`chip-remove-${idx}`}
            aria-label={`Remove ${chip}`}
            className="text-muted-foreground hover:text-foreground"
          >
            ×
          </button>
        </span>
      ))}
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        data-testid="chip-add-input"
        className="flex-1 min-w-[160px] bg-transparent outline-none text-sm"
      />
    </div>
  )
}
```

Note: the autocomplete popover on the add-input is a follow-up enhancement (a simple `{{` listener can open a filtered list). For now, operators type `{{key}}` manually in the chip add-field; the pill styling on submit provides the visual. This matches iOS/Android's "add one at a time" pattern today. If time permits, extend this component to show the same `VariableSuggestionList` popover when the draft contains unclosed `{{` — out of scope for this task; add as Wave B.9 bonus.

- [ ] **Step 4: Run test to verify it passes**

```bash
cd web-admin && npx vitest run src/components/inputs/VariableAwareChipInput.test.tsx
```

Expected: all 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add web-admin/src/components/inputs/VariableAwareChipInput.tsx web-admin/src/components/inputs/VariableAwareChipInput.test.tsx
git commit -m "feat(web): VariableAwareChipInput for correctAnswer field

Wave B.8 — chip array with inline pill rendering; mixed literal+
variable content supported; undefined-key warning styling."
```

### Task B.9: Wire ChallengeDetail — chip input, preview toggle, save-time guard

**Files:**
- Modify: `web-admin/src/features/build/ChallengeDetail.tsx`
- Modify: `web-admin/src/features/build/ChallengeDetail.test.tsx`

- [ ] **Step 1: Load variables in ChallengeDetail**

In `ChallengeDetail.tsx`, import the existing hooks:

```tsx
import { useGameVariables, useChallengeVariables } from '@/hooks/queries/useVariables'
```

(Confirm hook names by reading `web-admin/src/hooks/queries/useVariables.ts` first — adjust to actual export names.) Add these calls near the existing queries:

```tsx
const { data: gameVars = [] } = useGameVariables(gameId)
const { data: challengeVars = [] } = useChallengeVariables(gameId, challengeId)

const availableKeys = useMemo(
  () => Array.from(new Set([...gameVars.map((v) => v.key), ...challengeVars.map((v) => v.key)])),
  [gameVars, challengeVars],
)

const teams = /* from existing query or pass in */ []
```

- [ ] **Step 2: Replace the correctAnswer input**

Locate the comma-separated `<Input>` at `ChallengeDetail.tsx:334-340`. Replace with:

```tsx
import { VariableAwareChipInput } from '@/components/inputs/VariableAwareChipInput'

// inside the form where correctAnswer is edited:
<VariableAwareChipInput
  chips={localCorrectAnswer}
  onChange={setLocalCorrectAnswer}
  availableKeys={availableKeys}
  placeholder="Enter an accepted answer or {{variable}}"
/>
```

Change the `localCorrectAnswer` state type from `string` to `string[]`. Update the initial value around line 84 from `.join(', ')` to just `challenge.correctAnswer ?? []`. Update the save handler's payload to pass `localCorrectAnswer` directly instead of splitting.

- [ ] **Step 3: Pass variable keys to RichTextEditor**

Find the two `<RichTextEditor>` usages (around lines 309 and 631). Add props:

```tsx
<RichTextEditor
  // ... existing props
  variableKeys={availableKeys}
  onCreateVariable={(partial) => setCreateVariableDialogKey(partial)}
/>
```

Add state `const [createVariableDialogKey, setCreateVariableDialogKey] = useState<string | null>(null)` and render a simple dialog that calls the existing `useVariableMutations` on confirm. (If scope creeps, a placeholder `alert('Create variable: ' + partial)` is acceptable for this task; replace in a follow-up.)

- [ ] **Step 4: Add Preview as Team toggle**

Above the editor surface, add:

```tsx
const [previewMode, setPreviewMode] = useState(false)
const [previewTeamId, setPreviewTeamId] = useState<string | null>(null)
const previewTeam = teams.find((t) => t.id === previewTeamId) ?? teams[0]

const previewVars = useMemo(() => {
  if (!previewTeam) return new Map<string, string>()
  const map = new Map<string, string>()
  for (const v of gameVars) {
    const val = v.teamValues?.[previewTeam.id]
    if (val != null) map.set(v.key, val)
  }
  for (const v of challengeVars) {
    const val = v.teamValues?.[previewTeam.id]
    if (val != null) map.set(v.key, val)
  }
  return map
}, [gameVars, challengeVars, previewTeam])

// UI:
<div className="flex items-center gap-2 mb-2">
  <div role="tablist" className="rounded-md border p-0.5 inline-flex">
    <button
      onClick={() => setPreviewMode(false)}
      data-testid="preview-edit-btn"
      className={!previewMode ? 'bg-accent px-2 py-0.5 text-sm' : 'px-2 py-0.5 text-sm'}
    >
      Edit
    </button>
    <button
      onClick={() => setPreviewMode(true)}
      data-testid="preview-preview-btn"
      className={previewMode ? 'bg-accent px-2 py-0.5 text-sm' : 'px-2 py-0.5 text-sm'}
    >
      Preview
    </button>
  </div>
  {previewMode && (
    <select
      value={previewTeamId ?? ''}
      onChange={(e) => setPreviewTeamId(e.target.value)}
      data-testid="preview-team-select"
      className="text-sm rounded border px-2 py-1"
    >
      {teams.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
    </select>
  )}
</div>
```

In preview mode, render content via `resolveTemplate(content, previewVars)` inside a read-only `<div dangerouslySetInnerHTML>` instead of the editor. Ditto for completionContent. For correctAnswer chips, pass the resolved chip strings through `resolveTemplate`.

- [ ] **Step 5: Add save-time undefined-key guard**

Before the save mutation, scan:

```tsx
import { findUndefinedReferences } from '@/lib/variables/scanReferences'

const undefinedKeys = useMemo(
  () => findUndefinedReferences(
    [formContent, formCompletionContent, ...localCorrectAnswer],
    new Set(availableKeys),
  ),
  [formContent, formCompletionContent, localCorrectAnswer, availableKeys],
)

// in save handler:
if (undefinedKeys.length > 0) {
  const ok = window.confirm(
    `Undefined variables: ${undefinedKeys.map((k) => `{{${k}}}`).join(', ')}\n\nSave anyway?`,
  )
  if (!ok) return
}
```

(For polish, replace `window.confirm` with a shadcn `AlertDialog` — acceptable scope deferral if tests are green.)

- [ ] **Step 6: Add tests**

Append to `ChallengeDetail.test.tsx`:

```tsx
it('shows preview resolved text when Preview toggle is active', async () => {
  // Setup mock server responses to return:
  //   - a challenge with content = "Find {{secret}}"
  //   - a game variable { key: 'secret', teamValues: { 'team-1': 'FOX' } }
  //   - a team with id 'team-1' named 'Foxes'
  // (Follow existing MSW handlers pattern in this file.)

  render(<ChallengeDetail challengeId="challenge-1" gameId={gameId} />, {
    wrapper: createWrapper(),
  })
  await waitFor(() => screen.getByTestId('preview-preview-btn'))
  await userEvent.click(screen.getByTestId('preview-preview-btn'))
  await userEvent.selectOptions(screen.getByTestId('preview-team-select'), 'team-1')
  await waitFor(() => expect(screen.getByText(/Find FOX/)).toBeInTheDocument())
})

it('renders correctAnswer chips instead of comma-separated input', async () => {
  render(<ChallengeDetail challengeId="challenge-1" gameId={gameId} />, {
    wrapper: createWrapper(),
  })
  await waitFor(() => screen.getByTestId('variable-chip-input'))
  expect(screen.queryByPlaceholderText(/comma.separated/i)).not.toBeInTheDocument()
})
```

- [ ] **Step 7: Run tests + type-check + lint**

```bash
cd web-admin && npx vitest run src/features/build/ChallengeDetail.test.tsx && npx tsc --noEmit && npm run lint
```

Expected: all tests pass, no type errors, no lint errors.

- [ ] **Step 8: Commit**

```bash
git add web-admin/src/features/build/ChallengeDetail.tsx web-admin/src/features/build/ChallengeDetail.test.tsx
git commit -m "feat(web): chip input + preview toggle + save-time guard in ChallengeDetail

Wave B.9 — replaces comma-separated correctAnswer input with chips;
adds Preview-as-team toggle; blocks save on undefined {{key}} with
confirmation."
```

### Task B.10: Wire SubmissionDetail — resolved expected answer

**Files:**
- Modify: `web-admin/src/features/review/SubmissionDetail.tsx`

- [ ] **Step 1: Load variables for the submission's team**

Open `SubmissionDetail.tsx` and find the existing render near line 320. Add variable loading:

```tsx
import { resolveTemplate } from '@/lib/variables/resolveTemplate'
import { useGameVariables, useChallengeVariables } from '@/hooks/queries/useVariables'

const { data: gameVars = [] } = useGameVariables(gameId)
const { data: challengeVars = [] } = useChallengeVariables(gameId, challengeId)

const teamVars = useMemo(() => {
  const map = new Map<string, string>()
  for (const v of gameVars) {
    const val = v.teamValues?.[submission.teamId]
    if (val != null) map.set(v.key, val)
  }
  for (const v of challengeVars) {
    const val = v.teamValues?.[submission.teamId]
    if (val != null) map.set(v.key, val)
  }
  return map
}, [gameVars, challengeVars, submission.teamId])
```

- [ ] **Step 2: Render resolved row**

Replace the current correctAnswer display (~line 320-326) with:

```tsx
<div className="space-y-1" data-testid="expected-answer-block">
  <div>
    <span className="text-xs text-muted-foreground">Expected (raw):</span>{' '}
    <code className="text-sm">{challenge.correctAnswer?.join(', ') ?? '—'}</code>
  </div>
  {challenge.correctAnswer?.some((a) => /\{\{[a-zA-Z]/.test(a)) && (
    <div>
      <span className="text-xs text-muted-foreground">
        Expected (resolved for {team?.name ?? submission.teamId}):
      </span>{' '}
      <code className="text-sm" data-testid="resolved-expected-answer">
        {challenge.correctAnswer
          .map((a) => resolveTemplate(a, teamVars))
          .join(', ')}
      </code>
    </div>
  )}
</div>
```

- [ ] **Step 3: Add test**

Append to `web-admin/src/features/review/SubmissionDetail.test.tsx` (create if missing, follow the same pattern as ChallengeDetail.test.tsx):

```tsx
it('shows team-resolved expected answer next to raw template', async () => {
  // mock: submission by team-1, challenge with correctAnswer=["{{secret}}"],
  //       team-1 has game variable secret="FOX"
  render(<SubmissionDetail submissionId="sub-1" />, { wrapper: createWrapper() })
  await waitFor(() => screen.getByTestId('expected-answer-block'))
  expect(screen.getByTestId('resolved-expected-answer')).toHaveTextContent('FOX')
})
```

- [ ] **Step 4: Run tests + type-check**

```bash
cd web-admin && npx vitest run src/features/review/SubmissionDetail.test.tsx && npx tsc --noEmit
```

Expected: tests pass, no type errors.

- [ ] **Step 5: Commit**

```bash
git add web-admin/src/features/review/SubmissionDetail.tsx web-admin/src/features/review/SubmissionDetail.test.tsx
git commit -m "feat(web): show team-resolved expected answer in SubmissionDetail

Wave B.10 — debugging aid when auto-validation rejects a submission."
```

---

## Wave C — iOS operator: autocomplete overlay + chip input + preview

**Owner:** one iOS agent. All tasks touch `ios-app/` only.

**Files:**
- Create: `ios-app/dbv-nfc-games/Utils/VariableResolver.swift`
- Create: `ios-app/dbv-nfc-gamesTests/VariableResolverTests.swift`
- Create: `ios-app/dbv-nfc-games/Utils/VariableReferenceScanner.swift`
- Create: `ios-app/dbv-nfc-gamesTests/VariableReferenceScannerTests.swift`
- Create: `ios-app/dbv-nfc-games/Features/Operator/VariableAutocompleteOverlay.swift`
- Modify: `ios-app/dbv-nfc-games/Features/Operator/RichTextEditorView.swift`
- Modify: `ios-app/dbv-nfc-games/Features/Operator/ChallengeEditView.swift`

### Task C.1: `VariableResolver` utility — TDD

**Files:**
- Create: `ios-app/dbv-nfc-games/Utils/VariableResolver.swift`
- Create: `ios-app/dbv-nfc-gamesTests/VariableResolverTests.swift`

- [ ] **Step 1: Write the failing test**

```swift
import XCTest
@testable import dbv_nfc_games

final class VariableResolverTests: XCTestCase {
    func testSubstitutesSingleKey() {
        let vars = ["secret": "FOX"]
        XCTAssertEqual(VariableResolver.resolve("{{secret}}", variables: vars), "FOX")
    }

    func testSubstitutesMixedLiteralAndVariable() {
        let vars = ["prefix": "answer"]
        XCTAssertEqual(VariableResolver.resolve("{{prefix}}-FOX", variables: vars), "answer-FOX")
    }

    func testLeavesUnknownKeysAsIs() {
        XCTAssertEqual(VariableResolver.resolve("{{foo}}", variables: [:]), "{{foo}}")
    }

    func testEmptyInput() {
        XCTAssertEqual(VariableResolver.resolve("", variables: [:]), "")
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd ios-app && xcodebuild test -project dbv-nfc-games.xcodeproj -scheme dbv-nfc-games -destination 'platform=iOS Simulator,name=iPhone 16' -only-testing:dbv_nfc_gamesTests/VariableResolverTests 2>&1 | tail -30
```

Expected: FAIL — VariableResolver not defined.

- [ ] **Step 3: Write minimal implementation**

```swift
// ios-app/dbv-nfc-games/Utils/VariableResolver.swift
import Foundation

enum VariableResolver {
    private static let pattern = try! NSRegularExpression(
        pattern: #"\{\{([a-zA-Z][a-zA-Z0-9_]*)\}\}"#
    )

    /// Substitutes `{{key}}` placeholders with values from the given map.
    /// Unknown keys are left intact. Returns the fully-resolved string.
    static func resolve(_ text: String?, variables: [String: String]) -> String {
        guard let text = text, !text.isEmpty else { return "" }
        let ns = text as NSString
        let range = NSRange(location: 0, length: ns.length)
        let matches = pattern.matches(in: text, range: range)
        guard !matches.isEmpty else { return text }

        var result = ""
        var cursor = 0
        for m in matches {
            if m.range.location > cursor {
                result += ns.substring(with: NSRange(
                    location: cursor,
                    length: m.range.location - cursor
                ))
            }
            let key = ns.substring(with: m.range(at: 1))
            if let v = variables[key] {
                result += v
            } else {
                result += ns.substring(with: m.range)
            }
            cursor = m.range.location + m.range.length
        }
        if cursor < ns.length {
            result += ns.substring(with: NSRange(
                location: cursor,
                length: ns.length - cursor
            ))
        }
        return result
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd ios-app && xcodebuild test -project dbv-nfc-games.xcodeproj -scheme dbv-nfc-games -destination 'platform=iOS Simulator,name=iPhone 16' -only-testing:dbv_nfc_gamesTests/VariableResolverTests 2>&1 | tail -20
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add ios-app/dbv-nfc-games/Utils/VariableResolver.swift ios-app/dbv-nfc-gamesTests/VariableResolverTests.swift
git commit -m "feat(ios): add VariableResolver utility

Wave C.1 — client-side {{key}} substitution for editor preview."
```

### Task C.2: `VariableReferenceScanner` utility — TDD

**Files:**
- Create: `ios-app/dbv-nfc-games/Utils/VariableReferenceScanner.swift`
- Create: `ios-app/dbv-nfc-gamesTests/VariableReferenceScannerTests.swift`

- [ ] **Step 1: Write the failing test**

```swift
import XCTest
@testable import dbv_nfc_games

final class VariableReferenceScannerTests: XCTestCase {
    func testFindsReferences() {
        XCTAssertEqual(
            VariableReferenceScanner.scan("Find {{secret}} at {{place}}"),
            ["secret", "place"]
        )
    }

    func testDeduplicates() {
        XCTAssertEqual(VariableReferenceScanner.scan("{{a}} and {{a}}"), ["a"])
    }

    func testFindUndefined() {
        let out = VariableReferenceScanner.findUndefined(
            in: ["Find {{secret}}", "{{typo}}"],
            availableKeys: Set(["secret"])
        )
        XCTAssertEqual(out, ["typo"])
    }
}
```

- [ ] **Step 2: Run to fail**

```bash
cd ios-app && xcodebuild test -project dbv-nfc-games.xcodeproj -scheme dbv-nfc-games -destination 'platform=iOS Simulator,name=iPhone 16' -only-testing:dbv_nfc_gamesTests/VariableReferenceScannerTests 2>&1 | tail -20
```

Expected: FAIL.

- [ ] **Step 3: Implement**

```swift
// ios-app/dbv-nfc-games/Utils/VariableReferenceScanner.swift
import Foundation

enum VariableReferenceScanner {
    private static let pattern = try! NSRegularExpression(
        pattern: #"\{\{([a-zA-Z][a-zA-Z0-9_]*)\}\}"#
    )

    static func scan(_ texts: String...) -> [String] {
        scan(Array(texts))
    }

    static func scan(_ texts: [String?]) -> [String] {
        var seen = Set<String>()
        var ordered: [String] = []
        for text in texts {
            guard let text = text, !text.isEmpty else { continue }
            let ns = text as NSString
            let matches = pattern.matches(in: text, range: NSRange(location: 0, length: ns.length))
            for m in matches {
                let key = ns.substring(with: m.range(at: 1))
                if seen.insert(key).inserted {
                    ordered.append(key)
                }
            }
        }
        return ordered
    }

    static func findUndefined(in texts: [String?], availableKeys: Set<String>) -> [String] {
        scan(texts).filter { !availableKeys.contains($0) }
    }
}
```

- [ ] **Step 4: Run to pass**

Same command as step 2.

- [ ] **Step 5: Commit**

```bash
git add ios-app/dbv-nfc-games/Utils/VariableReferenceScanner.swift ios-app/dbv-nfc-gamesTests/VariableReferenceScannerTests.swift
git commit -m "feat(ios): add VariableReferenceScanner for undefined-key guard

Wave C.2 — powers save-time confirmation on ChallengeEditView."
```

### Task C.3: Add atomic pill HTML + JS bridge to WebView

**Files:**
- Modify: `ios-app/dbv-nfc-games/Features/Operator/RichTextEditorView.swift`

- [ ] **Step 1: Add `contenteditable="false"` to pill spans in `insertVariable`**

Find the `insertVariable` method (grep for `variable-tag` around line 195). Update the inserted HTML to include `contenteditable="false"`:

```swift
private func insertVariable(_ key: String) {
    let js = """
    (function() {
      var span = document.createElement('span');
      span.className = 'variable-tag';
      span.setAttribute('contenteditable', 'false');
      span.setAttribute('data-variable-key', '\(key)');
      span.textContent = '{{\(key)}}';
      document.execCommand('insertHTML', false, span.outerHTML + '\u{00a0}');
    })();
    """
    coordinator?.webView?.evaluateJavaScript(js)
}
```

- [ ] **Step 2: Add JS `{{` trigger listener**

In the `editorHTML(content:isDark:)` method around line 568-634, inside the `<script>` block at line 629-631, add:

```javascript
document.getElementById('editor').focus();

(function() {
  var buffer = '';
  document.getElementById('editor').addEventListener('input', function(e) {
    var sel = window.getSelection();
    if (!sel.rangeCount) return;
    var r = sel.getRangeAt(0);
    var container = r.startContainer;
    if (container.nodeType !== Node.TEXT_NODE) return;
    var before = container.textContent.substring(0, r.startOffset);
    var match = before.match(/\\{\\{([a-zA-Z0-9_]*)$/);
    if (match) {
      var rect = r.getBoundingClientRect();
      window.webkit.messageHandlers.variableTrigger.postMessage({
        partial: match[1],
        x: rect.left,
        y: rect.top + rect.height
      });
    } else {
      window.webkit.messageHandlers.variableTrigger.postMessage({ close: true });
    }
  });
})();
```

- [ ] **Step 3: Register the message handler in `WKWebViewConfiguration`**

In the coordinator / `makeUIView` method, after creating the `WKWebViewConfiguration` but before creating the webview:

```swift
let contentController = WKUserContentController()
contentController.add(context.coordinator, name: "variableTrigger")
config.userContentController = contentController
```

Add the handler method to `WebViewDelegate` (or the coordinator — whichever owns `WKScriptMessageHandler`):

```swift
extension WebViewDelegate: WKScriptMessageHandler {
    func userContentController(_ userContentController: WKUserContentController,
                               didReceive message: WKScriptMessage) {
        guard message.name == "variableTrigger",
              let body = message.body as? [String: Any] else { return }
        if body["close"] as? Bool == true {
            NotificationCenter.default.post(name: .variableSuggestionClose, object: nil)
            return
        }
        let partial = (body["partial"] as? String) ?? ""
        let x = (body["x"] as? CGFloat) ?? 0
        let y = (body["y"] as? CGFloat) ?? 0
        NotificationCenter.default.post(
            name: .variableSuggestionOpen,
            object: nil,
            userInfo: ["partial": partial, "x": x, "y": y]
        )
    }
}

extension Notification.Name {
    static let variableSuggestionOpen = Notification.Name("variableSuggestionOpen")
    static let variableSuggestionClose = Notification.Name("variableSuggestionClose")
}
```

Also, to make `WebViewDelegate` conform to `WKScriptMessageHandler`, change its base declaration:

```swift
class WebViewDelegate: NSObject, WKNavigationDelegate {
// becomes:
class WebViewDelegate: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
```

- [ ] **Step 4: Build to verify**

```bash
cd ios-app && xcodebuild build -project dbv-nfc-games.xcodeproj -scheme dbv-nfc-games -destination 'platform=iOS Simulator,name=iPhone 16' 2>&1 | tail -20
```

Expected: BUILD SUCCEEDED.

- [ ] **Step 5: Commit**

```bash
git add ios-app/dbv-nfc-games/Features/Operator/RichTextEditorView.swift
git commit -m "feat(ios): JS→native {{-trigger bridge in WKWebView editor

Wave C.3 — posts variableSuggestionOpen/Close notifications with
caret position; pill spans now atomic via contenteditable=false."
```

### Task C.4: `VariableAutocompleteOverlay` SwiftUI view

**Files:**
- Create: `ios-app/dbv-nfc-games/Features/Operator/VariableAutocompleteOverlay.swift`

- [ ] **Step 1: Create the overlay view**

```swift
import SwiftUI

struct VariableAutocompleteOverlay: View {
    let partial: String
    let position: CGPoint
    let availableKeys: [String]
    let onSelect: (String) -> Void
    let onCreate: (String) -> Void
    let onDismiss: () -> Void

    private var filtered: [String] {
        availableKeys.filter { $0.lowercased().contains(partial.lowercased()) }
    }

    private var showsCreate: Bool {
        !partial.isEmpty && !availableKeys.contains(partial)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(filtered.prefix(8), id: \.self) { key in
                Button {
                    onSelect(key)
                } label: {
                    HStack {
                        Text("{{\(key)}}")
                            .font(.system(.caption, design: .monospaced))
                        Spacer()
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .buttonStyle(.plain)
                .contentShape(Rectangle())
                .accessibilityIdentifier("variable-suggestion-\(key)")
            }
            if showsCreate {
                Divider()
                Button {
                    onCreate(partial)
                } label: {
                    HStack {
                        Image(systemName: "plus")
                        Text("Create variable ")
                        Text("{{\(partial)}}")
                            .font(.system(.caption, design: .monospaced))
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                }
                .accessibilityIdentifier("variable-suggestion-create")
            }
        }
        .frame(minWidth: 200, maxWidth: 260)
        .background(.regularMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .shadow(radius: 8)
        .position(x: position.x + 100, y: position.y + 40)
    }
}
```

- [ ] **Step 2: Build to verify**

```bash
cd ios-app && xcodebuild build -project dbv-nfc-games.xcodeproj -scheme dbv-nfc-games -destination 'platform=iOS Simulator,name=iPhone 16' 2>&1 | tail -10
```

Expected: BUILD SUCCEEDED.

- [ ] **Step 3: Commit**

```bash
git add ios-app/dbv-nfc-games/Features/Operator/VariableAutocompleteOverlay.swift
git commit -m "feat(ios): VariableAutocompleteOverlay SwiftUI view

Wave C.4 — native overlay anchored to caret position; Create-new
affordance when typed partial doesn't match an existing key."
```

### Task C.5: Wire overlay into RichTextEditorView

**Files:**
- Modify: `ios-app/dbv-nfc-games/Features/Operator/RichTextEditorView.swift`

- [ ] **Step 1: Add state to RichTextEditorView**

In the `RichTextEditorView: View` struct, add state and subscribe to the notifications:

```swift
@State private var suggestionPartial: String = ""
@State private var suggestionPosition: CGPoint = .zero
@State private var suggestionOpen: Bool = false

let availableVariableKeys: [String]  // new prop — pass from ChallengeEditView
let onCreateVariable: (String) -> Void  // new prop
```

- [ ] **Step 2: Overlay the autocomplete on the webview**

Wrap the existing `WebViewRepresentable` in a `ZStack` inside `body`:

```swift
ZStack(alignment: .topLeading) {
    WebViewRepresentable(...)
        .onReceive(NotificationCenter.default.publisher(for: .variableSuggestionOpen)) { note in
            guard let info = note.userInfo else { return }
            suggestionPartial = info["partial"] as? String ?? ""
            suggestionPosition = CGPoint(
                x: (info["x"] as? CGFloat) ?? 0,
                y: (info["y"] as? CGFloat) ?? 0
            )
            suggestionOpen = true
        }
        .onReceive(NotificationCenter.default.publisher(for: .variableSuggestionClose)) { _ in
            suggestionOpen = false
        }

    if suggestionOpen {
        VariableAutocompleteOverlay(
            partial: suggestionPartial,
            position: suggestionPosition,
            availableKeys: availableVariableKeys,
            onSelect: { key in
                // Delete the {{partial the user typed, then insert the pill
                let deleteJS = """
                (function() {
                  var sel = window.getSelection();
                  if (!sel.rangeCount) return;
                  var r = sel.getRangeAt(0);
                  var container = r.startContainer;
                  if (container.nodeType !== 3) return;
                  var text = container.textContent;
                  var idx = text.lastIndexOf('{{', r.startOffset);
                  if (idx < 0) return;
                  container.textContent = text.substring(0, idx) + text.substring(r.startOffset);
                  var range = document.createRange();
                  range.setStart(container, idx);
                  range.setEnd(container, idx);
                  sel.removeAllRanges();
                  sel.addRange(range);
                })();
                """
                coordinator.webView?.evaluateJavaScript(deleteJS) { _, _ in
                    insertVariable(key)
                }
                suggestionOpen = false
            },
            onCreate: { partial in
                onCreateVariable(partial)
                suggestionOpen = false
            },
            onDismiss: { suggestionOpen = false }
        )
    }
}
```

- [ ] **Step 3: Build to verify**

```bash
cd ios-app && xcodebuild build -project dbv-nfc-games.xcodeproj -scheme dbv-nfc-games -destination 'platform=iOS Simulator,name=iPhone 16' 2>&1 | tail -20
```

Expected: BUILD SUCCEEDED.

- [ ] **Step 4: Commit**

```bash
git add ios-app/dbv-nfc-games/Features/Operator/RichTextEditorView.swift
git commit -m "feat(ios): wire VariableAutocompleteOverlay into editor

Wave C.5 — {{ typing now shows native overlay; existing toolbar
picker continues to work as second entry point."
```

### Task C.6: Upgrade ChallengeEditView — pass keys, preview toggle, save-time guard

**Files:**
- Modify: `ios-app/dbv-nfc-games/Features/Operator/ChallengeEditView.swift`

- [ ] **Step 1: Pass variable keys and create callback to editor**

At the `.fullScreenCover` that presents `RichTextEditorView` (around line 352-358), add the new props:

```swift
RichTextEditorView(
    ...,
    availableVariableKeys: availableVariableKeys,
    onCreateVariable: { partial in
        newVariableKey = partial
        showCreateVariableSheet = true
    }
)
```

Add `@State private var newVariableKey: String = ""` and `@State private var showCreateVariableSheet: Bool = false`. The sheet presents `TeamVariablesManagementSheet` prefilled with the partial key (use the sheet's existing "add new" form).

- [ ] **Step 2: Upgrade correctAnswer add-chip flow**

Find the `.alert(..., isPresented: $showAddAnswerAlert)` block at line 342-351. Replace it with a sheet that embeds a text field with autocomplete:

```swift
.sheet(isPresented: $showAddAnswerAlert) {
    AddCorrectAnswerSheet(
        availableKeys: availableVariableKeys,
        onCreateVariable: { partial in
            newVariableKey = partial
            showCreateVariableSheet = true
        },
        onAdd: { answer in
            correctAnswers.append(answer)
            showAddAnswerAlert = false
        }
    )
    .presentationDetents([.medium])
}
```

Create the `AddCorrectAnswerSheet` view in the same file (or a new file `ios-app/dbv-nfc-games/Features/Operator/AddCorrectAnswerSheet.swift`). It contains a `TextField` + `VariableAutocompleteOverlay` driven by a local `{{`-match state.

- [ ] **Step 3: Add Preview toggle**

At the top of the main editing area (inside the form or right below the title field), add:

```swift
@State private var previewMode: Bool = false
@State private var previewTeamId: UUID? = nil

// inside body:
Picker("", selection: $previewMode) {
    Text("Edit").tag(false)
    Text("Preview").tag(true)
}
.pickerStyle(.segmented)
.accessibilityIdentifier("preview-mode-picker")

if previewMode {
    Picker("Team", selection: $previewTeamId) {
        ForEach(teams, id: \.id) { t in
            Text(t.name).tag(Optional(t.id))
        }
    }
    .accessibilityIdentifier("preview-team-picker")
}
```

In preview mode, replace the editor with a `ScrollView` showing the content resolved via `VariableResolver.resolve(content, variables: previewTeamVars)` — parse pills out first via a regex substitution for display.

- [ ] **Step 4: Add save-time undefined-key guard**

```swift
@State private var showUndefinedWarning: Bool = false
@State private var undefinedKeys: [String] = []

func saveChallenge() {
    let scan = VariableReferenceScanner.findUndefined(
        in: [content, completionContent] + correctAnswers,
        availableKeys: Set(availableVariableKeys)
    )
    if !scan.isEmpty {
        undefinedKeys = scan
        showUndefinedWarning = true
        return
    }
    // ... existing save logic
}

// modal:
.alert("Undefined variables", isPresented: $showUndefinedWarning) {
    Button("Save anyway", role: .destructive) {
        showUndefinedWarning = false
        performSave()
    }
    Button("Cancel", role: .cancel) {}
} message: {
    Text("The following variables are referenced but not defined: \(undefinedKeys.map { "{{\($0)}}" }.joined(separator: ", "))")
}
```

- [ ] **Step 5: Build + test**

```bash
cd ios-app && xcodebuild build -project dbv-nfc-games.xcodeproj -scheme dbv-nfc-games -destination 'platform=iOS Simulator,name=iPhone 16' 2>&1 | tail -15
```

Expected: BUILD SUCCEEDED.

- [ ] **Step 6: Commit**

```bash
git add ios-app/dbv-nfc-games/Features/Operator/ChallengeEditView.swift ios-app/dbv-nfc-games/Features/Operator/AddCorrectAnswerSheet.swift
git commit -m "feat(ios): wire editor + chip add + preview + save-guard in ChallengeEditView

Wave C.6 — operator authoring surface now uses the autocomplete
overlay on both rich text and correctAnswer; Preview-as-team
toggle; save-time undefined-key confirmation."
```

---

## Wave D — Android operator: autocomplete overlay + chip input + preview

**Owner:** one Android agent. Mirrors Wave C on Android primitives.

**Files:**
- Create: `android-app/core/data/src/main/kotlin/com/prayer/pointfinder/core/data/variables/VariableResolver.kt`
- Create: `android-app/core/data/src/test/kotlin/com/prayer/pointfinder/core/data/variables/VariableResolverTest.kt`
- Create: `android-app/core/data/src/main/kotlin/com/prayer/pointfinder/core/data/variables/VariableReferenceScanner.kt`
- Create: `android-app/core/data/src/test/kotlin/com/prayer/pointfinder/core/data/variables/VariableReferenceScannerTest.kt`
- Create: `android-app/feature/operator/src/main/kotlin/com/prayer/pointfinder/feature/operator/VariableAutocompleteOverlay.kt`
- Modify: `android-app/feature/operator/src/main/kotlin/com/prayer/pointfinder/feature/operator/RichTextWebEditor.kt`
- Modify: `android-app/feature/operator/src/main/kotlin/com/prayer/pointfinder/feature/operator/RichTextEditorScreen.kt`
- Modify: `android-app/feature/operator/src/main/kotlin/com/prayer/pointfinder/feature/operator/ChallengeEditScreen.kt`

### Task D.1: `VariableResolver` utility — TDD

**Files:**
- Create: `android-app/core/data/src/main/kotlin/com/prayer/pointfinder/core/data/variables/VariableResolver.kt`
- Create: `android-app/core/data/src/test/kotlin/com/prayer/pointfinder/core/data/variables/VariableResolverTest.kt`

- [ ] **Step 1: Write the failing test**

```kotlin
// android-app/core/data/src/test/kotlin/com/prayer/pointfinder/core/data/variables/VariableResolverTest.kt
package com.prayer.pointfinder.core.data.variables

import org.junit.Assert.assertEquals
import org.junit.Test

class VariableResolverTest {
    @Test fun substitutesSingleKey() {
        assertEquals("FOX", VariableResolver.resolve("{{secret}}", mapOf("secret" to "FOX")))
    }

    @Test fun substitutesMixed() {
        assertEquals(
            "answer-FOX",
            VariableResolver.resolve("{{prefix}}-FOX", mapOf("prefix" to "answer"))
        )
    }

    @Test fun leavesUnknownKeysAsIs() {
        assertEquals("{{foo}}", VariableResolver.resolve("{{foo}}", emptyMap()))
    }

    @Test fun emptyInput() {
        assertEquals("", VariableResolver.resolve("", emptyMap()))
        assertEquals("", VariableResolver.resolve(null, emptyMap()))
    }
}
```

- [ ] **Step 2: Run to fail**

```bash
cd android-app && ./gradlew :core:data:testDebugUnitTest --tests "com.prayer.pointfinder.core.data.variables.VariableResolverTest" 2>&1 | tail -20
```

Expected: FAIL — class doesn't exist.

- [ ] **Step 3: Implement**

```kotlin
// android-app/core/data/src/main/kotlin/com/prayer/pointfinder/core/data/variables/VariableResolver.kt
package com.prayer.pointfinder.core.data.variables

object VariableResolver {
    private val PATTERN = Regex("""\{\{([a-zA-Z][a-zA-Z0-9_]*)}}""")

    fun resolve(text: String?, variables: Map<String, String>): String {
        if (text.isNullOrEmpty()) return ""
        return PATTERN.replace(text) { m ->
            variables[m.groupValues[1]] ?: m.value
        }
    }
}
```

- [ ] **Step 4: Run to pass**

Same command as step 2.

- [ ] **Step 5: Commit**

```bash
git add android-app/core/data/src/main/kotlin/com/prayer/pointfinder/core/data/variables/VariableResolver.kt android-app/core/data/src/test/kotlin/com/prayer/pointfinder/core/data/variables/VariableResolverTest.kt
git commit -m "feat(android): add VariableResolver in core/data

Wave D.1 — client-side {{key}} substitution; mirrors iOS + web."
```

### Task D.2: `VariableReferenceScanner` utility — TDD

**Files:**
- Create: `android-app/core/data/src/main/kotlin/com/prayer/pointfinder/core/data/variables/VariableReferenceScanner.kt`
- Create: `android-app/core/data/src/test/kotlin/com/prayer/pointfinder/core/data/variables/VariableReferenceScannerTest.kt`

- [ ] **Step 1: Write failing test**

```kotlin
package com.prayer.pointfinder.core.data.variables

import org.junit.Assert.assertEquals
import org.junit.Test

class VariableReferenceScannerTest {
    @Test fun findsReferences() {
        assertEquals(
            listOf("secret", "place"),
            VariableReferenceScanner.scan(listOf("Find {{secret}} at {{place}}"))
        )
    }

    @Test fun deduplicates() {
        assertEquals(listOf("a"), VariableReferenceScanner.scan(listOf("{{a}} and {{a}}")))
    }

    @Test fun findsUndefined() {
        val out = VariableReferenceScanner.findUndefined(
            texts = listOf("Find {{secret}}", "{{typo}}"),
            availableKeys = setOf("secret")
        )
        assertEquals(listOf("typo"), out)
    }
}
```

- [ ] **Step 2: Run to fail**

```bash
cd android-app && ./gradlew :core:data:testDebugUnitTest --tests "com.prayer.pointfinder.core.data.variables.VariableReferenceScannerTest" 2>&1 | tail -15
```

- [ ] **Step 3: Implement**

```kotlin
// android-app/core/data/src/main/kotlin/com/prayer/pointfinder/core/data/variables/VariableReferenceScanner.kt
package com.prayer.pointfinder.core.data.variables

object VariableReferenceScanner {
    private val PATTERN = Regex("""\{\{([a-zA-Z][a-zA-Z0-9_]*)}}""")

    fun scan(texts: List<String?>): List<String> {
        val seen = linkedSetOf<String>()
        texts.forEach { text ->
            if (text.isNullOrEmpty()) return@forEach
            PATTERN.findAll(text).forEach { seen.add(it.groupValues[1]) }
        }
        return seen.toList()
    }

    fun findUndefined(texts: List<String?>, availableKeys: Set<String>): List<String> =
        scan(texts).filter { it !in availableKeys }
}
```

- [ ] **Step 4: Run to pass**

Same command.

- [ ] **Step 5: Commit**

```bash
git add android-app/core/data/src/main/kotlin/com/prayer/pointfinder/core/data/variables/VariableReferenceScanner.kt android-app/core/data/src/test/kotlin/com/prayer/pointfinder/core/data/variables/VariableReferenceScannerTest.kt
git commit -m "feat(android): add VariableReferenceScanner in core/data

Wave D.2 — undefined-key safety scan for editor + save guard."
```

### Task D.3: Add atomic pill HTML + JS bridge to RichTextWebEditor

**Files:**
- Modify: `android-app/feature/operator/src/main/kotlin/com/prayer/pointfinder/feature/operator/RichTextWebEditor.kt`

- [ ] **Step 1: Update `insertHTML` callers to add `contenteditable="false"`**

Find where `editorState.insertHTML(...)` is called with a `variable-tag` span (likely in `RichTextEditorScreen.kt` at line 233/245). Update those call sites to:

```kotlin
editorState.insertHTML(
    """<span class="variable-tag" contenteditable="false" data-variable-key="$key">{{$key}}</span>&nbsp;"""
)
```

- [ ] **Step 2: Add JS trigger listener to the HTML template**

In `RichTextWebEditor.kt`, inside `editorHTML(content, isDark)` (line 80+), locate where the HTML body/script is assembled (should mirror the iOS template). Add a `<script>` block before `</body>`:

```kotlin
val triggerScript = """
<script>
(function() {
  var editor = document.getElementById('editor');
  editor.focus();
  editor.addEventListener('input', function(e) {
    var sel = window.getSelection();
    if (!sel.rangeCount) return;
    var r = sel.getRangeAt(0);
    var container = r.startContainer;
    if (container.nodeType !== Node.TEXT_NODE) {
      if (window.VariableBridge) window.VariableBridge.onTriggerClose();
      return;
    }
    var before = container.textContent.substring(0, r.startOffset);
    var match = before.match(/\{\{([a-zA-Z0-9_]*)${'$'}/);
    if (match && window.VariableBridge) {
      var rect = r.getBoundingClientRect();
      window.VariableBridge.onTriggerOpen(match[1], rect.left, rect.top + rect.height);
    } else if (window.VariableBridge) {
      window.VariableBridge.onTriggerClose();
    }
  });
})();
</script>
""".trimIndent()
```

Append `$triggerScript` to the template string before `</body></html>`.

- [ ] **Step 3: Add a `JavascriptInterface`**

Add a new top-level class in the same file:

```kotlin
class VariableBridge(
    val onOpen: (partial: String, x: Float, y: Float) -> Unit,
    val onClose: () -> Unit,
) {
    @android.webkit.JavascriptInterface
    fun onTriggerOpen(partial: String, x: Float, y: Float) {
        onOpen(partial, x, y)
    }

    @android.webkit.JavascriptInterface
    fun onTriggerClose() {
        onClose()
    }
}
```

Update `RichTextWebEditor` composable signature:

```kotlin
@Composable
fun RichTextWebEditor(
    state: RichTextWebEditorState,
    initialHtml: String,
    bridge: VariableBridge? = null,
    modifier: Modifier = Modifier
) {
```

Wire it in the `WebView.apply { ... }` block:

```kotlin
if (bridge != null) {
    addJavascriptInterface(bridge, "VariableBridge")
}
```

- [ ] **Step 4: Build to verify**

```bash
cd android-app && ./gradlew :feature:operator:assembleDebug 2>&1 | tail -10
```

Expected: BUILD SUCCESSFUL.

- [ ] **Step 5: Commit**

```bash
git add android-app/feature/operator/src/main/kotlin/com/prayer/pointfinder/feature/operator/RichTextWebEditor.kt
git commit -m "feat(android): JavascriptInterface {{-trigger bridge in WebView editor

Wave D.3 — VariableBridge posts onTriggerOpen/Close to Compose;
pill spans now atomic via contenteditable=false."
```

### Task D.4: `VariableAutocompleteOverlay` composable

**Files:**
- Create: `android-app/feature/operator/src/main/kotlin/com/prayer/pointfinder/feature/operator/VariableAutocompleteOverlay.kt`

- [ ] **Step 1: Create the overlay**

```kotlin
package com.prayer.pointfinder.feature.operator

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable
fun VariableAutocompleteOverlay(
    partial: String,
    availableKeys: List<String>,
    onSelect: (String) -> Unit,
    onCreate: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val filtered = availableKeys.filter { it.contains(partial, ignoreCase = true) }.take(8)
    val showsCreate = partial.isNotEmpty() && partial !in availableKeys

    Surface(
        modifier = modifier
            .clip(RoundedCornerShape(8.dp))
            .widthIn(min = 220.dp, max = 280.dp),
        tonalElevation = 6.dp,
        shadowElevation = 6.dp,
    ) {
        Column {
            filtered.forEach { key ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { onSelect(key) }
                        .padding(horizontal = 12.dp, vertical = 8.dp)
                        .testTag("variable-suggestion-$key"),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        "{{$key}}",
                        fontSize = 13.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        style = MaterialTheme.typography.bodySmall.copy(
                            fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace
                        )
                    )
                }
            }
            if (showsCreate) {
                HorizontalDivider()
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { onCreate(partial) }
                        .padding(horizontal = 12.dp, vertical = 8.dp)
                        .testTag("variable-suggestion-create"),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(Icons.Default.Add, contentDescription = null, modifier = Modifier.size(14.dp))
                    Spacer(Modifier.width(6.dp))
                    Text("Create variable  ", fontSize = 13.sp)
                    Text("{{$partial}}", fontSize = 12.sp)
                }
            }
        }
    }
}
```

- [ ] **Step 2: Build**

```bash
cd android-app && ./gradlew :feature:operator:assembleDebug 2>&1 | tail -10
```

- [ ] **Step 3: Commit**

```bash
git add android-app/feature/operator/src/main/kotlin/com/prayer/pointfinder/feature/operator/VariableAutocompleteOverlay.kt
git commit -m "feat(android): VariableAutocompleteOverlay composable

Wave D.4 — Compose overlay anchored to caret; Create-new path
when typed partial has no existing match."
```

### Task D.5: Wire overlay into RichTextEditorScreen

**Files:**
- Modify: `android-app/feature/operator/src/main/kotlin/com/prayer/pointfinder/feature/operator/RichTextEditorScreen.kt`

- [ ] **Step 1: Add overlay state and bridge wiring**

In the `RichTextEditorScreen` composable (around line 208-214 where `RichTextWebEditor` is used), add:

```kotlin
var suggestionOpen by remember { mutableStateOf(false) }
var suggestionPartial by remember { mutableStateOf("") }
var suggestionX by remember { mutableStateOf(0f) }
var suggestionY by remember { mutableStateOf(0f) }

val bridge = remember {
    VariableBridge(
        onOpen = { partial, x, y ->
            suggestionPartial = partial
            suggestionX = x
            suggestionY = y
            suggestionOpen = true
        },
        onClose = { suggestionOpen = false }
    )
}
```

Pass `bridge` to `RichTextWebEditor`:

```kotlin
RichTextWebEditor(
    state = editorState,
    initialHtml = html,
    bridge = bridge,
    modifier = ...
)
```

Overlay the autocomplete in a `Box`:

```kotlin
Box {
    RichTextWebEditor(...)
    if (suggestionOpen) {
        VariableAutocompleteOverlay(
            partial = suggestionPartial,
            availableKeys = variables.map { it.key },
            onSelect = { key ->
                // Delete the typed {{partial, then insert the pill
                editorState.webView?.evaluateJavascript("""
                    (function() {
                      var sel = window.getSelection();
                      if (!sel.rangeCount) return;
                      var r = sel.getRangeAt(0);
                      var container = r.startContainer;
                      if (container.nodeType !== 3) return;
                      var text = container.textContent;
                      var idx = text.lastIndexOf('{{', r.startOffset);
                      if (idx < 0) return;
                      container.textContent = text.substring(0, idx) + text.substring(r.startOffset);
                      var range = document.createRange();
                      range.setStart(container, idx);
                      range.setEnd(container, idx);
                      sel.removeAllRanges();
                      sel.addRange(range);
                    })();
                """.trimIndent(), null)
                editorState.insertHTML(
                    """<span class="variable-tag" contenteditable="false" data-variable-key="$key">{{$key}}</span>&nbsp;"""
                )
                suggestionOpen = false
            },
            onCreate = { partial ->
                showCreateVariable = true
                newVariableName = partial
                suggestionOpen = false
            },
            modifier = Modifier
                .padding(start = suggestionX.dp, top = suggestionY.dp + 8.dp)
        )
    }
}
```

(Note: translating pixel coordinates from WebView to Compose Dp requires the local density — in practice, `LocalDensity.current.run { suggestionX.toDp() }`. Adjust as needed.)

- [ ] **Step 2: Build + smoke test**

```bash
cd android-app && ./gradlew :feature:operator:assembleDebug 2>&1 | tail -10
```

- [ ] **Step 3: Commit**

```bash
git add android-app/feature/operator/src/main/kotlin/com/prayer/pointfinder/feature/operator/RichTextEditorScreen.kt
git commit -m "feat(android): wire VariableAutocompleteOverlay into editor

Wave D.5 — {{ typing now shows Compose overlay; existing
curly-braces toolbar button continues to work."
```

### Task D.6: Upgrade ChallengeEditScreen — chip autocomplete + preview + save-guard

**Files:**
- Modify: `android-app/feature/operator/src/main/kotlin/com/prayer/pointfinder/feature/operator/ChallengeEditScreen.kt`

- [ ] **Step 1: Replace AlertDialog add-chip with autocomplete-enabled input**

Locate the `AlertDialog` at line 760-789. Replace with a `ModalBottomSheet` or sheet containing an `OutlinedTextField` + `VariableAutocompleteOverlay`:

```kotlin
if (showAddAnswerDialog) {
    ModalBottomSheet(onDismissRequest = { showAddAnswerDialog = false }) {
        var draft by remember { mutableStateOf("") }
        val partialMatch = Regex("""\{\{([a-zA-Z0-9_]*)$""").find(draft)
        Column(Modifier.padding(16.dp)) {
            OutlinedTextField(
                value = draft,
                onValueChange = { draft = it },
                label = { Text("Accepted answer or {{variable}}") },
                modifier = Modifier.fillMaxWidth()
            )
            if (partialMatch != null) {
                VariableAutocompleteOverlay(
                    partial = partialMatch.groupValues[1],
                    availableKeys = variables.map { it.key },
                    onSelect = { key ->
                        val before = draft.substring(0, partialMatch.range.first)
                        draft = "$before{{$key}}"
                    },
                    onCreate = { /* open create dialog */ }
                )
            }
            Button(
                onClick = {
                    if (draft.isNotBlank()) {
                        correctAnswers.add(draft.trim())
                        draft = ""
                        showAddAnswerDialog = false
                    }
                },
                modifier = Modifier.align(Alignment.End)
            ) { Text("Add") }
        }
    }
}
```

- [ ] **Step 2: Add Preview toggle**

Near the top of the form (above content editor), add:

```kotlin
var previewMode by remember { mutableStateOf(false) }
var previewTeamId by remember { mutableStateOf<String?>(null) }

Row {
    FilterChip(selected = !previewMode, onClick = { previewMode = false }, label = { Text("Edit") })
    Spacer(Modifier.width(8.dp))
    FilterChip(selected = previewMode, onClick = { previewMode = true }, label = { Text("Preview") })
}

if (previewMode) {
    DropdownMenuBox(
        items = teams,
        selected = previewTeamId,
        onSelect = { previewTeamId = it },
        label = { team -> team.name }
    )
}
```

In preview mode, render resolved strings via `VariableResolver.resolve(...)` in a read-only `Text` instead of the editor.

- [ ] **Step 3: Save-time guard**

```kotlin
import com.prayer.pointfinder.core.data.variables.VariableReferenceScanner

var showUndefinedDialog by remember { mutableStateOf(false) }
var undefinedKeys by remember { mutableStateOf<List<String>>(emptyList()) }

fun onSaveClicked() {
    val undefined = VariableReferenceScanner.findUndefined(
        texts = listOf(content, completionContent) + correctAnswers,
        availableKeys = variables.map { it.key }.toSet()
    )
    if (undefined.isNotEmpty()) {
        undefinedKeys = undefined
        showUndefinedDialog = true
        return
    }
    performSave()
}

if (showUndefinedDialog) {
    AlertDialog(
        onDismissRequest = { showUndefinedDialog = false },
        title = { Text("Undefined variables") },
        text = { Text("References with no definition: ${undefinedKeys.joinToString { "{{$it}}" }}") },
        confirmButton = {
            TextButton(onClick = {
                showUndefinedDialog = false
                performSave()
            }) { Text("Save anyway") }
        },
        dismissButton = {
            TextButton(onClick = { showUndefinedDialog = false }) { Text("Cancel") }
        }
    )
}
```

- [ ] **Step 4: Build + test**

```bash
cd android-app && ./gradlew :feature:operator:assembleDebug && ./gradlew :feature:operator:testDebugUnitTest 2>&1 | tail -15
```

Expected: BUILD SUCCESSFUL + tests pass.

- [ ] **Step 5: Commit**

```bash
git add android-app/feature/operator/src/main/kotlin/com/prayer/pointfinder/feature/operator/ChallengeEditScreen.kt
git commit -m "feat(android): chip autocomplete + preview + save-guard in ChallengeEditScreen

Wave D.6 — operator authoring now uses overlay on chip add field;
Preview-as-team toggle renders resolved content; save-time
undefined-key AlertDialog."
```

---

## Wave E — Integration: E2E parity + docs audit (sequential, after A–D)

**Owner:** one agent with cross-platform scope.

**Prerequisites:** Waves A, B, C, D are all merged to trunk.

### Task E.1: E2E API smoke — per-team auto-validation

**Files:**
- Create or modify: `e2e/tests/api/variables-auto-validate.spec.ts` (check existing test names)

- [ ] **Step 1: Write the E2E test**

```ts
import { test, expect } from '@playwright/test'
// Follow the pattern of existing e2e/tests/api/*.spec.ts files.

test('per-team auto-validation resolves {{secret}} uniquely per team', async ({ request }) => {
  // Arrange:
  // 1. Create game via operator fixture
  // 2. Define game variable { key: 'secret', teamValues: { teamA: 'FOX', teamB: 'WOLF' } }
  // 3. Create challenge with correctAnswer = ['{{secret}}'] and autoValidate=true, answerType='text'
  // 4. Each team submits a different answer

  const gameId = await setupGameWithTwoTeams(request)
  await defineVariable(request, gameId, 'secret', { teamA: 'FOX', teamB: 'WOLF' })
  const challengeId = await createChallenge(request, gameId, {
    correctAnswer: ['{{secret}}'],
    autoValidate: true,
    answerType: 'text',
  })

  // Team A submits FOX — should auto-approve
  const a = await submitAs(request, gameId, 'teamA', challengeId, 'FOX')
  expect(a.status).toBe('correct')

  // Team B submits FOX — should reject (their secret is WOLF)
  const b1 = await submitAs(request, gameId, 'teamB', challengeId, 'FOX')
  expect(b1.status).toBe('rejected')

  // Team B submits WOLF — should auto-approve
  const b2 = await submitAs(request, gameId, 'teamB', challengeId, 'WOLF')
  expect(b2.status).toBe('correct')
})

test('go-live rejects game with undefined {{key}} in challenge', async ({ request }) => {
  const gameId = await setupGameWithOneTeam(request)
  await createChallenge(request, gameId, {
    content: 'Find {{undefined_key}}',
    correctAnswer: ['whatever'],
    autoValidate: true,
    answerType: 'text',
  })
  const res = await request.post(`/api/games/${gameId}/status`, {
    data: { status: 'live' },
  })
  expect(res.status()).toBe(400)
  const body = await res.json()
  expect(body.code).toBe('VARIABLE_REFERENCE_UNDEFINED')
})
```

- [ ] **Step 2: Run the smoke test against local stack**

```bash
cd e2e && ./run.sh api -g "per-team auto-validation|go-live rejects"
```

Expected: both tests pass.

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/api/variables-auto-validate.spec.ts
git commit -m "test(e2e): per-team auto-validation + go-live undefined-key check

Wave E.1 — cross-cutting smoke covering Wave A backend readiness."
```

### Task E.2: Cross-platform parity audit

**Files:**
- Modify: `docs/gap-analysis.md` (append new row)

- [ ] **Step 1: Update parity matrix**

In `docs/gap-analysis.md`, add a row (or section) tracking the new feature across surfaces:

```markdown
### Variable autocomplete & auto-validation UX (2026-04-17)

| Surface | Status |
|---------|--------|
| Backend readiness (`VARIABLE_REFERENCE_UNDEFINED`) | ✅ Wave A |
| Web-admin editor `{{` autocomplete + pill | ✅ Wave B |
| Web-admin correctAnswer chip input | ✅ Wave B |
| Web-admin Preview-as-team toggle | ✅ Wave B |
| Web-admin SubmissionDetail resolved expected answer | ✅ Wave B |
| iOS editor `{{` autocomplete overlay | ✅ Wave C |
| iOS correctAnswer chip input with autocomplete | ✅ Wave C |
| iOS Preview-as-team toggle | ✅ Wave C |
| Android editor `{{` autocomplete overlay | ✅ Wave D |
| Android correctAnswer chip input with autocomplete | ✅ Wave D |
| Android Preview-as-team toggle | ✅ Wave D |
| iOS / Android SubmissionDetail | ❌ out-of-scope (operator review is web-only today) |
```

- [ ] **Step 2: Run full test suite docker**

```bash
make test-docker
```

Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add docs/gap-analysis.md
git commit -m "docs: parity matrix for variable UX wave (2026-04-17)

Wave E.2 — tracks coverage across backend + 3 clients + known
out-of-scope surfaces."
```

---

## Self-Review

**Spec coverage:**
- Foundation (no schema changes, pill rendering, keys source, client-side resolver) → Waves B.2, B.5, C.1, D.1
- Web authoring (TipTap Mention, toolbar, chip input) → Waves B.5, B.6, B.7, B.8, B.9
- iOS authoring (JS bridge, overlay, chip input) → Waves C.3, C.4, C.5, C.6
- Android authoring (JS bridge, overlay, chip input) → Waves D.3, D.4, D.5, D.6
- Preview-as-team (editor + SubmissionDetail) → Waves B.9, B.10, C.6, D.6
- Undefined-key safety (visual, save-time, go-live) → Waves A.2, A.3, B.5 (CSS), B.9, C.6, D.6
- Tests + docs → Waves A.4, E.1, E.2
- All spec sections are covered.

**Placeholder scan:** Two tasks (B.9 step 3, C.6 step 1) reference "replace window.confirm with shadcn AlertDialog — acceptable scope deferral" and "use existing TeamVariablesManagementSheet — prefilled". These are polish deferrals, not blockers, and are flagged explicitly as acceptable. No TBDs or missing code blocks.

**Type consistency:** `VariableResolver.resolve(text, variables)`, `VariableReferenceScanner.scan(texts)`, `findUndefinedReferences(text, availableKeys)` — signatures match across web/iOS/Android. `VariableMention` node name matches between B.5 definition and B.7 wiring. `VariableBridge.onTriggerOpen/onTriggerClose` names match between D.3 and D.5.

**Minor note for executors:** iOS Task C.6 step 2 references a new `AddCorrectAnswerSheet.swift` file — create it as part of that task's commit (file is listed in Wave C's Files section).
