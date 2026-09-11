# Check-in methods — Phase 2: Shared packages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Teach the shared TypeScript packages the three check-in methods — typed proofs, geofence acceptance rules, a pure arrival detector, a queue that stores whole proofs — and rewire the web player just enough to keep the app compiling and green.

**Architecture:** `packages/game-core` owns the domain: `proof.ts` maps every proof variant onto the wire body, `geofence.ts` mirrors the server's acceptance, ring and dwell constants exactly, `arrival.ts` is a pure fix-in/candidates-in detector with no timers or I/O, `queue.ts` persists the whole `CheckInProof` and reads pre-existing `nfcToken` rows as NFC proofs. `packages/api` carries the contract only: the discriminated `CheckInRequest`, the `checkInMethod`/`checkInRadiusM` fields on `Base` and `BaseProgress`, and the new `CheckInResponse` fields. The web wiring in this phase is deliberately thin: the queue executor maps a stored proof to a request, `usePlayerGame().checkIn` takes a proof, and `BaseScreen` passes `{type:'nfc', token}` where it passes a bare token today. Location and QR player surfaces are Phase 4; operator surfaces are Phase 3.

**Tech Stack:** TypeScript 5.9 (strict, `noUncheckedIndexedAccess` in `packages/*`), Vitest 4, React 19 + React Query 5 (web), MSW 2 for fixtures, Bun workspaces.

## Global Constraints

- Names in `/private/tmp/claude-501/-Users-xmedavid-dev-dbvnfc/4f6929c5-92c6-4d9d-bac0-2a52320e70fd/scratchpad/checkin-contract.md` are mandatory; do not invent alternatives.
- Verification constants, mirrored from the server: `AUTO_ACCURACY_CAP_M = 50`, `ACCURACY_CREDIT_CAP_M = 30`, `CLAIM_ACCURACY_CAP_M = 100`.
- Dwell constants: `DWELL_MIN_FIXES = 4`, `DWELL_MIN_SPAN_MS = 60_000`, `DWELL_SAMPLE_INTERVAL_MS = 10_000`, `DWELL_BUFFER_MAX_MS = 300_000`, `DWELL_MAX_GAP_TO_MAIN_MS = 120_000`.
- Auto acceptance rule: `distance <= radius + min(accuracy, 30)`. Wide ring: `R = max(3 * radius, 50)`. Arrival retry window: `ARRIVAL_RETRY_MS = 30_000`.
- Default check-in radius when nothing resolves it: 15 m (`DEFAULT_CHECK_IN_RADIUS_M`).
- `distanceM` already exists in `packages/game-core/src/location.ts`. Reuse it; never write a second haversine.
- `packages/api` must not depend on `@pointfinder/game-core`. Define `CheckInMethod`, `CheckInVerification` and `CheckInRequest` locally in `packages/api/src/types.ts`.
- `UnsupportedProofError` and `PresenceProvider` are deleted. The only consumer today is `packages/game-core/src/proof.test.ts`.
- Type names: `CheckInProof`, `DwellFix`, `CheckInMethod`, `CheckInRequestBody`, `ArrivalCandidate`, `ArrivalState`, `AutoAcceptance`. Functions: `toCheckInRequest`, `proofTypeForMethod`, `wideRingM`, `autoAccepts`, `insideWideRing`, `dwellSatisfied`, `pushDwellSample`, `emptyArrivalState`, `evaluateArrival`, `normalizeAction`.
- Never rename existing test IDs, routes, API paths, accessibility ids, or MSW error codes. `NFC_TOKEN_REQUIRED` and `NFC_TOKEN_MISMATCH` stay exactly as they are in fixtures.
- `web/tsconfig.app.json` excludes `*.test.ts`, `*.test.tsx` and `*.stories.tsx`, so `bun run --cwd web typecheck` does not cover them. `packages/game-core/tsconfig.json` and `packages/api/tsconfig.json` include `src`, so their tests **are** typechecked.
- Focused test commands: `bun run --cwd packages/game-core test -- src/geofence.test.ts`, `bun run --cwd web test -- src/features/player/BaseScreen.test.tsx`.
- Phase gates: `bun run --cwd web typecheck`, `bun run --cwd web lint`, `bun run --cwd packages/game-core test`, `bun run --cwd web test`.
- ONE atomic commit at the very end of Task 7. Message: `feat(shared): check-in proof, geofence rules and arrival detector`. Trailer: `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Do NOT commit this plan file or anything under `docs/specs/`.
- Do not touch `backend/`, `ios-app/`, `android-app/`, `web/e2e/`, `web/src/types/base.ts`, `web/src/lib/api/`, or `packages/i18n/`. Those belong to Phases 1, 3 and 4.

---

### Task 1: `packages/api` — check-in method contract

**Files:**
- Modify: `packages/api/src/types.ts` (add enums after line 19 `export type PushPlatform`; extend `Base` ~lines 96-114; extend `BaseProgress` ~lines 160-171; replace `CheckInRequest` ~lines 173-175; extend `CheckInResponse` ~lines 188-193; extend `Game` ~lines 71-89; extend `UpsertBaseRequest`; extend `CreateGameRequest`)
- Modify: `packages/api/src/endpoints.ts` (import list ~line 15; `player.checkIn` lines 83-84)
- Test: none of its own — `packages/api` has no type-only test file; the contract is proved by `packages/game-core` typecheck and tests in Tasks 2-6.

**Interfaces:**
- Produces: `type CheckInMethod = 'NFC' | 'QR' | 'LOCATION'`, `type CheckInVerification = 'VERIFIED' | 'CLAIMED' | 'OPERATOR'`, `interface CheckInFix { lat: number; lng: number; accuracy: number; capturedAt: IsoDateTime }`, `type CheckInRequest = { method: 'nfc' | 'qr'; token: string } | { method: 'geo'; lat: number; lng: number; accuracy: number; capturedAt: IsoDateTime; claimed: boolean; dwell?: CheckInFix[] }`, `Base.checkInMethod: CheckInMethod`, `Base.checkInRadiusM?: number | null`, `BaseProgress.checkInMethod: CheckInMethod`, `BaseProgress.checkInRadiusM?: number | null`, `CheckInResponse.method: CheckInMethod`, `CheckInResponse.verification: CheckInVerification`, `Game.defaultCheckInMethod: CheckInMethod`, `Game.defaultCheckInRadiusM: number`, `player.checkIn(gameId, baseId, body: CheckInRequest)`.
- Consumes: nothing new.

- [ ] **Step 1: Write the failing test**

There is no test file in `packages/api`; this task's failure signal is the compiler. Write the *consumer* assertion first, in `packages/game-core/src/proof.test.ts`, replacing the whole file:

```ts
import { describe, expect, it } from 'vitest'
import type { CheckInRequest } from '@pointfinder/api'
import { proofTypeForMethod, toCheckInRequest, type CheckInRequestBody } from './proof'
import { StateVersionTracker, decideSnapshot } from './snapshot'

/** game-core's body must be exactly what the api package declares on the wire. */
const wire: (b: CheckInRequestBody) => CheckInRequest = (b) => b

describe('proof mapping', () => {
  it('maps a tag tap and a scanned code to their own method', () => {
    expect(toCheckInRequest({ type: 'nfc', token: 'ab12cd34' })).toEqual({ method: 'nfc', token: 'ab12cd34' })
    expect(toCheckInRequest({ type: 'qr', token: 'ab12cd34' })).toEqual({ method: 'qr', token: 'ab12cd34' })
  })

  it('maps an automatic fix without a dwell buffer', () => {
    const body = toCheckInRequest({ type: 'geo', lat: 41.1, lng: -8.6, accuracy: 8.5, capturedAt: '2026-09-05T10:00:00Z', claimed: false })
    expect(body).toEqual({ method: 'geo', lat: 41.1, lng: -8.6, accuracy: 8.5, capturedAt: '2026-09-05T10:00:00Z', claimed: false })
    expect(wire(body)).toBe(body)
  })

  it('carries the dwell buffer of a claim', () => {
    const dwell = [{ lat: 41.1, lng: -8.6, accuracy: 30, capturedAt: '2026-09-05T09:58:50Z' }]
    const body = toCheckInRequest({ type: 'geo', lat: 41.1, lng: -8.6, accuracy: 22, capturedAt: '2026-09-05T10:00:00Z', claimed: true, dwell })
    expect(body).toEqual({ method: 'geo', lat: 41.1, lng: -8.6, accuracy: 22, capturedAt: '2026-09-05T10:00:00Z', claimed: true, dwell })
    expect(wire(body)).toBe(body)
  })

  it('names the proof a base of each method asks for', () => {
    expect(proofTypeForMethod('NFC')).toBe('nfc')
    expect(proofTypeForMethod('QR')).toBe('qr')
    expect(proofTypeForMethod('LOCATION')).toBe('geo')
  })
})

describe('snapshot decisions', () => {
  it('applies when behind or unknown, skips otherwise', () => {
    expect(decideSnapshot(null, 1)).toBe('apply')
    expect(decideSnapshot(5, 6)).toBe('apply')
    expect(decideSnapshot(6, 6)).toBe('skip')
    expect(decideSnapshot(7, 6)).toBe('skip')
  })

  it('tracks the highest version seen', () => {
    const t = new StateVersionTracker()
    expect(t.observe(undefined)).toBe(false)
    expect(t.observe(3)).toBe(true)
    expect(t.observe(2)).toBe(false)
    expect(t.observe(9)).toBe(true)
    expect(t.current).toBe(9)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```
bun run --cwd packages/game-core test -- src/proof.test.ts
```

Expected failure: the file fails to resolve/execute — `SyntaxError`/import error for `proofTypeForMethod` (not exported from `./proof`) and the two `toCheckInRequest` geo cases would throw `UnsupportedProofError`. `CheckInRequest` in `@pointfinder/api` is still `{ nfcToken: string }`.

- [ ] **Step 3: Write minimal implementation**

In `packages/api/src/types.ts`, insert immediately after the line `export type PushPlatform = 'ios' | 'android'`:

```ts
/** How a team proves it reached a base. Server enum names. */
export type CheckInMethod = 'NFC' | 'QR' | 'LOCATION'
/** How much the server trusts a check-in row. */
export type CheckInVerification = 'VERIFIED' | 'CLAIMED' | 'OPERATOR'
```

In the same file, add these two fields to the `Game` interface, immediately after `unlockTrigger?: UnlockTrigger`:

```ts
  /** Copied onto bases created after this point. Changing it never rewrites existing bases. */
  defaultCheckInMethod: CheckInMethod
  /** Metres. Used by every location base that does not override it. */
  defaultCheckInRadiusM: number
```

Add these two fields to the `Base` interface, immediately after `nfcLinked: boolean`:

```ts
  /** How a team proves it reached this base. */
  checkInMethod: CheckInMethod
  /** Metres. Null on operator DTOs means "inherit the game default"; player DTOs always resolve it. */
  checkInRadiusM?: number | null
```

Add the same two fields to the `BaseProgress` interface, immediately after its `nfcLinked: boolean`:

```ts
  /** How a team proves it reached this base. */
  checkInMethod: CheckInMethod
  /** Metres, already resolved against the game default. */
  checkInRadiusM?: number | null
```

Replace the whole `CheckInRequest` interface:

```ts
export interface CheckInRequest {
  nfcToken: string
}
```

with:

```ts
/** One GPS sample as the wire carries it. */
export interface CheckInFix {
  lat: number
  lng: number
  accuracy: number
  capturedAt: IsoDateTime
}

/**
 * A typed proof of presence. The legacy body `{ nfcToken }` is still accepted
 * by the server at NFC bases, but nothing in this repo sends it any more.
 */
export type CheckInRequest =
  | { method: 'nfc' | 'qr'; token: string }
  | { method: 'geo'; lat: number; lng: number; accuracy: number; capturedAt: IsoDateTime; claimed: boolean; dwell?: CheckInFix[] }
```

Add to `CheckInResponse`, after `checkedInAt: IsoDateTime`:

```ts
  method: CheckInMethod
  verification: CheckInVerification
```

Add to `UpsertBaseRequest`, after `hidden?: boolean`:

```ts
  /** Null on create means "copy the game default"; null on update means "leave unchanged". */
  checkInMethod?: CheckInMethod | null
  /** Metres, 5..200. Null inherits the game default. */
  checkInRadiusM?: number | null
```

Add to `CreateGameRequest`, after `enforceBaseOrder?: boolean`:

```ts
  defaultCheckInMethod?: CheckInMethod | null
  defaultCheckInRadiusM?: number | null
```

In `packages/api/src/endpoints.ts`, add `CheckInRequest,` to the type import list (alphabetically, immediately before `CheckInResponse,`), and replace lines 83-84:

```ts
    checkIn: (gameId: EntityId, baseId: EntityId, nfcToken: string) =>
      http.post<CheckInResponse>(`${p(gameId)}/bases/${encodeURIComponent(baseId)}/check-in`, { nfcToken }),
```

with:

```ts
    /** The body is a typed proof; the base's own method decides which variant is valid. */
    checkIn: (gameId: EntityId, baseId: EntityId, body: CheckInRequest) =>
      http.post<CheckInResponse>(`${p(gameId)}/bases/${encodeURIComponent(baseId)}/check-in`, body),
```

- [ ] **Step 4: Run test to verify it passes**

```
bun run --cwd packages/api typecheck
```

Expected: clean. `bun run --cwd packages/game-core test -- src/proof.test.ts` still fails at this point — that is Task 2's job. Verify green means: `packages/api typecheck` exits 0.

- [ ] **Step 5: Commit** — no commit. Phase commits once, at the end of Task 7. End here with `bun run --cwd packages/api typecheck` green.

---

### Task 2: `proof.ts` — typed proofs and the request mapper

**Files:**
- Modify: `packages/game-core/src/proof.ts` (replace the entire file, 48 lines)
- Test: `packages/game-core/src/proof.test.ts` (already rewritten in Task 1, Step 1)

**Interfaces:**
- Consumes: nothing.
- Produces: `interface DwellFix { lat: number; lng: number; accuracy: number; capturedAt: string }`, `type CheckInProof`, `type CheckInMode = CheckInProof['type']`, `type CheckInMethod = 'NFC' | 'QR' | 'LOCATION'`, `type CheckInRequestBody`, `function toCheckInRequest(proof: CheckInProof): CheckInRequestBody`, `function proofTypeForMethod(method: CheckInMethod): 'nfc' | 'qr' | 'geo'`. Removes `UnsupportedProofError` and `PresenceProvider`.

- [ ] **Step 1: Write the failing test** — done in Task 1, Step 1. Re-read `packages/game-core/src/proof.test.ts` and confirm it is the version above.

- [ ] **Step 2: Run test to verify it fails**

```
bun run --cwd packages/game-core test -- src/proof.test.ts
```

Expected failure: `No "proofTypeForMethod" export is defined on the "./proof" mock`-style import error, or `TypeError: proofTypeForMethod is not a function`; the geo cases throw `UnsupportedProofError: Check-in mode "geo" is not supported by the backend yet`.

- [ ] **Step 3: Write minimal implementation**

Replace the entire contents of `packages/game-core/src/proof.ts` with:

```ts
/**
 * Proof of presence at a base.
 *
 * A base declares how a team proves it arrived: tap the tag written for it,
 * scan the printed code, or let the phone's own fix speak. Every route
 * produces one of these proofs, and the server verifies it against the
 * base's declared method — a QR code will not open an NFC base.
 */

/** One GPS sample as the wire carries it. `capturedAt` is ISO 8601. */
export interface DwellFix {
  lat: number
  lng: number
  accuracy: number
  capturedAt: string
}

export type CheckInProof =
  | { type: 'nfc'; token: string }
  | { type: 'qr'; token: string }
  | { type: 'geo'; lat: number; lng: number; accuracy: number; capturedAt: string; claimed: false }
  | { type: 'geo'; lat: number; lng: number; accuracy: number; capturedAt: string; claimed: true; dwell: DwellFix[] }

export type CheckInMode = CheckInProof['type']

/** How the server names a base's check-in method. */
export type CheckInMethod = 'NFC' | 'QR' | 'LOCATION'

/** What the check-in endpoint accepts. */
export type CheckInRequestBody =
  | { method: 'nfc' | 'qr'; token: string }
  | { method: 'geo'; lat: number; lng: number; accuracy: number; capturedAt: string; claimed: boolean; dwell?: DwellFix[] }

/** Map a proof onto the request body. Every variant is supported. */
export function toCheckInRequest(proof: CheckInProof): CheckInRequestBody {
  switch (proof.type) {
    case 'nfc':
    case 'qr':
      return { method: proof.type, token: proof.token }
    case 'geo':
      return proof.claimed
        ? { method: 'geo', lat: proof.lat, lng: proof.lng, accuracy: proof.accuracy, capturedAt: proof.capturedAt, claimed: true, dwell: proof.dwell }
        : { method: 'geo', lat: proof.lat, lng: proof.lng, accuracy: proof.accuracy, capturedAt: proof.capturedAt, claimed: false }
  }
}

/** The proof a base of this method asks for. */
export function proofTypeForMethod(method: CheckInMethod): 'nfc' | 'qr' | 'geo' {
  switch (method) {
    case 'NFC':
      return 'nfc'
    case 'QR':
      return 'qr'
    case 'LOCATION':
      return 'geo'
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```
bun run --cwd packages/game-core test -- src/proof.test.ts
```

Expected: 6 tests pass.

- [ ] **Step 5: Commit** — no commit. End here with `bun run --cwd packages/game-core test -- src/proof.test.ts` green.

---

### Task 3: `geofence.ts` — acceptance, ring and dwell rules

**Files:**
- Create: `packages/game-core/src/geofence.ts`
- Create: `packages/game-core/src/geofence.test.ts`
- Modify: `packages/game-core/src/index.ts` (add one export line)

**Interfaces:**
- Consumes: `Fix` and `distanceM` from `./location`.
- Produces: `AUTO_ACCURACY_CAP_M`, `ACCURACY_CREDIT_CAP_M`, `CLAIM_ACCURACY_CAP_M`, `DEFAULT_CHECK_IN_RADIUS_M`, `DWELL_MIN_FIXES`, `DWELL_MIN_SPAN_MS`, `DWELL_SAMPLE_INTERVAL_MS`, `DWELL_BUFFER_MAX_MS`, `DWELL_MAX_GAP_TO_MAIN_MS`, `type AutoAcceptance = { ok: true; distanceM: number } | { ok: false; distanceM: number; allowedM: number; reason: 'inaccurate' | 'out_of_range' }`, `wideRingM(radiusM: number): number`, `autoAccepts(fix: Fix, base: { lat: number; lng: number }, radiusM: number): AutoAcceptance`, `insideWideRing(fix: Fix, base: { lat: number; lng: number }, radiusM: number): boolean`, `dwellSatisfied(buffer: Fix[], now: number): boolean`, `pushDwellSample(buffer: Fix[], fix: Fix): Fix[]`.

- [ ] **Step 1: Write the failing test**

Create `packages/game-core/src/geofence.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  AUTO_ACCURACY_CAP_M,
  CLAIM_ACCURACY_CAP_M,
  DWELL_MIN_FIXES,
  autoAccepts,
  dwellSatisfied,
  insideWideRing,
  pushDwellSample,
  wideRingM,
} from './geofence'
import type { Fix } from './location'

const base = { lat: 40.09, lng: -8.87 }
/** One degree of latitude here is ~111.19 km, so 0.0001 is ~11.1 m. */
const at = (metresNorth: number, accuracy: number, capturedAt = 0): Fix => ({
  lat: base.lat + metresNorth / 111_194.9,
  lng: base.lng,
  accuracy,
  capturedAt,
})

describe('automatic acceptance', () => {
  it('accepts a fix inside the radius', () => {
    const result = autoAccepts(at(0, 8), base, 15)
    expect(result.ok).toBe(true)
    expect(Math.round(result.distanceM)).toBe(0)
  })

  it('credits accuracy up to thirty metres and no further', () => {
    expect(autoAccepts(at(22, 5), base, 15).ok).toBe(false)
    expect(autoAccepts(at(22, 10), base, 15).ok).toBe(true)
    expect(autoAccepts(at(56, 40), base, 15)).toMatchObject({ ok: false, allowedM: 45, reason: 'out_of_range' })
  })

  it('refuses a fix the chip cannot vouch for', () => {
    expect(autoAccepts(at(0, AUTO_ACCURACY_CAP_M + 1), base, 15)).toMatchObject({ ok: false, reason: 'inaccurate' })
    expect(autoAccepts(at(0, Number.NaN), base, 15)).toMatchObject({ ok: false, reason: 'inaccurate' })
    expect(autoAccepts(at(0, 0), base, 15)).toMatchObject({ ok: false, reason: 'inaccurate' })
  })

  it('reports the distance and the allowance a refusal was measured against', () => {
    expect(autoAccepts(at(100, 10), base, 15)).toMatchObject({ allowedM: 25, reason: 'out_of_range' })
    expect(Math.round(autoAccepts(at(100, 10), base, 15).distanceM)).toBe(100)
  })
})

describe('the wider ring a claim may be made from', () => {
  it('is three radii, never under fifty metres', () => {
    expect(wideRingM(15)).toBe(50)
    expect(wideRingM(30)).toBe(90)
  })

  it('answers whether a fix stands inside it', () => {
    expect(insideWideRing(at(44, 90), base, 15)).toBe(true)
    expect(insideWideRing(at(56, 90), base, 15)).toBe(false)
  })
})

describe('dwell', () => {
  const buffer = [at(0, 30, 0), at(0, 30, 20_000), at(0, 30, 40_000), at(0, 30, 60_000)]

  it('needs four fixes spread over a minute, still current', () => {
    expect(dwellSatisfied(buffer, 90_000)).toBe(true)
    expect(buffer).toHaveLength(DWELL_MIN_FIXES)
  })

  it('refuses too few fixes, too short a span, or a stale buffer', () => {
    expect(dwellSatisfied(buffer.slice(1), 90_000)).toBe(false)
    expect(dwellSatisfied([at(0, 30, 0), at(0, 30, 15_000), at(0, 30, 30_000), at(0, 30, 50_000)], 60_000)).toBe(false)
    expect(dwellSatisfied(buffer, 60_000 + 120_001)).toBe(false)
  })

  it('refuses a buffer holding a fix coarser than the claim cap', () => {
    expect(dwellSatisfied([...buffer.slice(1), at(0, CLAIM_ACCURACY_CAP_M + 1, 80_000)], 90_000)).toBe(false)
  })

  it('samples at most every ten seconds', () => {
    const one = [at(0, 30, 100_000)]
    expect(pushDwellSample(one, at(0, 30, 105_000))).toBe(one)
    expect(pushDwellSample(one, at(0, 30, 110_000))).toHaveLength(2)
    expect(pushDwellSample([], at(0, 30, 0))).toHaveLength(1)
  })

  it('forgets samples older than five minutes', () => {
    expect(pushDwellSample([at(0, 30, 0), at(0, 30, 20_000)], at(0, 30, 400_000)).map((f) => f.capturedAt)).toEqual([400_000])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```
bun run --cwd packages/game-core test -- src/geofence.test.ts
```

Expected failure: `Failed to resolve import "./geofence" from "src/geofence.test.ts". Does the file exist?`

- [ ] **Step 3: Write minimal implementation**

Create `packages/game-core/src/geofence.ts`:

```ts
import { distanceM, type Fix } from './location'

/**
 * The rules that decide whether a fix proves a team reached a base.
 *
 * Every constant and helper here mirrors the server's verification exactly,
 * so the phone can refuse a hopeless proof before spending a round trip and
 * both ends' tests describe one behaviour rather than two.
 */

/** An automatic proof needs a fix at least this accurate. */
export const AUTO_ACCURACY_CAP_M = 50
/** Accuracy widens the accepted distance, but only this far. */
export const ACCURACY_CREDIT_CAP_M = 30
/** A claim tolerates a coarser fix, because GPS refusing to converge is the reason for it. */
export const CLAIM_ACCURACY_CAP_M = 100
/** Radius used when neither the base nor the game resolved one. */
export const DEFAULT_CHECK_IN_RADIUS_M = 15

export const DWELL_MIN_FIXES = 4
export const DWELL_MIN_SPAN_MS = 60_000
export const DWELL_SAMPLE_INTERVAL_MS = 10_000
export const DWELL_BUFFER_MAX_MS = 300_000
/** A dwell buffer counts only while its last sample is this fresh. */
export const DWELL_MAX_GAP_TO_MAIN_MS = 120_000

/** The wider ring a claim may be made from. */
export function wideRingM(radiusM: number): number {
  return Math.max(3 * radiusM, 50)
}

export type AutoAcceptance =
  | { ok: true; distanceM: number }
  | { ok: false; distanceM: number; allowedM: number; reason: 'inaccurate' | 'out_of_range' }

/**
 * Would the server accept this fix as an automatic arrival?
 * A fix with no usable accuracy is refused here as it is on the server:
 * an unmeasured error is not a small one.
 */
export function autoAccepts(fix: Fix, base: { lat: number; lng: number }, radiusM: number): AutoAcceptance {
  const distance = distanceM(fix, base)
  if (!Number.isFinite(fix.accuracy) || !(fix.accuracy > 0) || fix.accuracy > AUTO_ACCURACY_CAP_M) {
    return { ok: false, distanceM: distance, allowedM: radiusM, reason: 'inaccurate' }
  }
  const allowedM = radiusM + Math.min(fix.accuracy, ACCURACY_CREDIT_CAP_M)
  return distance <= allowedM ? { ok: true, distanceM: distance } : { ok: false, distanceM: distance, allowedM, reason: 'out_of_range' }
}

/** Is the fix inside the wider ring a claim may be made from? */
export function insideWideRing(fix: Fix, base: { lat: number; lng: number }, radiusM: number): boolean {
  return distanceM(fix, base) <= wideRingM(radiusM)
}

/** Enough samples, spread over enough time, all usable, and still current. */
export function dwellSatisfied(buffer: Fix[], now: number): boolean {
  if (buffer.length < DWELL_MIN_FIXES) return false
  const first = buffer[0]
  const last = buffer[buffer.length - 1]
  if (!first || !last) return false
  if (buffer.some((f) => !Number.isFinite(f.accuracy) || !(f.accuracy > 0) || f.accuracy > CLAIM_ACCURACY_CAP_M)) return false
  if (last.capturedAt - first.capturedAt < DWELL_MIN_SPAN_MS) return false
  return now - last.capturedAt <= DWELL_MAX_GAP_TO_MAIN_MS
}

/** Append a sample at most every ten seconds, and forget anything older than five minutes. */
export function pushDwellSample(buffer: Fix[], fix: Fix): Fix[] {
  const last = buffer[buffer.length - 1]
  if (last && fix.capturedAt - last.capturedAt < DWELL_SAMPLE_INTERVAL_MS) return buffer
  return [...buffer, fix].filter((f) => fix.capturedAt - f.capturedAt <= DWELL_BUFFER_MAX_MS)
}
```

In `packages/game-core/src/index.ts`, add after the `export * from './location'` line:

```ts
export * from './geofence'
```

- [ ] **Step 4: Run test to verify it passes**

```
bun run --cwd packages/game-core test -- src/geofence.test.ts
bun run --cwd packages/game-core typecheck
```

Expected: 9 tests pass, typecheck exits 0.

- [ ] **Step 5: Commit** — no commit. End here with the two commands above green.

---

### Task 4: `arrival.ts` — the pure arrival detector

**Files:**
- Create: `packages/game-core/src/arrival.ts`
- Create: `packages/game-core/src/arrival.test.ts`
- Modify: `packages/game-core/src/index.ts` (add one export line)

**Interfaces:**
- Consumes: `autoAccepts`, `dwellSatisfied`, `insideWideRing`, `pushDwellSample` from `./geofence`; `Fix` from `./location`.
- Produces: `interface ArrivalCandidate { baseId: string; lat: number; lng: number; radiusM: number; hidden: boolean }`, `interface ArrivalState { attemptedAt: Record<string, number>; dwell: Record<string, Fix[]> }`, `interface ArrivalEvaluation { state: ArrivalState; fire: ArrivalCandidate[]; claimable: string[] }`, `const ARRIVAL_RETRY_MS = 30_000`, `emptyArrivalState(): ArrivalState`, `evaluateArrival(fix: Fix, candidates: ArrivalCandidate[], state: ArrivalState, now: number): ArrivalEvaluation`.

- [ ] **Step 1: Write the failing test**

Create `packages/game-core/src/arrival.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { ARRIVAL_RETRY_MS, emptyArrivalState, evaluateArrival, type ArrivalCandidate } from './arrival'
import type { Fix } from './location'

const here = { lat: 40.09, lng: -8.87 }
const at = (metresNorth: number, accuracy: number, capturedAt: number): Fix => ({
  lat: here.lat + metresNorth / 111_194.9,
  lng: here.lng,
  accuracy,
  capturedAt,
})

const mill: ArrivalCandidate = { baseId: 'b1', lat: here.lat, lng: here.lng, radiusM: 15, hidden: false }
const chapel: ArrivalCandidate = { baseId: 'b2', lat: here.lat + 0.01, lng: here.lng, radiusM: 15, hidden: false }
const cache: ArrivalCandidate = { baseId: 'hidden', lat: here.lat, lng: here.lng, radiusM: 15, hidden: true }

describe('arrival detection', () => {
  it('fires once for the base the team reached and leaves the far one alone', () => {
    const result = evaluateArrival(at(0, 8, 1_000), [mill, chapel], emptyArrivalState(), 1_000)
    expect(result.fire.map((c) => c.baseId)).toEqual(['b1'])
    expect(result.state.attemptedAt).toEqual({ b1: 1_000 })
  })

  it('backs off for half a minute before trying the same base again', () => {
    const first = evaluateArrival(at(0, 8, 1_000), [mill], emptyArrivalState(), 1_000)
    const soon = evaluateArrival(at(0, 8, 5_000), [mill], first.state, 5_000)
    expect(soon.fire).toEqual([])
    const later = evaluateArrival(at(0, 8, 40_000), [mill], soon.state, 1_000 + ARRIVAL_RETRY_MS)
    expect(later.fire.map((c) => c.baseId)).toEqual(['b1'])
  })

  it('detects a hidden base without treating it differently', () => {
    const result = evaluateArrival(at(0, 8, 1_000), [cache], emptyArrivalState(), 1_000)
    expect(result.fire).toEqual([cache])
  })

  it('never fires on a fix too coarse to vouch for', () => {
    const result = evaluateArrival(at(0, 90, 1_000), [mill], emptyArrivalState(), 1_000)
    expect(result.fire).toEqual([])
  })

  it('offers a claim after a minute inside the wider ring', () => {
    let state = emptyArrivalState()
    let last = evaluateArrival(at(44, 90, 0), [mill], state, 0)
    for (const t of [20_000, 40_000, 60_000]) {
      state = last.state
      last = evaluateArrival(at(44, 90, t), [mill], state, t)
    }
    expect(last.claimable).toEqual(['b1'])
    expect(last.fire).toEqual([])
  })

  it('forgets the dwell buffer as soon as the team leaves the ring', () => {
    const inside = evaluateArrival(at(44, 90, 0), [mill], emptyArrivalState(), 0)
    expect(inside.state.dwell.b1).toHaveLength(1)
    const away = evaluateArrival(at(400, 90, 20_000), [mill], inside.state, 20_000)
    expect(away.state.dwell.b1).toBeUndefined()
    expect(away.claimable).toEqual([])
  })

  it('does nothing when the team has no candidates left', () => {
    const result = evaluateArrival(at(0, 8, 1_000), [], emptyArrivalState(), 1_000)
    expect(result).toMatchObject({ fire: [], claimable: [] })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```
bun run --cwd packages/game-core test -- src/arrival.test.ts
```

Expected failure: `Failed to resolve import "./arrival" from "src/arrival.test.ts". Does the file exist?`

- [ ] **Step 3: Write minimal implementation**

Create `packages/game-core/src/arrival.ts`:

```ts
import { autoAccepts, dwellSatisfied, insideWideRing, pushDwellSample } from './geofence'
import type { Fix } from './location'

/**
 * The arrival detector: pure, so the runtime can feed it real fixes and a
 * test can feed it a walk made of numbers.
 *
 * Each fix answers two questions. Which unvisited location bases has the
 * team just reached, and at which of them has it now stood long enough to
 * claim presence when the chip refuses to converge? The caller keeps the
 * returned state; attempts are recorded in it, so a caller that drops the
 * state will retry, and one that keeps it will not.
 */

export interface ArrivalCandidate {
  baseId: string
  lat: number
  lng: number
  radiusM: number
  /** Hidden bases are detected like any other; only their name is withheld. */
  hidden: boolean
}

export interface ArrivalState {
  /** Epoch ms of the last enqueued attempt, per base. */
  attemptedAt: Record<string, number>
  /** Dwell buffer per base, kept only while the team is inside the wider ring. */
  dwell: Record<string, Fix[]>
}

/** One attempt per base per half minute: a refused proof must not become a loop. */
export const ARRIVAL_RETRY_MS = 30_000

export function emptyArrivalState(): ArrivalState {
  return { attemptedAt: {}, dwell: {} }
}

export interface ArrivalEvaluation {
  state: ArrivalState
  /** Bases whose proof should be enqueued now. */
  fire: ArrivalCandidate[]
  /** Base ids where "I'm here" may be offered. */
  claimable: string[]
}

export function evaluateArrival(fix: Fix, candidates: ArrivalCandidate[], state: ArrivalState, now: number): ArrivalEvaluation {
  const attemptedAt: Record<string, number> = { ...state.attemptedAt }
  const dwell: Record<string, Fix[]> = {}
  const fire: ArrivalCandidate[] = []
  const claimable: string[] = []
  for (const candidate of candidates) {
    let buffer: Fix[] = []
    if (insideWideRing(fix, candidate, candidate.radiusM)) {
      buffer = pushDwellSample(state.dwell[candidate.baseId] ?? [], fix)
      dwell[candidate.baseId] = buffer
    }
    const last = attemptedAt[candidate.baseId]
    if (autoAccepts(fix, candidate, candidate.radiusM).ok && (last === undefined || now - last >= ARRIVAL_RETRY_MS)) {
      attemptedAt[candidate.baseId] = now
      fire.push(candidate)
    }
    if (dwellSatisfied(buffer, now)) claimable.push(candidate.baseId)
  }
  return { state: { attemptedAt, dwell }, fire, claimable }
}
```

In `packages/game-core/src/index.ts`, add after the `export * from './geofence'` line:

```ts
export * from './arrival'
```

- [ ] **Step 4: Run test to verify it passes**

```
bun run --cwd packages/game-core test -- src/arrival.test.ts
bun run --cwd packages/game-core typecheck
```

Expected: 7 tests pass, typecheck exits 0.

- [ ] **Step 5: Commit** — no commit. End here with the two commands above green.

---

### Task 5: `queue.ts` — whole proofs, and rows written before proofs were typed

**Files:**
- Modify: `packages/game-core/src/queue.ts` (import line 1; `PendingCheckIn` lines 33-38; `enqueueCheckIn` signature line 126; the `stored()` helper; every `this.options.store.list()` call site; `normalizeAction` at the end of the file)
- Modify: `packages/game-core/src/queue.test.ts` (replace the entire file)
- Modify: `packages/game-core/src/baseOrder.test.ts` (line 7)

**Interfaces:**
- Consumes: `CheckInProof` from `./proof`; `CheckInResponse` from `@pointfinder/api`.
- Produces: `PendingCheckIn.proof: CheckInProof` (replacing `nfcToken: string`), `enqueueCheckIn(input: { id: string; gameId: EntityId; baseId: EntityId; proof: CheckInProof; prerequisiteCheckInIds?: string[] })`, `normalizeAction(action: PendingAction): PendingAction`.

- [ ] **Step 1: Write the failing test**

Replace the entire contents of `packages/game-core/src/queue.test.ts` with:

```ts
import { describe, expect, it, vi } from 'vitest'
import { ApiError, type CheckInResponse } from '@pointfinder/api'
import type { CheckInProof } from './proof'
import { MemoryQueueStore, OfflineQueue, backoffMs, sortForSync, type PendingAction, type PendingCheckIn, type QueueExecutor } from './queue'

const nfc = (token = 't'): CheckInProof => ({ type: 'nfc', token })
const receipt = (baseId = 'b'): CheckInResponse => ({ checkInId: 'c', baseId, checkedInAt: 'x', method: 'NFC', verification: 'VERIFIED' })

function make(executor: Partial<QueueExecutor> = {}, nowMs = 1_000_000) {
  const store = new MemoryQueueStore()
  let now = nowMs
  const exec: QueueExecutor = {
    checkIn: executor.checkIn ?? vi.fn(async () => receipt()),
    submit: executor.submit ?? vi.fn(async () => ({}) as never),
  }
  const queue = new OfflineQueue({ store, executor: exec, now: () => now })
  return { queue, store, exec, tick: (ms: number) => (now += ms) }
}

describe('OfflineQueue', () => {
  it('holds a submission behind its failed check-in without sending it', async () => {
    const { queue, exec } = make({ checkIn: async () => { throw ApiError.fromResponse(400, { code: 'CHECK_IN_TOKEN_INVALID' }) } })
    await queue.enqueueCheckIn({ id: 'check-in', gameId: 'g', baseId: 'b', proof: nfc('proof') })
    await queue.enqueueSubmission({ id: 'submit', gameId: 'g', baseId: 'b', challengeId: 'c', answer: 'answer' })
    await queue.sync()
    expect(exec.submit).not.toHaveBeenCalled()
    expect(await queue.list()).toMatchObject([{ state: 'failed' }, { state: 'pending' }])
  })

  it('does not attribute an action to a new account if ownership changes during enqueue', async () => {
    let owner = 'alice'
    const store = new MemoryQueueStore()
    store.list = async () => { owner = 'bob'; return [] }
    const queue = new OfflineQueue({ store, owner: () => owner, executor: { checkIn: vi.fn(), submit: vi.fn() } })
    const write = vi.spyOn(store, 'upsert')
    await expect(queue.enqueueSubmission({ id: 'submit', gameId: 'g', baseId: 'b', challengeId: 'c', answer: 'Alice’s answer' })).rejects.toMatchObject({ status: 401 })
    expect(write).not.toHaveBeenCalled()
  })

  it('orders check-ins before submissions, oldest first', () => {
    const mk = (type: PendingAction['type'], createdAt: string, id: string) =>
      ({ type, id, gameId: 'g', baseId: 'b', createdAt, attempts: 0, nextAttemptAt: 0, state: 'pending', proof: nfc(), challengeId: 'c', answer: '' }) as PendingAction
    const sorted = sortForSync([mk('submission', '2026-01-01T00:00:01Z', 's1'), mk('check_in', '2026-01-01T00:00:02Z', 'c2'), mk('check_in', '2026-01-01T00:00:00Z', 'c1')])
    expect(sorted.map((a) => a.id)).toEqual(['c1', 'c2', 's1'])
  })

  it('backs off exponentially from two seconds', () => {
    expect(backoffMs(1)).toBe(2000)
    expect(backoffMs(3)).toBe(8000)
    expect(backoffMs(20)).toBe(60_000)
  })

  it('does not enqueue the same check-in twice', async () => {
    const { queue } = make()
    const a = await queue.enqueueCheckIn({ id: '1', gameId: 'g', baseId: 'b', proof: nfc() })
    const b = await queue.enqueueCheckIn({ id: '2', gameId: 'g', baseId: 'b', proof: nfc() })
    expect(b.id).toBe(a.id)
    expect(await queue.pendingCount()).toBe(1)
  })

  it('syncs due actions in order and removes them', async () => {
    const calls: string[] = []
    const { queue } = make({
      checkIn: vi.fn(async (a) => { calls.push(`ci:${a.baseId}`); return receipt(a.baseId) }),
      submit: vi.fn(async (a) => { calls.push(`sub:${a.baseId}:${a.id}`); return {} as never }),
    })
    await queue.enqueueSubmission({ id: 's1', gameId: 'g', baseId: 'b1', challengeId: 'ch', answer: '42' })
    await queue.enqueueCheckIn({ id: 'c1', gameId: 'g', baseId: 'b1', proof: nfc() })
    const report = await queue.sync()
    expect(calls).toEqual(['ci:b1', 'sub:b1:s1'])
    expect(report.outcomes.map((o) => o.result)).toEqual(['synced', 'synced'])
    expect(await queue.pendingCount()).toBe(0)
  })

  it('keeps retryable failures with a backoff and skips them until due', async () => {
    const checkIn = vi.fn(async () => { throw ApiError.network(new Error('offline')) })
    const { queue, tick } = make({ checkIn })
    await queue.enqueueCheckIn({ id: 'c1', gameId: 'g', baseId: 'b', proof: nfc() })
    const r1 = await queue.sync()
    expect(r1.outcomes[0]).toMatchObject({ result: 'retry_later', inMs: 2000 })
    const r2 = await queue.sync()
    expect(r2.outcomes).toEqual([])
    expect(checkIn).toHaveBeenCalledTimes(1)
    tick(2001)
    const r3 = await queue.sync()
    expect(r3.outcomes[0]).toMatchObject({ result: 'retry_later', inMs: 4000 })
    expect(await queue.pendingCount()).toBe(1)
  })

  it('marks server refusals as failed but never drops them', async () => {
    const { queue, store } = make({
      submit: vi.fn(async () => { throw ApiError.fromResponse(400, { message: 'No challenge assigned', code: 'X' }) }),
    })
    await queue.enqueueSubmission({ id: 's1', gameId: 'g', baseId: 'b', challengeId: 'ch', answer: 'a' })
    const report = await queue.sync()
    expect(report.outcomes[0]).toMatchObject({ result: 'failed', code: 'X' })
    const stored = (await store.list())[0]!
    expect(stored.state).toBe('failed')
    expect(stored.lastError).toBe('No challenge assigned')
    expect(await queue.failedCount()).toBe(1)
    await queue.retry('s1')
    expect((await store.list())[0]!.state).toBe('pending')
  })

  it('treats "already done" refusals as synced', async () => {
    const { queue } = make({
      checkIn: vi.fn(async () => { throw ApiError.fromResponse(409, { message: 'dup', code: 'MANUAL_CHECKIN_ALREADY_CHECKED_IN' }) }),
    })
    await queue.enqueueCheckIn({ id: 'c1', gameId: 'g', baseId: 'b', proof: nfc() })
    const report = await queue.sync()
    expect(report.outcomes[0]).toMatchObject({ result: 'synced' })
    expect(await queue.pendingCount()).toBe(0)
  })

  it('stops the run on a 401 and leaves everything pending', async () => {
    const submit = vi.fn()
    const { queue } = make({
      checkIn: vi.fn(async () => { throw ApiError.fromResponse(401, { message: 'expired' }) }),
      submit,
    })
    await queue.enqueueCheckIn({ id: 'c1', gameId: 'g', baseId: 'b', proof: nfc() })
    await queue.enqueueSubmission({ id: 's1', gameId: 'g', baseId: 'b', challengeId: 'ch', answer: 'a' })
    const report = await queue.sync()
    expect(report.authRequired).toBe(true)
    expect(submit).not.toHaveBeenCalled()
    expect(await queue.pendingCount()).toBe(2)
  })

  it('shares one run between concurrent sync calls', async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => { release = r })
    const checkIn = vi.fn(async () => { await gate; return receipt() })
    const { queue } = make({ checkIn })
    await queue.enqueueCheckIn({ id: 'c1', gameId: 'g', baseId: 'b', proof: nfc() })
    const p1 = queue.sync()
    const p2 = queue.sync()
    expect(p1).toBe(p2)
    release()
    await p1
    expect(checkIn).toHaveBeenCalledTimes(1)
  })
})

describe('typed proofs', () => {
  it('replays a queued geo proof with the fix that was captured at the base', async () => {
    const seen: CheckInProof[] = []
    const { queue } = make({ checkIn: vi.fn(async (a) => { seen.push(a.proof); return receipt(a.baseId) }) })
    const proof: CheckInProof = { type: 'geo', lat: 41.1, lng: -8.6, accuracy: 8.5, capturedAt: '2026-09-05T10:00:00Z', claimed: false }
    await queue.enqueueCheckIn({ id: 'g1', gameId: 'g', baseId: 'b', proof })
    await queue.sync()
    expect(seen).toEqual([proof])
    expect(await queue.list()).toEqual([])
  })

  it('replays a claim with its dwell buffer intact', async () => {
    const seen: CheckInProof[] = []
    const { queue } = make({ checkIn: vi.fn(async (a) => { seen.push(a.proof); return receipt(a.baseId) }) })
    const proof: CheckInProof = {
      type: 'geo', lat: 41.1, lng: -8.6, accuracy: 22, capturedAt: '2026-09-05T10:00:00Z', claimed: true,
      dwell: [{ lat: 41.1, lng: -8.6, accuracy: 30, capturedAt: '2026-09-05T09:58:50Z' }],
    }
    await queue.enqueueCheckIn({ id: 'g2', gameId: 'g', baseId: 'b', proof })
    await queue.sync()
    expect(seen).toEqual([proof])
  })

  it('reads a row written before proofs were typed as an nfc proof', async () => {
    const store = new MemoryQueueStore()
    await store.upsert({ type: 'check_in', id: 'legacy', gameId: 'g', baseId: 'b', nfcToken: 'ab12cd34', createdAt: '2026-09-05T09:00:00Z', attempts: 0, nextAttemptAt: 0, state: 'pending' } as unknown as PendingAction)
    const seen: CheckInProof[] = []
    const queue = new OfflineQueue({ store, executor: { checkIn: vi.fn(async (a) => { seen.push(a.proof); return receipt(a.baseId) }), submit: vi.fn() } })
    expect(await queue.list()).toMatchObject([{ id: 'legacy', proof: { type: 'nfc', token: 'ab12cd34' } }])
    await queue.sync()
    expect(seen).toEqual([{ type: 'nfc', token: 'ab12cd34' }])
    expect(await store.list()).toEqual([])
  })

  it('leaves a stored proof alone when both fields somehow exist', async () => {
    const store = new MemoryQueueStore()
    await store.upsert({ type: 'check_in', id: 'both', gameId: 'g', baseId: 'b', nfcToken: 'old', proof: nfc('new'), createdAt: '', attempts: 0, nextAttemptAt: 0, state: 'pending' } as unknown as PendingAction)
    const queue = new OfflineQueue({ store, executor: { checkIn: vi.fn(async () => receipt()), submit: vi.fn() } })
    expect((await queue.list())[0] as PendingCheckIn).toMatchObject({ proof: { type: 'nfc', token: 'new' } })
  })
})

describe('ordered offline check-ins', () => {
  it('holds later check-ins behind a network failure and syncs them in order after recovery', async () => {
    const checkIn = vi.fn().mockRejectedValueOnce(ApiError.network(null)).mockResolvedValue(receipt())
    const { queue, tick } = make({ checkIn })
    await queue.enqueueCheckIn({ id: 'q1', gameId: 'g', baseId: 'b1', proof: nfc() })
    await queue.enqueueCheckIn({ id: 'q2', gameId: 'g', baseId: 'b2', proof: nfc(), prerequisiteCheckInIds: ['q1'] })
    await queue.sync()
    expect(checkIn).toHaveBeenCalledTimes(1)
    tick(2001)
    await queue.sync()
    expect(checkIn.mock.calls.map(([a]) => a.baseId)).toEqual(['b1', 'b1', 'b2'])
    expect(await queue.list()).toEqual([])
  })

  it('permanently rejects dependent proofs after an earlier tag fails, requiring a fresh scan', async () => {
    const checkIn = vi.fn().mockRejectedValue(ApiError.fromResponse(403, { code: 'CHECK_IN_TOKEN_INVALID' }))
    const { queue } = make({ checkIn })
    await queue.enqueueCheckIn({ id: 'q1', gameId: 'g', baseId: 'b1', proof: nfc() })
    await queue.enqueueCheckIn({ id: 'q2', gameId: 'g', baseId: 'b2', proof: nfc(), prerequisiteCheckInIds: ['q1'] })
    await queue.sync()
    expect(checkIn).toHaveBeenCalledTimes(1)
    expect((await queue.list())[1]).toMatchObject({ state: 'failed', lastErrorCode: 'PREVIOUS_CHECK_IN_FAILED' })
    await queue.retry('q2')
    await queue.discard('q1')
    await queue.sync()
    expect(checkIn).toHaveBeenCalledTimes(1)
  })

  it('does not treat a discarded prerequisite as a successful check-in', async () => {
    const { queue, exec } = make()
    await queue.enqueueCheckIn({ id: 'q1', gameId: 'g', baseId: 'b1', proof: nfc() })
    await queue.enqueueCheckIn({ id: 'q2', gameId: 'g', baseId: 'b2', proof: nfc(), prerequisiteCheckInIds: ['q1'] })
    await queue.discard('q1')
    await queue.sync()
    expect(exec.checkIn).not.toHaveBeenCalled()
    expect((await queue.list())[0]).toMatchObject({ state: 'failed', lastErrorCode: 'PREVIOUS_CHECK_IN_FAILED' })
  })

  it('preserves the missing base number and does not retry refused out-of-order proofs', async () => {
    const { queue } = make({ checkIn: async () => { throw ApiError.fromResponse(400, { code: 'PREVIOUS_BASE_REQUIRED', errors: { nextRequiredBaseNumber: '2' } }) } })
    await queue.enqueueCheckIn({ id: 'q3', gameId: 'g', baseId: 'b3', proof: nfc() })
    expect((await queue.sync()).outcomes[0]).toMatchObject({ result: 'failed', details: { nextRequiredBaseNumber: '2' } })
    await queue.retry('q3')
    expect((await queue.list())[0]).toMatchObject({ state: 'failed', lastErrorDetails: { nextRequiredBaseNumber: '2' } })
  })
})

it('a fresh scan replaces the refused proof so it cannot block later submissions', async () => {
  const checkIn = vi.fn().mockRejectedValueOnce(ApiError.fromResponse(400, { code: 'PREVIOUS_BASE_REQUIRED', errors: { nextRequiredBaseNumber: '1' } })).mockResolvedValue(receipt('b2'))
  const { queue, exec } = make({ checkIn })
  await queue.enqueueCheckIn({ id: 'old', gameId: 'g', baseId: 'b2', proof: nfc('old') })
  await queue.sync()
  await queue.enqueueCheckIn({ id: 'fresh', gameId: 'g', baseId: 'b2', proof: nfc('new') })
  await queue.enqueueSubmission({ id: 'answer', gameId: 'g', baseId: 'b2', challengeId: 'c2', answer: 'yes' })
  await queue.sync()
  expect(exec.submit).toHaveBeenCalledTimes(1)
  expect(await queue.list()).toEqual([])
})
```

- [ ] **Step 2: Run test to verify it fails**

```
bun run --cwd packages/game-core test -- src/queue.test.ts
```

Expected failure: every `enqueueCheckIn` call is rejected by the compiler-free runtime as a silently missing `nfcToken`, and the four new "typed proofs" tests fail — `expect(seen).toEqual([proof])` receives `[undefined]`, and `queue.list()` returns the legacy row with `nfcToken` instead of `proof: { type: 'nfc', token: 'ab12cd34' }`. `bun run --cwd packages/game-core typecheck` reports `Object literal may only specify known properties, and 'proof' does not exist in type ...` on `enqueueCheckIn`, plus `Property 'method' is missing in type ... CheckInResponse` if `receipt` is compared before Task 1 landed.

- [ ] **Step 3: Write minimal implementation**

In `packages/game-core/src/queue.ts`, change the import block at the top of the file from:

```ts
import type { ApiError, CheckInResponse, EntityId, SubmissionResponse } from '@pointfinder/api'
```

to:

```ts
import type { ApiError, CheckInResponse, EntityId, SubmissionResponse } from '@pointfinder/api'
import type { CheckInProof } from './proof'
```

Replace the `PendingCheckIn` interface:

```ts
export interface PendingCheckIn extends PendingActionBase {
  type: 'check_in'
  nfcToken: string
  /** Pending earlier route check-ins that must sync before this proof. */
  prerequisiteCheckInIds?: string[]
}
```

with:

```ts
export interface PendingCheckIn extends PendingActionBase {
  type: 'check_in'
  /** The whole proof, so a queued arrival replays exactly the fix that was taken. */
  proof: CheckInProof
  /** Pending earlier route check-ins that must sync before this proof. */
  prerequisiteCheckInIds?: string[]
}
```

Replace the `enqueueCheckIn` signature line:

```ts
  async enqueueCheckIn(input: { id: string; gameId: EntityId; baseId: EntityId; nfcToken: string; prerequisiteCheckInIds?: string[] }): Promise<PendingCheckIn> {
```

with:

```ts
  async enqueueCheckIn(input: { id: string; gameId: EntityId; baseId: EntityId; proof: CheckInProof; prerequisiteCheckInIds?: string[] }): Promise<PendingCheckIn> {
```

Route every read through the normaliser. Run exactly this replacement over the file (14 call sites):

```
cd /Users/xmedavid/dev/dbvnfc && perl -pi -e 's/\Qthis.options.store.list()\E/this.stored()/g' packages/game-core/src/queue.ts
```

Then add the `stored()` helper as the first member of the `OfflineQueue` class body, immediately after the constructor's closing brace and before `onChange`:

```ts
  /** Every read of the durable store goes through here, so old rows arrive in today's shape. */
  private async stored(): Promise<PendingAction[]> {
    return (await this.options.store.list()).map(normalizeAction)
  }

```

Finally, add `normalizeAction` at the end of `packages/game-core/src/queue.ts`, after `requiresRescan`:

```ts
/**
 * Rows written before proofs were typed carry `nfcToken` and no `proof`.
 * They were all tag taps, so that is what they become. Reading is enough:
 * the row is rewritten in today's shape the next time anything touches it.
 */
export function normalizeAction(action: PendingAction): PendingAction {
  if (action.type !== 'check_in') return action
  const legacy = action as PendingCheckIn & { nfcToken?: unknown }
  if (legacy.proof || typeof legacy.nfcToken !== 'string') return action
  const { nfcToken, ...rest } = legacy
  return { ...rest, proof: { type: 'nfc', token: nfcToken } }
}
```

Then update `packages/game-core/src/baseOrder.test.ts` line 7, replacing:

```ts
const proof = (n: number, extra = {}): PendingAction => ({ id: `q${n}`, type: 'check_in', baseId: `b${n}`, gameId: 'g', nfcToken: 'proof', state: 'pending', createdAt: '', attempts: 0, nextAttemptAt: 0, ...extra })
```

with:

```ts
const proof = (n: number, extra = {}): PendingAction => ({ id: `q${n}`, type: 'check_in', baseId: `b${n}`, gameId: 'g', proof: { type: 'nfc', token: 'proof' }, state: 'pending', createdAt: '', attempts: 0, nextAttemptAt: 0, ...extra })
```

- [ ] **Step 4: Run test to verify it passes**

```
bun run --cwd packages/game-core test -- src/queue.test.ts
bun run --cwd packages/game-core test -- src/baseOrder.test.ts
bun run --cwd packages/game-core typecheck
```

Expected: all queue and baseOrder tests pass; typecheck exits 0 except for `src/progress.test.ts`, which Task 6 fixes.

- [ ] **Step 5: Commit** — no commit. End here with the queue and baseOrder suites green.

---

### Task 6: `progress.ts` — the method and radius a base screen needs

**Files:**
- Modify: `packages/game-core/src/progress.ts` (imports at line 1; `BaseView` interface lines 10-17; the `mergeProgress` return at the end of its `map` callback)
- Modify: `packages/game-core/src/progress.test.ts` (the `bp` helper lines 5-11; the `act` helper line 13-14)

**Interfaces:**
- Consumes: `BaseProgress` from `@pointfinder/api`; `CheckInMethod` from `./proof`; `DEFAULT_CHECK_IN_RADIUS_M` from `./geofence`.
- Produces: `BaseView.checkInMethod: CheckInMethod` (required), `BaseView.checkInRadiusM: number` (required, resolved).

- [ ] **Step 1: Write the failing test**

In `packages/game-core/src/progress.test.ts`, replace the `bp` and `act` helpers:

```ts
const bp = (baseId: string, status: 'not_visited' | 'checked_in' | 'submitted' | 'completed' | 'rejected') => ({
  baseId,
  lat: 0,
  lng: 0,
  nfcLinked: true,
  checkInMethod: 'NFC' as const,
  status,
})

const act = (over: Partial<PendingAction> & { baseId: string; type: PendingAction['type'] }): PendingAction =>
  ({ id: 'x', gameId: 'g', createdAt: '2026-01-01T00:00:00Z', attempts: 0, nextAttemptAt: 0, state: 'pending', proof: { type: 'nfc', token: 't' }, challengeId: 'c', answer: '', ...over }) as unknown as PendingAction
```

and append this describe block to the end of the same file:

```ts
describe('the check-in method a base screen must render', () => {
  it('carries the base method and its resolved radius onto the view', () => {
    const [view] = mergeProgress([{ ...bp('a', 'not_visited'), checkInMethod: 'LOCATION' as const, checkInRadiusM: 40 }], [])
    expect(view).toMatchObject({ checkInMethod: 'LOCATION', checkInRadiusM: 40 })
  })

  it('falls back to a tag and the default radius for progress cached before methods existed', () => {
    const stale = { baseId: 'a', lat: 0, lng: 0, nfcLinked: true, status: 'not_visited' as const } as Parameters<typeof mergeProgress>[0][number]
    const [view] = mergeProgress([stale], [])
    expect(view).toMatchObject({ checkInMethod: 'NFC', checkInRadiusM: 15 })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```
bun run --cwd packages/game-core test -- src/progress.test.ts
```

Expected failure: `expected { baseId: 'a', ... } to match object { checkInMethod: 'LOCATION', checkInRadiusM: 40 }` — the view has no `checkInRadiusM` key at all — and the second case reports `checkInMethod: undefined`.

- [ ] **Step 3: Write minimal implementation**

In `packages/game-core/src/progress.ts`, replace the import block at the top:

```ts
import type { BaseProgress, BaseStatus, SubmissionStatus } from '@pointfinder/api'
import type { PendingAction } from './queue'
```

with:

```ts
import type { BaseProgress, BaseStatus, SubmissionStatus } from '@pointfinder/api'
import { DEFAULT_CHECK_IN_RADIUS_M } from './geofence'
import type { CheckInMethod } from './proof'
import type { PendingAction } from './queue'
```

Replace the `BaseView` interface:

```ts
export interface BaseView extends BaseProgress {
  /** Server status merged with queued local actions. */
  effectiveStatus: BaseStatus
  /** True when a local action for this base has not reached the server yet. */
  pendingSync: boolean
  /** Set when a local action for this base was refused by the server. */
  syncError?: string | null
}
```

with:

```ts
export interface BaseView extends BaseProgress {
  /** Server status merged with queued local actions. */
  effectiveStatus: BaseStatus
  /** True when a local action for this base has not reached the server yet. */
  pendingSync: boolean
  /** Set when a local action for this base was refused by the server. */
  syncError?: string | null
  /** How this base is entered. Always answered, so a screen never has to guess. */
  checkInMethod: CheckInMethod
  /** Metres, already resolved: the base's own radius or the game default. */
  checkInRadiusM: number
}
```

Replace the final `return` inside `mergeProgress`'s `map` callback:

```ts
    return { ...p, effectiveStatus: status, pendingSync, syncError }
```

with:

```ts
    // A snapshot cached before methods existed has neither field; it was a tag base.
    const stored: { checkInMethod?: CheckInMethod | null; checkInRadiusM?: number | null } = p
    return {
      ...p,
      effectiveStatus: status,
      pendingSync,
      syncError,
      checkInMethod: stored.checkInMethod ?? 'NFC',
      checkInRadiusM: stored.checkInRadiusM ?? DEFAULT_CHECK_IN_RADIUS_M,
    }
```

- [ ] **Step 4: Run test to verify it passes**

```
bun run --cwd packages/game-core test -- src/progress.test.ts
bun run --cwd packages/game-core test
bun run --cwd packages/game-core typecheck
```

Expected: the whole game-core suite passes and typecheck exits 0.

- [ ] **Step 5: Commit** — no commit. End here with the whole game-core package green.

---

### Task 7: Web wiring, fixtures, and the phase commit

**Files:**
- Modify: `web/src/app/player/client.ts` (import line 2; queue executor `checkIn` line 67)
- Modify: `web/src/features/player/usePlayerGame.ts` (import line 4; `checkIn` callback lines 157-181)
- Modify: `web/src/features/player/BaseScreen.tsx` (import line 5; `checkInWith` lines 96-107; the `?token=` effect lines 110-119; `tapTag` line 136)
- Modify: `web/src/features/dev/VisualHarnessPage.tsx` (line 177 `BaseProgress` literal)
- Test: `web/src/app/player/client.test.ts` (line 9 and the expectation on line 25)
- Test: `web/src/test/msw/handlers/player.ts` (bases lines 9-11, progress lines 24-26, check-in handler lines 58-63)
- Test: `web/src/features/player/BaseScreen.test.tsx` (line 10, lines 17-18, line 24, line 285)
- Test: `web/src/features/player/logbook.test.ts` (lines 6-8, line 25)
- Test: `web/src/features/player/SettingsScreen.test.tsx` (line 31)
- Modify: `web/src/features/player/components/SyncBanner.stories.tsx` (line 6)

**Interfaces:**
- Consumes: `toCheckInRequest`, `proofTypeForMethod`, `type CheckInProof` from `@pointfinder/game-core`; `BaseView.checkInMethod` from Task 6; `player.checkIn(gameId, baseId, body)` from Task 1.
- Produces: `usePlayerGame().checkIn(baseId: string, proof: CheckInProof): Promise<ActionResult>`; queue executor sends `toCheckInRequest(a.proof)`.

- [ ] **Step 1: Write the failing test**

Three edits, all assertions.

(a) In `web/src/app/player/client.test.ts`, replace line 9:

```ts
  await queue.upsert({ id: 'old-action', type: 'check_in', gameId: 'g', baseId: 'b', nfcToken: 'proof', createdAt: '', attempts: 0, nextAttemptAt: 0, state: 'pending' })
```

with:

```ts
  await queue.upsert({ id: 'old-action', type: 'check_in', gameId: 'g', baseId: 'b', nfcToken: 'proof', createdAt: '', attempts: 0, nextAttemptAt: 0, state: 'pending' } as unknown as PendingAction)
```

and replace line 25:

```ts
  expect(await services.queue.list()).toMatchObject([{ id: 'old-action', playerId: 'p' }])
```

with:

```ts
  expect(await services.queue.list()).toMatchObject([{ id: 'old-action', playerId: 'p', proof: { type: 'nfc', token: 'proof' } }])
```

and change its game-core import on line 2 from:

```ts
import { MemoryQueueStore } from '@pointfinder/game-core'
```

to:

```ts
import { MemoryQueueStore, type PendingAction } from '@pointfinder/game-core'
```

(b) In `web/src/features/player/BaseScreen.test.tsx`, replace lines 17-18:

```ts
      const body = (await request.json()) as { nfcToken?: string }
      if (body.nfcToken === 'wrong') return HttpResponse.json({ status: 403, message: 'Invalid tag', code: 'NFC_TOKEN_MISMATCH' }, { status: 403 })
```

with:

```ts
      const body = (await request.json()) as { method?: string; token?: string }
      if (body.method !== 'nfc') return HttpResponse.json({ status: 400, message: 'Wrong method', code: 'CHECK_IN_METHOD_MISMATCH' }, { status: 400 })
      if (body.token === 'wrong') return HttpResponse.json({ status: 403, message: 'Invalid tag', code: 'NFC_TOKEN_MISMATCH' }, { status: 403 })
```

(c) In `web/src/features/player/BaseScreen.test.tsx`, replace line 10:

```ts
const NOT_VISITED = { baseId: 'b1', challengeTitle: 'The old mill', lat: 40.09, lng: -8.87, nfcLinked: true, status: 'not_visited', checkedInAt: null, challengeId: 'c1', submissionStatus: null }
```

with:

```ts
const NOT_VISITED = { baseId: 'b1', challengeTitle: 'The old mill', lat: 40.09, lng: -8.87, nfcLinked: true, checkInMethod: 'NFC', checkInRadiusM: 15, status: 'not_visited', checkedInAt: null, challengeId: 'c1', submissionStatus: null }
```

- [ ] **Step 2: Run test to verify it fails**

```
bun run --cwd web test -- src/features/player/BaseScreen.test.tsx src/app/player/client.test.ts
```

Expected failure: every BaseScreen check-in test fails with the body now sending `{ nfcToken: 'secret' }`, so `body.method !== 'nfc'` returns `CHECK_IN_METHOD_MISMATCH` — `expected element to have text content "You're in!"` and instead the status alert reads `Wrong method`. `client.test.ts` fails with `expected [ { id: 'old-action', playerId: 'p', nfcToken: 'proof' } ] to match [ { ..., proof: { type: 'nfc', token: 'proof' } } ]`.

- [ ] **Step 3: Write minimal implementation**

In `web/src/app/player/client.ts`, change the game-core import on line 2 from:

```ts
import { OfflineQueue, uploadSubmissionMedia, type QueueStore, type PendingAction } from '@pointfinder/game-core'
```

to:

```ts
import { OfflineQueue, toCheckInRequest, uploadSubmissionMedia, type QueueStore, type PendingAction } from '@pointfinder/game-core'
```

and replace line 67:

```ts
      checkIn: (a) => { requireOwner(a); return client.api.player.checkIn(a.gameId, a.baseId, a.nfcToken) },
```

with:

```ts
      checkIn: (a) => { requireOwner(a); return client.api.player.checkIn(a.gameId, a.baseId, toCheckInRequest(a.proof)) },
```

In `web/src/features/player/usePlayerGame.ts`, change the game-core import on line 4 from:

```ts
import { baseRoute, missingPreviousBase, type PendingAction, type SyncOutcome } from '@pointfinder/game-core'
```

to:

```ts
import { baseRoute, missingPreviousBase, type CheckInProof, type PendingAction, type SyncOutcome } from '@pointfinder/game-core'
```

replace the `checkIn` callback's first line:

```ts
  const checkIn = useCallback(async (baseId: string, nfcToken: string): Promise<ActionResult> => {
```

with:

```ts
  const checkIn = useCallback(async (baseId: string, proof: CheckInProof): Promise<ActionResult> => {
```

and replace the `enqueueCheckIn` line inside it:

```ts
    const action = await queue.enqueueCheckIn({ id: crypto.randomUUID(), gameId, baseId, nfcToken, prerequisiteCheckInIds })
```

with:

```ts
    const action = await queue.enqueueCheckIn({ id: crypto.randomUUID(), gameId, baseId, proof, prerequisiteCheckInIds })
```

In `web/src/features/player/BaseScreen.tsx`, change the game-core import on line 5 from:

```ts
import { missingPreviousBase } from '@pointfinder/game-core'
```

to:

```ts
import { missingPreviousBase, proofTypeForMethod, type CheckInProof } from '@pointfinder/game-core'
```

replace `checkInWith`:

```ts
  async function checkInWith(token: string) {
    setBusy(true)
    setNotice(null)
    setMissingNumber(null)
    try {
      report(await game.checkIn(baseId, token), 'check_in')
    } catch (err) {
      setNotice({ tone: 'destructive', text: describeError(err, t) })
    } finally {
      setBusy(false)
    }
  }
```

with:

```ts
  async function checkInWith(proof: CheckInProof) {
    setBusy(true)
    setNotice(null)
    setMissingNumber(null)
    try {
      report(await game.checkIn(baseId, proof), 'check_in')
    } catch (err) {
      setNotice({ tone: 'destructive', text: describeError(err, t) })
    } finally {
      setBusy(false)
    }
  }
```

replace the body of the `?token=` effect:

```ts
    const token = params.get('token')
    const scanKey = `${location.key}:${token}`
    if (token === null || scanKey === autoToken.current || !view || !needsCheckIn || !gameLive) return
    autoToken.current = scanKey
    setParams({}, { replace: true })
    void checkInWith(token)
```

with:

```ts
    const token = params.get('token')
    const scanKey = `${location.key}:${token}`
    if (token === null || scanKey === autoToken.current || !view || !needsCheckIn || !gameLive) return
    // A token in the link proves the tag or the printed code; the base says which.
    const mode = proofTypeForMethod(view.checkInMethod)
    if (mode === 'geo') return
    autoToken.current = scanKey
    setParams({}, { replace: true })
    void checkInWith({ type: mode, token })
```

and replace the `tapTag` call line:

```ts
      await checkInWith(tag.token ?? '')
```

with:

```ts
      await checkInWith({ type: 'nfc', token: tag.token ?? '' })
```

In `web/src/features/dev/VisualHarnessPage.tsx`, replace line 177:

```tsx
              logbook={buildLogbook([{ baseId: 'preview-base', sequenceNumber: 2, challengeTitle: 'Find the inscription beside the old forest bridge', lat: 0, lng: 0, nfcLinked: true, status: 'not_visited' }], [], [])} />
```

with:

```tsx
              logbook={buildLogbook([{ baseId: 'preview-base', sequenceNumber: 2, challengeTitle: 'Find the inscription beside the old forest bridge', lat: 0, lng: 0, nfcLinked: true, checkInMethod: 'NFC', status: 'not_visited' }], [], [])} />
```

In `web/src/test/msw/handlers/player.ts`, replace the three `bases` entries (lines 9-11):

```ts
    { id: 'b1', gameId: 'g1', lat: 40.09, lng: -8.87, nfcLinked: true, hidden: false, fixedChallengeId: null },
    { id: 'b2', gameId: 'g1', lat: 40.091, lng: -8.871, nfcLinked: true, hidden: false, fixedChallengeId: null },
    { id: 'b3', gameId: 'g1', lat: 40.092, lng: -8.872, nfcLinked: false, hidden: false, fixedChallengeId: null },
```

with:

```ts
    { id: 'b1', gameId: 'g1', lat: 40.09, lng: -8.87, nfcLinked: true, checkInMethod: 'NFC', checkInRadiusM: 15, hidden: false, fixedChallengeId: null },
    { id: 'b2', gameId: 'g1', lat: 40.091, lng: -8.871, nfcLinked: true, checkInMethod: 'NFC', checkInRadiusM: 15, hidden: false, fixedChallengeId: null },
    { id: 'b3', gameId: 'g1', lat: 40.092, lng: -8.872, nfcLinked: false, checkInMethod: 'NFC', checkInRadiusM: 15, hidden: false, fixedChallengeId: null },
```

replace the three `progress` entries (lines 24-26):

```ts
    { baseId: 'b1', challengeTitle: 'The old mill', lat: 40.09, lng: -8.87, nfcLinked: true, status: 'completed', checkedInAt: '2026-09-05T09:00:00Z', challengeId: 'c1', submissionStatus: 'correct' },
    { baseId: 'b2', challengeTitle: 'Granite boulder', lat: 40.091, lng: -8.871, nfcLinked: true, status: 'checked_in', checkedInAt: '2026-09-05T09:30:00Z', challengeId: 'c2', submissionStatus: null },
    { baseId: 'b3', challengeTitle: 'Chapel', lat: 40.092, lng: -8.872, nfcLinked: false, status: 'submitted', checkedInAt: '2026-09-05T09:40:00Z', challengeId: 'c3', submissionStatus: 'pending' },
```

with:

```ts
    { baseId: 'b1', challengeTitle: 'The old mill', lat: 40.09, lng: -8.87, nfcLinked: true, checkInMethod: 'NFC', checkInRadiusM: 15, status: 'completed', checkedInAt: '2026-09-05T09:00:00Z', challengeId: 'c1', submissionStatus: 'correct' },
    { baseId: 'b2', challengeTitle: 'Granite boulder', lat: 40.091, lng: -8.871, nfcLinked: true, checkInMethod: 'NFC', checkInRadiusM: 15, status: 'checked_in', checkedInAt: '2026-09-05T09:30:00Z', challengeId: 'c2', submissionStatus: null },
    { baseId: 'b3', challengeTitle: 'Chapel', lat: 40.092, lng: -8.872, nfcLinked: false, checkInMethod: 'NFC', checkInRadiusM: 15, status: 'submitted', checkedInAt: '2026-09-05T09:40:00Z', challengeId: 'c3', submissionStatus: 'pending' },
```

and replace the check-in handler (lines 58-63):

```ts
  http.post('/api/player/games/:gameId/bases/:baseId/check-in', async ({ params, request }) => {
    const body = (await request.json()) as { nfcToken?: string }
    if (!body.nfcToken) return HttpResponse.json({ status: 400, message: 'NFC token required', code: 'NFC_TOKEN_REQUIRED' }, { status: 400 })
    if (body.nfcToken === 'wrong') return HttpResponse.json({ status: 403, message: 'Invalid tag', code: 'NFC_TOKEN_MISMATCH' }, { status: 403 })
    return HttpResponse.json({ checkInId: 'ci-1', baseId: params.baseId, checkedInAt: '2026-09-05T10:45:00Z' })
  }),
```

with:

```ts
  http.post('/api/player/games/:gameId/bases/:baseId/check-in', async ({ params, request }) => {
    const body = (await request.json()) as { method?: string; token?: string; nfcToken?: string }
    const token = body.token ?? body.nfcToken
    if (body.method !== 'geo' && !token) return HttpResponse.json({ status: 400, message: 'NFC token required', code: 'NFC_TOKEN_REQUIRED' }, { status: 400 })
    if (token === 'wrong') return HttpResponse.json({ status: 403, message: 'Invalid tag', code: 'NFC_TOKEN_MISMATCH' }, { status: 403 })
    const method = body.method === 'geo' ? 'LOCATION' : body.method === 'qr' ? 'QR' : 'NFC'
    return HttpResponse.json({ checkInId: 'ci-1', baseId: params.baseId, checkedInAt: '2026-09-05T10:45:00Z', method, verification: 'VERIFIED' })
  }),
```

In `web/src/features/player/BaseScreen.test.tsx`, replace line 24's two base entries:

```ts
      bases: [{ id: 'b1', gameId: 'g1', lat: 40.09, lng: -8.87, nfcLinked: true, hidden: false, fixedChallengeId: null }, { id: 'b2', gameId: 'g1', lat: 40.091, lng: -8.871, nfcLinked: true, hidden: false, fixedChallengeId: null }],
```

with:

```ts
      bases: [{ id: 'b1', gameId: 'g1', lat: 40.09, lng: -8.87, nfcLinked: true, checkInMethod: 'NFC', checkInRadiusM: 15, hidden: false, fixedChallengeId: null }, { id: 'b2', gameId: 'g1', lat: 40.091, lng: -8.871, nfcLinked: true, checkInMethod: 'NFC', checkInRadiusM: 15, hidden: false, fixedChallengeId: null }],
```

and replace line 285:

```ts
      { type: 'check_in', id: 'failed', gameId: 'g1', baseId: 'b1', nfcToken: 'old', createdAt: '', state: 'failed', attempts: 1, nextAttemptAt: 0, lastErrorCode: 'PREVIOUS_CHECK_IN_FAILED' },
```

with:

```ts
      { type: 'check_in', id: 'failed', gameId: 'g1', baseId: 'b1', proof: { type: 'nfc', token: 'old' }, createdAt: '', state: 'failed', attempts: 1, nextAttemptAt: 0, lastErrorCode: 'PREVIOUS_CHECK_IN_FAILED' },
```

In `web/src/features/player/logbook.test.ts`, replace the `p` helper (lines 6-8):

```ts
const p = (baseId: string, status: BaseProgress['status'], title: string | null = 'T'): BaseProgress => ({
  baseId, challengeTitle: title, lat: 0, lng: 0, nfcLinked: true, status,
})
```

with:

```ts
const p = (baseId: string, status: BaseProgress['status'], title: string | null = 'T'): BaseProgress => ({
  baseId, challengeTitle: title, lat: 0, lng: 0, nfcLinked: true, checkInMethod: 'NFC', status,
})
```

and replace line 25:

```ts
    const pending: PendingAction = { type: 'check_in', id: 'q', gameId: 'g', baseId: 'b', nfcToken: 't', createdAt: '', attempts: 0, nextAttemptAt: 0, state: 'pending' }
```

with:

```ts
    const pending: PendingAction = { type: 'check_in', id: 'q', gameId: 'g', baseId: 'b', proof: { type: 'nfc', token: 't' }, createdAt: '', attempts: 0, nextAttemptAt: 0, state: 'pending' }
```

In `web/src/features/player/SettingsScreen.test.tsx`, replace line 31:

```ts
      pending: [{ type: 'check_in', id: 'q1', gameId: 'g1', baseId: 'b2', nfcToken: 't', createdAt: '2026-09-05T09:00:00Z', attempts: 0, nextAttemptAt: Date.now() + 60_000, state: 'pending' }],
```

with:

```ts
      pending: [{ type: 'check_in', id: 'q1', gameId: 'g1', baseId: 'b2', proof: { type: 'nfc', token: 't' }, createdAt: '2026-09-05T09:00:00Z', attempts: 0, nextAttemptAt: Date.now() + 60_000, state: 'pending' }],
```

In `web/src/features/player/components/SyncBanner.stories.tsx`, replace line 6:

```tsx
  ({ type: "check_in", id: "a1", gameId: "g", baseId: "b", nfcToken: "t", createdAt: "2026-09-05T09:00:00Z", attempts: 0, nextAttemptAt: 0, state: "pending", ...over }) as PendingAction;
```

with:

```tsx
  ({ type: "check_in", id: "a1", gameId: "g", baseId: "b", proof: { type: "nfc", token: "t" }, createdAt: "2026-09-05T09:00:00Z", attempts: 0, nextAttemptAt: 0, state: "pending", ...over }) as PendingAction;
```

- [ ] **Step 4: Run test to verify it passes**

```
bun run --cwd web test -- src/features/player/BaseScreen.test.tsx src/app/player/client.test.ts src/features/player/logbook.test.ts src/features/player/SettingsScreen.test.tsx
```

Expected: all four suites pass.

- [ ] **Step 5: Commit**

Run the four phase gates, in this order, and read each one's output before moving on:

```
bun run --cwd web typecheck
bun run --cwd web lint
bun run --cwd packages/game-core test
bun run --cwd web test
```

All four must exit 0. If `web typecheck` reports anything in `packages/api` or `packages/game-core`, also run `bun run --cwd packages/api typecheck` and `bun run --cwd packages/game-core typecheck` and fix there, not in `web`.

Then stage only the source files this phase touched — never `docs/superpowers/plans/` or `docs/specs/` — and commit once:

```
cd /Users/xmedavid/dev/dbvnfc && git add \
  packages/api/src/types.ts \
  packages/api/src/endpoints.ts \
  packages/game-core/src/proof.ts \
  packages/game-core/src/proof.test.ts \
  packages/game-core/src/geofence.ts \
  packages/game-core/src/geofence.test.ts \
  packages/game-core/src/arrival.ts \
  packages/game-core/src/arrival.test.ts \
  packages/game-core/src/queue.ts \
  packages/game-core/src/queue.test.ts \
  packages/game-core/src/baseOrder.test.ts \
  packages/game-core/src/progress.ts \
  packages/game-core/src/progress.test.ts \
  packages/game-core/src/index.ts \
  web/src/app/player/client.ts \
  web/src/app/player/client.test.ts \
  web/src/features/player/usePlayerGame.ts \
  web/src/features/player/BaseScreen.tsx \
  web/src/features/player/BaseScreen.test.tsx \
  web/src/features/player/logbook.test.ts \
  web/src/features/player/SettingsScreen.test.tsx \
  web/src/features/player/components/SyncBanner.stories.tsx \
  web/src/features/dev/VisualHarnessPage.tsx \
  web/src/test/msw/handlers/player.ts
```

```
cd /Users/xmedavid/dev/dbvnfc && git commit -m "feat(shared): check-in proof, geofence rules and arrival detector" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

Confirm with `git show --stat HEAD` that no plan or spec file is in the commit.
