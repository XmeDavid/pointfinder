# Operator tutorials — Phase 2: guided first game Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the `first-game` scenario — 36 coach-marked steps from an empty dashboard to a live game, a revert, an edit and a second go-live — plus the dashboard welcome card that offers it, the full trilingual `tutorials` copy block, and the corrected revert wording it teaches.

**Architecture:** The scenario is a pure data file (`scenarios/firstGame.ts`) of `Step` objects whose `done` rules are real predicates over the `TourState` selector that phase 1 assembles. No new engine concepts: `when` filters branch steps (GPS radius, QR print, NFC write, auto-validate answer), `prepare` only reveals anchors through `TourActions`, and `branchCopy` swaps the go-live body. The welcome card is a plain component gated on workspace, game count and the in-memory `progress` map; server persistence arrives in phase 3.

**Tech Stack:** React 19, TypeScript, Zustand, TanStack Query v5, Tailwind v4 semantic tokens, react-i18next (`@pointfinder/i18n`), Vitest + Testing Library + MSW, Playwright (offline route mocks).

---

## Contract deviations

These are already merged into the "Contract deviations" section of
`docs/superpowers/plans/2026-09-06-operator-tutorials-0-index.md`. Task 2 Step 7 only verifies
they are still there; never replace that section.

1. **`gamesAtStart` added to the tour state and store.** `Game` in
   `web/src/types/index.ts` has **no** `createdAt` field (verified: the interface runs
   `id … defaultCheckInRadiusM` with no timestamp), so the spec's step-1 rule "a game created
   after `startedAt` exists" cannot be expressed. Instead `TourStoreState` gains
   `gamesAtStart: string[]`, captured by `start()` from the games query, and `TourState` gains
   `gamesAtStart: readonly string[]`. Step 1 passes when the route game id is not in that
   snapshot and the game is in `setup`.
2. **`TourHost` narrows its game binding to `new-game` scenarios.** Phase 1's `TourRunner`
   already has a bind effect — `if (!gameId && state.routeGameId) bindGame(state.routeGameId)` —
   which binds any route game for any scenario. Phase 2 **replaces** that effect (it does not add
   a second one) with: bind only when `scenario.entry === 'new-game'`, `gameId` is null,
   `routeGameId` is set and the route game is not in `gamesAtStart`. Phase 1's `TourHost.test.tsx`
   case "binds the route game when the scenario has none yet" is updated in the same step, because
   its `probe` scenario is `entry: 'setup-game'` and must no longer bind.
3. **The empty anchor `''` means "no spotlight, centred bubble".** The spec's final step has
   anchor "none". `Step.anchor` stays `string | ((s) => string)`; `TourHost` treats a resolved
   anchor of `''` as: render `CoachBubble` centred, render no `Spotlight`, and never collapse to
   `TourPill`. `KNOWN_ANCHORS` does not need an entry for it.
4. **`base-radius` does not test ring overlap.** The spec's 4e completion is "radius valid and
   no overlap". `TourState.readiness.failing` carries **localized labels**, not stable check ids,
   so overlap cannot be tested from a scenario without string matching. The predicate tests
   radius validity only; the copy and the `aside` point the operator at the readiness pill, which
   already owns the overlap check (`readiness.locationOverlap`).
5. **`base-method` completes on click, `challenge-type` completes on ack.** Both fields ship with
   a value already selected (`BaseDetail` seeds `localMethod` from `base.checkInMethod ?? 'NFC'`;
   `ContentDrawer` creates challenges with `answerType: 'text'`), so the spec's "method chosen" /
   "type chosen" predicates are true on arrival and the engine would skip both coach marks.
   `base-method` uses `{ kind: 'click' }` on the `base-checkin-method` group; `challenge-type`
   uses `{ kind: 'ack' }` and anchors the `answer-type-group` wrapper. `pressedAnswerType(s)`
   still reads the chosen type for `challenge-answer`'s `when`, now off that group.
6. **`base-name` and `challenge-title` reject the prefilled default.** Both are prefilled
   (`Base 1`, `Challenge 1`), so a bare "non-empty" predicate self-completes. The predicates
   additionally require the value not to match `/^Base \d+$/` / `/^Challenge \d+$/`.
7. **`challenge-type` spotlights the whole answer-type group.** Phase 1's groundwork adds
   `data-testid="answer-type-group"` to the wrapper around the three `answer-type-{text,file,none}`
   buttons, so the step anchors the group rather than one of its three options and
   `pressedAnswerType(s)` is one `s.pressedIn('answer-type-group')` call instead of three
   `s.field(...)` reads. The helper is still exported from `firstGame.ts` because it maps the
   returned test id back to a bare `'text' | 'file' | 'none'` for `challenge-answer`'s `when`.
8. **All three scenario titles land in phase 2; `tutorials.common.*` stays as phase 1 wrote it.**
   `contractKeys` requires `tutorials.scenarios.fixedRoute.title` and
   `tutorials.scenarios.exploration.title`, whose scenarios are phase 4, so phase 2 writes
   title/blurb for all three scenarios. Phase 1 already created the top-level `tutorials` object
   containing `common` (`stepOf`, `next`, `gotIt`, `later`, `close`, `resume`, `pillLabel`) in all
   three locales; phase 2 **extends** that object with `menu`, `welcome`, `scenarios` and
   `firstGame` and does **not** re-emit or re-word `common`.
9. **Phase 2 appends to two phase-1 files.** `anchors.ts` (`KNOWN_ANCHORS`) and
   `scenarios/index.ts` (`SCENARIOS`) are delivered by phase 1 and extended here. Names are
   unchanged.
10. **Every `prepare` that switches mode guards first.** `setMode` in
    `web/src/stores/workspace.ts` closes the drawer and the settings panel as a side effect, so
    an unconditional `a.setMode('build')` on a step whose anchor lives *inside* the drawer slams
    it shut the moment the step starts — and `prepare` re-runs on every resume. Every scenario
    `prepare` therefore reads `if (s.mode !== 'build') a.setMode('build')`, which is why
    `prepare` takes `(a, s)` and not just `(a)`.
11. **The welcome card's Skip calls `skip('first-game')`.** Phase 1's store owns the only two
    places a `TutorialProgress` row is built (`complete()` and `skip()`), so the card does not
    hand-assemble a row and pass it to `setProgress`.
12. **Field-walkthrough steps carry `route: 'workspace'`.** Phase 1's `TourRunner` navigates to
    the step's route before resuming a paused run, so a step that has no `route` cannot bring the
    operator back to the screen its anchor lives on. Every `first-game` step after `create-game`
    is a workspace step and says so.

## Global Constraints

- Every name used here must match the shared contract in
  `docs/superpowers/plans/2026-09-06-operator-tutorials-0-index.md` exactly. Deviations are the
  nine above and nothing else.
- Never rename an existing `data-testid`, route, API path, query key or accessibility id. New ids
  only. New ids in this phase: `tutorial-welcome-card`, `tutorial-welcome-start`,
  `tutorial-welcome-skip` (all from the contract).
- Every new i18n key lands in `packages/i18n/src/locales/en.json`, `pt.json` **and** `de.json` in
  the same change — `packages/i18n/src/locales.test.ts` enforces key parity and rejects empty
  strings.
- Bubble bodies stay under ~45 words in every language. German is the length budget: copy must
  wrap in a 20 rem desktop bubble without clipping buttons.
- Portuguese is European Portuguese, informal `tu`, and uses the established vocabulary:
  *bases*, *desafios*, *equipas*, *jogadores*. German is informal `du` and uses *Stationen*,
  *Challenges*, *Teams*, *Spieler*.
- Compose canonical components only (`@/components/ui/*`, `@/components/layout/*`,
  `@/components/feedback/*`). No raw Tailwind palette classes, no new inline primitives.
- Scenario files are **pure data**: no React imports, no hooks, no direct DOM access. Everything
  a step needs comes from `TourState`; everything a step reveals goes through `TourActions`.
- `prepare` never performs a domain action. It may only call `setMode`, `openDrawer`,
  `selectBase`, `selectChallenge`, `selectTeam`, `setReadinessExpanded`, `setSettingsPanelOpen`,
  `navigate`.
- Phase 2 does **not** touch the backend, the tutorials library page, or `progressSync.ts`.
  Progress lives in memory; a reload brings the welcome card back. That is expected.
- Focused test command: `bun run --cwd web test -- <path>`. Package tests:
  `bun run --cwd packages/i18n test`.
- Phase gate commands: `bun run --cwd web typecheck`, `bun run --cwd web lint`,
  `bun run --cwd packages/i18n test`, `bun run --cwd web test:e2e -- tutorials`.
- ONE atomic commit at the very end, message `feat(web): guided first-game tutorial with welcome card`,
  trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Do **not** commit this plan
  file, the index, or anything under `docs/specs/`.

## File structure

| File | Responsibility |
|---|---|
| `packages/i18n/src/locales/{en,pt,de}.json` | new top-level `tutorials` block; new `lifecycle.revert` block |
| `packages/i18n/src/locales.test.ts` | five new `contractKeys`; a guard that revert copy never says "deleted" |
| `web/src/features/tutorials/types.ts` | `TourState.gamesAtStart` |
| `web/src/features/tutorials/store.ts` | `TourStoreState.gamesAtStart`, captured in `start()` |
| `web/src/features/tutorials/testState.ts` | the shared factory gains `gamesAtStart` |
| `web/src/features/tutorials/useTourState.ts` | feeds `gamesAtStart` through from the store |
| `web/src/features/tutorials/TourHost.tsx` | `new-game` binding narrowed; empty-anchor rendering |
| `web/src/components/tour/CoachBubble.tsx` | centre the bubble when `anchorRect` is null |
| `web/src/features/tutorials/anchors.ts` | first-game anchors appended to `KNOWN_ANCHORS` |
| `web/src/features/tutorials/scenarios/firstGame.ts` | the 36-step scenario + `pressedAnswerType` |
| `web/src/features/tutorials/scenarios/index.ts` | registers `first-game` in `SCENARIOS` |
| `web/src/features/tutorials/WelcomeCard.tsx` | dashboard offer card |
| `web/src/features/dashboard/DashboardPage.tsx` | mounts `WelcomeCard` above the header |
| `web/src/features/build/GameSettingsPanel.tsx` | Game State block moves to `lifecycle.revert.*` |
| `web/e2e/tutorials.spec.ts` | offline walk of the first three steps on both projects |
| `docs/visual-system/preview-matrix.md`, `docs/business-logic.md` | documentation |

---

### Task 1: The `tutorials` and `lifecycle.revert` i18n blocks

**Files:**
- Modify: `packages/i18n/src/locales/en.json` (add `lifecycle.revert`; extend the top-level `tutorials` object phase 1 created)
- Modify: `packages/i18n/src/locales/pt.json` (same two edits)
- Modify: `packages/i18n/src/locales/de.json` (same two edits)
- Test: `packages/i18n/src/locales.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: keys `tutorials.menu`, `tutorials.welcome.{title,body,duration,start,skip}`,
  `tutorials.scenarios.{firstGame,fixedRoute,exploration}.{title,blurb}`,
  `tutorials.firstGame.<stepId>.{title,body,aside?,later?,branch.*?}` for the 36 step ids, and
  `lifecycle.revert.{sectionTitle,currentStatus,toLive,toLiveHint,toSetup,toSetupHint,confirmToLive,confirmToSetup,progressQuestion,keep,keepHint,erase,eraseHint,resumeHint,confirm,reverting}`.
- Does **not** produce `tutorials.common.*` — phase 1 already shipped that sub-object in all three
  locales. Steps 4-6 leave it exactly as it is.

- [ ] **Step 1: Write the failing test**

In `packages/i18n/src/locales.test.ts`, add these two blocks at the end of the file:

```ts
describe('operator tutorial vocabulary', () => {
  const contractKeys = [
    'tutorials.menu',
    'tutorials.welcome.title',
    'tutorials.scenarios.firstGame.title',
    'tutorials.scenarios.fixedRoute.title',
    'tutorials.scenarios.exploration.title',
  ]

  it.each(['en', 'pt', 'de'] as const)('%s carries every tutorial contract key', (lang) => {
    const paths = new Set(keyPaths(resources[lang].translation as Record<string, unknown>))
    for (const key of contractKeys) expect(paths.has(key)).toBe(true)
  })

  const firstGameSteps = [
    'create-game', 'orient', 'place-base', 'base-name', 'base-description', 'base-coords',
    'base-method', 'base-radius', 'base-visibility', 'base-link', 'base-save', 'base-qr',
    'base-nfc', 'second-base', 'new-challenge', 'challenge-title', 'challenge-type',
    'challenge-content', 'challenge-description', 'challenge-autovalidate', 'challenge-answer',
    'challenge-points', 'challenge-completion', 'challenge-location-bound', 'challenge-notes',
    'challenge-save', 'more-challenges', 'assign', 'new-team', 'team-code', 'go-live', 'modes',
    'revert', 'edit', 'go-live-again', 'finish',
  ]

  it.each(['en', 'pt', 'de'] as const)('%s carries a title and body for every first-game step', (lang) => {
    const paths = new Set(keyPaths(resources[lang].translation as Record<string, unknown>))
    for (const step of firstGameSteps) {
      expect(paths.has(`tutorials.firstGame.${step}.title`), `${lang} ${step}.title`).toBe(true)
      expect(paths.has(`tutorials.firstGame.${step}.body`), `${lang} ${step}.body`).toBe(true)
    }
  })

  it.each(['en', 'pt', 'de'] as const)('%s keeps bubble bodies short enough for a 20rem bubble', (lang) => {
    const bundle = resources[lang].translation as Record<string, Record<string, Record<string, string>>>
    for (const [step, copy] of Object.entries(bundle.tutorials.firstGame)) {
      expect(copy.body.split(/\s+/).length, `${lang} ${step}.body word count`).toBeLessThanOrEqual(50)
    }
  })
})

describe('revert copy', () => {
  it.each(['en', 'pt', 'de'] as const)('%s says progress is archived, never deleted', (lang) => {
    const revert = (resources[lang].translation as { lifecycle: { revert: Record<string, string> } })
      .lifecycle.revert
    expect(revert.eraseHint).toBeTruthy()
    expect(revert.eraseHint.toLowerCase()).not.toMatch(/deleted|eliminad|gelöscht wird alles/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```
bun run --cwd packages/i18n test
```

Expected: `operator tutorial vocabulary > en carries every tutorial contract key` fails with
`expected false to be true`, and `revert copy` fails with
`TypeError: Cannot read properties of undefined (reading 'revert')`.

- [ ] **Step 3: Add the `lifecycle.revert` block to all three locales**

In `packages/i18n/src/locales/en.json`, inside the existing `"lifecycle"` object, after
`"endGameConfirmDescription"`, add:

```json
    "revert": {
      "sectionTitle": "Game state",
      "currentStatus": "Current status:",
      "toLive": "Revert to live",
      "toLiveHint": "Resume the game. All progress is kept.",
      "toSetup": "Revert to setup",
      "toSetupHint": "Return the game to setup so you can edit it.",
      "confirmToLive": "Revert to live?",
      "confirmToSetup": "Revert to setup?",
      "progressQuestion": "What should happen to player progress?",
      "keep": "Keep progress",
      "keepHint": "Submissions, check-ins and scores stay exactly as they are.",
      "erase": "Erase progress",
      "eraseHint": "Submissions, check-ins and events are archived out of the game. Nothing is removed — the audit trail keeps every row.",
      "resumeHint": "The game will resume. All progress is kept.",
      "confirm": "Confirm",
      "reverting": "Reverting…"
    }
```

In `packages/i18n/src/locales/pt.json`, same position inside `"lifecycle"`:

```json
    "revert": {
      "sectionTitle": "Estado do jogo",
      "currentStatus": "Estado atual:",
      "toLive": "Voltar a decorrer",
      "toLiveHint": "Retomar o jogo. Todo o progresso é mantido.",
      "toSetup": "Voltar à configuração",
      "toSetupHint": "Devolver o jogo à configuração para poderes editá-lo.",
      "confirmToLive": "Voltar a decorrer?",
      "confirmToSetup": "Voltar à configuração?",
      "progressQuestion": "O que deve acontecer ao progresso dos jogadores?",
      "keep": "Manter progresso",
      "keepHint": "Submissões, check-ins e pontuações ficam exatamente como estão.",
      "erase": "Apagar progresso",
      "eraseHint": "Submissões, check-ins e eventos são arquivados fora do jogo. Nada desaparece — o registo de auditoria guarda tudo.",
      "resumeHint": "O jogo vai retomar. Todo o progresso é mantido.",
      "confirm": "Confirmar",
      "reverting": "A reverter…"
    }
```

In `packages/i18n/src/locales/de.json`, same position inside `"lifecycle"`:

```json
    "revert": {
      "sectionTitle": "Spielstatus",
      "currentStatus": "Aktueller Status:",
      "toLive": "Zurück auf live",
      "toLiveHint": "Das Spiel läuft weiter. Der gesamte Fortschritt bleibt erhalten.",
      "toSetup": "Zurück in die Einrichtung",
      "toSetupHint": "Das Spiel zum Bearbeiten in die Einrichtung zurücksetzen.",
      "confirmToLive": "Zurück auf live?",
      "confirmToSetup": "Zurück in die Einrichtung?",
      "progressQuestion": "Was soll mit dem Fortschritt der Spieler passieren?",
      "keep": "Fortschritt behalten",
      "keepHint": "Einreichungen, Check-ins und Punkte bleiben unverändert.",
      "erase": "Fortschritt löschen",
      "eraseHint": "Einreichungen, Check-ins und Ereignisse werden aus dem Spiel archiviert. Nichts verschwindet — das Auditprotokoll behält jede Zeile.",
      "resumeHint": "Das Spiel läuft weiter. Der gesamte Fortschritt bleibt erhalten.",
      "confirm": "Bestätigen",
      "reverting": "Wird zurückgesetzt…"
    }
```

- [ ] **Step 4: Extend the English `tutorials` block**

Phase 1 already created the top-level `"tutorials"` key in `packages/i18n/src/locales/en.json`
(after `"readiness"`), and its entire content today is:

```json
  "tutorials": {
    "common": {
      "stepOf": "Step {{n}} of {{total}}",
      "next": "Next",
      "gotIt": "Got it",
      "later": "I'll do it later",
      "close": "Close tutorial",
      "resume": "Resume",
      "pillLabel": "Tutorial · step {{n}} of {{total}}"
    }
  }
```

**Do not add a second `"tutorials"` key and do not retype `"common"`.** Edit that object in place:
insert `"menu"` and `"welcome"` immediately **before** `"common"`, and `"scenarios"` and
`"firstGame"` immediately **after** it, leaving every `common` value byte-for-byte as phase 1
wrote it. The finished object is:

```json
  "tutorials": {
    "menu": "Tutorials",
    "welcome": {
      "title": "Build your first game, guided",
      "body": "A short walkthrough on a real game of your own. We highlight the next thing to do and explain what each screen offers. Nothing is created for you, and you can stop at any time.",
      "duration": "About 15 minutes",
      "start": "Start the tutorial",
      "skip": "Skip for now"
    },
    "common": {
      "stepOf": "Step {{n}} of {{total}}",
      "next": "Next",
      "gotIt": "Got it",
      "later": "I'll do it later",
      "close": "Close tutorial",
      "resume": "Resume",
      "pillLabel": "Tutorial · step {{n}} of {{total}}"
    },
    "scenarios": {
      "firstGame": {
        "title": "Run your first game",
        "blurb": "From an empty dashboard to a live game and back to setup: bases, challenges, teams, assignments and go-live."
      },
      "fixedRoute": {
        "title": "Make a fixed route",
        "blurb": "Bases unlock one at a time in an order you arrange, so every team follows the same path."
      },
      "exploration": {
        "title": "Hide bases for exploration",
        "blurb": "Keep bases off the player map until a team finds them, and use completion text to hand out the clues."
      }
    },
    "firstGame": {
      "create-game": {
        "title": "Start with a game",
        "body": "Every event lives inside a game, and a new game always begins in setup. Give it a name and create it — renaming, dates and importing a finished game all live on this screen too."
      },
      "orient": {
        "title": "Your readiness checklist",
        "body": "The map is your canvas: bases sit on it and everything else hangs off them. This pill counts what is still missing before the game can go live. Open it any time for the full list.",
        "aside": "It only appears while the game is in setup."
      },
      "place-base": {
        "title": "Place your first base",
        "body": "Tap the map where players should go, then choose Place base here. You can drag the marker later to move it, or add bases from the content panel if you would rather type coordinates."
      },
      "base-name": {
        "title": "Name the base",
        "body": "Players see this name on their map and in their list, so name it after the place: \"Old mill\", \"Chapel steps\". It is prefilled — change it to something a stranger could find."
      },
      "base-description": {
        "title": "Describe it (optional)",
        "body": "A sentence of context for players — what the spot looks like, where to stand. Leave it empty when the name is enough on its own."
      },
      "base-coords": {
        "title": "Check the coordinates",
        "body": "These came from where you tapped. Drag the marker on the small map to adjust them, or type exact values if you already have them from a survey."
      },
      "base-method": {
        "title": "How players check in",
        "body": "Tap how a team proves it arrived: an NFC tag you write, a QR code you print, or GPS location. The current choice is highlighted — tap one to confirm it. The game-wide default lives in settings."
      },
      "base-radius": {
        "title": "Set the GPS radius",
        "body": "Location bases unlock inside this ring. Too small and phones with poor accuracy struggle; too large and neighbouring bases overlap. The readiness list warns you when two rings touch.",
        "aside": "Leave it empty to inherit the game default."
      },
      "base-visibility": {
        "title": "Visible or hidden",
        "body": "Visible bases show on the player map from the start. Hidden ones stay off it until a team finds them — the basis of exploration games, which have their own tutorial."
      },
      "base-link": {
        "title": "Pin one challenge",
        "body": "A base can hold one fixed challenge, so the same task always waits there. You have no challenges yet — assignments come later and can differ per team."
      },
      "base-save": {
        "title": "Save the base",
        "body": "Save writes the base to the server. Nothing is live yet: teams see none of this until you go live, so edit as freely as you like."
      },
      "base-qr": {
        "title": "Print the QR code",
        "body": "This base unlocks by QR code. Print it and put it at the location, weatherproofed if it lives outdoors. The Tags & codes tab prints every code on one sheet."
      },
      "base-nfc": {
        "title": "Write the NFC tag",
        "body": "This base needs a tag written to it. Hold a blank NFC tag against the phone and write it. No tag with you right now? Do it later — the Tags tab lists every unlinked base.",
        "aside": "On a computer, open the Tags & codes tab and write the tag from the phone app.",
        "later": "I'll do it later"
      },
      "second-base": {
        "title": "Add a second base",
        "body": "One base is not a route. Place another far enough away that the two do not overlap, then save it. Later bases skip this field-by-field walkthrough."
      },
      "new-challenge": {
        "title": "Create a challenge",
        "body": "Challenges are the tasks teams answer. The content panel holds bases, challenges, teams, stages, and tags & codes — New adds one to whichever tab you are on."
      },
      "challenge-title": {
        "title": "Title the challenge",
        "body": "This is what players see in their list before they open it, so keep it short and concrete. It is prefilled — replace it. Required."
      },
      "challenge-type": {
        "title": "Choose an answer type",
        "body": "Text for a typed answer, File for a photo or recording, None when reaching the base is the whole task. Text is preselected."
      },
      "challenge-content": {
        "title": "Write the task",
        "body": "This is the challenge itself, shown once a team unlocks it. Formatting, embedded files and per-team variables all work, so one challenge can hand each team a different clue."
      },
      "challenge-description": {
        "title": "Short summary (optional)",
        "body": "One line shown in lists next to the title. Handy when several challenges look alike; skip it otherwise."
      },
      "challenge-autovalidate": {
        "title": "Who checks the answer",
        "body": "On, the app compares the answer to the one you set and accepts it instantly. Off, the submission waits for you in Review mode — which is what file answers need."
      },
      "challenge-answer": {
        "title": "Set the correct answer",
        "body": "Auto-validate needs something to compare against. Matching ignores capitals and surrounding spaces, so type the answer the way a player would write it."
      },
      "challenge-points": {
        "title": "Points",
        "body": "The scoring weight of this challenge. Players never see points or a leaderboard — scoring is yours alone, in Results mode."
      },
      "challenge-completion": {
        "title": "After they finish",
        "body": "Optional text shown to the team the moment this challenge is done. Good for a thank-you, the next hint, or the clue to a hidden base."
      },
      "challenge-location-bound": {
        "title": "Require being there",
        "body": "On, the challenge can only be answered at its base. Off, a team can answer from anywhere once it is unlocked — useful for research or photo tasks."
      },
      "challenge-notes": {
        "title": "Notes for your team",
        "body": "Private notes for you and your fellow operators: the expected answer, safety warnings, who looks after this base. Players never receive this field."
      },
      "challenge-save": {
        "title": "Save the challenge",
        "body": "Save it. Everything above stays editable while the game is in setup, and most of it stays editable while the game is running."
      },
      "more-challenges": {
        "title": "One per base",
        "body": "Add challenges until every base has at least one. Duplicating your first one and editing it is usually faster than starting from scratch."
      },
      "assign": {
        "title": "Link challenges to bases",
        "body": "Assignments decide which challenge waits at which base. Auto-assign gives every base every challenge; open a base to pick by hand, or assign per team for split routes."
      },
      "new-team": {
        "title": "Create a team",
        "body": "Players never join alone — they join a team. Create one now; you can add more, rename them, recolour them and set team variables at any time."
      },
      "team-code": {
        "title": "The join code",
        "body": "Players type this code in the app to join, or scan the QR beside it. Codes stay valid for the whole game, so you can print them on a handout."
      },
      "go-live": {
        "title": "Go live",
        "body": "Every check has passed. Going live fixes the route, hands the challenges to the teams and opens check-ins. You can come back to setup afterwards.",
        "branch": {
          "nfcPending": "One NFC base still has no tag written, and that is the only thing left. Write it from the Tags & codes tab, or switch that base to a QR code or GPS instead.",
          "notReady": "Some checks are still red. Open the checklist to see which — usually a base with no challenge, a missing team, or an NFC tag that has not been written yet."
        }
      },
      "modes": {
        "title": "The four modes",
        "body": "Build is where you have been. Command watches teams live on the map, Review handles submissions waiting for you, and Results holds scoring and the export."
      },
      "revert": {
        "title": "Back to setup",
        "body": "Need a change mid-event? Revert to setup. Keep progress and everything teams did stays; erase it and their submissions, check-ins and events are archived aside, never removed."
      },
      "edit": {
        "title": "Edit anything",
        "body": "In setup everything is editable again — open this challenge and change its points, its text, anything at all. Save it and the change is ready for the next go-live."
      },
      "go-live-again": {
        "title": "Go live again",
        "body": "Reopen the game. Teams pick up where they left off if you kept progress, or start clean if you erased it."
      },
      "finish": {
        "title": "That is your first game",
        "body": "You built a game, ran it, changed it and ran it again. Two more tutorials cover fixed routes, where bases unlock one at a time, and exploration games with hidden bases."
      }
    }
  }
```

- [ ] **Step 5: Extend the Portuguese `tutorials` block**

Same edit in `packages/i18n/src/locales/pt.json`. Phase 1 left exactly this there:

```json
  "tutorials": {
    "common": {
      "stepOf": "Passo {{n}} de {{total}}",
      "next": "Seguinte",
      "gotIt": "Percebi",
      "later": "Faço isto mais tarde",
      "close": "Fechar tutorial",
      "resume": "Retomar",
      "pillLabel": "Tutorial · passo {{n}} de {{total}}"
    }
  }
```

Insert around it — never replace it. The finished object is:

```json
  "tutorials": {
    "menu": "Tutoriais",
    "welcome": {
      "title": "Cria o teu primeiro jogo, passo a passo",
      "body": "Um percurso curto sobre um jogo teu, a sério. Destacamos o passo seguinte e explicamos o que cada ecrã oferece. Não criamos nada por ti e podes parar quando quiseres.",
      "duration": "Cerca de 15 minutos",
      "start": "Começar o tutorial",
      "skip": "Agora não"
    },
    "common": {
      "stepOf": "Passo {{n}} de {{total}}",
      "next": "Seguinte",
      "gotIt": "Percebi",
      "later": "Faço isto mais tarde",
      "close": "Fechar tutorial",
      "resume": "Retomar",
      "pillLabel": "Tutorial · passo {{n}} de {{total}}"
    },
    "scenarios": {
      "firstGame": {
        "title": "Faz o teu primeiro jogo",
        "blurb": "Do painel vazio até um jogo a decorrer e de volta à configuração: bases, desafios, equipas, atribuições e arranque."
      },
      "fixedRoute": {
        "title": "Cria um percurso fixo",
        "blurb": "As bases desbloqueiam uma a uma pela ordem que definires, para todas as equipas seguirem o mesmo caminho."
      },
      "exploration": {
        "title": "Esconde bases para exploração",
        "blurb": "Mantém bases fora do mapa dos jogadores até serem encontradas e usa o texto de conclusão para dar as pistas."
      }
    },
    "firstGame": {
      "create-game": {
        "title": "Começa por um jogo",
        "body": "Cada evento vive dentro de um jogo, e um jogo novo começa sempre em configuração. Dá-lhe um nome e cria-o — mudar o nome, definir datas e importar um jogo pronto também se faz neste ecrã."
      },
      "orient": {
        "title": "A tua lista de prontidão",
        "body": "O mapa é a tua tela: as bases assentam nele e tudo o resto depende delas. Esta pastilha conta o que ainda falta para o jogo arrancar. Abre-a quando quiseres a lista completa.",
        "aside": "Só aparece enquanto o jogo está em configuração."
      },
      "place-base": {
        "title": "Coloca a primeira base",
        "body": "Toca no mapa onde os jogadores devem chegar e escolhe Colocar base aqui. Depois podes arrastar o marcador para a mover, ou criar bases pelo painel de conteúdos se preferires escrever coordenadas."
      },
      "base-name": {
        "title": "Dá nome à base",
        "body": "Os jogadores veem este nome no mapa e na lista, por isso usa o nome do sítio: \"Moinho velho\", \"Escadas da capela\". Já vem preenchido — troca-o por algo que um estranho consiga encontrar."
      },
      "base-description": {
        "title": "Descreve-a (opcional)",
        "body": "Uma frase de contexto para os jogadores — o aspeto do sítio, onde se devem colocar. Deixa vazio quando o nome já chega."
      },
      "base-coords": {
        "title": "Confirma as coordenadas",
        "body": "Vieram do sítio onde tocaste. Arrasta o marcador no mapa pequeno para as ajustar, ou escreve os valores exatos se já os tiveres de um levantamento."
      },
      "base-method": {
        "title": "Como fazem check-in",
        "body": "Toca em como uma equipa prova que chegou: etiqueta NFC que gravas, código QR que imprimes, ou localização GPS. A escolha atual está destacada — toca numa para a confirmares. O padrão do jogo está nas definições."
      },
      "base-radius": {
        "title": "Define o raio de GPS",
        "body": "As bases por localização desbloqueiam dentro deste círculo. Pequeno demais e telemóveis pouco precisos falham; grande demais e as bases vizinhas sobrepõem-se. A lista de prontidão avisa-te.",
        "aside": "Deixa vazio para herdar o valor padrão do jogo."
      },
      "base-visibility": {
        "title": "Visível ou escondida",
        "body": "As bases visíveis aparecem no mapa dos jogadores desde o início. As escondidas ficam de fora até uma equipa as encontrar — a base dos jogos de exploração, que têm tutorial próprio."
      },
      "base-link": {
        "title": "Fixa um desafio",
        "body": "Uma base pode ter um desafio fixo, para que a mesma tarefa esteja sempre ali à espera. Ainda não tens desafios — as atribuições vêm depois e podem variar por equipa."
      },
      "base-save": {
        "title": "Guarda a base",
        "body": "Guardar envia a base para o servidor. Ainda nada está no ar: as equipas não veem nada disto até arrancares, por isso edita à vontade."
      },
      "base-qr": {
        "title": "Imprime o código QR",
        "body": "Esta base desbloqueia por código QR. Imprime-o e coloca-o no local, protegido da chuva se ficar ao ar livre. O separador Etiquetas e códigos imprime todos os códigos numa folha."
      },
      "base-nfc": {
        "title": "Grava a etiqueta NFC",
        "body": "Esta base precisa de uma etiqueta gravada. Encosta uma etiqueta NFC virgem ao telemóvel e grava-a. Não tens nenhuma à mão? Faz depois — o separador Etiquetas lista todas as bases por ligar.",
        "aside": "No computador, abre o separador Etiquetas e códigos e grava a etiqueta pela app do telemóvel.",
        "later": "Faço isto depois"
      },
      "second-base": {
        "title": "Acrescenta uma segunda base",
        "body": "Uma base não é um percurso. Coloca outra suficientemente longe para não se sobreporem e guarda-a. As bases seguintes já não passam por este passo a passo dos campos."
      },
      "new-challenge": {
        "title": "Cria um desafio",
        "body": "Os desafios são as tarefas que as equipas respondem. O painel de conteúdos tem bases, desafios, equipas, etapas e etiquetas e códigos — Novo acrescenta ao separador onde estiveres."
      },
      "challenge-title": {
        "title": "Dá título ao desafio",
        "body": "É o que os jogadores veem na lista antes de o abrirem, por isso curto e concreto. Já vem preenchido — substitui-o. Obrigatório."
      },
      "challenge-type": {
        "title": "Escolhe o tipo de resposta",
        "body": "Texto para uma resposta escrita, Ficheiro para uma foto ou gravação, Nenhuma quando chegar à base já é a tarefa toda. Texto vem selecionado."
      },
      "challenge-content": {
        "title": "Escreve a tarefa",
        "body": "É o desafio em si, mostrado assim que a equipa o desbloqueia. Formatação, ficheiros e variáveis por equipa funcionam aqui, para o mesmo desafio dar a cada equipa uma pista diferente."
      },
      "challenge-description": {
        "title": "Resumo curto (opcional)",
        "body": "Uma linha mostrada nas listas ao lado do título. Útil quando vários desafios se parecem; salta se não for o caso."
      },
      "challenge-autovalidate": {
        "title": "Quem valida a resposta",
        "body": "Ligado, a app compara com a resposta que definiste e aceita logo. Desligado, a submissão fica à tua espera no modo Revisão — que é o que as respostas por ficheiro precisam."
      },
      "challenge-answer": {
        "title": "Define a resposta certa",
        "body": "A validação automática precisa de algo com que comparar. A comparação ignora maiúsculas e espaços à volta, por isso escreve a resposta como um jogador a escreveria."
      },
      "challenge-points": {
        "title": "Pontos",
        "body": "O peso deste desafio na pontuação. Os jogadores nunca veem pontos nem classificação — a pontuação é só tua, no modo Resultados."
      },
      "challenge-completion": {
        "title": "Depois de terminarem",
        "body": "Texto opcional mostrado à equipa mal termina este desafio. Bom para um agradecimento, a pista seguinte, ou a dica para uma base escondida."
      },
      "challenge-location-bound": {
        "title": "Obrigar a estar lá",
        "body": "Ligado, o desafio só pode ser respondido na sua base. Desligado, a equipa responde de onde quiser depois de o desbloquear — útil para tarefas de pesquisa ou de fotografia."
      },
      "challenge-notes": {
        "title": "Notas para a tua equipa",
        "body": "Notas privadas para ti e para os outros operadores: a resposta esperada, avisos de segurança, quem trata desta base. Os jogadores nunca recebem este campo."
      },
      "challenge-save": {
        "title": "Guarda o desafio",
        "body": "Guarda-o. Tudo o que está acima continua editável enquanto o jogo estiver em configuração, e quase tudo continua editável com o jogo a decorrer."
      },
      "more-challenges": {
        "title": "Um por base",
        "body": "Cria desafios até cada base ter pelo menos um. Duplicar o primeiro e editá-lo costuma ser mais rápido do que começar do zero."
      },
      "assign": {
        "title": "Liga desafios às bases",
        "body": "As atribuições decidem que desafio espera em que base. A atribuição automática dá todos os desafios a todas as bases; abre uma base para escolher à mão, ou atribui por equipa."
      },
      "new-team": {
        "title": "Cria uma equipa",
        "body": "Os jogadores nunca entram sozinhos — entram numa equipa. Cria uma agora; podes acrescentar mais, mudar nomes, cores e variáveis de equipa quando quiseres."
      },
      "team-code": {
        "title": "O código de entrada",
        "body": "Os jogadores escrevem este código na app para entrar, ou leem o QR ao lado. Os códigos ficam válidos durante todo o jogo, por isso podes imprimi-los num folheto."
      },
      "go-live": {
        "title": "Arranca o jogo",
        "body": "Passaram todas as verificações. Arrancar fixa o percurso, entrega os desafios às equipas e abre os check-ins. Podes voltar à configuração depois.",
        "branch": {
          "nfcPending": "Falta gravar a etiqueta de uma base NFC, e é a única coisa em falta. Grava-a no separador Etiquetas e códigos, ou muda essa base para código QR ou GPS.",
          "notReady": "Ainda há verificações a vermelho. Abre a lista para veres quais — normalmente uma base sem desafio, uma equipa em falta, ou uma etiqueta NFC por gravar."
        }
      },
      "modes": {
        "title": "Os quatro modos",
        "body": "Construir é onde estiveste. Comando acompanha as equipas no mapa em tempo real, Revisão trata das submissões à tua espera, e Resultados guarda a pontuação e a exportação."
      },
      "revert": {
        "title": "Voltar à configuração",
        "body": "Precisas de mudar algo a meio do evento? Volta à configuração. Se mantiveres o progresso, fica tudo; se o apagares, submissões, check-ins e eventos são arquivados de lado, nunca desaparecem."
      },
      "edit": {
        "title": "Edita o que quiseres",
        "body": "Em configuração volta tudo a ser editável — abre este desafio e muda os pontos, o texto, o que for. Guarda e a alteração fica pronta para o próximo arranque."
      },
      "go-live-again": {
        "title": "Arranca outra vez",
        "body": "Reabre o jogo. As equipas continuam de onde ficaram se mantiveste o progresso, ou começam de novo se o apagaste."
      },
      "finish": {
        "title": "O teu primeiro jogo está feito",
        "body": "Construíste um jogo, puseste-o a correr, mudaste-o e voltaste a pô-lo a correr. Há mais dois tutoriais: percursos fixos, com bases a desbloquear uma a uma, e jogos de exploração com bases escondidas."
      }
    }
  }
```

- [ ] **Step 6: Extend the German `tutorials` block**

Same edit in `packages/i18n/src/locales/de.json`. Phase 1 left exactly this there:

```json
  "tutorials": {
    "common": {
      "stepOf": "Schritt {{n}} von {{total}}",
      "next": "Weiter",
      "gotIt": "Verstanden",
      "later": "Mache ich später",
      "close": "Tutorial schließen",
      "resume": "Fortsetzen",
      "pillLabel": "Tutorial · Schritt {{n}} von {{total}}"
    }
  }
```

Insert around it — never replace it. The finished object is:

```json
  "tutorials": {
    "menu": "Tutorials",
    "welcome": {
      "title": "Bau dein erstes Spiel – Schritt für Schritt",
      "body": "Ein kurzer Rundgang an einem echten eigenen Spiel. Wir heben den nächsten Schritt hervor und erklären, was jeder Bildschirm sonst noch kann. Wir legen nichts für dich an, und du kannst jederzeit aufhören.",
      "duration": "Etwa 15 Minuten",
      "start": "Tutorial starten",
      "skip": "Später"
    },
    "common": {
      "stepOf": "Schritt {{n}} von {{total}}",
      "next": "Weiter",
      "gotIt": "Verstanden",
      "later": "Mache ich später",
      "close": "Tutorial schließen",
      "resume": "Fortsetzen",
      "pillLabel": "Tutorial · Schritt {{n}} von {{total}}"
    },
    "scenarios": {
      "firstGame": {
        "title": "Dein erstes Spiel durchspielen",
        "blurb": "Vom leeren Dashboard bis zum laufenden Spiel und zurück in die Einrichtung: Stationen, Challenges, Teams, Zuordnungen und der Start."
      },
      "fixedRoute": {
        "title": "Eine feste Route bauen",
        "blurb": "Stationen gehen nacheinander in der Reihenfolge auf, die du festlegst, damit alle Teams denselben Weg gehen."
      },
      "exploration": {
        "title": "Stationen für Erkundung verstecken",
        "blurb": "Halte Stationen von der Spielerkarte fern, bis ein Team sie findet, und gib die Hinweise über den Abschlusstext."
      }
    },
    "firstGame": {
      "create-game": {
        "title": "Fang mit einem Spiel an",
        "body": "Jede Veranstaltung lebt in einem Spiel, und ein neues Spiel beginnt immer in der Einrichtung. Gib ihm einen Namen und lege es an – umbenennen, Termine setzen und fertige Spiele importieren geht ebenfalls hier."
      },
      "orient": {
        "title": "Deine Startbereitschaft",
        "body": "Die Karte ist deine Arbeitsfläche: Stationen liegen darauf, alles andere hängt an ihnen. Diese Anzeige zählt, was bis zum Start noch fehlt. Öffne sie jederzeit für die vollständige Liste.",
        "aside": "Sie erscheint nur, solange das Spiel in der Einrichtung ist."
      },
      "place-base": {
        "title": "Setze deine erste Station",
        "body": "Tippe auf die Karte, wo die Spieler hinsollen, und wähle Station hier setzen. Später verschiebst du sie per Marker, oder du legst Stationen im Inhaltsbereich an, wenn du Koordinaten lieber tippst."
      },
      "base-name": {
        "title": "Benenne die Station",
        "body": "Spieler sehen diesen Namen auf ihrer Karte und in ihrer Liste, also benenne sie nach dem Ort: „Alte Mühle“, „Kapellentreppe“. Der Name ist vorbelegt – ändere ihn in etwas, das Fremde finden."
      },
      "base-description": {
        "title": "Beschreibung (optional)",
        "body": "Ein Satz Kontext für die Spieler – wie der Ort aussieht, wo man stehen muss. Lass es leer, wenn der Name allein reicht."
      },
      "base-coords": {
        "title": "Prüfe die Koordinaten",
        "body": "Sie stammen von deinem Tipp auf die Karte. Zieh den Marker auf der kleinen Karte, um sie anzupassen, oder tippe genaue Werte ein, wenn du sie schon hast."
      },
      "base-method": {
        "title": "So checken Teams ein",
        "body": "Tippe an, wie ein Team seine Ankunft belegt: NFC-Tag zum Beschreiben, QR-Code zum Drucken oder GPS-Standort. Die aktuelle Wahl ist hervorgehoben – tippe eine an, um sie zu bestätigen. Die Vorgabe liegt in den Einstellungen."
      },
      "base-radius": {
        "title": "Setze den GPS-Radius",
        "body": "Standort-Stationen öffnen sich innerhalb dieses Rings. Zu klein, und ungenaue Handys scheitern; zu groß, und Nachbarstationen überlappen. Die Startbereitschaft warnt dich, wenn sich zwei Ringe berühren.",
        "aside": "Leer lassen, um die Vorgabe des Spiels zu übernehmen."
      },
      "base-visibility": {
        "title": "Sichtbar oder versteckt",
        "body": "Sichtbare Stationen stehen von Anfang an auf der Spielerkarte. Versteckte bleiben unsichtbar, bis ein Team sie findet – die Grundlage von Erkundungsspielen, für die es ein eigenes Tutorial gibt."
      },
      "base-link": {
        "title": "Eine feste Challenge",
        "body": "Eine Station kann eine feste Challenge tragen, damit dort immer dieselbe Aufgabe wartet. Du hast noch keine – Zuordnungen kommen später und können je Team verschieden sein."
      },
      "base-save": {
        "title": "Station speichern",
        "body": "Speichern schreibt die Station auf den Server. Live ist noch nichts: Teams sehen davon nichts, bis du startest, also ändere ruhig weiter."
      },
      "base-qr": {
        "title": "QR-Code drucken",
        "body": "Diese Station öffnet sich per QR-Code. Drucke ihn und bringe ihn vor Ort an, wetterfest, wenn er draußen hängt. Der Reiter Tags und Codes druckt alle Codes auf einem Blatt."
      },
      "base-nfc": {
        "title": "NFC-Tag beschreiben",
        "body": "Diese Station braucht ein beschriebenes Tag. Halte ein leeres NFC-Tag an das Telefon und schreibe es. Gerade keins dabei? Mach es später – der Reiter Tags listet jede offene Station.",
        "aside": "Am Computer öffnest du den Reiter Tags und Codes und beschreibst das Tag mit der Telefon-App.",
        "later": "Mache ich später"
      },
      "second-base": {
        "title": "Setze eine zweite Station",
        "body": "Eine Station ist noch keine Route. Setze eine weitere weit genug entfernt, damit sich nichts überlappt, und speichere sie. Weitere Stationen überspringen diesen Feld-für-Feld-Rundgang."
      },
      "new-challenge": {
        "title": "Lege eine Challenge an",
        "body": "Challenges sind die Aufgaben, die Teams beantworten. Der Inhaltsbereich hält Stationen, Challenges, Teams, Etappen sowie Tags und Codes bereit – Neu ergänzt den Reiter, auf dem du gerade bist."
      },
      "challenge-title": {
        "title": "Titel der Challenge",
        "body": "Das sehen Spieler in ihrer Liste, bevor sie die Challenge öffnen, also kurz und konkret. Der Titel ist vorbelegt – ersetze ihn. Pflichtfeld."
      },
      "challenge-type": {
        "title": "Antworttyp wählen",
        "body": "Text für eine getippte Antwort, Datei für Foto oder Aufnahme, Keine, wenn das Erreichen der Station schon die ganze Aufgabe ist. Text ist vorausgewählt."
      },
      "challenge-content": {
        "title": "Schreib die Aufgabe",
        "body": "Das ist die Challenge selbst, sichtbar sobald ein Team sie freischaltet. Formatierung, Dateien und Teamvariablen funktionieren hier, damit dieselbe Challenge jedem Team einen eigenen Hinweis gibt."
      },
      "challenge-description": {
        "title": "Kurzfassung (optional)",
        "body": "Eine Zeile, die in Listen neben dem Titel steht. Praktisch, wenn sich mehrere Challenges ähneln; sonst überspringen."
      },
      "challenge-autovalidate": {
        "title": "Wer prüft die Antwort",
        "body": "An: Die App vergleicht mit deiner Lösung und nimmt sofort an. Aus: Die Einreichung wartet im Modus Prüfen auf dich – genau das brauchen Dateiantworten."
      },
      "challenge-answer": {
        "title": "Richtige Antwort festlegen",
        "body": "Die automatische Prüfung braucht einen Vergleichswert. Groß- und Kleinschreibung sowie Leerzeichen am Rand werden ignoriert, also schreibe die Antwort so, wie ein Spieler sie tippt."
      },
      "challenge-points": {
        "title": "Punkte",
        "body": "Das Gewicht dieser Challenge in der Wertung. Spieler sehen weder Punkte noch eine Rangliste – die Wertung gehört dir allein, im Modus Ergebnisse."
      },
      "challenge-completion": {
        "title": "Nach dem Abschluss",
        "body": "Optionaler Text, den das Team direkt nach dieser Challenge sieht. Gut für ein Dankeschön, den nächsten Hinweis oder die Spur zu einer versteckten Station."
      },
      "challenge-location-bound": {
        "title": "Anwesenheit verlangen",
        "body": "An: Die Challenge lässt sich nur an ihrer Station beantworten. Aus: Ein Team antwortet von überall, sobald sie freigeschaltet ist – gut für Recherche- oder Fotoaufgaben."
      },
      "challenge-notes": {
        "title": "Notizen für dein Team",
        "body": "Private Notizen für dich und die anderen Operatoren: erwartete Antwort, Sicherheitshinweise, wer diese Station betreut. Spieler bekommen dieses Feld nie zu sehen."
      },
      "challenge-save": {
        "title": "Challenge speichern",
        "body": "Speichere sie. Alles darüber bleibt in der Einrichtung änderbar, und das meiste bleibt es auch, während das Spiel läuft."
      },
      "more-challenges": {
        "title": "Eine je Station",
        "body": "Lege Challenges an, bis jede Station eine hat. Die erste zu duplizieren und anzupassen ist meist schneller, als neu zu beginnen."
      },
      "assign": {
        "title": "Challenges zuordnen",
        "body": "Zuordnungen entscheiden, welche Challenge an welcher Station wartet. Automatisch zuordnen gibt jeder Station jede Challenge; öffne eine Station für die Handauswahl, oder ordne je Team zu."
      },
      "new-team": {
        "title": "Lege ein Team an",
        "body": "Spieler treten nie allein bei – sie treten einem Team bei. Lege jetzt eins an; weitere Teams, Namen, Farben und Teamvariablen kannst du jederzeit ändern."
      },
      "team-code": {
        "title": "Der Beitrittscode",
        "body": "Spieler tippen diesen Code in der App ein oder scannen den QR-Code daneben. Codes bleiben das ganze Spiel über gültig, du kannst sie also auf ein Handout drucken."
      },
      "go-live": {
        "title": "Live schalten",
        "body": "Alle Prüfungen sind grün. Der Start fixiert die Route, übergibt die Challenges an die Teams und öffnet die Check-ins. Zurück in die Einrichtung kommst du danach jederzeit.",
        "branch": {
          "nfcPending": "Einer NFC-Station fehlt noch das beschriebene Tag, und das ist das Einzige. Schreibe es im Reiter Tags und Codes, oder stelle die Station auf QR-Code oder GPS um.",
          "notReady": "Einige Prüfungen sind noch rot. Öffne die Liste, um zu sehen welche – meist eine Station ohne Challenge, ein fehlendes Team oder ein noch nicht beschriebenes NFC-Tag."
        }
      },
      "modes": {
        "title": "Die vier Modi",
        "body": "Bauen kennst du jetzt. Kommando verfolgt die Teams live auf der Karte, Prüfen bearbeitet wartende Einreichungen, und Ergebnisse hält Wertung und Export bereit."
      },
      "revert": {
        "title": "Zurück in die Einrichtung",
        "body": "Mitten im Event etwas ändern? Geh zurück in die Einrichtung. Mit behaltenem Fortschritt bleibt alles; beim Löschen werden Einreichungen, Check-ins und Ereignisse archiviert, nie entfernt."
      },
      "edit": {
        "title": "Ändere, was du willst",
        "body": "In der Einrichtung ist wieder alles änderbar – öffne diese Challenge und ändere ihre Punkte, ihren Text, was auch immer. Speichern, und die Änderung steht beim nächsten Start bereit."
      },
      "go-live-again": {
        "title": "Noch einmal live",
        "body": "Öffne das Spiel wieder. Teams machen dort weiter, wo sie aufgehört haben, wenn du den Fortschritt behalten hast – sonst starten sie sauber neu."
      },
      "finish": {
        "title": "Dein erstes Spiel steht",
        "body": "Du hast ein Spiel gebaut, gestartet, geändert und erneut gestartet. Zwei weitere Tutorials zeigen feste Routen, bei denen Stationen nacheinander aufgehen, und Erkundungsspiele mit versteckten Stationen."
      }
    }
  }
```

- [ ] **Step 7: Run the tests to verify they pass**

```
bun run --cwd packages/i18n test
```

Expected: PASS, including `locales > keep every language in sync with English` (all three
bundles now carry identical key paths) and `locales > have no empty strings`.

- [ ] **Step 8: Stage**

```
git add packages/i18n/src/locales/en.json packages/i18n/src/locales/pt.json packages/i18n/src/locales/de.json packages/i18n/src/locales.test.ts
```

---

### Task 2: `gamesAtStart`, `new-game` binding and the empty anchor

**Files:**
- Modify: `web/src/features/tutorials/types.ts` (add one field to `TourState`)
- Modify: `web/src/features/tutorials/store.ts` (add `gamesAtStart` to `TourStoreState`, `initialState`, `freshRun()` and `stop()`)
- Modify: `web/src/features/tutorials/testState.ts` (the shared factory must carry the new required field)
- Modify: `web/src/features/tutorials/useTourState.ts` (pass `gamesAtStart` through)
- Modify: `web/src/features/tutorials/TourHost.tsx` (replace the phase-1 bind effect; empty-anchor rendering)
- Modify: `web/src/components/tour/CoachBubble.tsx` (centre the bubble when `anchorRect` is null)
- Test: `web/src/features/tutorials/TourHost.test.tsx` (extend the phase-1 file)
- Test: `web/src/features/tutorials/store.test.ts` (extend the phase-1 file)

**Interfaces:**
- Consumes: `useTourStore`, `TourState`, `TourHost` from phase 1.
- Produces: `TourState.gamesAtStart: readonly string[]`;
  `useTourStore.getState().gamesAtStart: string[]`;
  `start(scenarioId, opts?: { gameId?: string; stepId?: string; gamesAtStart?: string[] })`
  (`gameId` and `stepId` are phase 1's; `gamesAtStart` is the addition here);
  `TourHost` binds `routeGameId` for `new-game` scenarios and renders a centred, spotlight-free
  bubble when the resolved anchor is `''`.

- [ ] **Step 1: Write the failing tests**

Append to `web/src/features/tutorials/store.test.ts`:

```ts
describe('useTourStore game snapshot', () => {
  beforeEach(() => useTourStore.getState().reset())

  it('records the games that already existed when the run started', () => {
    useTourStore.getState().start('first-game', { gamesAtStart: ['g-old-1', 'g-old-2'] })
    expect(useTourStore.getState().gamesAtStart).toEqual(['g-old-1', 'g-old-2'])
  })

  it('defaults the snapshot to an empty list and clears it on reset', () => {
    useTourStore.getState().start('first-game')
    expect(useTourStore.getState().gamesAtStart).toEqual([])
    useTourStore.getState().start('first-game', { gamesAtStart: ['g1'] })
    useTourStore.getState().reset()
    expect(useTourStore.getState().gamesAtStart).toEqual([])
  })
})
```

First, **fix the phase-1 case that this task's change invalidates.** Phase 1's `TourHost.test.tsx`
ends with:

```tsx
  it('binds the route game when the scenario has none yet', async () => {
    renderHost()
    useTourStore.getState().start('first-game')

    await waitFor(() => expect(useTourStore.getState().gameId).toBe('game-1'))
  })
```

Its `probe` scenario is `entry: 'setup-game'`, and after this task only `new-game` scenarios bind.
Replace that single `it` with:

```tsx
  it('does not bind a route game for a setup-game scenario', async () => {
    renderHost()
    useTourStore.getState().start('first-game')

    await waitFor(() => expect(screen.getByTestId('tour-bubble')).toBeInTheDocument())
    expect(useTourStore.getState().gameId).toBeNull()
  })
```

Second, no helper change is needed: phase 1 already ships
`renderHost(path = '/game/game-1')` on a `Harness` that takes the route as a prop (it needs it for
the "navigates back to the step route before resuming" case). Verify that is what the file
contains before writing the new describes; if it is not, phase 1 was not merged as planned.

Third, append the new cases. They use the real `firstGame` scenario, so import it and register it
in place of the `probe` for these two describes:

```tsx
describe('TourHost new-game binding', () => {
  beforeEach(() => {
    useTourStore.getState().reset()
    registerScenario(firstGame)
  })

  it('binds the game the operator just created', async () => {
    useTourStore.getState().start('first-game', { gamesAtStart: ['g-old'] })
    renderHost('/game/g-new')
    await waitFor(() => expect(useTourStore.getState().gameId).toBe('g-new'))
  })

  it('never binds a game that already existed when the run started', async () => {
    useTourStore.getState().start('first-game', { gamesAtStart: ['g-old'] })
    renderHost('/game/g-old')
    await waitFor(() => expect(useTourStore.getState().currentStepId).toBe('create-game'))
    expect(useTourStore.getState().gameId).toBeNull()
  })
})

describe('TourHost with no anchor', () => {
  beforeEach(() => {
    useTourStore.getState().reset()
    registerScenario(firstGame)
  })

  it('renders a centred bubble and no spotlight when the step anchor is empty', async () => {
    useTourStore.getState().start('first-game')
    useTourStore.getState().bindGame('g1')
    // Jump straight to the final step, whose anchor is ''. `finish` is an `ack`
    // step, so `advance` will not skip past it.
    useTourStore.getState().setCurrentStep('finish')
    renderHost('/game/g1')
    await waitFor(() => expect(screen.getByTestId('tour-bubble')).toBeInTheDocument())
    expect(screen.queryByTestId('tour-spotlight')).not.toBeInTheDocument()
    expect(screen.queryByTestId('tour-pill')).not.toBeInTheDocument()
  })
})
```

Add `import { firstGame } from './scenarios/firstGame'` to the file's imports; `registerScenario`
is already imported by phase 1. Because these two describes register the real scenario over
`probe`, keep them **after** every phase-1 describe, and leave phase 1's
`afterEach` (`delete SCENARIOS['first-game']`) in place so each file-level test starts clean.

> Ordering note: Task 3 creates `scenarios/firstGame.ts`. Write these two describes now but expect
> them to fail to resolve the import until Task 3 lands; run them again at the end of Task 3.

- [ ] **Step 2: Run the tests to verify they fail**

```
bun run --cwd web test -- src/features/tutorials/store.test.ts src/features/tutorials/TourHost.test.tsx
```

Expected: `expected undefined to deeply equal [ 'g-old-1', 'g-old-2' ]` for the store test. The
two new `TourHost` describes cannot resolve `./scenarios/firstGame` until Task 3 creates it, so
they fail on the import — that is expected; Task 3 Step 5 re-runs them. The rewritten phase-1
case ("does not bind a route game for a setup-game scenario") fails with
`expected 'game-1' to be null`.

- [ ] **Step 3: Add `gamesAtStart` to the type and the store**

In `web/src/features/tutorials/types.ts`, add this field to `TourState`, directly after
`isNative`:

```ts
  /** Ids of the games that already existed when the run started. Step 1 of `first-game`
   *  uses it because `Game` carries no creation timestamp. */
  gamesAtStart: readonly string[]
```

In `web/src/features/tutorials/store.ts`, make exactly four edits against the code phase 1 wrote.

1. Add the field to `TourStoreState`, directly after `gameId`:

```ts
  gameId: string | null
  /** Ids of the games that existed when this run started. */
  gamesAtStart: string[]
```

2. Add it to `initialState`, in the same position:

```ts
const initialState: TourStoreState = {
  activeScenario: null,
  gameId: null,
  gamesAtStart: [],
  currentStepId: null,
```

3. Widen `freshRun` — phase 1's signature is `freshRun(scenarioId, gameId, stepId)`; it becomes:

```ts
/** A fresh run. `lastSuccess` survives: it is a log of the app, not of the run. */
function freshRun(
  scenarioId: ScenarioId,
  gameId: string | null,
  stepId: string | null,
  gamesAtStart: string[],
): Omit<TourStoreState, 'lastSuccess' | 'tick' | 'progress'> {
  return {
    activeScenario: scenarioId,
    gameId,
    gamesAtStart,
    currentStepId: stepId,
    paused: false,
    startedAt: Date.now(),
    ackedSteps: new Set<string>(),
    laterSteps: new Set<string>(),
    clickedSteps: new Set<string>(),
    stepCompletedAt: {},
  }
}
```

4. Widen the `start` action type and its implementation, and clear the snapshot in `clearedRun`
   (phase 1's shared "run is over" object, which both `stop()` and `complete()` spread — editing it
   once covers both):

```ts
  start: (
    scenarioId: ScenarioId,
    opts?: { gameId?: string; stepId?: string; gamesAtStart?: string[] },
  ) => void
```

```ts
  start: (scenarioId, opts) =>
    set(freshRun(scenarioId, opts?.gameId ?? null, opts?.stepId ?? null, opts?.gamesAtStart ?? [])),
```

```ts
const clearedRun: Omit<TourStoreState, 'lastSuccess' | 'tick' | 'progress'> = {
  activeScenario: null,
  gameId: null,
  gamesAtStart: [],
  currentStepId: null,
  paused: false,
  startedAt: 0,
  ackedSteps: new Set<string>(),
  laterSteps: new Set<string>(),
  clickedSteps: new Set<string>(),
  stepCompletedAt: {},
}
```

`reset()` already spreads `initialState`, so edit 2 is all it needs.

Finally, `TourState.gamesAtStart` is **required**, so phase 1's shared factory stops
type-checking. In `web/src/features/tutorials/testState.ts`, add one line to `makeTourState`'s
returned object, directly after `isNative: false,`:

```ts
    gamesAtStart: [],
```

- [ ] **Step 4: Feed it through `useTourState`**

In `web/src/features/tutorials/useTourState.ts`, read the snapshot from the store and put it in
the assembled state object, right after `isNative`:

```ts
  const gamesAtStart = useTourStore((s) => s.gamesAtStart)
```

```ts
    gamesAtStart,
```

- [ ] **Step 5: Add the binding effect and the empty-anchor branch to `TourHost`**

In `web/src/features/tutorials/TourHost.tsx`, **replace** the bind effect phase 1 wrote inside
`TourRunner`. Phase 1's version is:

```ts
  // A `new-game` scenario follows the operator into the workspace of the game
  // they just created; a `setup-game` scenario is already bound at start.
  useEffect(() => {
    if (!gameId && state.routeGameId) bindGame(state.routeGameId)
  }, [bindGame, gameId, state.routeGameId])
```

It becomes:

```ts
  // A `new-game` scenario starts on the dashboard and follows the operator into the workspace
  // of the game they create. `Game` has no creation timestamp, so "new" means "not in the
  // snapshot taken when the run started". `setup-game` scenarios are bound at `start()`.
  useEffect(() => {
    if (scenario.entry !== 'new-game') return
    if (gameId) return
    const routeGameId = state.routeGameId
    if (!routeGameId || state.gamesAtStart.includes(routeGameId)) return
    bindGame(routeGameId)
  }, [bindGame, gameId, scenario.entry, state.gamesAtStart, state.routeGameId])
```

Do **not** add a second effect and do **not** re-declare `bindGame` — phase 1's `TourRunner`
already has `const bindGame = useTourStore((s) => s.bindGame)`.

Then special-case the empty anchor at the render branch. Phase 1's render tail is:

```tsx
  if (paused || !visible || !rect) {
    return <TourPill step={index + 1} total={total} onResume={handleResume} />
  }
```

Insert this **immediately above** it, so an anchorless step never collapses to the pill:

```tsx
  // A step with no anchor (the closing card) shows a centred bubble and never dims the screen.
  if (anchorId === '') {
    return (
      <CoachBubble
        title={t(step.copy.title)}
        body={t(resolveBody(step, state))}
        aside={step.copy.aside ? t(step.copy.aside) : undefined}
        step={index + 1}
        total={total}
        anchorRect={null}
        isLast={index === total - 1}
        onAck={step.done.kind === 'ack' ? () => ack(step.id) : undefined}
        onLater={step.copy.later ? () => later(step.id) : undefined}
        onClose={handleClose}
      />
    )
  }
```

`anchorId` is already computed by phase 1 (`const anchorId = step ? resolveAnchor(step, state) : null`).

Phase 1's `CoachBubble` accepts `anchorRect: DOMRect | null` but leaves `placement` at
`{ left: 0, top: 0 }` when it is null, which parks the bubble in the top-left corner. Fix that in
`web/src/components/tour/CoachBubble.tsx` by making the desktop positioning centre when there is
no anchor. Phase 1's `className`/`style` on the `motion.div` become:

```tsx
      className={cn(
        'outline-none',
        inline && 'relative w-full max-w-sm',
        !inline && 'fixed z-[70]',
        !inline && isDesktop && 'w-80',
        !inline && isDesktop && !anchorRect && 'left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2',
        sheet && 'left-0 right-0',
      )}
      style={
        inline
          ? undefined
          : isDesktop
            ? anchorRect
              ? { left: placement.left, top: placement.top }
              : undefined
            : { bottom: 'calc(var(--safe-bottom) + 56px)' }
      }
```

Below `md` nothing changes: an anchorless step is still the bottom sheet.

- [ ] **Step 6: Run the tests to verify they pass**

```
bun run --cwd web test -- src/features/tutorials/store.test.ts
bun run --cwd web typecheck
```

Expected: `store.test.ts` PASSES and typecheck is clean (the `gamesAtStart` addition to
`testState.ts` is what keeps it clean). `TourHost.test.tsx` stays red on the missing
`./scenarios/firstGame` import until Task 3; do not chase that failure here.

- [ ] **Step 7: Check the index still records these deviations**

Open `docs/superpowers/plans/2026-09-06-operator-tutorials-0-index.md` and confirm its
"Contract deviations" section still carries the phase-2 entries (`gamesAtStart`, the `TourHost`
bind narrowing, the empty anchor, `base-radius`, `base-method` / `challenge-type`, the prefilled
defaults, `pressedAnswerType`, the i18n landing rule, and the two appended phase-1 files).
**Append** anything you discover during execution that is missing; never replace the section, and
never `git add` the file.

- [ ] **Step 8: Stage**

```
git add web/src/features/tutorials/types.ts web/src/features/tutorials/store.ts web/src/features/tutorials/testState.ts web/src/features/tutorials/useTourState.ts web/src/features/tutorials/TourHost.tsx web/src/components/tour/CoachBubble.tsx web/src/features/tutorials/store.test.ts web/src/features/tutorials/TourHost.test.tsx
```

(The index file is intentionally **not** staged — plans are never committed.)

---

### Task 3: The `first-game` scenario

**Files:**
- Create: `web/src/features/tutorials/scenarios/firstGame.ts`
- Create: `web/src/features/tutorials/scenarios/firstGame.test.ts`
- Modify: `web/src/features/tutorials/scenarios/index.ts`
- Modify: `web/src/features/tutorials/anchors.ts`

**Interfaces:**
- Consumes: `Scenario`, `Step`, `StepCopy`, `TourState`, `TourActions` from
  `web/src/features/tutorials/types.ts`; `advance`, `effectiveSteps`, `resolveAnchor`,
  `resolveBody` from `engine.ts`; `KNOWN_ANCHORS` and `ANCHOR_PREFIXES` from `anchors.ts`.
- Produces: `export const firstGame: Scenario`, `export function pressedAnswerType(s: TourState): 'text' | 'file' | 'none' | null`,
  and `SCENARIOS['first-game'] === firstGame`.

- [ ] **Step 1: Write the failing test**

Create `web/src/features/tutorials/scenarios/firstGame.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { keyPaths, resources } from '@pointfinder/i18n'
import { createMockGame } from '@/test/factories/game'
import { createMockBase } from '@/test/factories/base'
import { createMockChallenge } from '@/test/factories/challenge'
import { createMockTeam } from '@/test/factories/team'
import { ANCHOR_PREFIXES, KNOWN_ANCHORS } from '../anchors'
import { advance, effectiveSteps, resolveAnchor, resolveBody } from '../engine'
import type { FieldReading, TourState } from '../types'
import { firstGame, pressedAnswerType } from './firstGame'
import { SCENARIOS } from './index'

const STEP_IDS = [
  'create-game', 'orient', 'place-base', 'base-name', 'base-description', 'base-coords',
  'base-method', 'base-radius', 'base-visibility', 'base-link', 'base-save', 'base-qr',
  'base-nfc', 'second-base', 'new-challenge', 'challenge-title', 'challenge-type',
  'challenge-content', 'challenge-description', 'challenge-autovalidate', 'challenge-answer',
  'challenge-points', 'challenge-completion', 'challenge-location-bound', 'challenge-notes',
  'challenge-save', 'more-challenges', 'assign', 'new-team', 'team-code', 'go-live', 'modes',
  'revert', 'edit', 'go-live-again', 'finish',
]

const NO_FIELD: FieldReading = { present: false, value: '', pressed: null }

function makeState(
  over: Partial<TourState> = {},
  fields: Record<string, Partial<FieldReading>> = {},
  pressedGroups: Record<string, string | null> = {},
): TourState {
  return {
    now: 1_000,
    startedAt: 100,
    scenarioId: 'first-game',
    gameId: null,
    routeGameId: null,
    isDashboard: true,
    isNative: false,
    gamesAtStart: [],
    games: [],
    game: null,
    bases: [],
    challenges: [],
    teams: [],
    assignments: [],
    readiness: { allPassed: false, failing: [] },
    mode: 'build',
    drawerOpen: false,
    drawerTab: 'bases',
    selectedBaseId: null,
    selectedChallengeId: null,
    selectedTeamId: null,
    readinessExpanded: false,
    settingsPanelOpen: false,
    lastSuccess: {},
    stepCompletedAt: {},
    ackedSteps: new Set<string>(),
    laterSteps: new Set<string>(),
    field: (id) => ({ ...NO_FIELD, ...(fields[id] ?? {}) }),
    pressedIn: (group) => pressedGroups[group] ?? null,
    ...over,
  }
}

/**
 * Id of the step `advance` lands on, given a state and where the run was.
 * `null` in means "a fresh run"; `null` out means "the scenario is finished".
 */
function nextStepId(
  s: TourState,
  clicked: Set<string> = new Set(),
  fromStepId: string | null = null,
): string | null {
  return advance(firstGame, s, clicked, fromStepId)
}

describe('first-game scenario definition', () => {
  it('is registered under its contract id with the new-game entry', () => {
    expect(SCENARIOS['first-game']).toBe(firstGame)
    expect(firstGame.id).toBe('first-game')
    expect(firstGame.entry).toBe('new-game')
    expect(firstGame.title).toBe('tutorials.scenarios.firstGame.title')
    expect(firstGame.blurb).toBe('tutorials.scenarios.firstGame.blurb')
  })

  it('carries the contract step ids exactly once, in order', () => {
    expect(firstGame.steps.map((s) => s.id)).toEqual(STEP_IDS)
    expect(new Set(STEP_IDS).size).toBe(STEP_IDS.length)
  })

  it('only points at anchors the app actually renders', () => {
    const probe = makeState({
      selectedBaseId: 'b1',
      challenges: [createMockChallenge({ id: 'c1' })],
      readiness: { allPassed: true, failing: [] },
    })
    for (const step of firstGame.steps) {
      const anchor = resolveAnchor(step, probe)
      if (anchor === '') continue // the closing card has no anchor by design
      const known = KNOWN_ANCHORS.includes(anchor)
      const prefixed = ANCHOR_PREFIXES.some((p) => anchor.startsWith(p))
      expect(known || prefixed, `${step.id} → ${anchor}`).toBe(true)
    }
  })

  it('resolves the native and browser NFC anchors', () => {
    const step = firstGame.steps.find((s) => s.id === 'base-nfc')!
    expect(resolveAnchor(step, makeState({ isNative: true, selectedBaseId: 'b7' }))).toBe('nfc-write-b7')
    expect(resolveAnchor(step, makeState({ isNative: false, selectedBaseId: 'b7' }))).toBe('tab-nfc')
  })

  it('falls back from the go-live button to the readiness pill until every check passes', () => {
    for (const id of ['go-live', 'go-live-again']) {
      const step = firstGame.steps.find((s) => s.id === id)!
      expect(resolveAnchor(step, makeState({ readiness: { allPassed: false, failing: ['Bases'] } })))
        .toBe('readiness-indicator')
      expect(resolveAnchor(step, makeState({ readiness: { allPassed: true, failing: [] } })))
        .toBe('go-live-btn')
    }
  })

  it.each(['en', 'pt', 'de'] as const)('has every copy key in %s', (lang) => {
    const paths = new Set(keyPaths(resources[lang].translation as Record<string, unknown>))
    for (const step of firstGame.steps) {
      for (const key of [step.copy.title, step.copy.body, step.copy.aside, step.copy.later]) {
        if (key) expect(paths.has(key), `${lang} ${key}`).toBe(true)
      }
      for (const branch of step.branchCopy ?? []) {
        expect(paths.has(branch.body), `${lang} ${branch.body}`).toBe(true)
      }
    }
  })

  it('reads the pressed answer type from the group', () => {
    expect(pressedAnswerType(makeState({}, {}, { 'answer-type-group': 'answer-type-file' }))).toBe('file')
    expect(pressedAnswerType(makeState({}, {}, { 'answer-type-group': 'answer-type-text' }))).toBe('text')
    expect(pressedAnswerType(makeState({}, {}, { 'answer-type-group': null }))).toBeNull()
    // A child id that is not one of the three is not an answer type.
    expect(pressedAnswerType(makeState({}, {}, { 'answer-type-group': 'answer-type-mystery' }))).toBeNull()
  })

  it('spotlights the whole answer-type group, not one of its options', () => {
    const step = firstGame.steps.find((s) => s.id === 'challenge-type')!
    expect(resolveAnchor(step, makeState())).toBe('answer-type-group')
  })

  it('never switches mode when the operator is already in build', () => {
    const calls: string[] = []
    const actions = {
      setMode: (mode: string) => calls.push(`setMode:${mode}`),
      openDrawer: () => {},
      selectBase: () => {},
      selectChallenge: () => {},
      selectTeam: () => {},
      setReadinessExpanded: () => {},
      setSettingsPanelOpen: () => {},
      navigate: () => {},
    } as never

    // `setMode` closes the drawer and the settings panel, and `prepare` re-runs on
    // every resume — so a step that is already in the right mode must not call it.
    for (const id of ['orient', 'place-base', 'second-base', 'go-live', 'edit', 'go-live-again']) {
      const step = firstGame.steps.find((s) => s.id === id)!
      step.prepare?.(actions, makeState({ mode: 'build' }))
    }
    expect(calls).toEqual([])

    const orient = firstGame.steps.find((s) => s.id === 'orient')!
    orient.prepare?.(actions, makeState({ mode: 'command' }))
    expect(calls).toEqual(['setMode:build'])
  })

  it('opens the content drawer for the browser NFC branch', () => {
    const calls: string[] = []
    const actions = {
      setMode: () => {},
      openDrawer: (tab: string) => calls.push(`openDrawer:${tab}`),
      selectBase: () => {},
      selectChallenge: () => {},
      selectTeam: () => {},
      setReadinessExpanded: () => {},
      setSettingsPanelOpen: () => {},
      navigate: () => {},
    } as never
    const step = firstGame.steps.find((s) => s.id === 'base-nfc')!

    // `tab-nfc` only exists while the drawer is open.
    step.prepare?.(actions, makeState({ drawerOpen: false }))
    expect(calls).toEqual(['openDrawer:bases'])

    // Already open: leave the operator's tab alone.
    calls.length = 0
    step.prepare?.(actions, makeState({ drawerOpen: true, drawerTab: 'nfc' }))
    expect(calls).toEqual([])
  })

  it('gives every step after create-game a workspace route', () => {
    // `TourRunner` navigates to `step.route` before resuming a paused run; a step
    // with no route cannot bring the operator back to its own screen.
    expect(firstGame.steps.find((s) => s.id === 'create-game')!.route).toBe('dashboard')
    for (const step of firstGame.steps.filter((s) => s.id !== 'create-game')) {
      expect(step.route, `${step.id} route`).toBe('workspace')
    }
  })
})

describe('first-game when guards', () => {
  const saved = (over: Partial<ReturnType<typeof createMockBase>>) =>
    makeState({ selectedBaseId: 'b1', bases: [createMockBase({ id: 'b1', ...over })] })

  it('includes the radius step only while the location method is pressed', () => {
    const location = makeState({}, {}, { 'base-checkin-method': 'base-checkin-method-location' })
    const nfc = makeState({}, {}, { 'base-checkin-method': 'base-checkin-method-nfc' })
    expect(effectiveSteps(firstGame, location).map((s) => s.id)).toContain('base-radius')
    expect(effectiveSteps(firstGame, nfc).map((s) => s.id)).not.toContain('base-radius')
  })

  it('includes the QR step and drops the NFC step for a saved QR base', () => {
    const ids = effectiveSteps(firstGame, saved({ checkInMethod: 'QR' })).map((s) => s.id)
    expect(ids).toContain('base-qr')
    expect(ids).not.toContain('base-nfc')
  })

  it('includes the NFC step only for a saved NFC base with no tag written', () => {
    const unlinked = effectiveSteps(firstGame, saved({ checkInMethod: 'NFC', nfcLinked: false })).map((s) => s.id)
    const linked = effectiveSteps(firstGame, saved({ checkInMethod: 'NFC', nfcLinked: true })).map((s) => s.id)
    expect(unlinked).toContain('base-nfc')
    expect(linked).not.toContain('base-nfc')
  })

  it('includes the correct-answer step only for auto-validated text challenges', () => {
    const on = makeState(
      {},
      { 'auto-validate-toggle': { present: true, pressed: true } },
      { 'answer-type-group': 'answer-type-text' },
    )
    const file = makeState(
      {},
      { 'auto-validate-toggle': { present: true, pressed: true } },
      { 'answer-type-group': 'answer-type-file' },
    )
    const off = makeState(
      {},
      { 'auto-validate-toggle': { present: true, pressed: false } },
      { 'answer-type-group': 'answer-type-text' },
    )
    expect(effectiveSteps(firstGame, on).map((s) => s.id)).toContain('challenge-answer')
    expect(effectiveSteps(firstGame, file).map((s) => s.id)).not.toContain('challenge-answer')
    expect(effectiveSteps(firstGame, off).map((s) => s.id)).not.toContain('challenge-answer')
  })
})

describe('first-game advance', () => {
  const setupGame = createMockGame({ id: 'g1', status: 'setup' })
  const liveGame = createMockGame({ id: 'g1', status: 'live' })

  const cases: Array<{ name: string; state: TourState; clicked?: Set<string>; from?: string; expected: string }> = [
    {
      name: 'a fresh run starts on the create-game button',
      state: makeState(),
      expected: 'create-game',
    },
    {
      name: 'creating a game moves on to the readiness pill',
      state: makeState({ routeGameId: 'g1', games: [setupGame], game: setupGame, isDashboard: false }),
      expected: 'orient',
    },
    {
      name: 'a placed base opens the field walkthrough at the name',
      state: makeState(
        {
          routeGameId: 'g1', games: [setupGame], game: setupGame, isDashboard: false,
          bases: [createMockBase({ id: 'b1', name: 'Base 1' })], selectedBaseId: 'b1',
          ackedSteps: new Set(['orient']),
        },
        { 'base-name-input': { present: true, value: 'Base 1' } },
      ),
      expected: 'base-name',
    },
    {
      name: 'a renamed base moves on to the description',
      state: makeState(
        {
          routeGameId: 'g1', games: [setupGame], game: setupGame, isDashboard: false,
          bases: [createMockBase({ id: 'b1', name: 'Old mill' })], selectedBaseId: 'b1',
          ackedSteps: new Set(['orient']),
        },
        { 'base-name-input': { present: true, value: 'Old mill' } },
      ),
      expected: 'base-description',
    },
    {
      name: 'pressing the location method inserts the radius step',
      state: makeState(
        {
          routeGameId: 'g1', games: [setupGame], game: setupGame, isDashboard: false,
          bases: [createMockBase({ id: 'b1', name: 'Old mill' })], selectedBaseId: 'b1',
          ackedSteps: new Set(['orient', 'base-description', 'base-coords']),
        },
        { 'base-name-input': { present: true, value: 'Old mill' } },
        { 'base-checkin-method': 'base-checkin-method-location' },
      ),
      clicked: new Set(['base-method']),
      expected: 'base-radius',
    },
    {
      name: 'a saved QR base asks for the printed code',
      state: makeState({
        routeGameId: 'g1', games: [setupGame], game: setupGame, isDashboard: false,
        bases: [createMockBase({ id: 'b1', name: 'Old mill', checkInMethod: 'QR' })],
        selectedBaseId: 'b1',
        stepCompletedAt: { 'base-name': 200 },
        lastSuccess: { 'base:update': 300 },
      }),
      from: 'base-save',
      expected: 'base-qr',
    },
    {
      name: 'a saved unlinked NFC base asks for the tag',
      state: makeState({
        routeGameId: 'g1', games: [setupGame], game: setupGame, isDashboard: false,
        bases: [createMockBase({ id: 'b1', name: 'Old mill', checkInMethod: 'NFC', nfcLinked: false })],
        selectedBaseId: 'b1',
        stepCompletedAt: { 'base-name': 200 },
        lastSuccess: { 'base:update': 300 },
      }),
      from: 'base-save',
      expected: 'base-nfc',
    },
    {
      name: 'pressing "later" clears the NFC step and moves to the second base',
      state: makeState({
        routeGameId: 'g1', games: [setupGame], game: setupGame, isDashboard: false,
        bases: [createMockBase({ id: 'b1', name: 'Old mill', checkInMethod: 'NFC', nfcLinked: false })],
        selectedBaseId: 'b1',
        stepCompletedAt: { 'base-name': 200 },
        lastSuccess: { 'base:update': 300 },
        laterSteps: new Set(['base-nfc']),
      }),
      from: 'base-nfc',
      expected: 'second-base',
    },
    {
      name: 'a live game moves from go-live to the mode tour',
      state: makeState({
        routeGameId: 'g1', games: [liveGame], game: liveGame, isDashboard: false,
        readiness: { allPassed: true, failing: [] },
      }),
      from: 'go-live',
      expected: 'modes',
    },
    {
      name: 'reverting to setup moves on to the edit step',
      state: makeState({
        routeGameId: 'g1', games: [setupGame], game: setupGame, isDashboard: false,
        challenges: [createMockChallenge({ id: 'c1' })],
        ackedSteps: new Set(['modes']),
      }),
      from: 'revert',
      expected: 'edit',
    },
    {
      name: 'a challenge saved after the revert moves on to the second go-live',
      state: makeState({
        routeGameId: 'g1', games: [setupGame], game: setupGame, isDashboard: false,
        challenges: [createMockChallenge({ id: 'c1' })],
        stepCompletedAt: { revert: 500 },
        lastSuccess: { 'challenge:update': 900 },
      }),
      from: 'edit',
      expected: 'go-live-again',
    },
  ]

  it.each(cases)('$name', ({ state, clicked, from, expected }) => {
    // A `from` that is not in the effective list would mean the case is describing a
    // state the run could never actually be in, so assert it before advancing.
    if (from) {
      expect(
        effectiveSteps(firstGame, state).some((step) => step.id === from),
        `${from} must be an effective step in this state`,
      ).toBe(true)
    }
    expect(nextStepId(state, clicked ?? new Set(), from ?? null)).toBe(expected)
  })

  it('swaps in the pending-tag body on the go-live step', () => {
    const step = firstGame.steps.find((s) => s.id === 'go-live')!
    const pending = makeState({
      laterSteps: new Set(['base-nfc']),
      bases: [createMockBase({ id: 'b1', checkInMethod: 'NFC', nfcLinked: false })],
      readiness: { allPassed: false, failing: ['NFC tags'] },
    })
    expect(resolveBody(step, pending)).toBe('tutorials.firstGame.go-live.branch.nfcPending')
  })

  it('swaps in the not-ready body when checks are red for another reason', () => {
    const step = firstGame.steps.find((s) => s.id === 'go-live')!
    const red = makeState({ readiness: { allPassed: false, failing: ['At least one team'] } })
    expect(resolveBody(step, red)).toBe('tutorials.firstGame.go-live.branch.notReady')
  })

  it('uses the plain body once every check is green', () => {
    const step = firstGame.steps.find((s) => s.id === 'go-live')!
    const green = makeState({ readiness: { allPassed: true, failing: [] } })
    expect(resolveBody(step, green)).toBe('tutorials.firstGame.go-live.body')
  })

  it('completes the assignment step once every base is covered', () => {
    const step = firstGame.steps.find((s) => s.id === 'assign')!
    expect(step.done.kind).toBe('predicate')
    const covered = makeState({
      bases: [createMockBase({ id: 'b1' }), createMockBase({ id: 'b2', fixedChallengeId: 'c9' })],
      assignments: [{ id: 'a1', gameId: 'g1', baseId: 'b1', challengeId: 'c1' }],
    })
    const uncovered = makeState({ bases: [createMockBase({ id: 'b1' }), createMockBase({ id: 'b2' })] })
    const test = (step.done as { test: (s: TourState) => boolean }).test
    expect(test(covered)).toBe(true)
    expect(test(uncovered)).toBe(false)
  })

  it('never treats an empty game as fully assigned', () => {
    const step = firstGame.steps.find((s) => s.id === 'assign')!
    const test = (step.done as { test: (s: TourState) => boolean }).test
    expect(test(makeState())).toBe(false)
  })

  it('waits for a team before showing the join code', () => {
    const step = firstGame.steps.find((s) => s.id === 'new-team')!
    const test = (step.done as { test: (s: TourState) => boolean }).test
    expect(test(makeState())).toBe(false)
    expect(test(makeState({ teams: [createMockTeam({ id: 't1' })] }))).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```
bun run --cwd web test -- src/features/tutorials/scenarios/firstGame.test.ts
```

Expected failure: `Failed to resolve import "./firstGame"`.

- [ ] **Step 3: Write the scenario**

Create `web/src/features/tutorials/scenarios/firstGame.ts`:

```ts
/**
 * `first-game` — the full lifecycle on the operator's own game.
 *
 * Pure data. Every completion rule reads `TourState`, which phase 1 assembles from the
 * queries, the workspace store and the DOM; every `prepare` only reveals an anchor through
 * `TourActions` and never performs a domain action.
 *
 * Two rules shape the predicates below:
 *   - the engine auto-skips `predicate` steps that already pass, so a predicate that is true
 *     on arrival silently swallows its own coach mark. `base-name` and `challenge-title`
 *     therefore reject the prefilled default, and `base-method` / `challenge-type` — whose
 *     controls ship with a value already selected — use `click` and `ack` instead;
 *   - "saved" state comes from `s.bases` / `s.challenges` (the server view), never from the
 *     detail form's local fields, so `base-qr` and `base-nfc` branch on what was actually
 *     written.
 */
import type { Base, Challenge } from '@/types'
import type { Scenario, Step, StepCopy, TourActions, TourState } from '../types'

const PREFILLED_BASE_NAME = /^Base \d+$/
const PREFILLED_CHALLENGE_TITLE = /^Challenge \d+$/

const ANSWER_TYPE_BY_TESTID: Record<string, 'text' | 'file' | 'none'> = {
  'answer-type-text': 'text',
  'answer-type-file': 'file',
  'answer-type-none': 'none',
}

/**
 * The chosen answer type, read off the `answer-type-group` wrapper phase 1 added to
 * `ChallengeDetail`. `pressedIn` gives back the pressed child's test id; this maps it
 * to the bare value `challenge-answer`'s `when` compares against.
 */
export function pressedAnswerType(s: TourState): 'text' | 'file' | 'none' | null {
  const pressed = s.pressedIn('answer-type-group')
  return pressed ? (ANSWER_TYPE_BY_TESTID[pressed] ?? null) : null
}

/**
 * `setMode` closes the drawer and the settings panel as a side effect, and `prepare`
 * re-runs every time the operator resumes from the pill — so switching mode
 * unconditionally would slam shut the very panel the step is pointing into.
 */
function buildMode(a: TourActions, s: TourState): void {
  if (s.mode !== 'build') a.setMode('build')
}

function selectedBase(s: TourState): Base | null {
  return s.bases.find((b) => b.id === s.selectedBaseId) ?? null
}

function firstChallengeId(s: TourState): string {
  return (s.challenges[0] as Challenge | undefined)?.id ?? ''
}

/** When a step completed, falling back to the start of the run. */
function since(s: TourState, stepId: string): number {
  return s.stepCompletedAt[stepId] ?? s.startedAt
}

function nfcStillPending(s: TourState): boolean {
  return (
    s.laterSteps.has('base-nfc') &&
    s.bases.some((b) => b.checkInMethod === 'NFC' && !b.nfcLinked)
  )
}

function copyFor(stepId: string, extra?: { aside?: boolean; later?: boolean }): StepCopy {
  return {
    title: `tutorials.firstGame.${stepId}.title`,
    body: `tutorials.firstGame.${stepId}.body`,
    ...(extra?.aside ? { aside: `tutorials.firstGame.${stepId}.aside` } : {}),
    ...(extra?.later ? { later: `tutorials.firstGame.${stepId}.later` } : {}),
  }
}

const steps: Step[] = [
  {
    id: 'create-game',
    route: 'dashboard',
    anchor: 'create-game-btn',
    done: {
      kind: 'predicate',
      test: (s) => {
        const id = s.routeGameId
        if (!id || s.gamesAtStart.includes(id)) return false
        const game = s.games.find((g) => g.id === id) ?? (s.game?.id === id ? s.game : null)
        return game?.status === 'setup'
      },
    },
    copy: copyFor('create-game'),
  },
  {
    id: 'orient',
    route: 'workspace',
    anchor: 'readiness-indicator',
    prepare: buildMode,
    done: { kind: 'ack' },
    copy: copyFor('orient', { aside: true }),
  },
  {
    id: 'place-base',
    route: 'workspace',
    anchor: 'map-wrapper',
    prepare: buildMode,
    done: { kind: 'predicate', test: (s) => s.bases.length >= 1 },
    copy: copyFor('place-base'),
  },
  {
    id: 'base-name',
    route: 'workspace',
    anchor: 'base-name-input',
    prepare: (a, s) => a.selectBase(s.selectedBaseId ?? s.bases[0]?.id ?? null),
    done: {
      kind: 'predicate',
      test: (s) => {
        const name = s.field('base-name-input').value
        return name !== '' && !PREFILLED_BASE_NAME.test(name)
      },
    },
    copy: copyFor('base-name'),
  },
  {
    id: 'base-description',
    route: 'workspace',
    anchor: 'base-description-input',
    done: { kind: 'ack' },
    copy: copyFor('base-description'),
  },
  {
    id: 'base-coords',
    route: 'workspace',
    anchor: 'base-lat-input',
    done: { kind: 'ack' },
    copy: copyFor('base-coords'),
  },
  {
    id: 'base-method',
    route: 'workspace',
    anchor: 'base-checkin-method',
    // A method is always preselected, so "chosen" has to mean "the operator tapped one".
    done: { kind: 'click' },
    copy: copyFor('base-method'),
  },
  {
    id: 'base-radius',
    route: 'workspace',
    anchor: 'base-checkin-radius',
    when: (s) => s.pressedIn('base-checkin-method') === 'base-checkin-method-location',
    done: {
      kind: 'predicate',
      test: (s) => {
        const radius = s.field('base-checkin-radius')
        // Ring overlap is the readiness pill's job — it owns the only implementation.
        return radius.present && radius.value !== '' && !s.field('base-checkin-radius-error').present
      },
    },
    copy: copyFor('base-radius', { aside: true }),
  },
  {
    id: 'base-visibility',
    route: 'workspace',
    anchor: 'visibility-visible',
    done: { kind: 'ack' },
    copy: copyFor('base-visibility'),
  },
  {
    id: 'base-link',
    route: 'workspace',
    anchor: 'link-challenge-btn',
    done: { kind: 'ack' },
    copy: copyFor('base-link'),
  },
  {
    id: 'base-save',
    route: 'workspace',
    anchor: 'save-base-btn',
    done: {
      kind: 'predicate',
      test: (s) => (s.lastSuccess['base:update'] ?? 0) > since(s, 'base-name'),
    },
    copy: copyFor('base-save'),
  },
  {
    id: 'base-qr',
    route: 'workspace',
    anchor: 'base-qr-print',
    when: (s) => selectedBase(s)?.checkInMethod === 'QR',
    done: { kind: 'click' },
    copy: copyFor('base-qr'),
  },
  {
    id: 'base-nfc',
    route: 'workspace',
    anchor: (s) => (s.isNative ? `nfc-write-${s.selectedBaseId ?? ''}` : 'tab-nfc'),
    when: (s) => {
      const base = selectedBase(s)
      return base?.checkInMethod === 'NFC' && !base.nfcLinked
    },
    // The browser branch anchors `tab-nfc`, which only exists while the content
    // drawer is open. Re-opening it on the bases tab keeps the saved base in view.
    prepare: (a, s) => {
      if (!s.drawerOpen) a.openDrawer('bases')
    },
    done: {
      kind: 'predicate',
      test: (s) => selectedBase(s)?.nfcLinked === true || s.laterSteps.has('base-nfc'),
    },
    copy: copyFor('base-nfc', { aside: true, later: true }),
  },
  {
    id: 'second-base',
    route: 'workspace',
    anchor: 'map-wrapper',
    prepare: (a, s) => {
      buildMode(a, s)
      a.selectBase(null)
    },
    done: { kind: 'predicate', test: (s) => s.bases.length >= 2 },
    copy: copyFor('second-base'),
  },
  {
    id: 'new-challenge',
    route: 'workspace',
    anchor: 'new-entity-btn',
    prepare: (a) => a.openDrawer('challenges'),
    done: { kind: 'predicate', test: (s) => s.challenges.length >= 1 },
    copy: copyFor('new-challenge'),
  },
  {
    id: 'challenge-title',
    route: 'workspace',
    anchor: 'challenge-title-input',
    prepare: (a, s) => a.selectChallenge(s.selectedChallengeId ?? s.challenges[0]?.id ?? null),
    done: {
      kind: 'predicate',
      test: (s) => {
        const title = s.field('challenge-title-input').value
        return title !== '' && !PREFILLED_CHALLENGE_TITLE.test(title)
      },
    },
    copy: copyFor('challenge-title'),
  },
  {
    id: 'challenge-type',
    route: 'workspace',
    // The whole segmented group, not one of its three options: spotlighting
    // `answer-type-text` would tell the operator to press Text.
    anchor: 'answer-type-group',
    // Text is preselected on every new challenge, so a "type chosen" predicate self-completes.
    done: { kind: 'ack' },
    copy: copyFor('challenge-type'),
  },
  {
    id: 'challenge-content',
    route: 'workspace',
    anchor: 'challenge-content',
    done: { kind: 'predicate', test: (s) => s.field('challenge-content').value !== '' },
    copy: copyFor('challenge-content'),
  },
  {
    id: 'challenge-description',
    route: 'workspace',
    anchor: 'challenge-description',
    done: { kind: 'ack' },
    copy: copyFor('challenge-description'),
  },
  {
    id: 'challenge-autovalidate',
    route: 'workspace',
    anchor: 'auto-validate-toggle',
    done: { kind: 'ack' },
    copy: copyFor('challenge-autovalidate'),
  },
  {
    id: 'challenge-answer',
    route: 'workspace',
    anchor: 'correct-answer-input',
    when: (s) => s.field('auto-validate-toggle').pressed === true && pressedAnswerType(s) === 'text',
    done: { kind: 'predicate', test: (s) => s.field('correct-answer-input').value !== '' },
    copy: copyFor('challenge-answer'),
  },
  {
    id: 'challenge-points',
    route: 'workspace',
    anchor: 'points-input',
    done: { kind: 'ack' },
    copy: copyFor('challenge-points'),
  },
  {
    id: 'challenge-completion',
    route: 'workspace',
    anchor: 'completion-content',
    done: { kind: 'ack' },
    copy: copyFor('challenge-completion'),
  },
  {
    id: 'challenge-location-bound',
    route: 'workspace',
    anchor: 'location-bound-toggle',
    done: { kind: 'ack' },
    copy: copyFor('challenge-location-bound'),
  },
  {
    id: 'challenge-notes',
    route: 'workspace',
    anchor: 'operator-notes',
    done: { kind: 'ack' },
    copy: copyFor('challenge-notes'),
  },
  {
    id: 'challenge-save',
    route: 'workspace',
    anchor: 'save-challenge',
    done: {
      kind: 'predicate',
      test: (s) => (s.lastSuccess['challenge:update'] ?? 0) > since(s, 'challenge-title'),
    },
    copy: copyFor('challenge-save'),
  },
  {
    id: 'more-challenges',
    route: 'workspace',
    anchor: 'new-entity-btn',
    prepare: (a) => {
      a.selectChallenge(null)
      a.openDrawer('challenges')
    },
    done: { kind: 'predicate', test: (s) => s.challenges.length >= s.bases.length },
    copy: copyFor('more-challenges'),
  },
  {
    id: 'assign',
    route: 'workspace',
    anchor: 'auto-assign-btn',
    prepare: (a) => a.openDrawer('bases'),
    done: {
      kind: 'predicate',
      test: (s) =>
        s.bases.length > 0 &&
        s.bases.every(
          (base) =>
            Boolean(base.fixedChallengeId) ||
            s.assignments.some((assignment) => assignment.baseId === base.id),
        ),
    },
    copy: copyFor('assign'),
  },
  {
    id: 'new-team',
    route: 'workspace',
    anchor: 'new-entity-btn',
    prepare: (a) => a.openDrawer('teams'),
    done: { kind: 'predicate', test: (s) => s.teams.length >= 1 },
    copy: copyFor('new-team'),
  },
  {
    id: 'team-code',
    route: 'workspace',
    anchor: 'team-join-code',
    prepare: (a, s) => a.selectTeam(s.selectedTeamId ?? s.teams[0]?.id ?? null),
    done: { kind: 'ack' },
    copy: copyFor('team-code'),
  },
  {
    id: 'go-live',
    route: 'workspace',
    // `go-live-btn` only mounts inside the expanded checklist once every check passes.
    anchor: (s) => (s.readiness.allPassed ? 'go-live-btn' : 'readiness-indicator'),
    prepare: (a, s) => {
      buildMode(a, s)
      a.setReadinessExpanded(true)
    },
    done: { kind: 'predicate', test: (s) => s.game?.status === 'live' },
    copy: copyFor('go-live'),
    branchCopy: [
      { when: nfcStillPending, body: 'tutorials.firstGame.go-live.branch.nfcPending' },
      { when: (s) => !s.readiness.allPassed, body: 'tutorials.firstGame.go-live.branch.notReady' },
    ],
  },
  {
    id: 'modes',
    route: 'workspace',
    anchor: 'mode-command',
    done: { kind: 'ack' },
    copy: copyFor('modes'),
  },
  {
    id: 'revert',
    route: 'workspace',
    anchor: 'revert-to-setup-btn',
    prepare: (a) => a.setSettingsPanelOpen(true),
    done: { kind: 'predicate', test: (s) => s.game?.status === 'setup' },
    copy: copyFor('revert'),
  },
  {
    id: 'edit',
    route: 'workspace',
    anchor: (s) => `challenge-item-${firstChallengeId(s)}`,
    prepare: (a, s) => {
      a.setSettingsPanelOpen(false)
      buildMode(a, s)
      a.openDrawer('challenges')
    },
    done: {
      kind: 'predicate',
      test: (s) => (s.lastSuccess['challenge:update'] ?? 0) > since(s, 'revert'),
    },
    copy: copyFor('edit'),
  },
  {
    id: 'go-live-again',
    route: 'workspace',
    anchor: (s) => (s.readiness.allPassed ? 'go-live-btn' : 'readiness-indicator'),
    prepare: (a, s) => {
      buildMode(a, s)
      a.setReadinessExpanded(true)
    },
    done: { kind: 'predicate', test: (s) => s.game?.status === 'live' },
    copy: copyFor('go-live-again'),
  },
  {
    id: 'finish',
    route: 'workspace',
    // No anchor: the closing card is centred and dims nothing.
    anchor: '',
    done: { kind: 'ack' },
    copy: copyFor('finish'),
  },
]

export const firstGame: Scenario = {
  id: 'first-game',
  entry: 'new-game',
  title: 'tutorials.scenarios.firstGame.title',
  blurb: 'tutorials.scenarios.firstGame.blurb',
  steps,
}
```

- [ ] **Step 4: Register the scenario and its anchors**

In `web/src/features/tutorials/scenarios/index.ts`, **keep phase 1's shape exactly** —
`SCENARIOS` stays `Partial<Record<ScenarioId, Scenario>>`, `SCENARIO_ORDER`, `registerScenario`,
`getScenario` and `scenarioList()` are unchanged. The only edit is an import and a registration
call at module scope, added at the bottom of the file:

```ts
import { firstGame } from './firstGame'
```

```ts
// Registered at module scope so importing the registry is enough to see the scenario.
registerScenario(firstGame)
```

Do **not** re-declare `SCENARIOS` as a total `Record`, and do **not** rewrite `scenarioList()`:
it must keep ordering by `SCENARIO_ORDER` and dropping unregistered ids, because phase 4's two
scenarios are not bundled yet.

In `web/src/features/tutorials/anchors.ts`, replace the two arrays with the versions below. This
is a **superset** of phase 1's catalogue — every phase-1 entry is still present, plus the ids the
`first-game` steps point at. Both phase-1 prefixes are kept even though `answer-type-*` is now
also listed statically, because `isKnownAnchor()` is order-independent and phase 4 relies on
`unlock-trigger-` and `base-item-` being prefixes:

```ts
export const KNOWN_ANCHORS: readonly string[] = [
  // dashboard
  'create-game-btn',
  'dashboard-empty-state',
  // workspace chrome
  'map-wrapper',
  'readiness-indicator',
  'go-live-btn',
  'open-content-panel',
  'mode-build',
  'mode-command',
  'mode-review',
  'mode-results',
  'settings-btn',
  'revert-to-setup-btn',
  'enforce-base-order-switch',
  // drawer
  'tab-bases',
  'tab-challenges',
  'tab-teams',
  'tab-stages',
  'tab-nfc',
  'new-entity-btn',
  'auto-assign-btn',
  'arrange-route-btn',
  'base-route-editor',
  // base detail
  'base-name-input',
  'base-description-input',
  'base-lat-input',
  'base-lng-input',
  'base-checkin-method',
  'base-checkin-radius',
  'base-checkin-radius-error',
  'base-qr-print',
  'visibility-visible',
  'visibility-hidden',
  'link-challenge-btn',
  'save-base-btn',
  // challenge detail
  'challenge-title-input',
  'answer-type-group',
  'answer-type-text',
  'answer-type-file',
  'answer-type-none',
  'auto-validate-toggle',
  'challenge-content',
  'challenge-description',
  'correct-answer-input',
  'points-input',
  'completion-content',
  'location-bound-toggle',
  'operator-notes',
  'save-challenge',
  // team detail
  'team-join-code',
] as const

/** Anchors built from an entity id. A scenario anchor may start with any of these. */
export const ANCHOR_PREFIXES: readonly string[] = [
  'answer-type-',
  'base-checkin-method-',
  'base-item-',
  'challenge-item-',
  'nfc-write-',
  'team-item-',
  'unlock-trigger-',
] as const
```

`isKnownAnchor()` stays exactly as phase 1 wrote it.

- [ ] **Step 5: Run the tests to verify they pass**

```
bun run --cwd web test -- src/features/tutorials/scenarios/firstGame.test.ts
bun run --cwd web test -- src/features/tutorials/TourHost.test.tsx
```

Expected: both PASS. `firstGame.test.ts` is 20+ assertions across the three describes;
`TourHost.test.tsx` now resolves `./scenarios/firstGame`, so the two describes Task 2 added go
green here.

- [ ] **Step 6: Typecheck**

```
bun run --cwd web typecheck
```

Expected: no errors.

- [ ] **Step 7: Stage**

```
git add web/src/features/tutorials/scenarios/firstGame.ts web/src/features/tutorials/scenarios/firstGame.test.ts web/src/features/tutorials/scenarios/index.ts web/src/features/tutorials/anchors.ts web/src/features/tutorials/TourHost.test.tsx
```

---

### Task 4: The dashboard welcome card

**Files:**
- Create: `web/src/features/tutorials/WelcomeCard.tsx`
- Create: `web/src/features/tutorials/WelcomeCard.test.tsx`
- Modify: `web/src/features/dashboard/DashboardPage.tsx` (import, render above the header)
- Test: `web/src/features/dashboard/DashboardPage.test.tsx` (one integration case)

**Interfaces:**
- Consumes: `useTourStore` (`progress`, `start`, `skip`) and `useWorkspaceContext`. It does **not**
  import `TutorialProgress`: building that row is the store's job (`skip()`), not the card's.
- Produces: `export function WelcomeCard({ games }: { games: Game[] | undefined })`.
  Test ids `tutorial-welcome-card`, `tutorial-welcome-start`, `tutorial-welcome-skip`.

- [ ] **Step 1: Write the failing test**

Create `web/src/features/tutorials/WelcomeCard.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMockGame } from '@/test/factories/game'
import { useWorkspaceContext } from '@/stores/workspaceContext'
import { useTourStore } from './store'
import { WelcomeCard } from './WelcomeCard'

beforeEach(() => {
  useTourStore.getState().reset()
  useWorkspaceContext.setState({ active: { type: 'personal' } })
})

describe('WelcomeCard', () => {
  it('offers the first-game tutorial on an empty personal dashboard', () => {
    render(<WelcomeCard games={[]} />)
    expect(screen.getByTestId('tutorial-welcome-card')).toBeInTheDocument()
    expect(screen.getByText('Build your first game, guided')).toBeInTheDocument()
    expect(screen.getByTestId('tutorial-welcome-start')).toBeInTheDocument()
    expect(screen.getByTestId('tutorial-welcome-skip')).toBeInTheDocument()
  })

  it('stays hidden while the games list is still loading', () => {
    render(<WelcomeCard games={undefined} />)
    expect(screen.queryByTestId('tutorial-welcome-card')).not.toBeInTheDocument()
  })

  it('stays hidden once the operator has a game', () => {
    render(<WelcomeCard games={[createMockGame({ id: 'g1' })]} />)
    expect(screen.queryByTestId('tutorial-welcome-card')).not.toBeInTheDocument()
  })

  it('stays hidden in an organisation workspace', () => {
    useWorkspaceContext.setState({ active: { type: 'org', orgId: 'o1', orgName: 'Scouts' } })
    render(<WelcomeCard games={[]} />)
    expect(screen.queryByTestId('tutorial-welcome-card')).not.toBeInTheDocument()
  })

  it('stays hidden once a progress row exists', () => {
    useTourStore.getState().setProgress([
      { scenarioId: 'first-game', status: 'skipped', currentStep: null, gameId: null, startedAt: '2026-09-06T10:00:00Z', completedAt: null },
    ])
    render(<WelcomeCard games={[]} />)
    expect(screen.queryByTestId('tutorial-welcome-card')).not.toBeInTheDocument()
  })

  it('starts the scenario, snapshotting the games that already exist', async () => {
    const user = userEvent.setup()
    render(<WelcomeCard games={[]} />)
    await user.click(screen.getByTestId('tutorial-welcome-start'))
    expect(useTourStore.getState().activeScenario).toBe('first-game')
    expect(useTourStore.getState().gamesAtStart).toEqual([])
    expect(useTourStore.getState().paused).toBe(false)
  })

  it('records a skipped row and hides itself', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<WelcomeCard games={[]} />)
    await user.click(screen.getByTestId('tutorial-welcome-skip'))

    // The row is the store's `skip()` shape, not something the card assembled.
    expect(useTourStore.getState().progress['first-game']).toEqual({
      scenarioId: 'first-game',
      status: 'skipped',
      currentStep: null,
      gameId: null,
      startedAt: expect.any(String),
      completedAt: null,
    })
    expect(useTourStore.getState().activeScenario).toBeNull()
    rerender(<WelcomeCard games={[]} />)
    expect(screen.queryByTestId('tutorial-welcome-card')).not.toBeInTheDocument()
  })
})
```

Append to `web/src/features/dashboard/DashboardPage.test.tsx`:

```tsx
it('shows the tutorial welcome card when the operator has no games', async () => {
  server.use(http.get('/api/games', () => HttpResponse.json([])))
  useTourStore.getState().reset()
  useWorkspaceContext.setState({ active: { type: 'personal' } })

  renderPage()

  await waitFor(() => {
    expect(screen.getByTestId('tutorial-welcome-card')).toBeInTheDocument()
  })
})

it('hides the tutorial welcome card once games exist', async () => {
  useTourStore.getState().reset()
  useWorkspaceContext.setState({ active: { type: 'personal' } })

  renderPage()

  await waitFor(() => {
    expect(screen.getByText('Test Game 1')).toBeInTheDocument()
  })
  expect(screen.queryByTestId('tutorial-welcome-card')).not.toBeInTheDocument()
})
```

and add the imports it needs at the top of that file:

```tsx
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { useTourStore } from '@/features/tutorials/store'
import { useWorkspaceContext } from '@/stores/workspaceContext'
```

- [ ] **Step 2: Run tests to verify they fail**

```
bun run --cwd web test -- src/features/tutorials/WelcomeCard.test.tsx src/features/dashboard/DashboardPage.test.tsx
```

Expected failure: `Failed to resolve import "./WelcomeCard"` and, for the dashboard file,
`Unable to find an element by: [data-testid="tutorial-welcome-card"]`.

- [ ] **Step 3: Write the component**

Create `web/src/features/tutorials/WelcomeCard.tsx`:

```tsx
/**
 * First-run offer for the guided `first-game` tutorial.
 *
 * Shown only on an empty personal dashboard with no progress row for the scenario. Skip calls the
 * store's `skip('first-game')`, which writes the `skipped` row, so the card never comes back;
 * until phase 3 that row lives in memory only, so a reload brings the card back. The scenario
 * stays reachable from the tutorials library.
 */
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { SurfacePanel } from '@/components/layout/SurfacePanel'
import { useWorkspaceContext } from '@/stores/workspaceContext'
import type { Game } from '@/types'
import { useTourStore } from './store'

export function WelcomeCard({ games }: { games: Game[] | undefined }) {
  const { t } = useTranslation()
  const active = useWorkspaceContext((s) => s.active)
  const progress = useTourStore((s) => s.progress['first-game'])
  const start = useTourStore((s) => s.start)
  const skip = useTourStore((s) => s.skip)

  if (active.type !== 'personal') return null
  if (!games || games.length > 0) return null
  if (progress) return null

  return (
    <SurfacePanel
      padding="md"
      elevation="panel"
      data-testid="tutorial-welcome-card"
      className="mb-6"
    >
      <h2 className="text-base font-semibold text-foreground">{t('tutorials.welcome.title')}</h2>
      <p className="mt-1 max-w-prose text-sm text-muted-foreground">{t('tutorials.welcome.body')}</p>
      <p className="mt-1 text-xs text-muted-foreground">{t('tutorials.welcome.duration')}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          data-testid="tutorial-welcome-start"
          onClick={() => start('first-game', { gamesAtStart: games.map((g) => g.id) })}
        >
          {t('tutorials.welcome.start')}
        </Button>
        <Button
          type="button"
          variant="outline"
          data-testid="tutorial-welcome-skip"
          // The store owns the shape of a progress row; the card just says "skipped".
          onClick={() => skip('first-game')}
        >
          {t('tutorials.welcome.skip')}
        </Button>
      </div>
    </SurfacePanel>
  )
}
```

- [ ] **Step 4: Mount it on the dashboard**

In `web/src/features/dashboard/DashboardPage.tsx`, add the import next to the other feature
imports:

```tsx
import { WelcomeCard } from '@/features/tutorials/WelcomeCard'
```

and render it between the pending invites and the header block:

```tsx
      <PendingOrgInvites />
      <PendingGameInvites />

      {/* First-run tutorial offer */}
      <WelcomeCard games={games} />

      {/* Header */}
```

- [ ] **Step 5: Run the tests to verify they pass**

```
bun run --cwd web test -- src/features/tutorials/WelcomeCard.test.tsx src/features/dashboard/DashboardPage.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Check the long-copy state manually against German**

```
bun run --cwd web test -- src/features/tutorials/WelcomeCard.test.tsx
```

Then confirm by reading the component that nothing constrains the card's height and that
`max-w-prose` on the body plus `flex-wrap` on the button row let the longer German strings wrap
instead of clipping. No code change is expected here; if the buttons are on one line with
`whitespace-nowrap`, remove that class.

- [ ] **Step 7: Stage**

```
git add web/src/features/tutorials/WelcomeCard.tsx web/src/features/tutorials/WelcomeCard.test.tsx web/src/features/dashboard/DashboardPage.tsx web/src/features/dashboard/DashboardPage.test.tsx
```

---

### Task 5: Correct the revert copy the tutorial teaches

**Files:**
- Modify: `web/src/features/build/GameSettingsPanel.tsx` (the "Game State Override" section, ~lines 685–833)
- Test: `web/src/features/build/GameSettingsPanel.test.tsx` (line ~254 and one new case)

**Interfaces:**
- Consumes: `lifecycle.revert.*` from Task 1.
- Produces: no new exports. The visible English strings change: "Game State" → "Game state",
  "All submissions, check-ins and scores are deleted" → the archived wording.

Every hardcoded English string in that block, and its replacement:

| Current literal | New call |
|---|---|
| `Game State` | `t('lifecycle.revert.sectionTitle')` |
| `Current status:` | `t('lifecycle.revert.currentStatus')` |
| `Revert to Live` | `t('lifecycle.revert.toLive')` |
| `Resume the game. All progress is kept.` (help text under the live button) | `t('lifecycle.revert.toLiveHint')` |
| `Revert to Setup` | `t('lifecycle.revert.toSetup')` |
| `Return game to setup mode for editing.` | `t('lifecycle.revert.toSetupHint')` |
| `Revert to {stateTarget}?` | `t(stateTarget === 'setup' ? 'lifecycle.revert.confirmToSetup' : 'lifecycle.revert.confirmToLive')` |
| `What should happen to player progress?` | `t('lifecycle.revert.progressQuestion')` |
| `Keep progress` | `t('lifecycle.revert.keep')` |
| `Submissions, check-ins and scores are preserved` | `t('lifecycle.revert.keepHint')` |
| `Erase progress` | `t('lifecycle.revert.erase')` |
| `All submissions, check-ins and scores are deleted` | `t('lifecycle.revert.eraseHint')` |
| `The game will resume. All progress is kept.` (confirm body for the live target) | `t('lifecycle.revert.resumeHint')` |
| `Cancel` (in the confirm row) | `t('common.cancel')` |
| `Reverting…` | `t('lifecycle.revert.reverting')` |
| `Confirm` | `t('lifecycle.revert.confirm')` |

- [ ] **Step 1: Update the failing test**

In `web/src/features/build/GameSettingsPanel.test.tsx`, change the assertion inside
`shows game state section with revert options for live game`:

```ts
    await waitFor(() => {
      expect(screen.getByText('Game state')).toBeInTheDocument()
    })
```

and add a new case after it:

```ts
  it('tells the operator that erasing progress archives rather than removes', async () => {
    const user = userEvent.setup()
    useWorkspaceStore.getState().toggleSettingsPanel()

    server.use(
      http.get('/api/games/:id', () =>
        HttpResponse.json(createMockGame({ id: 'game-1', status: 'live' })),
      ),
    )

    render(createElement(GameSettingsPanel, { gameId: 'game-1' }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByTestId('revert-to-setup-btn')).toBeInTheDocument()
    })
    await user.click(screen.getByTestId('revert-to-setup-btn'))

    expect(screen.getByText(/archived out of the game/i)).toBeInTheDocument()
    expect(screen.queryByText(/are deleted/i)).not.toBeInTheDocument()
    expect(screen.getByText('Return the game to setup so you can edit it.')).toBeInTheDocument()
  })
```

- [ ] **Step 2: Run the test to verify it fails**

```
bun run --cwd web test -- src/features/build/GameSettingsPanel.test.tsx
```

Expected failure: `Unable to find an element with the text: Game state` and
`Unable to find an element with the text: /archived out of the game/i`.

- [ ] **Step 3: Replace the literals**

Apply every row of the table above inside the `{/* Game State Override */}` section of
`web/src/features/build/GameSettingsPanel.tsx`. `const { t } = useTranslation()` already exists
at line 92, so no new import is needed. The two non-trivial replacements:

```tsx
                  <p className="text-sm font-medium text-foreground">
                    {t(
                      stateTarget === 'setup'
                        ? 'lifecycle.revert.confirmToSetup'
                        : 'lifecycle.revert.confirmToLive',
                    )}
                  </p>
```

```tsx
                      {updateStatus.isPending
                        ? t('lifecycle.revert.reverting')
                        : t('lifecycle.revert.confirm')}
```

Leave the "Danger Zone" section, the export section, and every `data-testid` untouched.

- [ ] **Step 4: Run the test to verify it passes**

```
bun run --cwd web test -- src/features/build/GameSettingsPanel.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Check no other test asserted the old strings**

```
grep -rn "Game State\|are deleted\|Return game to setup" web/src web/e2e e2e | grep -v node_modules
```

Expected: no matches. If a full-stack spec under `e2e/` matched one of these, update it in the
same commit.

- [ ] **Step 6: Stage**

```
git add web/src/features/build/GameSettingsPanel.tsx web/src/features/build/GameSettingsPanel.test.tsx
```

---

### Task 6: Offline Playwright walk of the opening steps

**Files:**
- Create: `web/e2e/tutorials.spec.ts`

**Interfaces:**
- Consumes: the welcome card, the scenario, and phase 1's `tour-spotlight` / `tour-bubble` /
  `tour-bubble-title` / `tour-next` test ids.
- Produces: nothing importable. Runs on both the `browser` (1280×800) and `native-shell`
  (390×844) projects from `web/playwright.config.ts`.

Scope note: the spec stops at `place-base`. Going live offline would need mocked readiness data
for every check, which the route stub cannot supply honestly; the full lifecycle is phase 3's
full-stack smoke.

- [ ] **Step 1: Write the failing test**

Create `web/e2e/tutorials.spec.ts`:

```ts
import { expect, test, type Page } from '@playwright/test'

const user = { id: 'u', name: 'Operator', email: 'operator@example.test', role: 'operator', createdAt: '2026-01-01' }
const token = `header.${Buffer.from(JSON.stringify({ exp: 4102444800 })).toString('base64url')}.signature`

type MockGame = Record<string, unknown> & { id: string; status: string }

function newGame(name: string): MockGame {
  return {
    id: 'g1',
    name,
    status: 'setup',
    description: '',
    createdBy: 'u',
    operatorIds: ['u'],
    uniformAssignment: false,
    broadcastEnabled: false,
    broadcastCode: null,
    tileSource: 'osm',
    unlockTrigger: 'CHECK_IN',
    enforceBaseOrder: false,
    startDate: null,
    endDate: null,
    defaultCheckInMethod: 'NFC',
    defaultCheckInRadiusM: 15,
  }
}

async function mockOperatorApi(page: Page, games: MockGame[]) {
  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const method = request.method()

    if (path.startsWith('/api/auth/')) return route.fulfill({ json: { accessToken: token, user } })
    if (path === '/api/workspaces') {
      return route.fulfill({ json: { personal: { tier: 'free', status: 'active', activeGames: games.length }, organizations: [] } })
    }
    if (path.startsWith('/api/quota/')) {
      return route.fulfill({ json: { limits: { maxActiveGames: 10 }, usage: { currentActiveGames: games.length } } })
    }
    if (path === '/api/games' && method === 'POST') {
      const body = request.postDataJSON() as { name?: string }
      const game = newGame(body.name ?? 'Tutorial game')
      games.push(game)
      return route.fulfill({ status: 201, json: game })
    }
    if (path === '/api/games') return route.fulfill({ json: games })
    if (path === '/api/games/g1') return route.fulfill({ json: games[0] ?? newGame('Tutorial game') })
    return route.fulfill({ json: [] })
  })
}

async function login(page: Page) {
  await page.goto('/login')
  await page.getByTestId('login-email').fill(user.email)
  await page.getByTestId('login-password').fill('test-password')
  await page.getByTestId('login-submit').click()
  await expect(page).toHaveURL(/\/dashboard$/)
}

test('the welcome card starts the guided first game and the coach marks follow the operator', async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const games: MockGame[] = []
  await mockOperatorApi(page, games)
  await login(page)

  // 1 — the empty personal dashboard offers the tutorial
  const card = page.getByTestId('tutorial-welcome-card')
  await expect(card).toBeVisible()
  await expect(page.getByTestId('tutorial-welcome-skip')).toBeVisible()
  await page.screenshot({ path: `test-results/${info.project.name}-tutorial-welcome-light.png`, fullPage: true })

  // 2 — Start spotlights the create-game button
  await page.getByTestId('tutorial-welcome-start').click()
  await expect(page.getByTestId('tour-spotlight')).toBeVisible()
  await expect(page.getByTestId('tour-bubble-title')).toHaveText('Start with a game')
  await expect(card).toHaveCount(0)

  // 3 — creating the game moves the run into the workspace and onto the readiness pill
  await page.locator('[data-testid="create-game-btn"]:visible').click()
  await page.getByTestId('game-name-input').fill('Tutorial game')
  await page.getByTestId('game-save-btn').click()
  await expect(page).toHaveURL(/\/game\/g1$/)
  await expect(page.getByTestId('map-wrapper')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('tour-bubble-title')).toHaveText('Your readiness checklist')

  // 4 — Got it advances to the map step
  await page.getByTestId('tour-next').click()
  await expect(page.getByTestId('tour-bubble-title')).toHaveText('Place your first base')
  await expect(page.getByTestId('tour-spotlight')).toBeVisible()

  // 5 — the scrim never blocks: the content panel still opens under the spotlight.
  // The content panel is a `SlideDrawer` rendered with no `title`, so it has no
  // `slide-drawer-close` header button; its own close control is `drawer-close`
  // (`web/src/features/build/ContentDrawer.tsx`). Both the desktop rail and the
  // mobile bar can be laid out, so pick the visible one.
  await page.locator('[data-testid="open-content-panel"]:visible').click()
  await expect(page.getByTestId('drawer-tabs')).toBeVisible()
  await expect(page.getByTestId('tour-bubble')).toBeVisible()
  await page.locator('[data-testid="drawer-close"]:visible').first().click()
  await expect(page.getByTestId('drawer-tabs')).toHaveCount(0)

  // 6 — at phone width the bubble is a bottom sheet above the mobile tab bar
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByTestId('tour-bubble')).toBeVisible()
  const viewport = page.viewportSize()!
  const box = await page.getByTestId('tour-bubble').boundingBox()
  expect(box).not.toBeNull()
  const safeBottom = await page.evaluate(() =>
    Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--native-safe-bottom')) || 0,
  )
  expect(box!.y + box!.height).toBeGreaterThanOrEqual(viewport.height - 56 - safeBottom - 1)
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height - 56 - safeBottom + 1)
  expect(Math.round(box!.width)).toBe(viewport.width)
  expect(box!.height).toBeLessThanOrEqual(viewport.height * 0.45 + 1)
  await page.screenshot({ path: `test-results/${info.project.name}-tutorial-sheet-390.png`, fullPage: true })

  // 7 — dark theme and reduced motion render the same states
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
  await expect(page.getByTestId('tour-bubble')).toBeVisible()
  await page.screenshot({ path: `test-results/${info.project.name}-tutorial-sheet-390-dark.png`, fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)

  expect(errors).toEqual([])
})

test('skipping the welcome card hides it without starting a run', async ({ page }) => {
  const games: MockGame[] = []
  await mockOperatorApi(page, games)
  await login(page)

  await expect(page.getByTestId('tutorial-welcome-card')).toBeVisible()
  await page.getByTestId('tutorial-welcome-skip').click()
  await expect(page.getByTestId('tutorial-welcome-card')).toHaveCount(0)
  await expect(page.getByTestId('tour-spotlight')).toHaveCount(0)
  await expect(page.getByTestId('tour-bubble')).toHaveCount(0)
  await expect(page.getByTestId('tour-pill')).toHaveCount(0)
})
```

- [ ] **Step 2: Run the spec to verify it fails**

```
bun run --cwd web test:e2e -- tutorials
```

Expected failure before Tasks 3–4 land: `expect(locator).toBeVisible()` on
`tutorial-welcome-card` times out. After Tasks 3–4 land it should pass; if it fails on step 3
because the run did not follow into the workspace, the `TourHost` binding from Task 2 is
missing or `gamesAtStart` was not snapshotted by the welcome card.

- [ ] **Step 3: Run it on both projects and confirm they pass**

```
bun run --cwd web test:e2e -- tutorials
```

Expected: `4 passed` (two tests × two projects). Screenshots land in
`web/test-results/browser-tutorial-*.png` and `web/test-results/native-shell-tutorial-*.png`.

- [ ] **Step 4: Stage**

```
git add web/e2e/tutorials.spec.ts
```

---

### Task 7: Documentation

**Files:**
- Modify: `docs/visual-system/preview-matrix.md` (one new row)
- Modify: `docs/business-logic.md` (new subsection at the end of § 1)

- [ ] **Step 1: Add the preview-matrix row**

In `docs/visual-system/preview-matrix.md`, insert this row immediately after the phase-1
tutorial row if one exists (its label mentions `Spotlight`, `CoachBubble` or `TourPill`);
otherwise insert it after `| Operator readiness rows per check-in method | partial | pending | pending |`:

```
| Operator guided first game: welcome card, per-step coach marks, method branches, go-live branch copy, mobile bottom sheet | partial | n/a | n/a |
```

The `n/a` columns are correct: the legacy SwiftUI and Compose operator apps are on a
maintenance footing and receive no tutorial UI (spec, "Frontend" § intro).

- [ ] **Step 2: Add the Onboarding subsection to the business logic reference**

In `docs/business-logic.md`, add this at the end of section 1, directly before the `---` that
precedes `## 2. Check-In Methods`:

```markdown
### Onboarding: the guided first game

A new operator's dashboard shows a welcome card offering the `first-game` tutorial. The card
appears only when all three of these hold: the **personal** workspace is active, the operator has
**no games**, and there is **no tutorial-progress row** for `first-game`. Start runs the scenario
as coach marks over the operator's own game. Skip writes a `skipped` row and the card never
returns; the scenario itself stays available from the tutorials library.

The tutorial never creates or changes domain data. It reads state the app already holds, may open
a drawer tab, switch workspace mode or expand the readiness panel to reveal the element it is
pointing at, and advances only when the operator's own action changes real state. Going live,
reverting to setup and every save are the operator's own actions, audited exactly as they would be
outside the tutorial. The scrim dims but never intercepts clicks, so the operator can always leave
the guided path.

Because `Game` carries no creation timestamp, "the game the operator just created" is resolved
against a snapshot of the games list taken when the run started, not against a timestamp.

Progress is per account and stored server side (`user_tutorial_progress`, one row per user and
scenario, no row meaning not started) so completion follows the operator across devices. Before
that storage landed, progress lived in memory only and a reload brought the welcome card back.
```

- [ ] **Step 3: Stage**

```
git add docs/visual-system/preview-matrix.md docs/business-logic.md
```

---

### Task 8: Verify and commit

- [ ] **Step 1: Typecheck**

```
bun run --cwd web typecheck
```

Expected: no output, exit 0.

- [ ] **Step 2: Lint**

```
bun run --cwd web lint
```

Expected: no errors. `firstGame.ts` shadows nothing; if ESLint flags the `a` parameter name in
`assign`'s `every(...)` callback as shadowing the `TourActions` `a`, rename the callback
parameter to `assignment` (the code above already does).

- [ ] **Step 3: i18n package tests**

```
bun run --cwd packages/i18n test
```

Expected: PASS, including key parity across en/pt/de and the new tutorial and revert blocks.

- [ ] **Step 4: All the touched web tests**

```
bun run --cwd web test -- src/features/tutorials src/features/dashboard/DashboardPage.test.tsx src/features/build/GameSettingsPanel.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Full web unit suite**

```
bun run --cwd web test
```

Expected: PASS. If the local toolchain is unavailable, run `make test-frontend-docker` instead.

- [ ] **Step 6: Offline E2E**

```
bun run --cwd web test:e2e -- tutorials
```

Expected: `4 passed`.

- [ ] **Step 7: Design-system checks**

```
make design-system-check
make design-system-audit
```

Expected: `design-system-check` passes (no generated file drift — this phase changes none).
`design-system-audit` is advisory; `WelcomeCard.tsx` composes `SurfacePanel` and `Button` and
introduces no `backdrop-blur` inside `features/`, so it should report nothing new.

- [ ] **Step 8: Confirm nothing unwanted is staged**

```
git status --short
```

Expected staged paths, and only these:

```
M  docs/business-logic.md
M  docs/visual-system/preview-matrix.md
M  packages/i18n/src/locales.test.ts
M  packages/i18n/src/locales/de.json
M  packages/i18n/src/locales/en.json
M  packages/i18n/src/locales/pt.json
A  web/e2e/tutorials.spec.ts
M  web/src/features/build/GameSettingsPanel.test.tsx
M  web/src/features/build/GameSettingsPanel.tsx
M  web/src/features/dashboard/DashboardPage.test.tsx
M  web/src/features/dashboard/DashboardPage.tsx
M  web/src/components/tour/CoachBubble.tsx
M  web/src/features/tutorials/TourHost.test.tsx
M  web/src/features/tutorials/TourHost.tsx
A  web/src/features/tutorials/WelcomeCard.test.tsx
A  web/src/features/tutorials/WelcomeCard.tsx
M  web/src/features/tutorials/anchors.ts
A  web/src/features/tutorials/scenarios/firstGame.test.ts
A  web/src/features/tutorials/scenarios/firstGame.ts
M  web/src/features/tutorials/scenarios/index.ts
M  web/src/features/tutorials/store.test.ts
M  web/src/features/tutorials/store.ts
M  web/src/features/tutorials/testState.ts
M  web/src/features/tutorials/types.ts
M  web/src/features/tutorials/useTourState.ts
```

Everything under `docs/specs/` and `docs/superpowers/plans/` must remain **untracked and
unstaged**. If any of them appear staged, `git restore --staged docs/specs docs/superpowers`.

- [ ] **Step 9: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(web): guided first-game tutorial with welcome card

The 36-step `first-game` scenario walks a new operator from an empty dashboard
through bases, challenges, teams and assignments to go-live, a revert, an edit
and a second go-live, branching on the base's check-in method. A dashboard
welcome card offers it on a first run and a Skip records the choice.

Also corrects the revert dialog copy the tutorial teaches: erasing progress
archives submissions, check-ins and events; nothing is removed.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

## Self-review

**1. Spec coverage — every row of the `first-game` table in
`docs/specs/2026-09-06-operator-tutorials-design.md`:**

| Spec row | Step id | Covered in |
|---|---|---|
| 1 `create-game-btn` | `create-game` | Task 3 (predicate uses `gamesAtStart`, deviation 1) |
| 2 `readiness-indicator` | `orient` | Task 3 |
| 3 `map-wrapper` | `place-base` | Task 3 |
| 4a `base-name-input` | `base-name` | Task 3 (deviation 6) |
| 4b `base-description-input` | `base-description` | Task 3 |
| 4c `base-lat-input` | `base-coords` | Task 3 |
| 4d `base-checkin-method` | `base-method` | Task 3 (deviation 5) |
| 4e `base-checkin-radius` | `base-radius` | Task 3 (deviation 4) |
| 4f `base-qr-print` | `base-qr` | Task 3, reordered after save per the index |
| 4g `nfc-write-{id}` / `tab-nfc` | `base-nfc` | Task 3, reordered after save; `later` path present |
| 4h `visibility-visible` | `base-visibility` | Task 3 |
| 4i `link-challenge-btn` | `base-link` | Task 3 |
| 4j `save-base-btn` | `base-save` | Task 3 |
| 5 second base | `second-base` | Task 3 |
| 6 `new-entity-btn` | `new-challenge` | Task 3 |
| 6a `challenge-title-input` | `challenge-title` | Task 3 (deviation 6) |
| 6b `answer-type-*` | `challenge-type` | Task 3 (deviation 5) |
| 6c `challenge-content` | `challenge-content` | Task 3 |
| 6d `challenge-description` | `challenge-description` | Task 3 |
| 6e `auto-validate-toggle` | `challenge-autovalidate` | Task 3 |
| 6f `correct-answer-input` | `challenge-answer` | Task 3 (deviation 7 for the `when`) |
| 6g `points-input` | `challenge-points` | Task 3 |
| 6h `completion-content` | `challenge-completion` | Task 3 |
| 6i `location-bound-toggle` | `challenge-location-bound` | Task 3 |
| 6j `operator-notes` | `challenge-notes` | Task 3 |
| 6k `save-challenge` | `challenge-save` | Task 3 |
| 7 more challenges | `more-challenges` | Task 3 |
| 8 `auto-assign-btn` | `assign` | Task 3 |
| 9 new team | `new-team` | Task 3 |
| 10 `team-join-code` | `team-code` | Task 3 |
| 11 `go-live-btn` + both branch copies | `go-live` | Task 3 (anchor fallback + two `branchCopy` entries) |
| 12 `mode-command` | `modes` | Task 3 |
| 13 `revert-to-setup-btn` | `revert` | Task 3 |
| 14 `challenge-item-{firstId}` | `edit` | Task 3 |
| 15 second go-live | `go-live-again` | Task 3 |
| 16 no anchor, marks completed | `finish` | Task 3 + deviation 3; it is the last `ack` step, so acking it makes `advance()` return `null`, and phase 1's `TourRunner` calls the store's `complete()` — which writes the `completed` row and ends the run in one action. Phase 3 only carries that row to the server |

Other phase-2 spec obligations: welcome card rules and org exclusion (Task 4); the `tutorials.*`
block in all three locales plus the `contractKeys` additions (Task 1); the corrected revert copy
(Task 5); the offline Playwright walk asserting the phone bottom sheet and the non-blocking scrim
(Task 6); the preview-matrix row and the business-logic subsection (Task 7). Explicitly out of
scope for this phase and unchanged: backend table and endpoints, the tutorials library page,
`progressSync.ts`, the `fixed-route` and `exploration` scenarios, Storybook stories for the tour
components (phase 1 owns those), and the full-stack smoke spec (phase 3).

**2. Placeholder scan:** no "TBD", "implement later", "similar to Task N", or "add appropriate
error handling" appears. Every step that changes code carries the code. Every command is exact
and paired with its expected result. The two places where a phase-1 detail could differ
(`renderHost`/`mockTourState` helper names in `TourHost.test.tsx`, and `CoachBubble` accepting
`rect={null}`) name the fallback explicitly rather than deferring.

**3. Name consistency with the index:** `Scenario`, `Step`, `StepDone`, `StepCopy`, `TourState`,
`TourActions`, `ScenarioId`, `TutorialProgress`, `TutorialStatus`, `SCENARIOS`, `scenarioList`,
`KNOWN_ANCHORS`, `useTourStore`, `start`/`ack`/`later`/`clicked`/`bindGame`/`skip`/`setCurrentStep`/`reset`,
`effectiveSteps`/`isStepDone`/`advance`/`resolveAnchor`/`resolveBody`, the mutation log keys
`base:update` and `challenge:update`, the workspace additions `setReadinessExpanded` and
`setSettingsPanelOpen`, the test ids `tutorial-welcome-card` / `-start` / `-skip`,
`tour-spotlight` / `tour-bubble` / `tour-bubble-title` / `tour-next` / `tour-pill`, and the 36
`first-game` step ids all match the index verbatim. The two names this plan introduces —
`ANCHOR_PREFIXES` and `pressedAnswerType` — are covered by deviations 7 and 9. `Assignment` is
the real exported type name in `web/src/types/index.ts`, so the contract's conditional note needs
no deviation.
