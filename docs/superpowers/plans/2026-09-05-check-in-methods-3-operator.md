# Check-in methods — Phase 3: Operator web Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the operator browser surfaces full control of per-base check-in methods (NFC / QR / LOCATION) — game defaults, base editing with a radius ring, a printable "Tags & codes" sheet, method-aware readiness rules, and method/claim visibility in the command view.

**Architecture:** New shared operator types live in `web/src/types/checkIn.ts` and are consumed by the existing TanStack Query hooks and API modules; a canonical `CheckInMethodBadge` plus a dependency-free `QrCodeSvg` (built from the already-installed `qrcode` package's `create()` bit matrix) and a portal-based `CodesPrintSheet` are added to `web/src/components`, and every feature screen composes them. Geometry and ring rules are never re-derived locally: distances use `distanceM` and wide rings use `wideRingM` from `@pointfinder/game-core` (Phase 2), so the browser and the server agree.

**Tech Stack:** React 19, TypeScript, Tailwind v4 semantic tokens, TanStack Query v5, zustand, react-i18next (`@pointfinder/i18n`), `@pointfinder/game-core`, lucide-react, `qrcode` (already a dependency), react-map-gl/maplibre, Vitest + Testing Library + MSW.

## Global Constraints

- Never rename an existing `data-testid`, route, API path, query key, or accessibility id. New ids only.
- Mandatory new test ids from the contract: `checkin-default-method`, `checkin-default-radius`, `base-checkin-method`, `base-checkin-radius`, `base-qr-code`, `base-qr-print`, `codes-print-all`. Existing `nfc-tags-page` and `nfc-base-<id>` stay exactly as they are; the drawer tab id stays `nfc`.
- Every new i18n key lands in `packages/i18n/src/locales/en.json`, `de.json` and `pt.json` in the same change — `packages/i18n/src/locales.test.ts` enforces key parity.
- Compose canonical components only (`@/components/ui/*`, `@/components/status/*`, `@/components/feedback/*`, `@/components/layout/*`). No new inline primitives, no raw Tailwind palette classes, no hard-coded hex outside the QR bitmap (which is recorded as an exception in `design-system/decisions.md`).
- Cover loading / empty / error / disabled / setup-only / long-copy states, light and dark themes, accessible labels on every icon-only control, and reduced motion (no new animation is introduced).
- Focused test command: `bun run --cwd web test -- src/features/build/BaseDetail.test.tsx` (substitute the file under test). Package tests: `bun run --cwd packages/i18n test`.
- Phase gate commands: `bun run --cwd web typecheck`, `bun run --cwd web lint`, `bun run --cwd web test`, `make design-system-check`.
- ONE atomic commit at the very end of the phase, message `feat(web): operator check-in method setup, codes sheet and readiness rules`, trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Do NOT commit this plan file or anything under `docs/specs/`.

---

### Task 1: Shared check-in types, DTOs, factories and fixtures

**Files:**
- Create `web/src/types/checkIn.ts`
- Create `web/src/types/checkIn.test.ts`
- Create `web/src/lib/api/bases.test.ts`
- Modify `web/src/types/base.ts` (whole file)
- Modify `web/src/types/index.ts` (lines 53–74 `Base`, lines 28–51 `Game`, lines 186–204 `TeamBaseProgress` + `ActivityEvent`)
- Modify `web/src/types/game.ts` (lines 12–29 `Game`)
- Modify `web/src/lib/api/bases.ts` (lines 4–21 `CreateBaseDto`)
- Modify `web/src/lib/api/games.ts` (lines 9–21 `CreateGameDto`, lines 26–36 `GameMetadataExportDto`, lines 38–49 `BaseExportDto`)
- Modify `web/src/hooks/mutations/useGameMutations.ts` (lines 14–36 `useUpdateGame` merge)
- Modify `web/src/test/factories/base.ts`, `web/src/test/factories/game.ts`

**Interfaces:**
- Produces `CheckInMethod = 'NFC' | 'QR' | 'LOCATION'`, `CheckInVerification = 'VERIFIED' | 'CLAIMED' | 'OPERATOR'`, `CHECK_IN_METHODS`, `MIN_CHECK_IN_RADIUS_M = 5`, `MAX_CHECK_IN_RADIUS_M = 200`, `DEFAULT_CHECK_IN_RADIUS_M = 15`, `TeamPositionSnapshotEntry`, `ActivityCheckInMetadata`, `resolveCheckInRadiusM(baseRadius, gameDefault)`, `isValidCheckInRadiusM(value)`, `parseCheckInRadiusInput(text)`.
- Produces `Base.checkInMethod: CheckInMethod`, `Base.checkInRadiusM?: number | null`; `Game.defaultCheckInMethod: CheckInMethod`, `Game.defaultCheckInRadiusM: number`; `CreateBaseDto.checkInMethod?`, `CreateBaseDto.checkInRadiusM?`; `CreateGameDto.defaultCheckInMethod?`, `CreateGameDto.defaultCheckInRadiusM?`; `TeamBaseProgress` proof fields; `ActivityEvent.metadata?`.
- Consumes nothing new.

- [ ] **Step 1: Write the failing test**

Create `web/src/types/checkIn.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  CHECK_IN_METHODS,
  DEFAULT_CHECK_IN_RADIUS_M,
  MAX_CHECK_IN_RADIUS_M,
  MIN_CHECK_IN_RADIUS_M,
  isValidCheckInRadiusM,
  parseCheckInRadiusInput,
  resolveCheckInRadiusM,
} from './checkIn'

describe('check-in shared types', () => {
  it('lists the three methods in operator order', () => {
    expect(CHECK_IN_METHODS).toEqual(['NFC', 'QR', 'LOCATION'])
  })

  it('resolves a base radius, falling back to the game default', () => {
    expect(resolveCheckInRadiusM(40, 15)).toBe(40)
    expect(resolveCheckInRadiusM(null, 15)).toBe(15)
    expect(resolveCheckInRadiusM(undefined, 25)).toBe(25)
    expect(resolveCheckInRadiusM(null, undefined)).toBe(DEFAULT_CHECK_IN_RADIUS_M)
  })

  it('accepts only radii inside the server clamp', () => {
    expect(isValidCheckInRadiusM(MIN_CHECK_IN_RADIUS_M)).toBe(true)
    expect(isValidCheckInRadiusM(MAX_CHECK_IN_RADIUS_M)).toBe(true)
    expect(isValidCheckInRadiusM(4)).toBe(false)
    expect(isValidCheckInRadiusM(201)).toBe(false)
    expect(isValidCheckInRadiusM(Number.NaN)).toBe(false)
  })

  it('parses operator radius input, treating blank as inherit', () => {
    expect(parseCheckInRadiusInput('')).toEqual({ ok: true, value: null })
    expect(parseCheckInRadiusInput('   ')).toEqual({ ok: true, value: null })
    expect(parseCheckInRadiusInput('30')).toEqual({ ok: true, value: 30 })
    expect(parseCheckInRadiusInput('30.7')).toEqual({ ok: true, value: 31 })
    expect(parseCheckInRadiusInput('2')).toEqual({ ok: false })
    expect(parseCheckInRadiusInput('abc')).toEqual({ ok: false })
  })
})
```

Create `web/src/lib/api/bases.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { createMockBase } from '@/test/factories/base'
import { basesApi } from './bases'

describe('basesApi check-in fields', () => {
  it('sends the method and radius when creating a base', async () => {
    let body: Record<string, unknown> = {}
    server.use(
      http.post('/api/games/:gameId/bases', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>
        return HttpResponse.json(createMockBase({ id: 'base-new' }), { status: 201 })
      }),
    )

    await basesApi.create({
      gameId: 'game-1',
      name: 'Old mill',
      description: '',
      lat: 38.7,
      lng: -9.1,
      checkInMethod: 'LOCATION',
      checkInRadiusM: 40,
    })

    expect(body.checkInMethod).toBe('LOCATION')
    expect(body.checkInRadiusM).toBe(40)
    expect(body.gameId).toBeUndefined()
  })

  it('sends a null radius when the base should inherit the game default', async () => {
    let body: Record<string, unknown> = {}
    server.use(
      http.put('/api/games/:gameId/bases/:baseId', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>
        return HttpResponse.json(createMockBase({ id: 'base-1' }))
      }),
    )

    await basesApi.update('base-1', {
      gameId: 'game-1',
      checkInMethod: 'QR',
      checkInRadiusM: null,
    })

    expect(body.checkInMethod).toBe('QR')
    expect(body.checkInRadiusM).toBeNull()
  })

  it('defaults mock bases to the NFC method', () => {
    expect(createMockBase().checkInMethod).toBe('NFC')
    expect(createMockBase().checkInRadiusM).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```
bun run --cwd web test -- src/types/checkIn.test.ts src/lib/api/bases.test.ts
```

Expected failure: `Failed to resolve import "./checkIn"` for the first file, and `Object literal may only specify known properties, and 'checkInMethod' does not exist in type ...` / `expected undefined to be 'NFC'` for the second.

- [ ] **Step 3: Write minimal implementation**

Create `web/src/types/checkIn.ts`:

```ts
/**
 * Shared operator vocabulary for the three check-in methods.
 *
 * Mirrors the backend `CheckInMethod` / `CheckInVerification` enums and the
 * clamp constants in `service/CheckInVerificationService.java`. Distances and
 * wide rings are NOT computed here — those come from `@pointfinder/game-core`
 * so the browser and the server share one implementation.
 */

export type CheckInMethod = 'NFC' | 'QR' | 'LOCATION'

export type CheckInVerification = 'VERIFIED' | 'CLAIMED' | 'OPERATOR'

/** Operator display order: today's default first, then the two new methods. */
export const CHECK_IN_METHODS: CheckInMethod[] = ['NFC', 'QR', 'LOCATION']

export const MIN_CHECK_IN_RADIUS_M = 5
export const MAX_CHECK_IN_RADIUS_M = 200

/** Server default when a game predates the feature. */
export const DEFAULT_CHECK_IN_RADIUS_M = 15

/** One teammate position recorded alongside a CLAIMED check-in. */
export interface TeamPositionSnapshotEntry {
  playerId: string
  displayName: string
  lat: number
  lng: number
  accuracyM?: number | null
  ageSeconds?: number | null
  distanceM?: number | null
}

/** Structured payload appended to check-in activity events. */
export interface ActivityCheckInMetadata {
  method?: CheckInMethod
  verification?: CheckInVerification
  teammatesInRing?: number
  teammatesTotal?: number
}

/** Base radius when set, otherwise the game default. Never null. */
export function resolveCheckInRadiusM(
  baseRadiusM: number | null | undefined,
  gameDefaultRadiusM: number | null | undefined,
): number {
  if (typeof baseRadiusM === 'number' && Number.isFinite(baseRadiusM)) return baseRadiusM
  if (typeof gameDefaultRadiusM === 'number' && Number.isFinite(gameDefaultRadiusM)) {
    return gameDefaultRadiusM
  }
  return DEFAULT_CHECK_IN_RADIUS_M
}

/** True when the value is inside the server's 5..200 clamp. */
export function isValidCheckInRadiusM(value: number | null | undefined): boolean {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= MIN_CHECK_IN_RADIUS_M &&
    value <= MAX_CHECK_IN_RADIUS_M
  )
}

/**
 * Read an operator radius field. Blank means "inherit the game default"
 * (null); anything unparseable or outside the clamp is rejected so the
 * operator sees an inline error instead of a silent fallback.
 */
export function parseCheckInRadiusInput(
  text: string,
): { ok: true; value: number | null } | { ok: false } {
  const trimmed = text.trim()
  if (trimmed === '') return { ok: true, value: null }
  const parsed = Number.parseFloat(trimmed)
  if (!Number.isFinite(parsed)) return { ok: false }
  const rounded = Math.round(parsed)
  if (!isValidCheckInRadiusM(rounded)) return { ok: false }
  return { ok: true, value: rounded }
}
```

Replace `web/src/types/base.ts` entirely:

```ts
import type { CheckInMethod } from './checkIn'

export interface Base {
  id: string
  gameId: string
  name: string
  description: string
  lat: number
  lng: number
  /** One-based route position; absent when base order is not enforced. */
  sequenceNumber?: number | null
  nfcLinked: boolean
  nfcToken?: string
  hidden: boolean
  fixedChallengeId?: string
  tagIds?: string[]
  /** Stage this base belongs to (v2 stages feature) */
  stageId?: string | null
  /** How a team proves it reached this base. Copied from the game default at creation. */
  checkInMethod: CheckInMethod
  /** Raw operator value: null means "use the game default". Clamped 5..200 on write. */
  checkInRadiusM?: number | null
}
```

In `web/src/types/index.ts`, add the re-export at the top of the file (immediately after the first line `export type UserRole = "admin" | "operator";`):

```ts
export type {
  ActivityCheckInMetadata,
  CheckInMethod,
  CheckInVerification,
  TeamPositionSnapshotEntry,
} from "./checkIn";
export {
  CHECK_IN_METHODS,
  DEFAULT_CHECK_IN_RADIUS_M,
  MAX_CHECK_IN_RADIUS_M,
  MIN_CHECK_IN_RADIUS_M,
  isValidCheckInRadiusM,
  parseCheckInRadiusInput,
  resolveCheckInRadiusM,
} from "./checkIn";
import type {
  ActivityCheckInMetadata,
  CheckInMethod,
  CheckInVerification,
  TeamPositionSnapshotEntry,
} from "./checkIn";
```

In the same file, extend `Game` by adding these two lines just before its closing brace (after `orgName?: string | null;`):

```ts
  /** Method copied onto new bases. Changing it never rewrites existing bases. */
  defaultCheckInMethod: CheckInMethod;
  /** Fallback radius for LOCATION bases that do not override it. */
  defaultCheckInRadiusM: number;
```

Extend `Base` in the same file by adding these two lines just before its closing brace (after `stageId?: string | null;`):

```ts
  /** How a team proves it reached this base. */
  checkInMethod: CheckInMethod;
  /** Raw operator value; null means "use the game default". */
  checkInRadiusM?: number | null;
```

Replace `TeamBaseProgress` and `ActivityEvent` in the same file with:

```ts
export interface TeamBaseProgress {
  baseId: string;
  teamId: string;
  status: BaseStatus;
  checkedInAt?: string;
  challengeId?: string;
  submissionStatus?: string;
  /** Method the accepted check-in used. Absent for pre-feature rows. */
  checkInMethod?: CheckInMethod;
  verification?: CheckInVerification;
  /** Metres between the accepted fix and the base. */
  proofDistanceM?: number | null;
  /** Horizontal accuracy of the accepted fix, in metres. */
  proofAccuracyM?: number | null;
  proofCapturedAt?: string | null;
  /** Only filled for CLAIMED rows. */
  teamPositionsSnapshot?: TeamPositionSnapshotEntry[] | null;
}

export interface ActivityEvent {
  id: string;
  gameId: string;
  type: "check_in" | "submission" | "approval" | "rejection";
  teamId: string;
  baseId?: string;
  challengeId?: string;
  message: string;
  timestamp: string;
  /** Structured payload; check-ins carry method, verification and claim counts. */
  metadata?: ActivityCheckInMetadata | null;
}
```

In `web/src/types/game.ts`, add the import at the top and the two fields to `Game`:

```ts
import type { CheckInMethod } from './checkIn'
```

and just before the closing brace of `Game` (after `orgName?: string | null`):

```ts
  defaultCheckInMethod: CheckInMethod
  defaultCheckInRadiusM: number
```

In `web/src/lib/api/bases.ts`, add the import and the two DTO fields:

```ts
import type { Base, CheckInMethod } from "@/types";
```

and inside `CreateBaseDto`, just before its closing brace:

```ts
  /** Omit on create to inherit the game default; explicit on update. */
  checkInMethod?: CheckInMethod;
  /** null clears the override so the base inherits the game default. */
  checkInRadiusM?: number | null;
```

In `web/src/lib/api/games.ts`, change the type import line to:

```ts
import type {
  AnswerType,
  CheckInMethod,
  Game,
  GameStatus,
  OperatorSnapshotResponse,
  User,
} from "@/types";
```

Add to `CreateGameDto`, just before its closing brace:

```ts
  defaultCheckInMethod?: CheckInMethod;
  defaultCheckInRadiusM?: number;
```

Add the same two lines to `GameMetadataExportDto`, and add to `BaseExportDto` just before its closing brace:

```ts
  checkInMethod?: CheckInMethod;
  checkInRadiusM?: number | null;
```

In `web/src/hooks/mutations/useGameMutations.ts`, add the two fields to the merge object inside `useUpdateGame` (right after `unlockTrigger: current.unlockTrigger,` and before `...dto,`):

```ts
            defaultCheckInMethod: current.defaultCheckInMethod,
            defaultCheckInRadiusM: current.defaultCheckInRadiusM,
```

In `web/src/test/factories/base.ts`, add to the returned object just before `...overrides,`:

```ts
    checkInMethod: 'NFC' as const,
    checkInRadiusM: null,
```

In `web/src/test/factories/game.ts`, add to `defaults` just before its closing brace (after `unlockTrigger: 'CHECK_IN',`):

```ts
  defaultCheckInMethod: 'NFC',
  defaultCheckInRadiusM: 15,
```

- [ ] **Step 4: Run test to verify it passes**

```
bun run --cwd web test -- src/types/checkIn.test.ts src/lib/api/bases.test.ts
```

- [ ] **Step 5: Commit** — no commit yet. This phase produces ONE atomic commit in Task 12.

---

### Task 2: Localization for the three methods (en / de / pt)

**Files:**
- Modify `packages/i18n/src/locales/en.json` (change `build.drawer.nfcTags` on line 1171; append a top-level `checkIn` and `readiness` block after the closing brace of `baseOrder`)
- Modify `packages/i18n/src/locales/de.json` (same two edits)
- Modify `packages/i18n/src/locales/pt.json` (same two edits)
- Test `packages/i18n/src/locales.test.ts` (existing parity test, unchanged)

**Interfaces:**
- Produces `checkIn.*` and `readiness.*` translation keys used by every later task; changes the value of the existing `build.drawer.nfcTags` key (key name unchanged).
- Consumes nothing.

- [ ] **Step 1: Write the failing test**

Append this block to the end of `packages/i18n/src/locales.test.ts`, inside the outermost `describe` (add a new `describe` at file level if the file has no wrapping block — match the file's existing style):

```ts
describe('check-in method vocabulary', () => {
  const contractKeys = [
    'checkIn.method',
    'checkIn.methodNfc',
    'checkIn.methodQr',
    'checkIn.methodLocation',
    'checkIn.radius',
    'checkIn.radiusHint',
    'checkIn.inheritsDefault',
    'checkIn.defaultMethod',
    'checkIn.defaultRadius',
    'checkIn.tagsAndCodes',
    'checkIn.printCode',
    'checkIn.printAll',
    'checkIn.noTagNeeded',
    'checkIn.claimedBadge',
    'checkIn.teammatesInRing',
    'readiness.nfcLinked',
    'readiness.locationCoords',
    'readiness.locationOverlap',
    'readiness.legacyAppsNote',
  ]

  it.each(['en', 'pt', 'de'] as const)('%s carries every contract key', (lang) => {
    const paths = new Set(keyPaths(resources[lang].translation as Record<string, unknown>))
    for (const key of contractKeys) expect(paths.has(key)).toBe(true)
  })

  it('renames the drawer tab to "Tags & codes"', () => {
    expect(
      (resources.en.translation as { build: { drawer: { nfcTags: string } } }).build.drawer.nfcTags,
    ).toBe('Tags & codes')
  })
})
```

Make sure the file imports `resources` and `keyPaths` from `./index` — add them to the existing import if missing:

```ts
import { keyPaths, resources } from './index'
```

- [ ] **Step 2: Run test to verify it fails**

```
bun run --cwd packages/i18n test
```

Expected failure: `expected false to be true` for every contract key in all three languages, and `expected 'NFC' to be 'Tags & codes'`.

- [ ] **Step 3: Write minimal implementation**

In `packages/i18n/src/locales/en.json`, change line 1171 from `"nfcTags": "NFC",` to:

```json
      "nfcTags": "Tags & codes",
```

and replace the file's final two lines

```json
    "baseNumber": "Base {{number}}"
  }
}
```

with:

```json
    "baseNumber": "Base {{number}}"
  },
  "checkIn": {
    "group": "Check-in",
    "method": "Check-in method",
    "methodNfc": "NFC",
    "methodQr": "QR code",
    "methodLocation": "Location",
    "radius": "Radius (m)",
    "radiusHint": "Between 5 and 200 metres. Leave empty to use the game default of {{meters}} m.",
    "inheritsDefault": "Inherits the game default.",
    "defaultMethod": "Default check-in method",
    "defaultRadius": "Default radius (m)",
    "setupOnly": "Check-in settings can only be changed during setup.",
    "tagsAndCodes": "Tags & codes",
    "printCode": "Print code",
    "printAll": "Print all codes",
    "noTagNeeded": "No tag needed — this base unlocks by location.",
    "noQrBases": "No base uses a QR code yet.",
    "allMethods": "All methods",
    "coordinatesInvalid": "Enter valid coordinates before saving.",
    "radiusInvalid": "Enter a radius between 5 and 200, or leave it empty.",
    "closePrint": "Close",
    "claimedBadge": "Claimed",
    "teammatesInRing": "{{inside}} of {{total}} teammates within {{meters}} m",
    "proofTitle": "Check-in proof",
    "proofDistance": "Distance: {{meters}} m",
    "proofAccuracy": "Accuracy: ±{{meters}} m",
    "proofTeammates": "Teammate positions",
    "proofNoSnapshot": "No teammate positions were recorded.",
    "verificationVerified": "Verified",
    "verificationClaimed": "Claimed",
    "verificationOperator": "Operator"
  },
  "readiness": {
    "nfcLinked": "NFC bases linked ({{linked}}/{{total}})",
    "locationCoords": "Location bases have coordinates ({{ok}}/{{total}})",
    "locationRadius": "Location radii between 5 and 200 m ({{ok}}/{{total}})",
    "locationOverlap": "Location rings do not overlap",
    "legacyAppsNote": "The legacy iOS and Android apps cannot complete QR or location bases."
  }
}
```

In `packages/i18n/src/locales/de.json`, change line 1171 to:

```json
      "nfcTags": "Tags & Codes",
```

and replace its final two lines the same way with:

```json
    "baseNumber": "Basis {{number}}"
  },
  "checkIn": {
    "group": "Check-in",
    "method": "Check-in-Methode",
    "methodNfc": "NFC",
    "methodQr": "QR-Code",
    "methodLocation": "Standort",
    "radius": "Radius (m)",
    "radiusHint": "Zwischen 5 und 200 Metern. Leer lassen, um den Spielstandard von {{meters}} m zu verwenden.",
    "inheritsDefault": "Übernimmt den Spielstandard.",
    "defaultMethod": "Standard-Check-in-Methode",
    "defaultRadius": "Standardradius (m)",
    "setupOnly": "Check-in-Einstellungen können nur während der Einrichtung geändert werden.",
    "tagsAndCodes": "Tags & Codes",
    "printCode": "Code drucken",
    "printAll": "Alle Codes drucken",
    "noTagNeeded": "Kein Tag nötig – diese Basis wird per Standort freigeschaltet.",
    "noQrBases": "Noch keine Basis nutzt einen QR-Code.",
    "allMethods": "Alle Methoden",
    "coordinatesInvalid": "Gib gültige Koordinaten ein, bevor du speicherst.",
    "radiusInvalid": "Gib einen Radius zwischen 5 und 200 ein oder lass das Feld leer.",
    "closePrint": "Schließen",
    "claimedBadge": "Selbst gemeldet",
    "teammatesInRing": "{{inside}} von {{total}} Teammitgliedern innerhalb von {{meters}} m",
    "proofTitle": "Check-in-Nachweis",
    "proofDistance": "Entfernung: {{meters}} m",
    "proofAccuracy": "Genauigkeit: ±{{meters}} m",
    "proofTeammates": "Positionen der Teammitglieder",
    "proofNoSnapshot": "Es wurden keine Positionen der Teammitglieder erfasst.",
    "verificationVerified": "Bestätigt",
    "verificationClaimed": "Selbst gemeldet",
    "verificationOperator": "Betreiber"
  },
  "readiness": {
    "nfcLinked": "NFC-Basen verknüpft ({{linked}}/{{total}})",
    "locationCoords": "Standort-Basen haben Koordinaten ({{ok}}/{{total}})",
    "locationRadius": "Standortradien zwischen 5 und 200 m ({{ok}}/{{total}})",
    "locationOverlap": "Standortringe überschneiden sich nicht",
    "legacyAppsNote": "Die alten iOS- und Android-Apps können QR- und Standort-Basen nicht abschließen."
  }
}
```

In `packages/i18n/src/locales/pt.json`, change line 1171 to:

```json
      "nfcTags": "Etiquetas e códigos",
```

and replace its final two lines with:

```json
    "baseNumber": "Base {{number}}"
  },
  "checkIn": {
    "group": "Check-in",
    "method": "Método de check-in",
    "methodNfc": "NFC",
    "methodQr": "Código QR",
    "methodLocation": "Localização",
    "radius": "Raio (m)",
    "radiusHint": "Entre 5 e 200 metros. Deixa vazio para usar o valor por omissão do jogo de {{meters}} m.",
    "inheritsDefault": "Herda o valor por omissão do jogo.",
    "defaultMethod": "Método de check-in por omissão",
    "defaultRadius": "Raio por omissão (m)",
    "setupOnly": "As definições de check-in só podem ser alteradas durante a configuração.",
    "tagsAndCodes": "Etiquetas e códigos",
    "printCode": "Imprimir código",
    "printAll": "Imprimir todos os códigos",
    "noTagNeeded": "Não precisa de etiqueta — esta base desbloqueia por localização.",
    "noQrBases": "Ainda nenhuma base usa código QR.",
    "allMethods": "Todos os métodos",
    "coordinatesInvalid": "Introduz coordenadas válidas antes de guardar.",
    "radiusInvalid": "Introduz um raio entre 5 e 200, ou deixa vazio.",
    "closePrint": "Fechar",
    "claimedBadge": "Autodeclarado",
    "teammatesInRing": "{{inside}} de {{total}} colegas dentro de {{meters}} m",
    "proofTitle": "Prova de check-in",
    "proofDistance": "Distância: {{meters}} m",
    "proofAccuracy": "Precisão: ±{{meters}} m",
    "proofTeammates": "Posições dos colegas",
    "proofNoSnapshot": "Não foram registadas posições dos colegas.",
    "verificationVerified": "Verificado",
    "verificationClaimed": "Autodeclarado",
    "verificationOperator": "Operador"
  },
  "readiness": {
    "nfcLinked": "Bases NFC ligadas ({{linked}}/{{total}})",
    "locationCoords": "Bases de localização têm coordenadas ({{ok}}/{{total}})",
    "locationRadius": "Raios de localização entre 5 e 200 m ({{ok}}/{{total}})",
    "locationOverlap": "Os anéis de localização não se sobrepõem",
    "legacyAppsNote": "As apps antigas de iOS e Android não conseguem concluir bases QR ou de localização."
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```
bun run --cwd packages/i18n test
```

- [ ] **Step 5: Commit** — no commit yet.

---

### Task 3: Canonical `CheckInMethodBadge` and `CheckInVerificationBadge`

**Files:**
- Create `web/src/components/status/CheckInMethodBadge.tsx`
- Create `web/src/components/status/CheckInMethodBadge.test.tsx`
- Modify `web/src/components/status/index.ts` (append exports)

**Interfaces:**
- Consumes `CheckInMethod`, `CheckInVerification` from `@/types/checkIn`; `StatusBadge`, `StatusBadgeTone`.
- Produces `CheckInMethodIcon({ method, className })`, `CheckInMethodBadge({ method, size?, className? })`, `CheckInVerificationBadge({ verification, size?, className? })`, `checkInMethodIcons: Record<CheckInMethod, LucideIcon>`, `checkInMethodTone: Record<CheckInMethod, StatusBadgeTone>`, `useCheckInMethodLabel(): (m: CheckInMethod) => string`.

- [ ] **Step 1: Write the failing test**

Create `web/src/components/status/CheckInMethodBadge.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CheckInMethodBadge, CheckInMethodIcon, CheckInVerificationBadge } from './CheckInMethodBadge'

describe('CheckInMethodBadge', () => {
  it('labels each method with its localized name', () => {
    render(
      <>
        <CheckInMethodBadge method="NFC" />
        <CheckInMethodBadge method="QR" />
        <CheckInMethodBadge method="LOCATION" />
      </>,
    )
    expect(screen.getByText('NFC')).toBeInTheDocument()
    expect(screen.getByText('QR code')).toBeInTheDocument()
    expect(screen.getByText('Location')).toBeInTheDocument()
  })

  it('gives the standalone icon an accessible label', () => {
    render(<CheckInMethodIcon method="LOCATION" data-testid="method-icon" />)
    const icon = screen.getByTestId('method-icon')
    expect(icon).toHaveAttribute('role', 'img')
    expect(icon).toHaveAttribute('aria-label', 'Location')
  })

  it('renders nothing for a verified check-in and a badge for a claimed one', () => {
    const { container } = render(<CheckInVerificationBadge verification="VERIFIED" />)
    expect(container).toBeEmptyDOMElement()

    render(<CheckInVerificationBadge verification="CLAIMED" />)
    expect(screen.getByText('Claimed')).toBeInTheDocument()

    render(<CheckInVerificationBadge verification="OPERATOR" />)
    expect(screen.getByText('Operator')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```
bun run --cwd web test -- src/components/status/CheckInMethodBadge.test.tsx
```

Expected failure: `Failed to resolve import "./CheckInMethodBadge"`.

- [ ] **Step 3: Write minimal implementation**

Create `web/src/components/status/CheckInMethodBadge.tsx`:

```tsx
import type { ComponentType, SVGProps } from 'react'
import { MapPin, Nfc, QrCode } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { CheckInMethod, CheckInVerification } from '@/types/checkIn'
import { StatusBadge, type StatusBadgeTone } from './StatusBadge'

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>

/**
 * Method icons stay local to the web canonical badge. They are deliberately
 * not added to `design-system/icons.json`, whose generators also feed the
 * legacy Swift and Compose apps that cannot play QR or location bases.
 */
export const checkInMethodIcons: Record<CheckInMethod, IconComponent> = {
  NFC: Nfc,
  QR: QrCode,
  LOCATION: MapPin,
}

/** Blue = tag/base signal, indigo = secondary category, green = presence proven. */
export const checkInMethodTone: Record<CheckInMethod, StatusBadgeTone> = {
  NFC: 'info',
  QR: 'override',
  LOCATION: 'success',
}

const methodLabelKey: Record<CheckInMethod, string> = {
  NFC: 'checkIn.methodNfc',
  QR: 'checkIn.methodQr',
  LOCATION: 'checkIn.methodLocation',
}

const verificationTone: Record<CheckInVerification, StatusBadgeTone> = {
  VERIFIED: 'success',
  CLAIMED: 'warning',
  OPERATOR: 'override',
}

const verificationLabelKey: Record<CheckInVerification, string> = {
  VERIFIED: 'checkIn.verificationVerified',
  CLAIMED: 'checkIn.verificationClaimed',
  OPERATOR: 'checkIn.verificationOperator',
}

/** Localized method name, for callers that need the raw string. */
// eslint-disable-next-line react-refresh/only-export-components
export function useCheckInMethodLabel(): (method: CheckInMethod) => string {
  const { t } = useTranslation()
  return (method) => t(methodLabelKey[method])
}

export interface CheckInMethodIconProps {
  method: CheckInMethod
  className?: string
  'data-testid'?: string
}

/** Icon-only method marker with an accessible label, for dense rows. */
export function CheckInMethodIcon({ method, className, ...props }: CheckInMethodIconProps) {
  const { t } = useTranslation()
  const Icon = checkInMethodIcons[method]
  return (
    <Icon
      className={className ?? 'h-3.5 w-3.5 shrink-0'}
      role="img"
      aria-label={t(methodLabelKey[method])}
      data-testid={props['data-testid']}
    />
  )
}

export interface CheckInMethodBadgeProps {
  method: CheckInMethod
  size?: 'sm' | 'md'
  className?: string
  'data-testid'?: string
}

export function CheckInMethodBadge({ method, size, className, ...props }: CheckInMethodBadgeProps) {
  const { t } = useTranslation()
  const Icon = checkInMethodIcons[method]
  return (
    <StatusBadge
      tone={checkInMethodTone[method]}
      size={size}
      className={className}
      data-testid={props['data-testid']}
      label={
        <span className="inline-flex items-center gap-1">
          <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
          {t(methodLabelKey[method])}
        </span>
      }
    />
  )
}

export interface CheckInVerificationBadgeProps {
  verification: CheckInVerification
  size?: 'sm' | 'md'
  className?: string
  'data-testid'?: string
}

/**
 * Only the exceptional verifications are shown. A VERIFIED row is the norm and
 * would add noise to every feed line.
 */
export function CheckInVerificationBadge({
  verification,
  size,
  className,
  ...props
}: CheckInVerificationBadgeProps) {
  const { t } = useTranslation()
  if (verification === 'VERIFIED') return null
  return (
    <StatusBadge
      tone={verificationTone[verification]}
      size={size}
      className={className}
      data-testid={props['data-testid']}
      label={t(verificationLabelKey[verification])}
    />
  )
}
```

Append to `web/src/components/status/index.ts`:

```ts
export {
  CheckInMethodBadge,
  CheckInMethodIcon,
  CheckInVerificationBadge,
  checkInMethodIcons,
  checkInMethodTone,
  useCheckInMethodLabel,
} from './CheckInMethodBadge'
export type {
  CheckInMethodBadgeProps,
  CheckInMethodIconProps,
  CheckInVerificationBadgeProps,
} from './CheckInMethodBadge'
```

- [ ] **Step 4: Run test to verify it passes**

```
bun run --cwd web test -- src/components/status/CheckInMethodBadge.test.tsx
```

- [ ] **Step 5: Commit** — no commit yet.

---

### Task 4: `QrCodeSvg` and `CodesPrintSheet`

**Files:**
- Create `web/src/components/common/QrCodeSvg.tsx`
- Create `web/src/components/common/CodesPrintSheet.tsx`
- Create `web/src/components/common/QrCodeSvg.test.tsx`
- Modify `design-system/decisions.md` (append one exception row)

**Interfaces:**
- Consumes `qrcode`'s synchronous `QRCode.create(text)` bit matrix and `createPortal` from `react-dom`.
- Produces `QrCodeSvg({ value, size?, className?, 'data-testid'? })` rendering a self-contained `<svg>` with one `<path>`, and `CodesPrintSheet({ open, gameName, codes, onClose })` where `codes: Array<{ id: string; name: string; value: string }>`.

- [ ] **Step 1: Write the failing test**

Create `web/src/components/common/QrCodeSvg.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CodesPrintSheet } from './CodesPrintSheet'
import { QrCodeSvg } from './QrCodeSvg'

describe('QrCodeSvg', () => {
  it('renders a square svg with a module path for the encoded value', () => {
    render(<QrCodeSvg value="https://pointfinder.pt/tag/abc?t=xyz" data-testid="qr" />)
    const svg = screen.getByTestId('qr')
    expect(svg.tagName.toLowerCase()).toBe('svg')
    const viewBox = svg.getAttribute('viewBox')?.split(' ') ?? []
    expect(viewBox[2]).toBe(viewBox[3])
    const path = svg.querySelector('path[data-testid="qr-modules"]')
    expect(path?.getAttribute('d')).toMatch(/^M\d+ \d+h1v1h-1z/)
  })

  it('renders nothing when the value cannot be encoded', () => {
    const { container } = render(<QrCodeSvg value="" />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('CodesPrintSheet', () => {
  it('renders one page per code with the base and game name and asks the browser to print', async () => {
    const print = vi.fn()
    vi.stubGlobal('print', print)

    render(
      <CodesPrintSheet
        open
        gameName="Night Trail"
        onClose={vi.fn()}
        codes={[
          { id: 'b1', name: 'Old mill', value: 'https://pointfinder.pt/tag/b1?t=a' },
          { id: 'b2', name: 'Chapel', value: 'https://pointfinder.pt/tag/b2?t=b' },
        ]}
      />,
    )

    const pages = await screen.findAllByTestId('codes-print-page')
    expect(pages).toHaveLength(2)
    expect(pages[0]).toHaveTextContent('Old mill')
    expect(pages[0]).toHaveTextContent('Night Trail')
    expect(pages[1]).toHaveTextContent('Chapel')
    expect(print).toHaveBeenCalledTimes(1)

    vi.unstubAllGlobals()
  })

  it('renders nothing while closed and closes on demand', async () => {
    const onClose = vi.fn()
    vi.stubGlobal('print', vi.fn())
    const { rerender } = render(
      <CodesPrintSheet open={false} gameName="Night Trail" onClose={onClose} codes={[]} />,
    )
    expect(screen.queryByTestId('codes-print-sheet')).not.toBeInTheDocument()

    rerender(
      <CodesPrintSheet
        open
        gameName="Night Trail"
        onClose={onClose}
        codes={[{ id: 'b1', name: 'Old mill', value: 'https://pointfinder.pt/tag/b1?t=a' }]}
      />,
    )
    await userEvent.click(screen.getByTestId('codes-print-close'))
    expect(onClose).toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```
bun run --cwd web test -- src/components/common/QrCodeSvg.test.tsx
```

Expected failure: `Failed to resolve import "./CodesPrintSheet"` and `"./QrCodeSvg"`.

- [ ] **Step 3: Write minimal implementation**

Create `web/src/components/common/QrCodeSvg.tsx`:

```tsx
import { useMemo } from 'react'
import QRCode from 'qrcode'

export interface QrCodeSvgProps {
  /** Payload to encode — always `buildTagUrl(base.id, base.nfcToken)`. */
  value: string
  /** Rendered edge length in CSS pixels. */
  size?: number
  className?: string
  /** Accessible name; when omitted the graphic is decorative. */
  title?: string
  'data-testid'?: string
}

const QUIET_ZONE_MODULES = 2

/**
 * A QR code drawn as real SVG elements from the encoder's bit matrix.
 *
 * `qrcode` is already a dependency (used by the team join-code dialog); its
 * synchronous `create()` gives the module matrix, so nothing is injected as
 * raw HTML and the code renders offline with no canvas or data URI.
 *
 * Colours are literal black on white on purpose: a QR code must stay
 * dark-on-light in both themes and on paper to remain scannable. Recorded as
 * an exception in `design-system/decisions.md`.
 */
export function QrCodeSvg({ value, size = 160, className, title, ...props }: QrCodeSvgProps) {
  const matrix = useMemo(() => {
    if (!value) return null
    try {
      return QRCode.create(value, { errorCorrectionLevel: 'M' }).modules
    } catch {
      return null
    }
  }, [value])

  const path = useMemo(() => {
    if (!matrix) return ''
    const parts: string[] = []
    for (let row = 0; row < matrix.size; row++) {
      for (let col = 0; col < matrix.size; col++) {
        if (matrix.data[row * matrix.size + col]) {
          parts.push(`M${col + QUIET_ZONE_MODULES} ${row + QUIET_ZONE_MODULES}h1v1h-1z`)
        }
      }
    }
    return parts.join('')
  }, [matrix])

  if (!matrix || !path) return null

  const dimension = matrix.size + QUIET_ZONE_MODULES * 2

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${dimension} ${dimension}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      className={className}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      data-testid={props['data-testid']}
    >
      {title && <title>{title}</title>}
      <rect width={dimension} height={dimension} fill="#ffffff" />
      <path d={path} fill="#000000" data-testid="qr-modules" />
    </svg>
  )
}
```

Create `web/src/components/common/CodesPrintSheet.tsx`:

```tsx
import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { QrCodeSvg } from './QrCodeSvg'

export interface PrintableCode {
  id: string
  /** Base name, printed above the code. */
  name: string
  /** Encoded payload — `buildTagUrl(base.id, base.nfcToken)`. */
  value: string
}

export interface CodesPrintSheetProps {
  open: boolean
  gameName: string
  codes: PrintableCode[]
  onClose: () => void
}

const PRINT_STYLE = `
@media print {
  body > *:not(#pf-print-root) { display: none !important; }
  #pf-print-root { position: static !important; overflow: visible !important; }
  #pf-print-root .pf-print-chrome { display: none !important; }
  #pf-print-root .pf-print-page { break-after: page; page-break-after: always; }
  #pf-print-root .pf-print-page:last-child { break-after: auto; page-break-after: auto; }
}
`

/**
 * One printable page per code: base name, game name, and the SVG code itself.
 * Rendered into a body-level portal so a single print rule can hide the rest
 * of the operator workspace without touching the global stylesheet.
 */
export function CodesPrintSheet({ open, gameName, codes, onClose }: CodesPrintSheetProps) {
  const { t } = useTranslation()

  useEffect(() => {
    if (!open) return
    if (typeof window.print !== 'function') return
    window.print()
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div
      id="pf-print-root"
      data-testid="codes-print-sheet"
      className="fixed inset-0 z-[100] overflow-y-auto bg-white text-black"
    >
      <style>{PRINT_STYLE}</style>
      <div className="pf-print-chrome sticky top-0 flex justify-end gap-2 bg-white p-3">
        <Button type="button" variant="outline" size="sm" onClick={onClose} data-testid="codes-print-close">
          {t('checkIn.closePrint')}
        </Button>
      </div>
      {codes.map((code) => (
        <section
          key={code.id}
          data-testid="codes-print-page"
          className="pf-print-page flex min-h-screen flex-col items-center justify-center gap-4 px-8 py-10 text-center"
        >
          <h2 className="text-3xl font-semibold break-words">{code.name}</h2>
          <QrCodeSvg value={code.value} size={320} title={code.name} />
          <p className="text-lg break-words">{gameName}</p>
        </section>
      ))}
    </div>,
    document.body,
  )
}
```

Append to the table at the top of `design-system/decisions.md` (a new row after the existing 2026-07-11 row):

```
| 2026-09-05 | `QrCodeSvg` paints literal `#000000` on `#ffffff` instead of semantic tokens. | A QR code must stay dark-on-light in both themes and on paper to remain scannable; theming it would break field use. | PointFinder frontend | None — this is a permanent, machine-readable-graphic exception. |
```

- [ ] **Step 4: Run test to verify it passes**

```
bun run --cwd web test -- src/components/common/QrCodeSvg.test.tsx
```

- [ ] **Step 5: Commit** — no commit yet.

---

### Task 5: Radius ring geometry on the `LocationPicker`

**Files:**
- Create `web/src/components/map/circleGeoJson.ts`
- Create `web/src/components/map/circleGeoJson.test.ts`
- Modify `web/src/components/map/LocationPicker.tsx` (lines 1–14 imports/props, lines 56–77 render)

**Interfaces:**
- Consumes `distanceM` from `@pointfinder/game-core` (test only).
- Produces `circlePolygon(center: { lat: number; lng: number }, radiusM: number, steps?: number): GeoJSON.Feature<GeoJSON.Polygon>` and an optional `radiusM?: number | null` prop on `LocationPicker`.

- [ ] **Step 1: Write the failing test**

Create `web/src/components/map/circleGeoJson.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { distanceM } from '@pointfinder/game-core'
import { circlePolygon } from './circleGeoJson'

describe('circlePolygon', () => {
  it('produces a closed ring whose vertices sit on the radius', () => {
    const center = { lat: 38.7075, lng: -9.17 }
    const feature = circlePolygon(center, 50, 32)
    const ring = feature.geometry.coordinates[0]

    expect(feature.type).toBe('Feature')
    expect(feature.geometry.type).toBe('Polygon')
    expect(ring).toHaveLength(33)
    expect(ring[0]).toEqual(ring[ring.length - 1])

    for (const [lng, lat] of ring) {
      expect(distanceM(center, { lat, lng })).toBeCloseTo(50, 0)
    }
  })

  it('returns a degenerate ring for a non-positive radius', () => {
    const ring = circlePolygon({ lat: 0, lng: 0 }, 0, 8).geometry.coordinates[0]
    for (const [lng, lat] of ring) {
      expect(lat).toBe(0)
      expect(lng).toBe(0)
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```
bun run --cwd web test -- src/components/map/circleGeoJson.test.ts
```

Expected failure: `Failed to resolve import "./circleGeoJson"`.

- [ ] **Step 3: Write minimal implementation**

Create `web/src/components/map/circleGeoJson.ts`:

```ts
/**
 * Approximate a metric circle as a GeoJSON polygon so MapLibre can draw a
 * check-in radius without a turf dependency. Accurate enough for the 5..200 m
 * range the product clamps radii to.
 */
const EARTH_RADIUS_M = 6_371_000

export function circlePolygon(
  center: { lat: number; lng: number },
  radiusM: number,
  steps = 64,
): GeoJSON.Feature<GeoJSON.Polygon> {
  const safeRadius = Number.isFinite(radiusM) && radiusM > 0 ? radiusM : 0
  const latRad = (center.lat * Math.PI) / 180
  const dLat = (safeRadius / EARTH_RADIUS_M) * (180 / Math.PI)
  const cosLat = Math.cos(latRad)
  const dLng = cosLat === 0 ? 0 : dLat / cosLat

  const ring: [number, number][] = []
  for (let i = 0; i < steps; i++) {
    const angle = (i / steps) * 2 * Math.PI
    ring.push([center.lng + dLng * Math.cos(angle), center.lat + dLat * Math.sin(angle)])
  }
  ring.push(ring[0])

  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'Polygon', coordinates: [ring] },
  }
}
```

Replace `web/src/components/map/LocationPicker.tsx` entirely:

```tsx
import { useState, useCallback, useEffect, useMemo } from 'react'
import Map, { Layer, Marker, Source } from 'react-map-gl/maplibre'
import type { MapLayerMouseEvent } from 'react-map-gl/maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'
import { DARK_STYLE_URL } from '@/lib/tile-sources'
import { PinMarkerSvg } from '@/components/common/MapMarkers'
import { circlePolygon } from './circleGeoJson'

interface LocationPickerProps {
  lat: number
  lng: number
  onChange: (lat: number, lng: number) => void
  className?: string
  mapStyle?: string
  /** Draws the check-in radius as a faint ring. Omit for non-location bases. */
  radiusM?: number | null
}

export function LocationPicker({
  lat,
  lng,
  onChange,
  className = '',
  mapStyle,
  radiusM,
}: LocationPickerProps) {
  const [viewState, setViewState] = useState({
    longitude: lng || -9.17,
    latitude: lat || 38.7075,
    zoom: 15,
  })

  // Recenter when base changes
  useEffect(() => {
    if (lat !== 0 || lng !== 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setViewState(prev => ({ ...prev, latitude: lat, longitude: lng }))
    }
  }, [lat, lng])

  const handleMove = useCallback(
    (evt: { viewState: typeof viewState }) => {
      setViewState(evt.viewState)
    },
    [],
  )

  const handleClick = useCallback(
    (evt: MapLayerMouseEvent) => {
      onChange(
        Math.round(evt.lngLat.lat * 1_000_000) / 1_000_000,
        Math.round(evt.lngLat.lng * 1_000_000) / 1_000_000,
      )
    },
    [onChange],
  )

  const hasPosition = lat !== 0 || lng !== 0
  const showRadius = hasPosition && typeof radiusM === 'number' && radiusM > 0

  const radiusFeature = useMemo(
    () => (showRadius ? circlePolygon({ lat, lng }, radiusM as number) : null),
    [showRadius, lat, lng, radiusM],
  )

  return (
    <div
      className={`h-48 rounded-lg border border-border overflow-hidden ${className}`}
      data-testid="location-picker"
    >
      <Map
        {...viewState}
        onMove={handleMove}
        onClick={handleClick}
        mapStyle={mapStyle ?? DARK_STYLE_URL}
        style={{ width: '100%', height: '100%' }}
        attributionControl={false}
        cursor="crosshair"
      >
        {radiusFeature && (
          <Source id="checkin-radius" type="geojson" data={radiusFeature}>
            <Layer
              id="checkin-radius-fill"
              type="fill"
              paint={{ 'fill-color': 'var(--color-info)', 'fill-opacity': 0.12 }}
            />
            <Layer
              id="checkin-radius-line"
              type="line"
              paint={{ 'line-color': 'var(--color-info)', 'line-width': 1.5, 'line-opacity': 0.6 }}
            />
          </Source>
        )}
        {hasPosition && (
          <Marker longitude={lng} latitude={lat} anchor="bottom">
            <PinMarkerSvg color="var(--color-info)" />
          </Marker>
        )}
      </Map>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

```
bun run --cwd web test -- src/components/map/circleGeoJson.test.ts
```

- [ ] **Step 5: Commit** — no commit yet.

---

### Task 6: Game settings "Check-in" group

**Files:**
- Modify `web/src/features/build/GameSettingsPanel.tsx` (imports lines 1–18; insert a new `<section>` between the Progression section ending at line 351 and the Assignment Mode section starting at line 353)
- Modify `web/src/features/build/GameSettingsPanel.test.tsx` (append tests)

**Interfaces:**
- Consumes `CHECK_IN_METHODS`, `MAX_CHECK_IN_RADIUS_M`, `MIN_CHECK_IN_RADIUS_M`, `parseCheckInRadiusInput` from `@/types/checkIn`; `useCheckInMethodLabel` from `@/components/status`; `useUpdateGame`.
- Produces test ids `checkin-default-method`, `checkin-default-method-nfc|qr|location`, `checkin-default-radius`, `checkin-default-radius-error`; writes `{ defaultCheckInMethod }` / `{ defaultCheckInRadiusM }` through `updateGame.mutate`.

- [ ] **Step 1: Write the failing test**

Append inside the `describe('GameSettingsPanel', ...)` block in `web/src/features/build/GameSettingsPanel.test.tsx`:

```tsx
  it('offers the three check-in methods and saves the chosen default', async () => {
    const user = userEvent.setup()
    useWorkspaceStore.getState().toggleSettingsPanel()
    let body: Record<string, unknown> = {}

    server.use(
      http.get('/api/games/:id', () =>
        HttpResponse.json(createMockGame({ id: 'game-1', status: 'setup' })),
      ),
      http.put('/api/games/:id', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>
        return HttpResponse.json(
          createMockGame({ id: 'game-1', defaultCheckInMethod: 'LOCATION' }),
        )
      }),
    )

    render(createElement(GameSettingsPanel, { gameId: 'game-1' }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByTestId('checkin-default-method')).toBeInTheDocument()
    })

    await user.click(screen.getByTestId('checkin-default-method-location'))

    await waitFor(() => {
      expect(body.defaultCheckInMethod).toBe('LOCATION')
    })
  })

  it('shows the default radius only for the location method', async () => {
    useWorkspaceStore.getState().toggleSettingsPanel()
    server.use(
      http.get('/api/games/:id', () =>
        HttpResponse.json(createMockGame({ id: 'game-1', defaultCheckInMethod: 'NFC' })),
      ),
    )

    const { unmount } = render(createElement(GameSettingsPanel, { gameId: 'game-1' }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByTestId('checkin-default-method')).toBeInTheDocument()
    })
    expect(screen.queryByTestId('checkin-default-radius')).not.toBeInTheDocument()
    unmount()

    server.use(
      http.get('/api/games/:id', () =>
        HttpResponse.json(
          createMockGame({
            id: 'game-1',
            defaultCheckInMethod: 'LOCATION',
            defaultCheckInRadiusM: 30,
          }),
        ),
      ),
    )

    render(createElement(GameSettingsPanel, { gameId: 'game-1' }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByTestId('checkin-default-radius')).toHaveValue(30)
    })
  })

  it('rejects a radius outside the 5..200 clamp without calling the API', async () => {
    const user = userEvent.setup()
    useWorkspaceStore.getState().toggleSettingsPanel()
    let putCalls = 0

    server.use(
      http.get('/api/games/:id', () =>
        HttpResponse.json(
          createMockGame({
            id: 'game-1',
            defaultCheckInMethod: 'LOCATION',
            defaultCheckInRadiusM: 15,
          }),
        ),
      ),
      http.put('/api/games/:id', () => {
        putCalls += 1
        return HttpResponse.json(createMockGame({ id: 'game-1' }))
      }),
    )

    render(createElement(GameSettingsPanel, { gameId: 'game-1' }), {
      wrapper: createWrapper(),
    })

    const input = await screen.findByTestId('checkin-default-radius')
    await user.clear(input)
    await user.type(input, '900')
    await user.tab()

    expect(await screen.findByTestId('checkin-default-radius-error')).toBeInTheDocument()
    expect(putCalls).toBe(0)
  })

  it('locks the check-in group once the game is live', async () => {
    useWorkspaceStore.getState().toggleSettingsPanel()
    server.use(
      http.get('/api/games/:id', () =>
        HttpResponse.json(
          createMockGame({ id: 'game-1', status: 'live', defaultCheckInMethod: 'LOCATION' }),
        ),
      ),
    )

    render(createElement(GameSettingsPanel, { gameId: 'game-1' }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByTestId('checkin-default-method-qr')).toBeDisabled()
    })
    expect(screen.getByTestId('checkin-default-radius')).toBeDisabled()
    expect(
      screen.getByText('Check-in settings can only be changed during setup.'),
    ).toBeInTheDocument()
  })
```

- [ ] **Step 2: Run test to verify it fails**

```
bun run --cwd web test -- src/features/build/GameSettingsPanel.test.tsx
```

Expected failure: `Unable to find an element by: [data-testid="checkin-default-method"]`.

- [ ] **Step 3: Write minimal implementation**

In `web/src/features/build/GameSettingsPanel.tsx`, extend the imports:

```tsx
import { Input } from '@/components/ui/input'
import { useCheckInMethodLabel } from '@/components/status'
import {
  CHECK_IN_METHODS,
  MAX_CHECK_IN_RADIUS_M,
  MIN_CHECK_IN_RADIUS_M,
  parseCheckInRadiusInput,
} from '@/types/checkIn'
import type { CheckInMethod } from '@/types/checkIn'
```

Add local state next to the other `useState` calls (right after `const [localBroadcast, setLocalBroadcast] = useState<boolean | null>(null)`):

```tsx
  const methodLabel = useCheckInMethodLabel()
  const [radiusDraft, setRadiusDraft] = useState<string | null>(null)
  const [radiusError, setRadiusError] = useState(false)
```

Add derived values right after `const broadcastValue = ...`:

```tsx
  const checkInLocked = game?.status !== 'setup'
  const defaultMethod: CheckInMethod = game?.defaultCheckInMethod ?? 'NFC'
  const defaultRadiusValue = radiusDraft ?? String(game?.defaultCheckInRadiusM ?? 15)
```

Insert this section between the `Progression` `</section>` and the `Assignment Mode` `<section>`:

```tsx
        {/* Check-in */}
        <section className="space-y-3">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {t('checkIn.group')}
          </h3>
          <div className="space-y-1.5">
            <label className="text-sm text-muted-foreground" id="checkin-default-method-label">
              {t('checkIn.defaultMethod')}
            </label>
            <div
              className="flex gap-1 rounded-lg bg-muted p-1"
              role="group"
              aria-labelledby="checkin-default-method-label"
              data-testid="checkin-default-method"
            >
              {CHECK_IN_METHODS.map((method) => {
                const isActive = defaultMethod === method
                return (
                  <button
                    key={method}
                    type="button"
                    disabled={checkInLocked || updateGame.isPending}
                    aria-pressed={isActive}
                    data-testid={`checkin-default-method-${method.toLowerCase()}`}
                    onClick={() => updateGame.mutate({ defaultCheckInMethod: method })}
                    className={`min-h-11 flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                      isActive
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {methodLabel(method)}
                  </button>
                )
              })}
            </div>
          </div>

          {defaultMethod === 'LOCATION' && (
            <div className="space-y-1.5">
              <label htmlFor="checkin-default-radius" className="text-sm text-muted-foreground">
                {t('checkIn.defaultRadius')}
              </label>
              <Input
                id="checkin-default-radius"
                data-testid="checkin-default-radius"
                type="number"
                inputMode="numeric"
                min={MIN_CHECK_IN_RADIUS_M}
                max={MAX_CHECK_IN_RADIUS_M}
                disabled={checkInLocked || updateGame.isPending}
                aria-invalid={radiusError}
                aria-describedby={radiusError ? 'checkin-default-radius-error' : undefined}
                value={defaultRadiusValue}
                onChange={(e) => {
                  setRadiusDraft(e.target.value)
                  setRadiusError(false)
                }}
                onBlur={() => {
                  if (radiusDraft === null) return
                  const parsed = parseCheckInRadiusInput(radiusDraft)
                  if (!parsed.ok || parsed.value === null) {
                    setRadiusError(true)
                    return
                  }
                  setRadiusError(false)
                  if (parsed.value === game?.defaultCheckInRadiusM) {
                    setRadiusDraft(null)
                    return
                  }
                  updateGame.mutate(
                    { defaultCheckInRadiusM: parsed.value },
                    { onSettled: () => setRadiusDraft(null) },
                  )
                }}
              />
              {radiusError ? (
                <p
                  id="checkin-default-radius-error"
                  data-testid="checkin-default-radius-error"
                  className="text-xs text-destructive"
                >
                  {t('checkIn.radiusInvalid')}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {t('checkIn.radiusHint', { meters: game?.defaultCheckInRadiusM ?? 15 })}
                </p>
              )}
            </div>
          )}

          {checkInLocked && (
            <p className="text-xs text-muted-foreground">{t('checkIn.setupOnly')}</p>
          )}
        </section>
```

- [ ] **Step 4: Run test to verify it passes**

```
bun run --cwd web test -- src/features/build/GameSettingsPanel.test.tsx
```

- [ ] **Step 5: Commit** — no commit yet.

---

### Task 7: Base detail — method, radius, ring, inline QR, strict coordinates

**Files:**
- Modify `web/src/features/build/BaseDetail.tsx` (imports lines 1–20; local state lines 54–69; `isDirty` lines 117–122; `handleSave` lines 124–138; identity section lines 189–209)
- Modify `web/src/features/build/BaseDetail.test.tsx` (extend the `LocationPicker` mock, append tests)

**Interfaces:**
- Consumes `buildTagUrl` from `@pointfinder/game-core`; `QrCodeSvg`, `CodesPrintSheet`; `CheckInMethodBadge`, `useCheckInMethodLabel`; `CHECK_IN_METHODS`, `parseCheckInRadiusInput`, `resolveCheckInRadiusM`.
- Produces test ids `base-checkin-method`, `base-checkin-method-nfc|qr|location`, `base-checkin-inherits`, `base-checkin-radius`, `base-checkin-radius-error`, `base-coordinates-error`, `base-qr-code`, `base-qr-print`; sends `checkInMethod` and `checkInRadiusM` in the update DTO.

- [ ] **Step 1: Write the failing test**

In `web/src/features/build/BaseDetail.test.tsx`, replace the `LocationPicker` mock with one that also reports the radius:

```tsx
// Mock LocationPicker to avoid WebGL initialization in jsdom
vi.mock('@/components/map/LocationPicker', () => ({
  LocationPicker: ({ lat, lng, radiusM }: { lat: number; lng: number; radiusM?: number | null }) => (
    <div data-testid="location-picker-mock" data-radius={radiusM ?? ''}>
      {lat}, {lng}
    </div>
  ),
}))
```

Add the MSW imports at the top of the file:

```tsx
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { createMockBase } from '@/test/factories/base'
import { createMockGame } from '@/test/factories/game'
```

Append these tests inside `describe('BaseDetail', ...)`:

```tsx
  it('lets the operator switch the base to QR and shows the printable code', async () => {
    const user = userEvent.setup()
    server.use(
      http.get('/api/games/:gameId/bases', () =>
        HttpResponse.json([
          createMockBase({ id: 'base-1', name: 'Base Alpha', nfcToken: 'ab12cd34', checkInMethod: 'QR' }),
        ]),
      ),
    )
    renderBaseDetail()

    const qr = await screen.findByTestId('base-qr-code')
    expect(qr.querySelector('title')?.textContent).toContain('base-1')
    expect(screen.getByTestId('base-qr-print')).toBeInTheDocument()

    await user.click(screen.getByTestId('base-checkin-method-nfc'))
    expect(screen.queryByTestId('base-qr-code')).not.toBeInTheDocument()
  })

  it('shows the radius field and draws the ring for a location base', async () => {
    server.use(
      http.get('/api/games/:id', () =>
        HttpResponse.json(createMockGame({ id: 'game-1', defaultCheckInRadiusM: 25 })),
      ),
      http.get('/api/games/:gameId/bases', () =>
        HttpResponse.json([
          createMockBase({
            id: 'base-1',
            name: 'Base Alpha',
            checkInMethod: 'LOCATION',
            checkInRadiusM: null,
          }),
        ]),
      ),
    )
    renderBaseDetail()

    await waitFor(() => {
      expect(screen.getByTestId('base-checkin-radius')).toHaveValue(null)
    })
    expect(screen.getByTestId('base-checkin-inherits')).toBeInTheDocument()
    expect(screen.getByTestId('location-picker-mock')).toHaveAttribute('data-radius', '25')
  })

  it('sends the method and radius when saving', async () => {
    const user = userEvent.setup()
    let body: Record<string, unknown> = {}
    server.use(
      http.get('/api/games/:gameId/bases', () =>
        HttpResponse.json([
          createMockBase({ id: 'base-1', name: 'Base Alpha', checkInMethod: 'LOCATION' }),
        ]),
      ),
      http.put('/api/games/:gameId/bases/:baseId', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>
        return HttpResponse.json(createMockBase({ id: 'base-1' }))
      }),
    )
    renderBaseDetail()

    const radius = await screen.findByTestId('base-checkin-radius')
    await user.clear(radius)
    await user.type(radius, '60')
    await user.click(await screen.findByTestId('save-base-btn'))

    await waitFor(() => {
      expect(body.checkInMethod).toBe('LOCATION')
    })
    expect(body.checkInRadiusM).toBe(60)
  })

  it('refuses to save unparseable coordinates instead of falling back to 0,0', async () => {
    const user = userEvent.setup()
    let putCalls = 0
    server.use(
      http.get('/api/games/:gameId/bases', () =>
        HttpResponse.json([createMockBase({ id: 'base-1', name: 'Base Alpha' })]),
      ),
      http.put('/api/games/:gameId/bases/:baseId', () => {
        putCalls += 1
        return HttpResponse.json(createMockBase({ id: 'base-1' }))
      }),
    )
    renderBaseDetail()

    const latInput = await screen.findByTestId('base-lat-input')
    await user.clear(latInput)
    await user.type(latInput, 'not-a-number')

    expect(await screen.findByTestId('base-coordinates-error')).toBeInTheDocument()
    expect(screen.getByTestId('save-base-btn')).toBeDisabled()
    await user.click(screen.getByTestId('save-base-btn'))
    expect(putCalls).toBe(0)
  })
```

- [ ] **Step 2: Run test to verify it fails**

```
bun run --cwd web test -- src/features/build/BaseDetail.test.tsx
```

Expected failure: `Unable to find an element by: [data-testid="base-qr-code"]` and `[data-testid="base-lat-input"]`.

- [ ] **Step 3: Write minimal implementation**

In `web/src/features/build/BaseDetail.tsx`, extend the imports:

```tsx
import { buildTagUrl } from '@pointfinder/game-core'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { QrCodeSvg } from '@/components/common/QrCodeSvg'
import { CodesPrintSheet } from '@/components/common/CodesPrintSheet'
import { useCheckInMethodLabel } from '@/components/status'
import {
  CHECK_IN_METHODS,
  MAX_CHECK_IN_RADIUS_M,
  MIN_CHECK_IN_RADIUS_M,
  parseCheckInRadiusInput,
  resolveCheckInRadiusM,
} from '@/types/checkIn'
import type { CheckInMethod } from '@/types/checkIn'
```

Replace the local-state block (currently lines 54–69) with:

```tsx
  // Local form state
  const methodLabel = useCheckInMethodLabel()
  const [localName, setLocalName] = useState(base?.name ?? '')
  const [localDescription, setLocalDescription] = useState(base?.description ?? '')
  const [localLat, setLocalLat] = useState(base?.lat?.toString() ?? '')
  const [localLng, setLocalLng] = useState(base?.lng?.toString() ?? '')
  const [localHidden, setLocalHidden] = useState(base?.hidden ?? false)
  const [localMethod, setLocalMethod] = useState<CheckInMethod>(base?.checkInMethod ?? 'NFC')
  const [localRadius, setLocalRadius] = useState(
    base?.checkInRadiusM != null ? String(base.checkInRadiusM) : '',
  )
  const [printOpen, setPrintOpen] = useState(false)

  // Reset local state when base changes
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocalName(base?.name ?? '')
    setLocalDescription(base?.description ?? '')
    setLocalLat(base?.lat?.toString() ?? '')
    setLocalLng(base?.lng?.toString() ?? '')
    setLocalHidden(base?.hidden ?? false)
    setLocalMethod(base?.checkInMethod ?? 'NFC')
    setLocalRadius(base?.checkInRadiusM != null ? String(base.checkInRadiusM) : '')
  }, [
    baseId,
    base?.name,
    base?.description,
    base?.lat,
    base?.lng,
    base?.hidden,
    base?.checkInMethod,
    base?.checkInRadiusM,
  ])
```

Replace `isDirty` and `handleSave` (currently lines 117–138) with:

```tsx
  const parsedLat = Number.parseFloat(localLat)
  const parsedLng = Number.parseFloat(localLng)
  const coordinatesValid =
    Number.isFinite(parsedLat) &&
    Number.isFinite(parsedLng) &&
    parsedLat >= -90 &&
    parsedLat <= 90 &&
    parsedLng >= -180 &&
    parsedLng <= 180
  const parsedRadius = parseCheckInRadiusInput(localRadius)
  const radiusValid = parsedRadius.ok

  const gameDefaultRadius = game?.defaultCheckInRadiusM
  const effectiveRadius = resolveCheckInRadiusM(
    parsedRadius.ok ? parsedRadius.value : (base?.checkInRadiusM ?? null),
    gameDefaultRadius,
  )

  const isDirty =
    localName !== (base?.name ?? '') ||
    localDescription !== (base?.description ?? '') ||
    localLat !== (base?.lat?.toString() ?? '') ||
    localLng !== (base?.lng?.toString() ?? '') ||
    localHidden !== (base?.hidden ?? false) ||
    localMethod !== (base?.checkInMethod ?? 'NFC') ||
    localRadius !== (base?.checkInRadiusM != null ? String(base.checkInRadiusM) : '')

  const canSave = coordinatesValid && radiusValid && !updateBase.isPending

  const handleSave = () => {
    if (!base || !canSave || !parsedRadius.ok) return
    updateBase.mutate({
      baseId: base.id,
      dto: {
        name: localName,
        description: localDescription,
        lat: parsedLat,
        lng: parsedLng,
        hidden: localHidden,
        tagIds: base.tagIds,
        fixedChallengeId: base.fixedChallengeId,
        checkInMethod: localMethod,
        checkInRadiusM: localMethod === 'LOCATION' ? parsedRadius.value : null,
      },
    })
  }
```

Replace the block from `<LocationPicker ... />` through the closing `</div>` of the NFC field (currently lines 189–209) with:

```tsx
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="base-lat" className="block text-xs text-muted-foreground mb-1">
                {t('bases.latitude')}
              </label>
              <Input
                id="base-lat"
                data-testid="base-lat-input"
                value={localLat}
                inputMode="decimal"
                aria-invalid={!coordinatesValid}
                onChange={(e) => setLocalLat(e.target.value)}
                className="h-8"
              />
            </div>
            <div>
              <label htmlFor="base-lng" className="block text-xs text-muted-foreground mb-1">
                {t('bases.longitude')}
              </label>
              <Input
                id="base-lng"
                data-testid="base-lng-input"
                value={localLng}
                inputMode="decimal"
                aria-invalid={!coordinatesValid}
                onChange={(e) => setLocalLng(e.target.value)}
                className="h-8"
              />
            </div>
          </div>
          {!coordinatesValid && (
            <p data-testid="base-coordinates-error" className="text-xs text-destructive">
              {t('checkIn.coordinatesInvalid')}
            </p>
          )}
          <LocationPicker
            lat={coordinatesValid ? parsedLat : 0}
            lng={coordinatesValid ? parsedLng : 0}
            radiusM={localMethod === 'LOCATION' ? effectiveRadius : null}
            mapStyle={game?.tileSource ? getStyleUrl(game.tileSource) : undefined}
            onChange={(newLat, newLng) => {
              setLocalLat(newLat.toString())
              setLocalLng(newLng.toString())
            }}
          />

          <div>
            <label className="block text-xs text-muted-foreground mb-1" id="base-checkin-method-label">
              {t('checkIn.method')}
            </label>
            <div
              className="flex gap-1 rounded-lg bg-muted p-1"
              role="group"
              aria-labelledby="base-checkin-method-label"
              data-testid="base-checkin-method"
            >
              {CHECK_IN_METHODS.map((method) => {
                const isActive = localMethod === method
                return (
                  <button
                    key={method}
                    type="button"
                    aria-pressed={isActive}
                    data-testid={`base-checkin-method-${method.toLowerCase()}`}
                    onClick={() => setLocalMethod(method)}
                    className={`min-h-11 flex-1 cursor-pointer rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                      isActive
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {methodLabel(method)}
                  </button>
                )
              })}
            </div>
            {base.checkInMethod === game?.defaultCheckInMethod && (
              <p data-testid="base-checkin-inherits" className="mt-1 text-xs text-muted-foreground">
                {t('checkIn.inheritsDefault')}
              </p>
            )}
          </div>

          {localMethod === 'LOCATION' && (
            <div>
              <label htmlFor="base-checkin-radius" className="block text-xs text-muted-foreground mb-1">
                {t('checkIn.radius')}
              </label>
              <Input
                id="base-checkin-radius"
                data-testid="base-checkin-radius"
                type="number"
                inputMode="numeric"
                min={MIN_CHECK_IN_RADIUS_M}
                max={MAX_CHECK_IN_RADIUS_M}
                value={localRadius}
                aria-invalid={!radiusValid}
                aria-describedby={radiusValid ? undefined : 'base-checkin-radius-error'}
                onChange={(e) => setLocalRadius(e.target.value)}
                className="h-8"
              />
              {radiusValid ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('checkIn.radiusHint', { meters: gameDefaultRadius ?? 15 })}
                </p>
              ) : (
                <p
                  id="base-checkin-radius-error"
                  data-testid="base-checkin-radius-error"
                  className="mt-1 text-xs text-destructive"
                >
                  {t('checkIn.radiusInvalid')}
                </p>
              )}
            </div>
          )}

          {localMethod === 'QR' && (
            <div className="flex flex-col items-start gap-2">
              <QrCodeSvg
                value={buildTagUrl(base.id, base.nfcToken)}
                size={144}
                title={buildTagUrl(base.id, base.nfcToken)}
                data-testid="base-qr-code"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-testid="base-qr-print"
                onClick={() => setPrintOpen(true)}
              >
                {t('checkIn.printCode')}
              </Button>
            </div>
          )}

          {localMethod === 'NFC' && (
            <div>
              <label className="block text-xs text-muted-foreground mb-1">NFC</label>
              <div className="flex flex-col gap-2">
                <NfcStatusBadge status={base.nfcLinked ? 'linked' : 'missing'} />
                {isNative() && <NfcLinkControl base={base} gameId={gameId} />}
              </div>
            </div>
          )}

          {localMethod === 'LOCATION' && (
            <p className="text-xs text-muted-foreground">{t('checkIn.noTagNeeded')}</p>
          )}
```

Change the save button so it respects validation — replace its `disabled` attribute:

```tsx
            disabled={!canSave}
```

Finally, render the print sheet just before the closing `</div>` of the component (immediately before `<ConfirmDeleteDialog`):

```tsx
      <CodesPrintSheet
        open={printOpen}
        gameName={game?.name ?? ''}
        onClose={() => setPrintOpen(false)}
        codes={[{ id: base.id, name: base.name, value: buildTagUrl(base.id, base.nfcToken) }]}
      />
```

- [ ] **Step 4: Run test to verify it passes**

```
bun run --cwd web test -- src/features/build/BaseDetail.test.tsx
```

- [ ] **Step 5: Commit** — no commit yet.

---

### Task 8: "Tags & codes" page — per-method rows, method filter, print-all sheet

**Files:**
- Modify `web/src/features/build/NfcTagsPage.tsx` (whole file)
- Modify `web/src/features/build/NfcTagsPage.test.tsx` (append tests)

**Interfaces:**
- Consumes `buildTagUrl`; `QrCodeSvg`, `CodesPrintSheet`; `CheckInMethodBadge`, `useCheckInMethodLabel`; `resolveCheckInRadiusM`; `useBases`, `useGame`.
- Produces the unchanged ids `nfc-tags-page` and `nfc-base-<id>`, plus `codes-method-filter`, `codes-method-<all|nfc|qr|location>`, `codes-qr-<baseId>`, `codes-print-all`.

- [ ] **Step 1: Write the failing test**

Append to `web/src/features/build/NfcTagsPage.test.tsx`:

```tsx
  it('renders each base according to its check-in method', async () => {
    resetBaseCounter()
    server.use(
      http.get('/api/games/:gameId/bases', () =>
        HttpResponse.json([
          createMockBase({ id: 'b1', name: 'Chapel', checkInMethod: 'NFC', nfcLinked: true }),
          createMockBase({ id: 'b2', name: 'Old mill', checkInMethod: 'QR', nfcToken: 'ab12cd34' }),
          createMockBase({
            id: 'b3',
            name: 'Fountain',
            checkInMethod: 'LOCATION',
            checkInRadiusM: 40,
          }),
        ]),
      ),
    )
    renderPage()

    expect(await screen.findByTestId('nfc-base-b1')).toHaveTextContent('NFC linked')
    expect(screen.getByTestId('codes-qr-b2')).toBeInTheDocument()
    expect(screen.getByTestId('nfc-base-b3')).toHaveTextContent(
      'No tag needed — this base unlocks by location.',
    )
    expect(screen.getByTestId('nfc-base-b3')).toHaveTextContent('40')
  })

  it('filters the list by check-in method', async () => {
    resetBaseCounter()
    server.use(
      http.get('/api/games/:gameId/bases', () =>
        HttpResponse.json([
          createMockBase({ id: 'b1', name: 'Chapel', checkInMethod: 'NFC' }),
          createMockBase({ id: 'b2', name: 'Old mill', checkInMethod: 'QR' }),
        ]),
      ),
    )
    renderPage()

    await screen.findByTestId('nfc-base-b1')
    await userEvent.click(screen.getByTestId('codes-method-qr'))

    expect(screen.queryByTestId('nfc-base-b1')).not.toBeInTheDocument()
    expect(screen.getByTestId('nfc-base-b2')).toBeInTheDocument()
  })

  it('prints one page per QR base with the base and game name', async () => {
    const print = vi.fn()
    vi.stubGlobal('print', print)
    resetBaseCounter()
    server.use(
      http.get('/api/games/:id', () =>
        HttpResponse.json(createMockGame({ id: 'g1', name: 'Night Trail' })),
      ),
      http.get('/api/games/:gameId/bases', () =>
        HttpResponse.json([
          createMockBase({ id: 'b1', name: 'Chapel', checkInMethod: 'NFC' }),
          createMockBase({ id: 'b2', name: 'Old mill', checkInMethod: 'QR', nfcToken: 'ab12cd34' }),
          createMockBase({ id: 'b3', name: 'Fountain', checkInMethod: 'QR', nfcToken: 'ef56gh78' }),
        ]),
      ),
    )
    renderPage()

    await userEvent.click(await screen.findByTestId('codes-print-all'))

    const pages = await screen.findAllByTestId('codes-print-page')
    expect(pages).toHaveLength(2)
    expect(pages[0]).toHaveTextContent('Night Trail')
    expect(print).toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('disables print-all when no base uses a QR code', async () => {
    resetBaseCounter()
    server.use(
      http.get('/api/games/:gameId/bases', () =>
        HttpResponse.json([createMockBase({ id: 'b1', name: 'Chapel', checkInMethod: 'NFC' })]),
      ),
    )
    renderPage()

    expect(await screen.findByTestId('codes-print-all')).toBeDisabled()
  })
```

Extend the imports at the top of that test file:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { createMockGame } from '@/test/factories/game'
```

- [ ] **Step 2: Run test to verify it fails**

```
bun run --cwd web test -- src/features/build/NfcTagsPage.test.tsx
```

Expected failure: `Unable to find an element by: [data-testid="codes-qr-b2"]`.

- [ ] **Step 3: Write minimal implementation**

Replace `web/src/features/build/NfcTagsPage.tsx` entirely:

```tsx
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import { ChevronLeft, Nfc, Printer } from 'lucide-react'
import { buildTagUrl } from '@pointfinder/game-core'
import { Alert, Button } from '@/components'
import { NfcLinkControl } from '@/components/nfc/NfcLinkControl'
import { CheckInMethodBadge, NfcStatusBadge, useCheckInMethodLabel } from '@/components/status'
import { QrCodeSvg } from '@/components/common/QrCodeSvg'
import { CodesPrintSheet } from '@/components/common/CodesPrintSheet'
import { EmptyState } from '@/components/feedback/EmptyState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { LoadingState } from '@/components/feedback/LoadingState'
import { useBases } from '@/hooks/queries/useBases'
import { useGame } from '@/hooks/queries/useGames'
import { isNative } from '@/platform'
import { CHECK_IN_METHODS, resolveCheckInRadiusM } from '@/types/checkIn'
import type { CheckInMethod } from '@/types/checkIn'

type Filter = 'all' | 'unlinked' | 'linked'
type MethodFilter = 'all' | CheckInMethod

/**
 * Operator tag and code management: every base, how it is checked into, the NFC
 * write control on the phone, an inline QR code with print, and a print-all
 * sheet. Codes render in the browser so the sheet works offline.
 */
export default function NfcTagsPage() {
  const { id: gameId = '' } = useParams()
  return <NfcTagsManager gameId={gameId} standalone />
}

export function NfcTagsManager({ gameId, standalone = false }: { gameId: string; standalone?: boolean }) {
  const { t } = useTranslation(undefined, { keyPrefix: 'playerApp.nfcWrite' })
  const { t: tCommon } = useTranslation()
  const methodLabel = useCheckInMethodLabel()
  const game = useGame(gameId)
  const bases = useBases(gameId)
  const [filter, setFilter] = useState<Filter>('all')
  const [methodFilter, setMethodFilter] = useState<MethodFilter>('all')
  const [printOpen, setPrintOpen] = useState(false)

  const defaultRadius = game.data?.defaultCheckInRadiusM

  const visible = useMemo(() => {
    const list = [...(bases.data ?? [])].sort((a, b) => Number(a.nfcLinked) - Number(b.nfcLinked) || a.name.localeCompare(b.name))
    const byMethod = methodFilter === 'all' ? list : list.filter((b) => b.checkInMethod === methodFilter)
    if (filter === 'all') return byMethod
    // Link state only means anything for NFC bases; the other methods are never "unlinked".
    return byMethod.filter((b) => b.checkInMethod !== 'NFC' || (filter === 'linked' ? b.nfcLinked : !b.nfcLinked))
  }, [bases.data, filter, methodFilter])

  const qrCodes = useMemo(
    () =>
      (bases.data ?? [])
        .filter((b) => b.checkInMethod === 'QR')
        .map((b) => ({ id: b.id, name: b.name, value: buildTagUrl(b.id, b.nfcToken) })),
    [bases.data],
  )

  const filters: Array<{ key: Filter; label: string }> = [
    { key: 'all', label: t('allBases') },
    { key: 'unlinked', label: t('onlyUnlinked') },
    { key: 'linked', label: t('onlyLinked') },
  ]

  const methodFilters: Array<{ key: MethodFilter; label: string }> = [
    { key: 'all', label: tCommon('checkIn.allMethods') },
    ...CHECK_IN_METHODS.map((m) => ({ key: m as MethodFilter, label: methodLabel(m) })),
  ]

  return (
    <div className={`${standalone ? 'mx-auto max-w-2xl' : 'w-full'} flex h-full flex-col gap-4 overflow-y-auto px-4 py-4`} data-testid="nfc-tags-page">
      {standalone && <Link to={`/game/${encodeURIComponent(gameId)}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground"><ChevronLeft className="h-4 w-4" aria-hidden /> {game.data?.name ?? tCommon('common.back')}</Link>}
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold leading-tight">{tCommon('checkIn.tagsAndCodes')}</h1>
        <p className="text-sm text-muted-foreground">{t('instructions')}</p>
      </header>
      {!isNative() && <Alert variant="info">{t('unavailable')}</Alert>}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-2" role="tablist" aria-label={t('title')}>
          {filters.map((f) => (
            <Button key={f.key} type="button" role="tab" aria-selected={filter === f.key} size="sm" variant={filter === f.key ? 'default' : 'outline'} onClick={() => setFilter(f.key)}>{f.label}</Button>
          ))}
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="ml-auto"
          data-testid="codes-print-all"
          disabled={qrCodes.length === 0}
          onClick={() => setPrintOpen(true)}
        >
          <Printer className="mr-2 h-4 w-4" aria-hidden />
          {tCommon('checkIn.printAll')}
        </Button>
      </div>
      <div className="flex flex-wrap gap-2" role="tablist" aria-label={tCommon('checkIn.method')} data-testid="codes-method-filter">
        {methodFilters.map((f) => (
          <Button
            key={f.key}
            type="button"
            role="tab"
            aria-selected={methodFilter === f.key}
            size="sm"
            variant={methodFilter === f.key ? 'default' : 'outline'}
            data-testid={`codes-method-${String(f.key).toLowerCase()}`}
            onClick={() => setMethodFilter(f.key)}
          >
            {f.label}
          </Button>
        ))}
      </div>
      {bases.isLoading && <LoadingState label={tCommon('common.loading')} />}
      {bases.error && <ErrorState title={tCommon('common.error')} retryLabel={tCommon('common.retry')} onRetry={() => void bases.refetch()} />}
      {bases.data && visible.length === 0 && <EmptyState icon={<Nfc className="h-6 w-6" aria-hidden />} title={qrCodes.length === 0 && methodFilter === 'QR' ? tCommon('checkIn.noQrBases') : t('noBases')} />}
      {visible.length > 0 && (
        <ul className="flex flex-col gap-2" aria-label={tCommon('checkIn.tagsAndCodes')}>
          {visible.map((base) => (
            <li key={base.id} className="flex flex-col gap-2 rounded-lg border border-border bg-card px-4 py-3" data-testid={`nfc-base-${base.id}`}>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{base.name}</p>
                  {base.hidden && <p className="text-xs text-muted-foreground">{tCommon('bases.hidden', { defaultValue: 'Hidden' })}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <CheckInMethodBadge method={base.checkInMethod} size="sm" />
                  {base.checkInMethod === 'NFC' && <NfcStatusBadge status={base.nfcLinked ? 'linked' : 'missing'} />}
                </div>
              </div>
              {base.checkInMethod === 'NFC' && isNative() && (
                <NfcLinkControl base={base} gameId={gameId} />
              )}
              {base.checkInMethod === 'QR' && (
                <div className="flex items-center gap-3">
                  <QrCodeSvg
                    value={buildTagUrl(base.id, base.nfcToken)}
                    size={96}
                    title={base.name}
                    data-testid={`codes-qr-${base.id}`}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    data-testid={`codes-print-${base.id}`}
                    onClick={() => setPrintOpen(true)}
                  >
                    {tCommon('checkIn.printAll')}
                  </Button>
                </div>
              )}
              {base.checkInMethod === 'LOCATION' && (
                <p className="text-xs text-muted-foreground">
                  {tCommon('checkIn.noTagNeeded')}{' '}
                  {tCommon('checkIn.radius')}: {resolveCheckInRadiusM(base.checkInRadiusM, defaultRadius)} m
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      <CodesPrintSheet
        open={printOpen}
        gameName={game.data?.name ?? ''}
        codes={qrCodes}
        onClose={() => setPrintOpen(false)}
      />
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

```
bun run --cwd web test -- src/features/build/NfcTagsPage.test.tsx
```

- [ ] **Step 5: Commit** — no commit yet.

---

### Task 9: Content drawer tab available in the browser

**Files:**
- Modify `web/src/features/build/ContentDrawer.tsx` (line 19 import, line 54 `visibleTabs`)
- Modify `web/src/features/build/ContentDrawer.test.tsx` (replace the native-only test)

**Interfaces:**
- Consumes the renamed value of the existing key `build.drawer.nfcTags` (Task 2). The tab id stays `nfc`.
- Produces no new ids; `tab-nfc` now renders in the browser too, because printing codes is a browser job.

- [ ] **Step 1: Write the failing test**

In `web/src/features/build/ContentDrawer.test.tsx`, replace the test `'puts NFC management in the native content panel'` with:

```tsx
  it('offers tags and codes in the browser as well as the phone app', () => {
    renderDrawer()
    expect(screen.getByTestId('tab-nfc')).toHaveTextContent('Tags & codes')

    platform.native = true
    const { container } = renderDrawer()
    expect(container.querySelector('[data-testid="tab-nfc"]')).toBeInTheDocument()
  })
```

- [ ] **Step 2: Run test to verify it fails**

```
bun run --cwd web test -- src/features/build/ContentDrawer.test.tsx
```

Expected failure: `Unable to find an element by: [data-testid="tab-nfc"]` (the tab is gated behind `isNativeEntry()`).

- [ ] **Step 3: Write minimal implementation**

In `web/src/features/build/ContentDrawer.tsx`, delete the now-unused import on line 19:

```tsx
import { isNativeEntry } from '@/platform/runtime'
```

and replace line 54:

```tsx
  const visibleTabs = tabs
```

with a comment explaining why the gate is gone:

```tsx
  // Tags & codes is no longer phone-only: QR codes are generated and printed
  // in the browser. The NFC write control inside the tab stays native-gated.
  const visibleTabs = tabs
```

- [ ] **Step 4: Run test to verify it passes**

```
bun run --cwd web test -- src/features/build/ContentDrawer.test.tsx
```

- [ ] **Step 5: Commit** — no commit yet.

---

### Task 10: Method-aware readiness rules

**Files:**
- Modify `web/src/features/build/ReadinessIndicator.tsx` (imports lines 1–11; `useReadinessChecks` lines 13–69; component lines 71–223)
- Modify `web/src/features/build/ReadinessIndicator.test.tsx` (update counts, add tests)

**Interfaces:**
- Consumes `distanceM` from `@pointfinder/game-core`; `useGame`; `isValidCheckInRadiusM`, `resolveCheckInRadiusM`.
- Produces the readiness rows `readiness.nfcLinked`, `readiness.locationCoords`, `readiness.locationRadius`, `readiness.locationOverlap` and the note `readiness.legacyAppsNote` under test id `readiness-legacy-note`. Existing ids `readiness-indicator`, `readiness-toggle`, `readiness-ring`, `readiness-count`, `readiness-checklist`, `check-pass`, `check-fail`, `go-live-btn` are unchanged.

- [ ] **Step 1: Write the failing test**

In `web/src/features/build/ReadinessIndicator.test.tsx`, change the fully-ready count assertion from `'7/7'` to `'9/9'`, then append these tests inside `describe('ReadinessIndicator', ...)`:

```tsx
  it('passes NFC readiness vacuously when no base uses NFC', async () => {
    const user = userEvent.setup()
    server.use(
      http.get('/api/games/:gameId/bases', () =>
        HttpResponse.json([
          createMockBase({ id: 'b1', checkInMethod: 'QR', nfcLinked: false, hidden: false }),
        ]),
      ),
      http.get('/api/games/:gameId/challenges', () =>
        HttpResponse.json([createMockChallenge({ id: 'c1' })]),
      ),
      http.get('/api/games/:gameId/teams', () => HttpResponse.json([createMockTeam({ id: 't1' })])),
      http.get('/api/games/:gameId/assignments', () =>
        HttpResponse.json([createMockAssignment({ baseId: 'b1', challengeId: 'c1' })]),
      ),
      http.get('/api/games/:gameId/team-variables/completeness', () =>
        HttpResponse.json({ complete: true, errors: [] }),
      ),
    )

    render(createElement(ReadinessIndicator, { gameId: 'game-1' }), { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByTestId('readiness-count')).toHaveTextContent('9/9')
    })

    await user.click(screen.getByTestId('readiness-toggle'))
    expect(await screen.findByText('NFC bases linked (0/0)')).toBeInTheDocument()
    expect(screen.getByTestId('readiness-legacy-note')).toHaveTextContent(
      'The legacy iOS and Android apps cannot complete QR or location bases.',
    )
  })

  it('fails location bases sitting at 0,0 and flags overlapping rings', async () => {
    const user = userEvent.setup()
    server.use(
      http.get('/api/games/:id', () =>
        HttpResponse.json(createMockGame({ id: 'game-1', defaultCheckInRadiusM: 100 })),
      ),
      http.get('/api/games/:gameId/bases', () =>
        HttpResponse.json([
          createMockBase({ id: 'b1', checkInMethod: 'LOCATION', lat: 0, lng: 0 }),
          createMockBase({ id: 'b2', checkInMethod: 'LOCATION', lat: 38.7, lng: -9.1 }),
          createMockBase({ id: 'b3', checkInMethod: 'LOCATION', lat: 38.7001, lng: -9.1001 }),
        ]),
      ),
      http.get('/api/games/:gameId/challenges', () =>
        HttpResponse.json([createMockChallenge({ id: 'c1' })]),
      ),
      http.get('/api/games/:gameId/teams', () => HttpResponse.json([createMockTeam({ id: 't1' })])),
      http.get('/api/games/:gameId/assignments', () => HttpResponse.json([])),
      http.get('/api/games/:gameId/team-variables/completeness', () =>
        HttpResponse.json({ complete: true, errors: [] }),
      ),
    )

    render(createElement(ReadinessIndicator, { gameId: 'game-1' }), { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByTestId('readiness-toggle')).toBeInTheDocument()
    })
    await user.click(screen.getByTestId('readiness-toggle'))

    expect(await screen.findByText('Location bases have coordinates (2/3)')).toBeInTheDocument()
    expect(screen.getByText('Location rings do not overlap')).toBeInTheDocument()
    expect(screen.queryByTestId('go-live-btn')).not.toBeInTheDocument()
  })

  it('rejects a location radius outside 5..200', async () => {
    const user = userEvent.setup()
    server.use(
      http.get('/api/games/:gameId/bases', () =>
        HttpResponse.json([
          createMockBase({
            id: 'b1',
            checkInMethod: 'LOCATION',
            lat: 38.7,
            lng: -9.1,
            checkInRadiusM: 400,
          }),
        ]),
      ),
      http.get('/api/games/:gameId/challenges', () =>
        HttpResponse.json([createMockChallenge({ id: 'c1' })]),
      ),
      http.get('/api/games/:gameId/teams', () => HttpResponse.json([createMockTeam({ id: 't1' })])),
      http.get('/api/games/:gameId/assignments', () => HttpResponse.json([])),
      http.get('/api/games/:gameId/team-variables/completeness', () =>
        HttpResponse.json({ complete: true, errors: [] }),
      ),
    )

    render(createElement(ReadinessIndicator, { gameId: 'game-1' }), { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByTestId('readiness-toggle')).toBeInTheDocument()
    })
    await user.click(screen.getByTestId('readiness-toggle'))

    expect(
      await screen.findByText('Location radii between 5 and 200 m (0/1)'),
    ).toBeInTheDocument()
  })

  it('hides the legacy-apps note when every base is NFC', async () => {
    const user = userEvent.setup()
    setupFullyReadyHandlers()

    render(createElement(ReadinessIndicator, { gameId: 'game-1' }), { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByTestId('readiness-toggle')).toBeInTheDocument()
    })
    await user.click(screen.getByTestId('readiness-toggle'))

    await waitFor(() => {
      expect(screen.getByTestId('readiness-checklist')).toBeInTheDocument()
    })
    expect(screen.queryByTestId('readiness-legacy-note')).not.toBeInTheDocument()
  })
```

Add the game factory import at the top of that test file:

```tsx
import { createMockGame } from '@/test/factories/game'
```

Also update the `'expands checklist on click'` test: replace the assertion `expect(screen.getByText('All bases have NFC')).toBeInTheDocument()` with:

```tsx
    expect(screen.getByText('NFC bases linked (1/1)')).toBeInTheDocument()
```

- [ ] **Step 2: Run test to verify it fails**

```
bun run --cwd web test -- src/features/build/ReadinessIndicator.test.tsx
```

Expected failure: `expected element to have text content 9/9, but had 7/7` and `Unable to find an element with the text: NFC bases linked (1/1)`.

- [ ] **Step 3: Write minimal implementation**

In `web/src/features/build/ReadinessIndicator.tsx`, replace the imports and `useReadinessChecks` (lines 1–69) with:

```tsx
import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { CheckCircle, Info, XCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { distanceM } from '@pointfinder/game-core'
import { GlassPanel } from '@/components/layout/GlassPanel'
import { useBases } from '@/hooks/queries/useBases'
import { useChallenges } from '@/hooks/queries/useChallenges'
import { useGame } from '@/hooks/queries/useGames'
import { useTeams } from '@/hooks/queries/useTeams'
import { useAssignments } from '@/hooks/queries/useAssignments'
import { useVariableCompleteness } from '@/hooks/queries/useVariables'
import { useUpdateGameStatus } from '@/hooks/mutations/useGameMutations'
import { useWorkspaceStore } from '@/stores/workspace'
import { isValidCheckInRadiusM, resolveCheckInRadiusM } from '@/types/checkIn'

interface ReadinessCheck {
  label: string
  passed: boolean
}

interface ReadinessSummary {
  checks: ReadinessCheck[]
  /** True when any base uses a method the legacy Swift/Compose apps cannot play. */
  legacyNote: boolean
}

function useReadinessChecks(gameId: string): ReadinessSummary {
  const { t } = useTranslation()
  const { data: game } = useGame(gameId)
  const { data: bases } = useBases(gameId)
  const { data: challenges } = useChallenges(gameId)
  const { data: teams } = useTeams(gameId)
  const { data: assignments } = useAssignments(gameId)
  const { data: completeness } = useVariableCompleteness(gameId)

  const defaultRadius = game?.defaultCheckInRadiusM

  return useMemo(() => {
    const baseList = bases ?? []
    const challengeList = challenges ?? []
    const teamList = teams ?? []
    const assignmentList = assignments ?? []

    const baseIds = new Set(baseList.map((b) => b.id))
    const challengeIds = new Set(challengeList.map((c) => c.id))

    // NFC bases must carry a written tag. QR bases always pass — the code is
    // generated, not provisioned.
    const nfcBases = baseList.filter((b) => b.checkInMethod === 'NFC' && !b.hidden)
    const nfcLinkedCount = nfcBases.filter((b) => b.nfcLinked).length

    const locationBases = baseList.filter((b) => b.checkInMethod === 'LOCATION')
    const locatedCount = locationBases.filter((b) => b.lat !== 0 || b.lng !== 0).length
    const radiusOkCount = locationBases.filter((b) =>
      isValidCheckInRadiusM(resolveCheckInRadiusM(b.checkInRadiusM, defaultRadius)),
    ).length

    // Two rings overlap when the bases are closer than the sum of their radii;
    // a player standing in the overlap could unlock either base.
    let overlapping = false
    for (let i = 0; i < locationBases.length && !overlapping; i++) {
      for (let j = i + 1; j < locationBases.length; j++) {
        const a = locationBases[i]
        const b = locationBases[j]
        const ra = resolveCheckInRadiusM(a.checkInRadiusM, defaultRadius)
        const rb = resolveCheckInRadiusM(b.checkInRadiusM, defaultRadius)
        if (distanceM(a, b) < ra + rb) {
          overlapping = true
          break
        }
      }
    }

    const checks: ReadinessCheck[] = [
      { label: 'At least one base', passed: baseList.length > 0 },
      { label: 'At least one challenge', passed: challengeList.length > 0 },
      { label: 'At least one team', passed: teamList.length > 0 },
      {
        label: t('readiness.nfcLinked', { linked: nfcLinkedCount, total: nfcBases.length }),
        passed: nfcLinkedCount === nfcBases.length,
      },
      {
        label: 'All assignments valid',
        passed: assignmentList.every(
          (a) => baseIds.has(a.baseId) && challengeIds.has(a.challengeId),
        ),
      },
      {
        label: t('readiness.locationCoords', { ok: locatedCount, total: locationBases.length }),
        passed: locatedCount === locationBases.length,
      },
      {
        label: t('readiness.locationRadius', { ok: radiusOkCount, total: locationBases.length }),
        passed: radiusOkCount === locationBases.length,
      },
      { label: t('readiness.locationOverlap'), passed: !overlapping },
      { label: 'Variables complete', passed: completeness?.complete ?? true },
    ]

    return {
      checks,
      legacyNote: baseList.some((b) => b.checkInMethod !== 'NFC'),
    }
  }, [bases, challenges, teams, assignments, completeness, defaultRadius, t])
}
```

In the component body, replace `const checks = useReadinessChecks(gameId)` with:

```tsx
  const { t } = useTranslation()
  const { checks, legacyNote } = useReadinessChecks(gameId)
```

and insert the note inside the expanded checklist, immediately after the `{checks.map(...)}` block and before the `{allPassed && (` block:

```tsx
                  {legacyNote && (
                    <div
                      className="flex items-start gap-2 pt-1"
                      data-testid="readiness-legacy-note"
                    >
                      <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <span className="text-xs text-muted-foreground">
                        {t('readiness.legacyAppsNote')}
                      </span>
                    </div>
                  )}
```

- [ ] **Step 4: Run test to verify it passes**

```
bun run --cwd web test -- src/features/build/ReadinessIndicator.test.tsx
```

- [ ] **Step 5: Commit** — no commit yet.

---

### Task 11: Command view — method icons, claim badge, proof detail

**Files:**
- Modify `web/src/features/command/ActivityFeed.tsx` (imports lines 1–20; `EventCard` lines 26–110; `ActivityFeed` lines 112–130)
- Modify `web/src/features/command/Leaderboard.tsx` (imports lines 1–14; body lines 39–61; entry render lines 99–140)
- Modify `web/src/features/command/TeamInspector.tsx` (imports lines 1–17; body lines 28–52; children lines 116–126)
- Modify `web/src/features/command/ActivityFeed.test.tsx` (append tests)
- Modify `web/src/test/msw/handlers/monitoring.ts` (add metadata and proof fields to the default fixtures)

**Interfaces:**
- Consumes `wideRingM` from `@pointfinder/game-core` (Phase 2 `geofence.ts`); `CheckInMethodIcon`, `CheckInVerificationBadge`; `useProgress`, `useBases`, `useGame`; `resolveCheckInRadiusM`.
- Produces test ids `activity-method-<eventId>`, `activity-claimed-badge`, `activity-teammates-<eventId>`, `leaderboard-method-<teamId>`, `team-checkin-proof`, `team-checkin-proof-<baseId>`, `proof-teammate-<playerId>`.

- [ ] **Step 1: Write the failing test**

Append to `web/src/features/command/ActivityFeed.test.tsx`:

```tsx
describe('ActivityFeed check-in methods', () => {
  it('marks each check-in with its method icon', async () => {
    server.use(
      http.get('/api/games/:gameId/monitoring/activity', () =>
        HttpResponse.json([
          {
            id: 'event-qr',
            gameId: 'game-1',
            type: 'check_in',
            teamId: 'team-1',
            baseId: 'base-1',
            message: 'Team Alpha checked in at Base 1',
            timestamp: new Date().toISOString(),
            metadata: { method: 'QR', verification: 'VERIFIED' },
          },
        ] satisfies ActivityEvent[]),
      ),
    )

    render(createElement(ActivityFeed, { gameId: 'game-1' }), { wrapper: createWrapper() })

    const icon = await screen.findByTestId('activity-method-event-qr')
    expect(icon).toHaveAttribute('aria-label', 'QR code')
    expect(screen.queryByTestId('activity-claimed-badge')).not.toBeInTheDocument()
  })

  it('flags a claimed check-in with the teammate summary for the wide ring', async () => {
    server.use(
      http.get('/api/games/:gameId/bases', () =>
        HttpResponse.json([
          createMockBase({
            id: 'base-1',
            checkInMethod: 'LOCATION',
            checkInRadiusM: 20,
            lat: 38.7,
            lng: -9.1,
          }),
        ]),
      ),
      http.get('/api/games/:gameId/monitoring/activity', () =>
        HttpResponse.json([
          {
            id: 'event-claim',
            gameId: 'game-1',
            type: 'check_in',
            teamId: 'team-1',
            baseId: 'base-1',
            message: 'Team Alpha claimed Base 1',
            timestamp: new Date().toISOString(),
            metadata: {
              method: 'LOCATION',
              verification: 'CLAIMED',
              teammatesInRing: 2,
              teammatesTotal: 4,
            },
          },
        ] satisfies ActivityEvent[]),
      ),
    )

    render(createElement(ActivityFeed, { gameId: 'game-1' }), { wrapper: createWrapper() })

    expect(await screen.findByTestId('activity-claimed-badge')).toHaveTextContent('Claimed')
    // wideRingM(20) === max(60, 50) === 60
    expect(screen.getByTestId('activity-teammates-event-claim')).toHaveTextContent(
      '2 of 4 teammates within 60 m',
    )
  })

  it('renders a pre-feature check-in without a method icon', async () => {
    server.use(
      http.get('/api/games/:gameId/monitoring/activity', () =>
        HttpResponse.json([
          {
            id: 'event-legacy',
            gameId: 'game-1',
            type: 'check_in',
            teamId: 'team-1',
            baseId: 'base-1',
            message: 'Team Alpha checked in at Base 1',
            timestamp: new Date().toISOString(),
          },
        ] satisfies ActivityEvent[]),
      ),
    )

    render(createElement(ActivityFeed, { gameId: 'game-1' }), { wrapper: createWrapper() })

    await screen.findByText('Team Alpha checked in at Base 1')
    expect(screen.queryByTestId('activity-method-event-legacy')).not.toBeInTheDocument()
  })
})
```

Add the base factory import to that test file:

```tsx
import { createMockBase } from '@/test/factories/base'
```

- [ ] **Step 2: Run test to verify it fails**

```
bun run --cwd web test -- src/features/command/ActivityFeed.test.tsx
```

Expected failure: `Unable to find an element by: [data-testid="activity-method-event-qr"]`.

- [ ] **Step 3: Write minimal implementation**

In `web/src/features/command/ActivityFeed.tsx`, extend the imports:

```tsx
import { useTranslation } from 'react-i18next'
import { wideRingM } from '@pointfinder/game-core'
import { CheckInMethodIcon, CheckInVerificationBadge } from '@/components/status'
import { useBases } from '@/hooks/queries/useBases'
import { useGame } from '@/hooks/queries/useGames'
import { resolveCheckInRadiusM } from '@/types/checkIn'
```

Change the `EventCard` signature and header block. Replace lines 26–63 (`function EventCard({ ... })` through the closing `</p>` of the message) with:

```tsx
function EventCard({
  event,
  gameId,
  ringMeters,
}: {
  event: ActivityEvent
  gameId: string
  /** Wide-ring radius for this event's base, used by the claim summary. */
  ringMeters: number | null
}) {
  const { t } = useTranslation()
  const [acted, setActed] = useState(false)
  const { data: submissions } = useSubmissions(gameId)
  const reviewMutation = useReviewSubmission(gameId)

  const matchingPending = useMemo(() => {
    if (event.type !== 'submission' || !submissions) return null
    return submissions.find(
      (s) =>
        s.status === 'pending' &&
        s.teamId === event.teamId &&
        s.baseId === event.baseId &&
        s.challengeId === event.challengeId,
    )
  }, [submissions, event])

  const showActions = matchingPending && !acted
  const meta = event.type === 'check_in' ? event.metadata : null
  const claimed = meta?.verification === 'CLAIMED'

  return (
    <div
      data-testid="activity-event"
      className={`border-b border-l-2 border-border/30 px-3 py-2 ${activityEventBorderClass[event.type]}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <ActivityEventBadge status={event.type} />
          {meta?.method && (
            <CheckInMethodIcon
              method={meta.method}
              className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
              data-testid={`activity-method-${event.id}`}
            />
          )}
          {meta?.verification && meta.verification !== 'VERIFIED' && (
            <CheckInVerificationBadge
              verification={meta.verification}
              size="sm"
              data-testid={claimed ? 'activity-claimed-badge' : undefined}
            />
          )}
        </div>
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {relativeTime(event.timestamp)}
        </span>
      </div>
      <p className="text-sm text-muted-foreground mt-0.5 leading-snug">
        {event.message}
      </p>
      {claimed && typeof meta?.teammatesTotal === 'number' && ringMeters !== null && (
        <p
          data-testid={`activity-teammates-${event.id}`}
          className="mt-0.5 text-xs text-warning leading-snug"
        >
          {t('checkIn.teammatesInRing', {
            inside: meta.teammatesInRing ?? 0,
            total: meta.teammatesTotal,
            meters: ringMeters,
          })}
        </p>
      )}
```

In the `ActivityFeed` component body, add the base lookup after `const { data: teams = [] } = useTeams(gameId)`:

```tsx
  const { data: bases = [] } = useBases(gameId)
  const { data: game } = useGame(gameId)

  // The server accepts a claim inside max(3 * radius, 50) m; mirror it here so
  // the operator sees the same number the player was judged against.
  const ringByBaseId = useMemo(() => {
    const map = new Map<string, number>()
    for (const base of bases) {
      if (base.checkInMethod !== 'LOCATION') continue
      const radius = resolveCheckInRadiusM(base.checkInRadiusM, game?.defaultCheckInRadiusM)
      map.set(base.id, Math.round(wideRingM(radius)))
    }
    return map
  }, [bases, game?.defaultCheckInRadiusM])
```

and pass it to each card — replace the render call:

```tsx
          filteredEvents.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              gameId={gameId}
              ringMeters={event.baseId ? (ringByBaseId.get(event.baseId) ?? null) : null}
            />
          ))
```

In `web/src/features/command/Leaderboard.tsx`, extend the imports:

```tsx
import { CheckInMethodIcon } from '@/components/status'
import { useProgress } from '@/hooks/queries/useMonitoring'
import type { CheckInMethod } from '@/types/checkIn'
```

Add the derived map after `const teamLastSeen = useMemo(...)`:

```tsx
  const { data: progress = [] } = useProgress(gameId)

  // Method of each team's most recent check-in, so an operator can see at a
  // glance how a team is proving arrival.
  const teamLastMethod = useMemo(() => {
    const best = new Map<string, { method: CheckInMethod; at: string }>()
    for (const row of progress) {
      if (!row.checkInMethod || !row.checkedInAt) continue
      const current = best.get(row.teamId)
      if (!current || row.checkedInAt > current.at) {
        best.set(row.teamId, { method: row.checkInMethod, at: row.checkedInAt })
      }
    }
    return best
  }, [progress])
```

Insert the icon inside each entry, immediately before the location-signal dot:

```tsx
                  {teamLastMethod.get(entry.teamId) && (
                    <CheckInMethodIcon
                      method={teamLastMethod.get(entry.teamId)!.method}
                      className="h-3 w-3 shrink-0 text-muted-foreground"
                      data-testid={`leaderboard-method-${entry.teamId}`}
                    />
                  )}
```

In `web/src/features/command/TeamInspector.tsx`, extend the imports:

```tsx
import { useTranslation } from 'react-i18next'
import { CheckInMethodBadge, CheckInVerificationBadge } from '@/components/status'
import { useProgress } from '@/hooks/queries/useMonitoring'
```

Add the derived rows after `const { data: leaderboard = [] } = useLeaderboard(gameId)`:

```tsx
  const { t } = useTranslation()
  const { data: progress = [] } = useProgress(gameId)

  const proofRows = useMemo(
    () =>
      progress.filter((row) => row.teamId === inspectedTeamId && row.checkInMethod !== undefined),
    [progress, inspectedTeamId],
  )
```

and add `useMemo` to the React import on line 1:

```tsx
import { useCallback, useEffect, useMemo, useState } from 'react'
```

Insert this block inside the `<div className="space-y-3">` in the panel children, immediately after the rescue-actions header row:

```tsx
          {proofRows.length > 0 && (
            <div className="space-y-2" data-testid="team-checkin-proof">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t('checkIn.proofTitle')}
              </p>
              {proofRows.map((row) => {
                const base = bases.find((b) => b.id === row.baseId)
                const snapshot = row.teamPositionsSnapshot ?? []
                return (
                  <div
                    key={row.baseId}
                    data-testid={`team-checkin-proof-${row.baseId}`}
                    className="space-y-1 rounded-lg border border-border/50 px-2 py-1.5"
                  >
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="min-w-0 flex-1 truncate text-xs text-foreground">
                        {base?.name ?? row.baseId}
                      </span>
                      {row.checkInMethod && <CheckInMethodBadge method={row.checkInMethod} size="sm" />}
                      {row.verification && (
                        <CheckInVerificationBadge verification={row.verification} size="sm" />
                      )}
                    </div>
                    {typeof row.proofDistanceM === 'number' && (
                      <p className="text-[11px] text-muted-foreground">
                        {t('checkIn.proofDistance', { meters: Math.round(row.proofDistanceM) })}
                      </p>
                    )}
                    {typeof row.proofAccuracyM === 'number' && (
                      <p className="text-[11px] text-muted-foreground">
                        {t('checkIn.proofAccuracy', { meters: Math.round(row.proofAccuracyM) })}
                      </p>
                    )}
                    {row.verification === 'CLAIMED' && (
                      <>
                        <p className="text-[11px] font-medium text-muted-foreground">
                          {t('checkIn.proofTeammates')}
                        </p>
                        {snapshot.length === 0 ? (
                          <p className="text-[11px] text-muted-foreground">
                            {t('checkIn.proofNoSnapshot')}
                          </p>
                        ) : (
                          <ul className="space-y-0.5">
                            {snapshot.map((entry) => (
                              <li
                                key={entry.playerId}
                                data-testid={`proof-teammate-${entry.playerId}`}
                                className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground"
                              >
                                <span className="min-w-0 truncate">{entry.displayName}</span>
                                <span className="shrink-0 tabular-nums">
                                  {typeof entry.distanceM === 'number'
                                    ? `${Math.round(entry.distanceM)} m`
                                    : '—'}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          )}
```

In `web/src/test/msw/handlers/monitoring.ts`, extend the default check-in event and the first progress row so every consumer sees realistic data. Replace the `event-1` object with:

```ts
      {
        id: 'event-1',
        gameId: 'game-1',
        type: 'check_in',
        teamId: 'team-1',
        baseId: 'base-1',
        message: 'Team Alpha checked in at Base 1',
        timestamp: new Date().toISOString(),
        metadata: { method: 'NFC', verification: 'VERIFIED' },
      },
```

and the `base-1` progress row with:

```ts
      {
        baseId: 'base-1',
        teamId: 'team-1',
        status: 'completed',
        checkedInAt: new Date().toISOString(),
        challengeId: 'challenge-1',
        submissionStatus: 'approved',
        checkInMethod: 'NFC',
        verification: 'VERIFIED',
      },
```

- [ ] **Step 4: Run test to verify it passes**

```
bun run --cwd web test -- src/features/command/ActivityFeed.test.tsx src/features/command/Leaderboard.test.tsx
```

- [ ] **Step 5: Commit** — no commit yet.

---

### Task 12: Visual harness, visual-system docs, phase verification and the atomic commit

**Files:**
- Modify `web/src/features/dev/VisualHarnessPage.tsx` (imports around lines 1–48; add one `HarnessSection` inside the `grid` after the "Semantic status and sync" sections)
- Modify `docs/visual-system/component-inventory.md` (append a new dated group at the end)
- Modify `docs/visual-system/preview-matrix.md` (add rows to the table)
- Test: full phase gate

**Interfaces:**
- Consumes `CheckInMethodBadge`, `CheckInVerificationBadge`, `QrCodeSvg`, `CHECK_IN_METHODS`.
- Produces the harness scenario id `harness-checkin-methods` and the documentation entries required by the visual system.

- [ ] **Step 1: Write the failing test**

Create `web/src/features/dev/VisualHarnessPage.checkin.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { VisualHarnessPage } from './VisualHarnessPage'

vi.mock('@/components/map/LocationPicker', () => ({
  LocationPicker: () => <div data-testid="location-picker-mock" />,
}))

describe('VisualHarnessPage check-in scenario', () => {
  it('previews every method badge, the claim badge and a QR code', () => {
    render(<VisualHarnessPage />)

    const section = screen.getByTestId('harness-checkin-methods')
    expect(section).toHaveTextContent('NFC')
    expect(section).toHaveTextContent('QR code')
    expect(section).toHaveTextContent('Location')
    expect(section).toHaveTextContent('Claimed')
    expect(section).toHaveTextContent('Operator')
    expect(section.querySelector('[data-testid="harness-qr"]')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```
bun run --cwd web test -- src/features/dev/VisualHarnessPage.checkin.test.tsx
```

Expected failure: `Unable to find an element by: [data-testid="harness-checkin-methods"]`.

- [ ] **Step 3: Write minimal implementation**

In `web/src/features/dev/VisualHarnessPage.tsx`, extend the imports:

```tsx
import { CheckInMethodBadge, CheckInVerificationBadge } from '@/components/status'
import { QrCodeSvg } from '@/components/common/QrCodeSvg'
import { CHECK_IN_METHODS } from '@/types/checkIn'
import type { CheckInVerification } from '@/types/checkIn'
```

Add the constant next to the other scenario arrays (after `const nfcStatuses: NfcStatus[] = ['linked', 'missing']`):

```tsx
const checkInVerifications: CheckInVerification[] = ['VERIFIED', 'CLAIMED', 'OPERATOR']
```

Add this section inside the `grid` container, immediately after the `<HarnessSection title="Buttons">` block:

```tsx
          <HarnessSection title="Check-in methods, claims and printable codes">
            <div className="space-y-3" data-testid="harness-checkin-methods">
              <div className="flex flex-wrap items-center gap-2">
                {CHECK_IN_METHODS.map((method) => (
                  <CheckInMethodBadge key={method} method={method} />
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {checkInVerifications.map((verification) => (
                  <CheckInVerificationBadge key={verification} verification={verification} />
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                2 of 4 teammates within 60 m
              </p>
              <QrCodeSvg
                value="https://pointfinder.pt/tag/0d2f1c9e-0000-4000-8000-000000000001?t=ab12cd34"
                size={128}
                title="Preview code"
                data-testid="harness-qr"
              />
            </div>
          </HarnessSection>
```

Append to `docs/visual-system/component-inventory.md`:

```markdown
## Check-in methods (2026-09-05)

Component: CheckInMethodBadge
Status: canonical
Location: `web/src/components/status/CheckInMethodBadge.tsx`
Modes: Operator Setup, Operator Command
States: NFC, QR, LOCATION; badge and icon-only variants; small and medium sizes
Notes: New status meaning for this slice — NFC is info/blue (tag and base signal),
QR is override/indigo (secondary category), LOCATION is success/green (presence
proven). Icons are lucide `Nfc`, `QrCode` and `MapPin`; they are intentionally
not added to `design-system/icons.json`, whose generators also feed the legacy
Swift and Compose apps that cannot play QR or location bases. Icon-only usage
always carries a localized `aria-label`. Preview: `/dev/visual-system`.
See `docs/specs/2026-09-05-check-in-methods-design.md`.

Component: CheckInVerificationBadge
Status: canonical
Location: `web/src/components/status/CheckInMethodBadge.tsx`
Modes: Operator Command
States: claimed (warning/amber), operator (override/indigo); verified renders nothing
Notes: A VERIFIED row is the norm and would add noise to every feed line, so only
the exceptional verifications are shown. Sits beside `ActivityEventBadge` in the
live feed and beside the method badge in the team inspector proof block.
Preview: `/dev/visual-system`.

Component: QrCodeSvg
Status: canonical
Location: `web/src/components/common/QrCodeSvg.tsx`
Modes: Operator Setup
States: encoded, unencodable value (renders nothing), sized, titled/decorative
Notes: Drawn as real SVG elements from the `qrcode` package's synchronous bit
matrix, so nothing is injected as raw HTML and codes render offline. Paints
literal black on white rather than semantic tokens because a QR code must stay
dark-on-light in both themes and on paper — recorded in
`design-system/decisions.md`. Preview: `/dev/visual-system`.

Component: CodesPrintSheet
Status: canonical
Location: `web/src/components/common/CodesPrintSheet.tsx`
Modes: Operator Setup
States: closed, open with one page per code, empty code list, Escape/close chrome
Notes: Body-level portal with a scoped print rule so a single sheet can hide the
rest of the operator workspace without touching the global stylesheet. One page
per code carrying the base name, the code, and the game name. Used by the base
detail (single code) and the Tags & codes tab (all QR bases).

Component: LocationPicker radius ring
Status: canonical
Location: `web/src/components/map/LocationPicker.tsx`, `web/src/components/map/circleGeoJson.ts`
Modes: Operator Setup
States: no radius, radius ring, unplaced base (no ring)
Notes: The check-in radius is drawn as a faint info-toned fill and line from a
GeoJSON polygon approximation. Geometry is a pure, tested function; the map
component stays a thin renderer.
```

Append these rows to the table in `docs/visual-system/preview-matrix.md` (before the trailing paragraph):

```markdown
| Check-in method badges and claim states | yes | pending | n/a |
| Printable QR codes and codes sheet | yes | n/a | n/a |
| Operator check-in radius ring on the location picker | partial | n/a | n/a |
| Operator readiness rows per check-in method | partial | pending | pending |
```

and extend the trailing paragraph with one sentence:

```markdown
Check-in method rows are marked `n/a` for the legacy Swift and Compose apps: those apps keep working for NFC bases only and receive no QR or location UI.
```

- [ ] **Step 4: Run test to verify it passes**

```
bun run --cwd web test -- src/features/dev/VisualHarnessPage.checkin.test.tsx
```

- [ ] **Step 5: Commit** — the phase's ONE atomic commit.

Run the full phase gate first and read every output before claiming success:

```
bun run --cwd web typecheck
bun run --cwd web lint
bun run --cwd web test
bun run --cwd packages/i18n test
make design-system-check
```

Then stage only source, locale and documentation changes — never this plan file, never anything under `docs/specs/`:

```
git add web/src packages/i18n/src/locales docs/visual-system/component-inventory.md docs/visual-system/preview-matrix.md design-system/decisions.md
git status --short
```

Confirm `git status --short` lists no file under `docs/superpowers/` or `docs/specs/`, then commit:

```
git commit -m "feat(web): operator check-in method setup, codes sheet and readiness rules" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```
