# Check-in methods — Phase 4: Player app Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the native player app three working check-in methods — NFC tap, in-app QR scan, and automatic GPS arrival with a dwell-gated "I'm here" claim — so a team can reach any base the operator configured.

**Architecture:** The foreground location watch moves out of `PlayerMap` into a zustand store (`web/src/app/player/locationStore.ts`) owned by `startPlayerRuntime`; `useTeamLocation` becomes a thin reporter that keeps `decideSend`. A runtime-owned arrival detector (`web/src/app/player/arrival.ts`) feeds each fix plus a candidate list built from the cached game data into game-core's pure `evaluateArrival`, enqueues `geo` proofs through the same `services.queue` path `usePlayerGame.checkIn` uses, and publishes app-wide notices. `BaseScreen` branches on `view.checkInMethod` between the existing NFC button, a QR scan through the generalised `QrScannerOverlay`, and a live `LocationCheckInPanel`.

**Tech Stack:** React 18 + TypeScript, Tailwind semantic tokens, zustand, TanStack Query, react-router-dom, react-map-gl/maplibre, `@pointfinder/game-core`, `@pointfinder/api`, `@pointfinder/i18n`, Vitest + Testing Library + MSW, Tauri plugins (`plugin-geolocation`, `plugin-barcode-scanner`) behind `web/src/platform/`.

## Global Constraints

- Native-only player surface: every new capability is guarded by `isNative()`; browser player paths keep today's behaviour and must not regress.
- Thresholds are never re-derived in the app: import `AUTO_ACCURACY_CAP_M`, `ACCURACY_CREDIT_CAP_M`, `CLAIM_ACCURACY_CAP_M`, `DWELL_MIN_FIXES`, `DWELL_MIN_SPAN_MS`, `DWELL_SAMPLE_INTERVAL_MS`, `DWELL_BUFFER_MAX_MS`, `ARRIVAL_RETRY_MS`, `wideRingM`, `autoAccepts`, `insideWideRing`, `dwellSatisfied`, `pushDwellSample`, `evaluateArrival` from `@pointfinder/game-core`.
- Never rename an existing `data-testid`, route, API path, or accessibility id. New ids only: `player-scan-qr-btn`, `player-tap-nfc-btn` (the NFC button has none today), `player-location-panel`, `player-im-here-btn`, `player-arrival-notice`, `player-map-scan-qr-btn`, `player-map-location-warning`.
- Every new i18n key lands in `en.json`, `de.json` and `pt.json` in the same change; `packages/i18n` has a key-parity test that fails otherwise.
- Compose canonical components (`Alert`, `Button`, `Card`, `Screen`, `SyncBanner`, `QrScannerOverlay`, `StatusMarker`); no new primitives, no raw Tailwind palette classes, no hard-coded hex outside `web/src/generated/colorValues`.
- Cover loading/locating, empty, error, offline/queued, denied, disabled and long-copy states; both themes; reduced motion (no animated toast entrance beyond a token transition); accessible labels on every icon-only control.
- Focused test command: `bun run --cwd web test -- <path>`; game-core: `bun run --cwd packages/game-core test`; i18n: `bun run --cwd packages/i18n test`.
- ONE atomic commit at the very end of the phase (Task 12) with trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Do not commit this plan file.

---

### Task 1: Player i18n keys and check-in error copy

**Files:**
- Modify: `packages/i18n/src/locales/en.json` (playerApp block, lines 1297–1304 for `checkIn`, line 1478 and 1482 for `disclosure`)
- Modify: `packages/i18n/src/locales/de.json` (same line ranges)
- Modify: `packages/i18n/src/locales/pt.json` (same line ranges)
- Modify: `web/src/app/player/errors.ts`
- Test: `web/src/app/player/errors.test.ts` (create)

**Interfaces:**
- Consumes: `ApiError` from `@pointfinder/api` (`code`, `status`, `fieldErrors`), `TFunction` from `i18next`.
- Produces: `playerApp.checkIn.{scanQr,wrongCode,imHere,imHereHint,arrived,found,foundUnknown,claimed}`, `playerApp.location.{locating,denied,openSettings,far,near,arrived,unavailable,basesWontUnlock}`, `playerApp.errors.{CHECK_IN_METHOD_MISMATCH,CHECK_IN_TOKEN_INVALID,CHECK_IN_FIX_TOO_COARSE,CHECK_IN_FIX_STALE,CHECK_IN_OUT_OF_RANGE,CHECK_IN_CLAIM_NOT_DWELLED}`; unchanged `describeError(err: unknown, t: TFunction): string`.

- [ ] **Step 1: Write the failing test**

Create `web/src/app/player/errors.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { ApiError } from '@pointfinder/api'
import i18n from '@/i18n'
import { describeError } from './errors'

const t = i18n.getFixedT(null, undefined, 'playerApp')

function apiError(code: string, fieldErrors: Record<string, string> = {}) {
  return new ApiError({ status: 400, message: 'server text', code, fieldErrors })
}

describe('describeError', () => {
  it('explains a method mismatch in player words', () => {
    expect(describeError(apiError('CHECK_IN_METHOD_MISMATCH'), t)).toBe('This base uses a different way to check in.')
  })

  it('explains an invalid token', () => {
    expect(describeError(apiError('CHECK_IN_TOKEN_INVALID'), t)).toBe("That code doesn't belong to this base.")
  })

  it('explains a coarse fix', () => {
    expect(describeError(apiError('CHECK_IN_FIX_TOO_COARSE'), t)).toBe('Your GPS signal is too weak. Move into the open and try again.')
  })

  it('explains a stale fix', () => {
    expect(describeError(apiError('CHECK_IN_FIX_STALE'), t)).toBe('That position is too old. Wait for a fresh GPS reading.')
  })

  it('reports the measured distance when out of range', () => {
    expect(describeError(apiError('CHECK_IN_OUT_OF_RANGE', { distanceM: '84', allowedM: '20' }), t))
      .toBe("You're about 84 m away. Get within 20 m of the base.")
  })

  it('explains a refused claim', () => {
    expect(describeError(apiError('CHECK_IN_CLAIM_NOT_DWELLED'), t)).toBe('Stay near the base a little longer, then try again.')
  })

  it('still falls back to the server message for unknown codes', () => {
    expect(describeError(apiError('SOMETHING_ELSE'), t)).toBe('server text')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```sh
bun run --cwd web test -- src/app/player/errors.test.ts
```

Expected failure: every check-in assertion fails because `describeError` returns the raw `'server text'`, and the missing keys make `t('errors.CHECK_IN_METHOD_MISMATCH')` resolve to the key path.

- [ ] **Step 3: Write minimal implementation**

In all three of `packages/i18n/src/locales/en.json`, `de.json`, `pt.json`, replace the `playerApp.checkIn` object (line 1297–1304) with the localized block below and insert the `location` and `errors` objects immediately after it (before `"sync": {`).

`en.json`:

```json
    "checkIn": {
      "title": "Check in",
      "tapTag": "Tap the tag at the base",
      "scanning": "Looking for the tag…",
      "success": "You're in!",
      "alreadyCheckedIn": "Your team already checked in here.",
      "queuedOffline": "Saved. It will sync when you're back online.",
      "scanQr": "Scan code",
      "wrongCode": "That code belongs to a different base.",
      "imHere": "I'm here",
      "imHereHint": "Stay near the base for a minute to enable this.",
      "arrived": "Arrived at {{name}}",
      "found": "You found {{name}}",
      "foundUnknown": "You found a base",
      "claimed": "Checked in from nearby. Your operator can see it."
    },
    "location": {
      "locating": "Finding your position…",
      "denied": "Location is off, so this base can't unlock.",
      "openSettings": "Open settings",
      "far": "About {{meters}} m away",
      "near": "You're close. GPS accuracy ±{{accuracy}} m, move into the open",
      "arrived": "You're at the base.",
      "unavailable": "This phone can't report a position right now.",
      "basesWontUnlock": "Location is off. Bases that unlock by position will not open."
    },
    "errors": {
      "CHECK_IN_METHOD_MISMATCH": "This base uses a different way to check in.",
      "CHECK_IN_TOKEN_INVALID": "That code doesn't belong to this base.",
      "CHECK_IN_FIX_TOO_COARSE": "Your GPS signal is too weak. Move into the open and try again.",
      "CHECK_IN_FIX_STALE": "That position is too old. Wait for a fresh GPS reading.",
      "CHECK_IN_OUT_OF_RANGE": "You're about {{distance}} m away. Get within {{allowed}} m of the base.",
      "CHECK_IN_CLAIM_NOT_DWELLED": "Stay near the base a little longer, then try again."
    },
```

`de.json`:

```json
    "checkIn": {
      "title": "Einchecken",
      "tapTag": "Tippe auf den Tag an der Station",
      "scanning": "Suche den Tag…",
      "success": "Du bist drin!",
      "alreadyCheckedIn": "Dein Team hat hier bereits eingecheckt.",
      "queuedOffline": "Gespeichert. Wird synchronisiert, sobald du wieder online bist.",
      "scanQr": "Code scannen",
      "wrongCode": "Dieser Code gehört zu einer anderen Station.",
      "imHere": "Ich bin hier",
      "imHereHint": "Bleib eine Minute in der Nähe der Station, um das freizuschalten.",
      "arrived": "Angekommen bei {{name}}",
      "found": "Du hast {{name}} gefunden",
      "foundUnknown": "Du hast eine Station gefunden",
      "claimed": "Aus der Nähe eingecheckt. Dein Operator sieht das."
    },
    "location": {
      "locating": "Suche deine Position…",
      "denied": "Standort ist aus, diese Station kann nicht freigeschaltet werden.",
      "openSettings": "Einstellungen öffnen",
      "far": "Etwa {{meters}} m entfernt",
      "near": "Du bist nah dran. GPS-Genauigkeit ±{{accuracy}} m, geh ins Freie",
      "arrived": "Du bist an der Station.",
      "unavailable": "Dieses Telefon kann gerade keine Position melden.",
      "basesWontUnlock": "Standort ist aus. Stationen, die sich per Position öffnen, bleiben zu."
    },
    "errors": {
      "CHECK_IN_METHOD_MISMATCH": "Diese Station wird auf andere Weise eingecheckt.",
      "CHECK_IN_TOKEN_INVALID": "Dieser Code gehört nicht zu dieser Station.",
      "CHECK_IN_FIX_TOO_COARSE": "Dein GPS-Signal ist zu schwach. Geh ins Freie und versuch es erneut.",
      "CHECK_IN_FIX_STALE": "Diese Position ist zu alt. Warte auf eine frische GPS-Messung.",
      "CHECK_IN_OUT_OF_RANGE": "Du bist etwa {{distance}} m entfernt. Komm auf {{allowed}} m an die Station heran.",
      "CHECK_IN_CLAIM_NOT_DWELLED": "Bleib noch etwas länger in der Nähe der Station und versuch es dann erneut."
    },
```

`pt.json`:

```json
    "checkIn": {
      "title": "Check-in",
      "tapTag": "Toca na etiqueta da base",
      "scanning": "À procura da etiqueta…",
      "success": "Estás dentro!",
      "alreadyCheckedIn": "A tua equipa já fez check-in aqui.",
      "queuedOffline": "Guardado. Vai sincronizar quando voltares a ter ligação.",
      "scanQr": "Ler código",
      "wrongCode": "Esse código pertence a outra base.",
      "imHere": "Estou aqui",
      "imHereHint": "Fica perto da base durante um minuto para ativar isto.",
      "arrived": "Chegaste a {{name}}",
      "found": "Encontraste {{name}}",
      "foundUnknown": "Encontraste uma base",
      "claimed": "Check-in feito por proximidade. O teu operador consegue ver."
    },
    "location": {
      "locating": "A procurar a tua posição…",
      "denied": "A localização está desligada, esta base não pode abrir.",
      "openSettings": "Abrir definições",
      "far": "Cerca de {{meters}} m de distância",
      "near": "Estás perto. Precisão do GPS ±{{accuracy}} m, sai para um sítio aberto",
      "arrived": "Estás na base.",
      "unavailable": "Este telemóvel não consegue indicar a posição agora.",
      "basesWontUnlock": "A localização está desligada. As bases que abrem por posição não vão abrir."
    },
    "errors": {
      "CHECK_IN_METHOD_MISMATCH": "Esta base usa outra forma de check-in.",
      "CHECK_IN_TOKEN_INVALID": "Esse código não pertence a esta base.",
      "CHECK_IN_FIX_TOO_COARSE": "O sinal de GPS está fraco. Sai para um sítio aberto e tenta outra vez.",
      "CHECK_IN_FIX_STALE": "Essa posição é demasiado antiga. Espera por uma leitura de GPS recente.",
      "CHECK_IN_OUT_OF_RANGE": "Estás a cerca de {{distance}} m. Aproxima-te até {{allowed}} m da base.",
      "CHECK_IN_CLAIM_NOT_DWELLED": "Fica mais um pouco perto da base e tenta outra vez."
    },
```

Then update the permission disclosure copy so it names location unlocking and code scanning at bases. Replace line 1478 (`locationDetail`) and line 1482 (`cameraDetail`) in each file:

`en.json`:

```json
      "locationDetail": "Shows your team on the live map and unlocks bases that open when you reach them.",
```
```json
      "cameraDetail": "Scan QR codes to join, check in at bases, and submit photos for challenges.",
```

`de.json`:

```json
      "locationDetail": "Zeigt dein Team auf der Live-Karte und schaltet Stationen frei, die sich beim Erreichen öffnen.",
```
```json
      "cameraDetail": "QR-Codes scannen, um beizutreten und an Stationen einzuchecken, sowie Fotos für Challenges einreichen.",
```

`pt.json`:

```json
      "locationDetail": "Mostra a tua equipa no mapa ao vivo e abre bases que se desbloqueiam quando lá chegas.",
```
```json
      "cameraDetail": "Lê códigos QR para entrar e fazer check-in nas bases, e submete fotos para desafios.",
```

Replace `web/src/app/player/errors.ts` with:

```ts
import { ApiError } from '@pointfinder/api'
import type { TFunction } from 'i18next'

/** Check-in refusals the player can act on. Distances come from the server's detail map. */
const CHECK_IN_CODES = new Set([
  'CHECK_IN_METHOD_MISMATCH',
  'CHECK_IN_TOKEN_INVALID',
  'CHECK_IN_FIX_TOO_COARSE',
  'CHECK_IN_FIX_STALE',
  'CHECK_IN_OUT_OF_RANGE',
  'CHECK_IN_CLAIM_NOT_DWELLED',
])

function rounded(value: string | undefined): string {
  const n = Number(value)
  return Number.isFinite(n) ? String(Math.round(n)) : '?'
}

/** Map an API failure to something a scout can read. Unknown codes fall back to the server message. */
export function describeError(err: unknown, t: TFunction): string {
  if (err instanceof ApiError) {
    if (err.code && CHECK_IN_CODES.has(err.code)) {
      return t(`errors.${err.code}`, {
        distance: rounded(err.fieldErrors.distanceM),
        allowed: rounded(err.fieldErrors.allowedM),
      })
    }
    switch (err.code) {
      case 'INVALID_JOIN_CODE':
      case 'TEAM_NOT_FOUND':
        return t('join.invalidCode')
      case 'GAME_NOT_ACTIVE':
        return t('join.gameNotActive')
      case 'DEVICE_IN_OTHER_TEAM':
        return t('join.deviceInOtherTeam')
      case 'INVALID_CREDENTIALS':
        return t('login.invalid')
    }
    if (err.status === 401) return t('login.invalid')
    if (err.status === 0) return t('common.offline')
    return err.message || t('common.unknownError')
  }
  return err instanceof Error && err.message ? err.message : t('common.unknownError')
}

/** The same mapping for a queued action's stored failure, which has no ApiError instance. */
export function describeFailedAction(
  code: string | null | undefined,
  details: Record<string, string> | undefined,
  fallback: string | null | undefined,
  t: TFunction,
): string {
  if (code && CHECK_IN_CODES.has(code)) {
    return t(`errors.${code}`, { distance: rounded(details?.distanceM), allowed: rounded(details?.allowedM) })
  }
  return fallback || t('common.unknownError')
}
```

- [ ] **Step 4: Run test to verify it passes**

```sh
bun run --cwd web test -- src/app/player/errors.test.ts && bun run --cwd packages/i18n test
```

- [ ] **Step 5: Commit** — no commit in this task. The single atomic commit happens in Task 12.

---

### Task 2: Location store fed by `watchLocation`

**Files:**
- Create: `web/src/app/player/locationStore.ts`
- Test: `web/src/app/player/locationStore.test.ts` (create)

**Interfaces:**
- Consumes: `watchLocation(onPosition, onState)` and `LocationPosition` from `@/platform/geolocation`; `Fix` from `@pointfinder/game-core`; `create` from `zustand`.
- Produces:
  - `export type LocationStatus = 'idle' | 'requesting' | 'watching' | 'denied' | 'unavailable'`
  - `export interface PlayerLocationState { fix: Fix | null; heading: number | null; status: LocationStatus; claimable: Record<string, boolean>; dwell: Record<string, Fix[]> }`
  - `export const useLocationStore` (zustand store of `PlayerLocationState`)
  - `export function startLocationStore(enabled: () => boolean): () => void`
  - `export function refreshLocationWatch(): void`
  - `export function setArrivalDwell(dwell: Record<string, Fix[]>, claimable: Record<string, boolean>): void`

- [ ] **Step 1: Write the failing test**

Create `web/src/app/player/locationStore.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as geolocation from '@/platform/geolocation'
import { refreshLocationWatch, setArrivalDwell, startLocationStore, useLocationStore } from './locationStore'

type Handlers = {
  onPosition: (p: geolocation.LocationPosition) => void
  onState: (s: geolocation.LocationState) => void
}

let handlers: Handlers | null = null
let stop: ReturnType<typeof vi.fn>

function position(lat: number, lng: number, accuracy = 9, timestamp = 1_000): geolocation.LocationPosition {
  return { coords: { latitude: lat, longitude: lng, accuracy, heading: 42 }, timestamp }
}

beforeEach(() => {
  handlers = null
  stop = vi.fn()
  vi.spyOn(geolocation, 'watchLocation').mockImplementation(async (onPosition, onState) => {
    handlers = { onPosition, onState } as Handlers
    return stop
  })
  useLocationStore.setState({ fix: null, heading: null, status: 'idle', claimable: {}, dwell: {} })
})

afterEach(() => vi.restoreAllMocks())

describe('locationStore', () => {
  it('publishes fixes, heading and status while the game is live', async () => {
    const enabled = { value: true }
    const off = startLocationStore(() => enabled.value)
    await vi.waitFor(() => expect(handlers).not.toBeNull())

    handlers!.onState('watching')
    handlers!.onPosition(position(40.09, -8.87))

    expect(useLocationStore.getState().status).toBe('watching')
    expect(useLocationStore.getState().fix).toEqual({ lat: 40.09, lng: -8.87, accuracy: 9, capturedAt: 1_000 })
    expect(useLocationStore.getState().heading).toBe(42)
    off()
  })

  it('does not start a watch while the game is not live', async () => {
    const off = startLocationStore(() => false)
    await Promise.resolve()
    expect(geolocation.watchLocation).not.toHaveBeenCalled()
    off()
  })

  it('starts and stops as enablement changes on refresh', async () => {
    const enabled = { value: false }
    const off = startLocationStore(() => enabled.value)
    await Promise.resolve()
    expect(geolocation.watchLocation).not.toHaveBeenCalled()

    enabled.value = true
    refreshLocationWatch()
    await vi.waitFor(() => expect(geolocation.watchLocation).toHaveBeenCalledOnce())

    enabled.value = false
    refreshLocationWatch()
    await vi.waitFor(() => expect(stop).toHaveBeenCalledOnce())
    expect(useLocationStore.getState().status).toBe('idle')
    off()
  })

  it('stops the watch and clears arrival state on teardown', async () => {
    const off = startLocationStore(() => true)
    await vi.waitFor(() => expect(handlers).not.toBeNull())
    setArrivalDwell({ b1: [{ lat: 1, lng: 2, accuracy: 5, capturedAt: 10 }] }, { b1: true })
    expect(useLocationStore.getState().claimable).toEqual({ b1: true })

    off()
    await vi.waitFor(() => expect(stop).toHaveBeenCalledOnce())
    expect(useLocationStore.getState().claimable).toEqual({})
    expect(useLocationStore.getState().dwell).toEqual({})
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```sh
bun run --cwd web test -- src/app/player/locationStore.test.ts
```

Expected failure: `Failed to resolve import "./locationStore"` — the module does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `web/src/app/player/locationStore.ts`:

```ts
import { create } from 'zustand'
import type { Fix } from '@pointfinder/game-core'
import { watchLocation, type LocationPosition, type LocationState } from '@/platform/geolocation'

/** Kept identical to the value `useTeamLocation` published before the store existed. */
export type LocationStatus = LocationState

export interface PlayerLocationState {
  fix: Fix | null
  heading: number | null
  status: LocationStatus
  /** Bases whose dwell buffer currently satisfies the claim rule. Written by the arrival detector. */
  claimable: Record<string, boolean>
  /** Dwell buffers per location base, sent as `dwell` with a claimed proof. */
  dwell: Record<string, Fix[]>
}

const EMPTY: PlayerLocationState = { fix: null, heading: null, status: 'idle', claimable: {}, dwell: {} }

/**
 * One foreground location watch for the whole player app. The map, the position
 * reporter and the arrival detector all read from here, so the phone runs a
 * single native watch no matter how many screens are mounted.
 */
export const useLocationStore = create<PlayerLocationState>(() => ({ ...EMPTY }))

export function setArrivalDwell(dwell: Record<string, Fix[]>, claimable: Record<string, boolean>): void {
  useLocationStore.setState({ dwell, claimable })
}

let controller: { enabled: () => boolean; stop?: () => void; alive: boolean; running: boolean; generation: number } | null = null

function toFix(position: LocationPosition): Fix {
  return { lat: position.coords.latitude, lng: position.coords.longitude, accuracy: position.coords.accuracy, capturedAt: position.timestamp }
}

async function evaluate(): Promise<void> {
  const active = controller
  if (!active || !active.alive) return
  const want = active.enabled()
  if (want === active.running) return
  active.running = want
  const generation = ++active.generation
  if (!want) {
    active.stop?.()
    active.stop = undefined
    useLocationStore.setState({ status: 'idle' })
    return
  }
  try {
    const off = await watchLocation(
      (position) => {
        if (!active.alive || active.generation !== generation) return
        useLocationStore.setState({ fix: toFix(position), heading: position.coords.heading })
      },
      (state) => {
        if (!active.alive || active.generation !== generation) return
        useLocationStore.setState({ status: state })
      },
    )
    if (!active.alive || active.generation !== generation) off()
    else active.stop = off
  } catch {
    if (active.alive && active.generation === generation) useLocationStore.setState({ status: 'unavailable' })
  }
}

/** Re-read `enabled()` and start or stop the native watch accordingly. */
export function refreshLocationWatch(): void {
  void evaluate()
}

/**
 * Own the foreground watch for as long as the runtime lives. `enabled` is read on
 * start and on every `refreshLocationWatch()`, so the caller decides what "the game
 * is live" means without this module knowing about sessions or queries.
 */
export function startLocationStore(enabled: () => boolean): () => void {
  controller?.stop?.()
  const active = { enabled, stop: undefined as (() => void) | undefined, alive: true, running: false, generation: 0 }
  controller = active
  void evaluate()
  return () => {
    active.alive = false
    active.generation++
    active.stop?.()
    active.stop = undefined
    if (controller === active) controller = null
    useLocationStore.setState({ ...EMPTY })
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```sh
bun run --cwd web test -- src/app/player/locationStore.test.ts
```

- [ ] **Step 5: Commit** — no commit in this task.

---

### Task 3: `useTeamLocation` becomes a position reporter

**Files:**
- Modify: `web/src/features/player/useTeamLocation.ts` (whole file)
- Test: `web/src/features/player/useTeamLocation.test.tsx` (create)

**Interfaces:**
- Consumes: `useLocationStore`, `LocationStatus` from `@/app/player/locationStore`; `decideSend`, `DEFAULT_SEND_POLICY`, `Fix` from `@pointfinder/game-core`; `useServices` from `@/app/player/services`.
- Produces: `useTeamLocation(gameId: string | null, enabled: boolean): { fix: Fix | null; heading: number | null; status: LocationStatus }` (unchanged shape), plus `export type { LocationStatus }` so existing importers keep working.

- [ ] **Step 1: Write the failing test**

Create `web/src/features/player/useTeamLocation.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { server } from '@/test/msw/server'
import { ServicesProvider } from '@/app/player/services'
import { createServices } from '@/app/player/client'
import { memoryPlatform } from '@/features/player/test/renderPlayer'
import { useLocationStore } from '@/app/player/locationStore'
import { useTeamLocation } from './useTeamLocation'

async function wrapper() {
  const services = await createServices(await memoryPlatform())
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <ServicesProvider services={services}>{children}</ServicesProvider>
    </QueryClientProvider>
  )
}

describe('useTeamLocation', () => {
  it('reports store fixes to the operators and republishes the store state', async () => {
    const sent: Array<Record<string, unknown>> = []
    server.use(http.post('/api/player/games/:gameId/location', async ({ request }) => {
      sent.push((await request.json()) as Record<string, unknown>)
      return new HttpResponse(null, { status: 204 })
    }))
    useLocationStore.setState({ fix: null, heading: null, status: 'watching', claimable: {}, dwell: {} })

    const { result } = renderHook(() => useTeamLocation('g1', true), { wrapper: await wrapper() })
    act(() => useLocationStore.setState({ fix: { lat: 40.09, lng: -8.87, accuracy: 8, capturedAt: Date.now() }, heading: 12 }))

    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0]).toMatchObject({ lat: 40.09, lng: -8.87, accuracy: 8 })
    expect(result.current.status).toBe('watching')
    expect(result.current.heading).toBe(12)
  })

  it('sends nothing while the game is not live', async () => {
    const sent = vi.fn()
    server.use(http.post('/api/player/games/:gameId/location', () => { sent(); return new HttpResponse(null, { status: 204 }) }))
    useLocationStore.setState({ fix: null, heading: null, status: 'watching', claimable: {}, dwell: {} })

    renderHook(() => useTeamLocation('g1', false), { wrapper: await wrapper() })
    act(() => useLocationStore.setState({ fix: { lat: 40.09, lng: -8.87, accuracy: 8, capturedAt: Date.now() } }))

    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(sent).not.toHaveBeenCalled()
  })

  it('drops fixes the send policy rejects', async () => {
    const sent = vi.fn()
    server.use(http.post('/api/player/games/:gameId/location', () => { sent(); return new HttpResponse(null, { status: 204 }) }))
    useLocationStore.setState({ fix: null, heading: null, status: 'watching', claimable: {}, dwell: {} })

    renderHook(() => useTeamLocation('g1', true), { wrapper: await wrapper() })
    act(() => useLocationStore.setState({ fix: { lat: 40.09, lng: -8.87, accuracy: 500, capturedAt: Date.now() } }))

    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(sent).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```sh
bun run --cwd web test -- src/features/player/useTeamLocation.test.tsx
```

Expected failure: the first case times out with `expect(sent).toHaveLength(1)` because today's hook starts its own `watchLocation` and ignores the store entirely.

- [ ] **Step 3: Write minimal implementation**

Replace `web/src/features/player/useTeamLocation.ts` with:

```ts
import { useEffect, useRef } from 'react'
import { DEFAULT_SEND_POLICY, decideSend, type Fix } from '@pointfinder/game-core'
import { useServices } from '@/app/player/services'
import { useLocationStore, type LocationStatus } from '@/app/player/locationStore'

export type { LocationStatus }

/**
 * Reports the team's position to the operators from the shared location store.
 * The watch itself belongs to the player runtime; this hook only decides which
 * fixes are worth sending (accuracy, movement, heartbeat), so the operator map
 * gets one honest dot per team instead of the scatter the old apps produced.
 */
export function useTeamLocation(gameId: string | null, enabled: boolean) {
  const { client } = useServices()
  const fix = useLocationStore((s) => s.fix)
  const heading = useLocationStore((s) => s.heading)
  const status = useLocationStore((s) => s.status)
  const lastSent = useRef<{ fix: Fix; at: number } | null>(null)

  useEffect(() => { lastSent.current = null }, [gameId, enabled])

  useEffect(() => {
    if (!gameId || !enabled || !fix) return
    const now = Date.now()
    const decision = decideSend(fix, lastSent.current?.fix ?? null, lastSent.current?.at ?? null, now, DEFAULT_SEND_POLICY)
    if (!decision.send) return
    lastSent.current = { fix, at: now }
    client.api.player
      .updateLocation(gameId, { lat: fix.lat, lng: fix.lng, accuracy: fix.accuracy, capturedAt: new Date(fix.capturedAt).toISOString() })
      .catch(() => { lastSent.current = null })
  }, [client, gameId, enabled, fix])

  return { fix, heading, status }
}
```

- [ ] **Step 4: Run test to verify it passes**

```sh
bun run --cwd web test -- src/features/player/useTeamLocation.test.tsx
```

- [ ] **Step 5: Commit** — no commit in this task.

---

### Task 4: Pure arrival candidate builder

**Files:**
- Create: `web/src/features/player/arrivalCandidates.ts`
- Test: `web/src/features/player/arrivalCandidates.test.ts` (create)

**Interfaces:**
- Consumes: `Base`, `BaseProgress` from `@pointfinder/api`; `ArrivalCandidate`, `PendingAction`, `baseRoute`, `missingPreviousBase` from `@pointfinder/game-core`.
- Produces: `export function buildCandidates(input: { bases: Pick<Base, 'id' | 'lat' | 'lng' | 'hidden' | 'checkInMethod' | 'checkInRadiusM'>[]; progress: BaseProgress[]; pending: PendingAction[]; game: { enforceBaseOrder?: boolean; nextRequiredBaseNumber?: number | null } | undefined }): ArrivalCandidate[]`

- [ ] **Step 1: Write the failing test**

Create `web/src/features/player/arrivalCandidates.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { Base, BaseProgress } from '@pointfinder/api'
import type { PendingAction } from '@pointfinder/game-core'
import { buildCandidates } from './arrivalCandidates'

type BaseRow = Pick<Base, 'id' | 'lat' | 'lng' | 'hidden' | 'checkInMethod' | 'checkInRadiusM'>

function base(id: string, overrides: Partial<BaseRow> = {}): BaseRow {
  return { id, lat: 40.09, lng: -8.87, hidden: false, checkInMethod: 'LOCATION', checkInRadiusM: 20, ...overrides }
}

function progress(baseId: string, overrides: Partial<BaseProgress> = {}): BaseProgress {
  return { baseId, lat: 40.09, lng: -8.87, nfcLinked: false, status: 'not_visited', checkedInAt: null, ...overrides }
}

describe('buildCandidates', () => {
  it('keeps unvisited location bases, including hidden geofence rows', () => {
    const result = buildCandidates({
      bases: [base('b1'), base('hidden1', { hidden: true, checkInRadiusM: 30 })],
      progress: [progress('b1')],
      pending: [],
      game: undefined,
    })
    expect(result).toEqual([
      { baseId: 'b1', lat: 40.09, lng: -8.87, radiusM: 20, hidden: false },
      { baseId: 'hidden1', lat: 40.09, lng: -8.87, radiusM: 30, hidden: true },
    ])
  })

  it('drops NFC and QR bases', () => {
    const result = buildCandidates({
      bases: [base('b1', { checkInMethod: 'NFC' }), base('b2', { checkInMethod: 'QR' })],
      progress: [progress('b1'), progress('b2')],
      pending: [],
      game: undefined,
    })
    expect(result).toEqual([])
  })

  it('drops bases the team already checked in to', () => {
    const result = buildCandidates({
      bases: [base('b1')],
      progress: [progress('b1', { status: 'checked_in', checkedInAt: '2026-09-05T10:00:00Z' })],
      pending: [],
      game: undefined,
    })
    expect(result).toEqual([])
  })

  it('drops bases with a check-in already queued but keeps ones whose proof failed', () => {
    const queued: PendingAction = { type: 'check_in', id: 'q', gameId: 'g1', baseId: 'b1', proof: { type: 'geo', lat: 40.09, lng: -8.87, accuracy: 8, capturedAt: '2026-09-05T10:00:00Z', claimed: false }, createdAt: '', state: 'pending', attempts: 0, nextAttemptAt: 0 }
    const failed: PendingAction = { ...queued, id: 'f', baseId: 'b2', state: 'failed' }
    const result = buildCandidates({
      bases: [base('b1'), base('b2')],
      progress: [progress('b1'), progress('b2')],
      pending: [queued, failed],
      game: undefined,
    })
    expect(result.map((c) => c.baseId)).toEqual(['b2'])
  })

  it('drops bases blocked by the enforced base order', () => {
    const result = buildCandidates({
      bases: [base('b1'), base('b2')],
      progress: [progress('b1', { sequenceNumber: 1 }), progress('b2', { sequenceNumber: 2 })],
      pending: [],
      game: { enforceBaseOrder: true, nextRequiredBaseNumber: 1 },
    })
    expect(result.map((c) => c.baseId)).toEqual(['b1'])
  })

  it('never proposes a hidden base while the route is enforced and unproven', () => {
    const result = buildCandidates({
      bases: [base('hidden1', { hidden: true })],
      progress: [],
      pending: [],
      game: { enforceBaseOrder: true, nextRequiredBaseNumber: 1 },
    })
    expect(result).toEqual([])
  })

  it('falls back to the game default radius when a row carries none', () => {
    const result = buildCandidates({
      bases: [base('b1', { checkInRadiusM: null })],
      progress: [progress('b1')],
      pending: [],
      game: undefined,
    })
    expect(result[0]?.radiusM).toBe(15)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```sh
bun run --cwd web test -- src/features/player/arrivalCandidates.test.ts
```

Expected failure: `Failed to resolve import "./arrivalCandidates"`.

- [ ] **Step 3: Write minimal implementation**

Create `web/src/features/player/arrivalCandidates.ts`:

```ts
import type { Base, BaseProgress } from '@pointfinder/api'
import { baseRoute, missingPreviousBase, type ArrivalCandidate, type PendingAction } from '@pointfinder/game-core'

/** Server default when a base row carries no resolved radius (older cached game data). */
const FALLBACK_RADIUS_M = 15

export type ArrivalBaseRow = Pick<Base, 'id' | 'lat' | 'lng' | 'hidden' | 'checkInMethod' | 'checkInRadiusM'>

export interface CandidateInput {
  bases: ArrivalBaseRow[]
  progress: BaseProgress[]
  pending: PendingAction[]
  game: { enforceBaseOrder?: boolean; nextRequiredBaseNumber?: number | null } | undefined
}

/**
 * Location bases the detector may still fire for: not visited, no proof already in
 * flight, and not blocked by the enforced route. Hidden geofence rows are included
 * so an unlisted base can still be found, but only when the route allows it.
 */
export function buildCandidates({ bases, progress, pending, game }: CandidateInput): ArrivalCandidate[] {
  const route = baseRoute(game, progress, pending)
  const byBase = new Map(progress.map((p) => [p.baseId, p]))
  const claimed = new Set(pending.filter((a) => a.type === 'check_in' && a.state !== 'failed').map((a) => a.baseId))
  const candidates: ArrivalCandidate[] = []
  for (const b of bases) {
    if (b.checkInMethod !== 'LOCATION') continue
    if (claimed.has(b.id)) continue
    const row = byBase.get(b.id)
    if (row?.checkedInAt || (row && row.status !== 'not_visited')) continue
    // null means the route allows this base now; a number or undefined means it does not.
    if (missingPreviousBase(route, row) !== null) continue
    if (!Number.isFinite(b.lat) || !Number.isFinite(b.lng)) continue
    const radiusM = typeof b.checkInRadiusM === 'number' && b.checkInRadiusM > 0 ? b.checkInRadiusM : FALLBACK_RADIUS_M
    candidates.push({ baseId: b.id, lat: b.lat, lng: b.lng, radiusM, hidden: b.hidden === true })
  }
  return candidates
}
```

- [ ] **Step 4: Run test to verify it passes**

```sh
bun run --cwd web test -- src/features/player/arrivalCandidates.test.ts
```

- [ ] **Step 5: Commit** — no commit in this task.

---

### Task 5: Arrival notices store and `ArrivalToast`

**Files:**
- Create: `web/src/app/player/arrivalNotices.ts`
- Create: `web/src/features/player/components/ArrivalToast.tsx`
- Modify: `web/src/app/player/TagIntake.tsx` (render the toast beside `<Outlet />`)
- Test: `web/src/features/player/components/ArrivalToast.test.tsx` (create)

**Interfaces:**
- Consumes: `create` from `zustand`; `Alert`, `Button`, `buttonVariants`, `cn` from `@/components`; `Link` from `react-router-dom`.
- Produces:
  - `export interface ArrivalNotice { id: string; baseId: string; title: string | null; state: 'synced' | 'queued'; hidden: boolean }`
  - `export function useArrivalNotices(): { notices: ArrivalNotice[]; dismiss: (id: string) => void }`
  - `export function pushArrivalNotice(notice: Omit<ArrivalNotice, 'id'>): string`
  - `export function clearArrivalNotices(): void`, `export function dismissArrivalNotice(id: string): void`, `export function getArrivalNotices(): ArrivalNotice[]`
  - `export function ArrivalToast(): JSX.Element | null` with testid `player-arrival-notice`

- [ ] **Step 1: Write the failing test**

Create `web/src/features/player/components/ArrivalToast.test.tsx`:

```tsx
import { afterEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { clearArrivalNotices, pushArrivalNotice } from '@/app/player/arrivalNotices'
import { ArrivalToast } from './ArrivalToast'

afterEach(() => clearArrivalNotices())

function renderToast() {
  return render(<MemoryRouter><ArrivalToast /></MemoryRouter>)
}

describe('ArrivalToast', () => {
  it('renders nothing without notices', () => {
    renderToast()
    expect(screen.queryByTestId('player-arrival-notice')).not.toBeInTheDocument()
  })

  it('announces a visible base by name and links to it', () => {
    pushArrivalNotice({ baseId: 'b1', title: 'The old mill', state: 'synced', hidden: false })
    renderToast()
    expect(screen.getByTestId('player-arrival-notice')).toHaveTextContent('Arrived at The old mill')
    expect(screen.getByRole('link', { name: 'Open' })).toHaveAttribute('href', '/base/b1')
  })

  it('celebrates a hidden base once its name has arrived', () => {
    pushArrivalNotice({ baseId: 'h1', title: 'The hollow oak', state: 'synced', hidden: true })
    renderToast()
    expect(screen.getByTestId('player-arrival-notice')).toHaveTextContent('You found The hollow oak')
  })

  it('says a base was found without naming it while offline', () => {
    pushArrivalNotice({ baseId: 'h1', title: null, state: 'queued', hidden: true })
    renderToast()
    const notice = screen.getByTestId('player-arrival-notice')
    expect(notice).toHaveTextContent('You found a base')
    expect(notice).toHaveTextContent('Saved offline. It will sync when you’re back online.')
    expect(screen.queryByRole('link', { name: 'Open' })).not.toBeInTheDocument()
  })

  it('dismisses one notice and keeps the rest', async () => {
    pushArrivalNotice({ baseId: 'b1', title: 'The old mill', state: 'synced', hidden: false })
    pushArrivalNotice({ baseId: 'b2', title: 'Granite boulder', state: 'synced', hidden: false })
    renderToast()
    expect(screen.getAllByTestId('player-arrival-notice')).toHaveLength(2)
    await userEvent.click(screen.getAllByRole('button', { name: 'Close' })[0]!)
    expect(screen.getAllByTestId('player-arrival-notice')).toHaveLength(1)
    expect(screen.getByTestId('player-arrival-notice')).toHaveTextContent('Granite boulder')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```sh
bun run --cwd web test -- src/features/player/components/ArrivalToast.test.tsx
```

Expected failure: `Failed to resolve import "@/app/player/arrivalNotices"`.

- [ ] **Step 3: Write minimal implementation**

Create `web/src/app/player/arrivalNotices.ts`:

```ts
import { create } from 'zustand'

/**
 * An app-wide "you arrived" message. The detector fires while any screen is open,
 * so the notice has to live outside the base screen. `hidden` distinguishes a base
 * the team already knew about from one they just discovered.
 */
export interface ArrivalNotice {
  id: string
  baseId: string
  /** Null while the name is unknown, which is the offline case for a hidden base. */
  title: string | null
  state: 'synced' | 'queued'
  hidden: boolean
}

interface NoticeState {
  notices: ArrivalNotice[]
}

const useNoticeStore = create<NoticeState>(() => ({ notices: [] }))

/** Add one notice. Repeats for the same base replace the earlier one so the list stays short. */
export function pushArrivalNotice(notice: Omit<ArrivalNotice, 'id'>): string {
  const id = crypto.randomUUID()
  useNoticeStore.setState((s) => ({ notices: [...s.notices.filter((n) => n.baseId !== notice.baseId), { ...notice, id }] }))
  return id
}

export function dismissArrivalNotice(id: string): void {
  useNoticeStore.setState((s) => ({ notices: s.notices.filter((n) => n.id !== id) }))
}

export function clearArrivalNotices(): void {
  useNoticeStore.setState({ notices: [] })
}

/** Non-hook read for the runtime detector and its tests. */
export function getArrivalNotices(): ArrivalNotice[] {
  return useNoticeStore.getState().notices
}

export function useArrivalNotices(): { notices: ArrivalNotice[]; dismiss: (id: string) => void } {
  const notices = useNoticeStore((s) => s.notices)
  return { notices, dismiss: dismissArrivalNotice }
}
```

Create `web/src/features/player/components/ArrivalToast.tsx`:

```tsx
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Alert, buttonVariants, cn } from '@/components'
import { useArrivalNotices, type ArrivalNotice } from '@/app/player/arrivalNotices'

function title(notice: ArrivalNotice, t: (key: string, options?: Record<string, unknown>) => string): string {
  if (!notice.title) return t('checkIn.foundUnknown')
  return notice.hidden ? t('checkIn.found', { name: notice.title }) : t('checkIn.arrived', { name: notice.title })
}

/**
 * App-wide arrival notices. Rendered once above the router outlet so a base that
 * unlocks while the player is on the map, the logbook, or another base is never missed.
 */
export function ArrivalToast() {
  const { t } = useTranslation(undefined, { keyPrefix: 'playerApp' })
  const { notices, dismiss } = useArrivalNotices()
  if (!notices.length) return null
  return (
    <div className="safe-gutter pointer-events-none fixed inset-x-0 top-[calc(var(--safe-top)+8px)] z-40 mx-auto flex w-full max-w-2xl flex-col gap-2">
      {notices.map((notice) => (
        <Alert
          key={notice.id}
          variant={notice.state === 'queued' ? 'warning' : 'info'}
          className={cn('pointer-events-auto shadow-overlay', notice.state === 'synced' && 'bg-success/10 text-success')}
          role="status"
          data-testid="player-arrival-notice"
          onDismiss={() => dismiss(notice.id)}
        >
          <div className="flex flex-col gap-1">
            <p className="font-medium">{title(notice, t)}</p>
            {notice.state === 'queued' && <p className="text-sm">{t('base.queued')}</p>}
            {notice.state === 'synced' && (
              <Link
                className={cn(buttonVariants({ variant: 'link', size: 'sm' }), 'w-fit p-0')}
                to={`/base/${encodeURIComponent(notice.baseId)}`}
                onClick={() => dismiss(notice.id)}
              >
                {t('map.open')}
              </Link>
            )}
          </div>
        </Alert>
      ))}
    </div>
  )
}
```

In `web/src/app/player/TagIntake.tsx`, add the import and render the toast beside the outlet. Replace the import block line `import { kv } from '@/platform'` with:

```tsx
import { kv } from '@/platform'
import { ArrivalToast } from '@/features/player/components/ArrivalToast'
```

and replace the final `return <Outlet />` with:

```tsx
  return <><ArrivalToast /><Outlet /></>
```

- [ ] **Step 4: Run test to verify it passes**

```sh
bun run --cwd web test -- src/features/player/components/ArrivalToast.test.tsx
```

- [ ] **Step 5: Commit** — no commit in this task.

---

### Task 6: Arrival detector runtime wired into `startPlayerRuntime`

**Files:**
- Create: `web/src/app/player/arrival.ts`
- Modify: `web/src/app/player/runtime.ts` (imports at the top; the `startPlayerRuntime` body around the `offForeground`/`offAuth`/`offQueue` wiring and the returned teardown)
- Test: `web/src/app/player/arrival.test.ts` (create)

**Interfaces:**
- Consumes: `AppServices` from `./client`; `QueryClient` from `@tanstack/react-query`; `useLocationStore`, `setArrivalDwell`, `refreshLocationWatch`, `startLocationStore` from `./locationStore`; `pushArrivalNotice` from `./arrivalNotices`; `buildCandidates` from `@/features/player/arrivalCandidates`; `evaluateArrival`, `emptyArrivalState`, `ArrivalState`, `Fix` from `@pointfinder/game-core`; `GameDataResponse`, `PlayerSnapshotResponse` from `@pointfinder/api`.
- Produces: `export function startArrivalDetector(services: AppServices, queries: QueryClient): () => void`; `export function playerGameIsLive(services: AppServices, queries: QueryClient): boolean`.

- [ ] **Step 1: Write the failing test**

Create `web/src/app/player/arrival.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { QueryClient } from '@tanstack/react-query'
import { server } from '@/test/msw/server'
import { memoryPlatform } from '@/features/player/test/renderPlayer'
import { createServices, type AppServices } from './client'
import { useLocationStore } from './locationStore'
import { clearArrivalNotices, getArrivalNotices } from './arrivalNotices'
import { startArrivalDetector } from './arrival'

const BASE = { id: 'b1', gameId: 'g1', lat: 40.09, lng: -8.87, nfcLinked: false, hidden: false, fixedChallengeId: null, checkInMethod: 'LOCATION', checkInRadiusM: 20 }
const HIDDEN = { id: 'h1', gameId: 'g1', lat: 41.09, lng: -8.87, nfcLinked: false, hidden: true, fixedChallengeId: null, checkInMethod: 'LOCATION', checkInRadiusM: 20 }
const PROGRESS = { baseId: 'b1', challengeTitle: 'The old mill', lat: 40.09, lng: -8.87, nfcLinked: false, status: 'not_visited', checkedInAt: null, challengeId: 'c1', submissionStatus: null, checkInMethod: 'LOCATION', checkInRadiusM: 20 }

function seed(queries: QueryClient, bases: unknown[], progress: unknown[]) {
  queries.setQueryData(['gameData', 'g1'], { gameStatus: 'live', unlockTrigger: 'CHECK_IN', bases, challenges: [], assignments: [], progress })
  queries.setQueryData(['snapshot', 'g1'], { stateVersion: 1, game: { id: 'g1', name: 'Serra', status: 'live' }, team: { id: 'team1', name: 'Falcons', memberCount: 2 }, progress, submissions: [], uploadSessions: [] })
}

let services: AppServices
let queries: QueryClient

beforeEach(async () => {
  services = await createServices(await memoryPlatform())
  queries = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  useLocationStore.setState({ fix: null, heading: null, status: 'watching', claimable: {}, dwell: {} })
  clearArrivalNotices()
})

afterEach(() => {
  queries.clear()
  vi.restoreAllMocks()
})

describe('startArrivalDetector', () => {
  it('checks in once when a fix lands inside the radius and announces the base', async () => {
    const posted: string[] = []
    server.use(http.post('/api/player/games/:gameId/bases/:baseId/check-in', async ({ params, request }) => {
      posted.push(String(params.baseId))
      const body = (await request.json()) as { method?: string; claimed?: boolean }
      expect(body.method).toBe('geo')
      expect(body.claimed).toBe(false)
      return HttpResponse.json({ checkInId: 'ci-1', baseId: params.baseId, checkedInAt: '2026-09-05T10:45:00Z' })
    }))
    seed(queries, [BASE], [PROGRESS])
    const off = startArrivalDetector(services, queries)

    useLocationStore.setState({ fix: { lat: 40.09, lng: -8.87, accuracy: 8, capturedAt: Date.now() } })
    await vi.waitFor(() => expect(posted).toEqual(['b1']))
    await vi.waitFor(() => expect(getArrivalNotices()).toMatchObject([{ baseId: 'b1', title: 'The old mill', state: 'synced', hidden: false }]))

    useLocationStore.setState({ fix: { lat: 40.09, lng: -8.87, accuracy: 8, capturedAt: Date.now() + 1_000 } })
    await new Promise((resolve) => setTimeout(resolve, 60))
    expect(posted).toEqual(['b1'])
    off()
  })

  it('queues the proof offline and reports the queued state', async () => {
    server.use(http.post('/api/player/games/:gameId/bases/:baseId/check-in', () => HttpResponse.error()))
    seed(queries, [BASE], [PROGRESS])
    const off = startArrivalDetector(services, queries)

    useLocationStore.setState({ fix: { lat: 40.09, lng: -8.87, accuracy: 8, capturedAt: Date.now() } })
    await vi.waitFor(async () => expect(await services.queue.list()).toMatchObject([{ type: 'check_in', baseId: 'b1', state: 'pending' }]))
    await vi.waitFor(() => expect(getArrivalNotices()).toMatchObject([{ baseId: 'b1', state: 'queued' }]))
    off()
  })

  it('discards an out-of-range refusal instead of leaving a failed action', async () => {
    server.use(http.post('/api/player/games/:gameId/bases/:baseId/check-in', () => HttpResponse.json(
      { code: 'CHECK_IN_OUT_OF_RANGE', message: 'Too far', errors: { distanceM: '84', allowedM: '20' } },
      { status: 400 },
    )))
    seed(queries, [BASE], [PROGRESS])
    const off = startArrivalDetector(services, queries)

    useLocationStore.setState({ fix: { lat: 40.09, lng: -8.87, accuracy: 8, capturedAt: Date.now() } })
    await vi.waitFor(async () => expect(await services.queue.list()).toEqual([]))
    off()
  })

  it('never fires for a base the team already visited', async () => {
    const posted = vi.fn()
    server.use(http.post('/api/player/games/:gameId/bases/:baseId/check-in', () => { posted(); return HttpResponse.json({ checkInId: 'x', baseId: 'b1', checkedInAt: '2026-09-05T10:45:00Z' }) }))
    seed(queries, [BASE], [{ ...PROGRESS, status: 'checked_in', checkedInAt: '2026-09-05T09:00:00Z' }])
    const off = startArrivalDetector(services, queries)

    useLocationStore.setState({ fix: { lat: 40.09, lng: -8.87, accuracy: 8, capturedAt: Date.now() } })
    await new Promise((resolve) => setTimeout(resolve, 60))
    expect(posted).not.toHaveBeenCalled()
    off()
  })

  it('finds a hidden geofence base the map never showed', async () => {
    const posted: string[] = []
    server.use(http.post('/api/player/games/:gameId/bases/:baseId/check-in', ({ params }) => {
      posted.push(String(params.baseId))
      return HttpResponse.json({ checkInId: 'ci-h', baseId: params.baseId, checkedInAt: '2026-09-05T10:45:00Z' })
    }))
    seed(queries, [BASE, HIDDEN], [PROGRESS])
    const off = startArrivalDetector(services, queries)

    useLocationStore.setState({ fix: { lat: 41.09, lng: -8.87, accuracy: 8, capturedAt: Date.now() } })
    await vi.waitFor(() => expect(posted).toEqual(['h1']))
    off()
  })

  it('publishes dwell buffers and claimability for the base screen', async () => {
    server.use(http.post('/api/player/games/:gameId/bases/:baseId/check-in', () => HttpResponse.json(
      { code: 'CHECK_IN_OUT_OF_RANGE', message: 'Too far', errors: { distanceM: '60', allowedM: '20' } },
      { status: 400 },
    )))
    seed(queries, [BASE], [PROGRESS])
    const off = startArrivalDetector(services, queries)

    // Inside the wide ring (max(3*20, 50) = 60 m) but too coarse to auto-accept.
    const start = Date.now()
    for (let i = 0; i < 8; i++) {
      useLocationStore.setState({ fix: { lat: 40.0904, lng: -8.87, accuracy: 80, capturedAt: start + i * 11_000 } })
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
    await vi.waitFor(() => expect(useLocationStore.getState().dwell.b1?.length ?? 0).toBeGreaterThanOrEqual(4))
    off()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```sh
bun run --cwd web test -- src/app/player/arrival.test.ts
```

Expected failure: `Failed to resolve import "./arrival"`.

- [ ] **Step 3: Write minimal implementation**

Create `web/src/app/player/arrival.ts`:

```ts
import type { QueryClient } from '@tanstack/react-query'
import type { GameDataResponse, PlayerSnapshotResponse } from '@pointfinder/api'
import { emptyArrivalState, evaluateArrival, type ArrivalCandidate, type ArrivalState, type Fix } from '@pointfinder/game-core'
import { buildCandidates } from '@/features/player/arrivalCandidates'
import type { AppServices } from './client'
import { setArrivalDwell, useLocationStore } from './locationStore'
import { pushArrivalNotice } from './arrivalNotices'

/** Refusals the player never asked for. They are dropped instead of nagging in the sync banner. */
const SILENT_REFUSALS = new Set(['CHECK_IN_OUT_OF_RANGE', 'PREVIOUS_BASE_REQUIRED', 'CHECK_IN_FIX_TOO_COARSE', 'CHECK_IN_FIX_STALE'])

function playerGameId(services: AppServices): string | null {
  const auth = services.client.session.current
  return auth.kind === 'player' ? auth.gameId : null
}

/** The watch runs whenever the game is live, because operators rely on team positions. */
export function playerGameIsLive(services: AppServices, queries: QueryClient): boolean {
  const auth = services.client.session.current
  if (auth.kind !== 'player') return false
  const snapshot = queries.getQueryData<PlayerSnapshotResponse>(['snapshot', auth.gameId])
  return (snapshot?.game.status ?? auth.gameStatus) === 'live'
}

function titleFor(queries: QueryClient, gameId: string, baseId: string): string | null {
  const snapshot = queries.getQueryData<PlayerSnapshotResponse>(['snapshot', gameId])
  const row = snapshot?.progress.find((p) => p.baseId === baseId)
  return row?.challengeTitle?.trim() ? row.challengeTitle : null
}

/**
 * App-wide arrival detection while the app is in the foreground. Pure evaluation
 * lives in game-core; this owns the side effects: enqueue, sync, notice, back-off.
 */
export function startArrivalDetector(services: AppServices, queries: QueryClient): () => void {
  let alive = true
  let state: ArrivalState = emptyArrivalState()
  let working = false
  let latest: Fix | null = null

  const candidatesFor = async (gameId: string): Promise<ArrivalCandidate[]> => {
    const data = queries.getQueryData<GameDataResponse>(['gameData', gameId])
    const snapshot = queries.getQueryData<PlayerSnapshotResponse>(['snapshot', gameId])
    if (!data) return []
    const pending = (await services.queue.list()).filter((a) => a.gameId === gameId)
    return buildCandidates({
      bases: data.bases,
      progress: snapshot?.progress ?? data.progress ?? [],
      pending,
      game: snapshot?.game ?? data,
    })
  }

  const fire = async (gameId: string, candidate: ArrivalCandidate, fix: Fix) => {
    const action = await services.queue.enqueueCheckIn({
      id: crypto.randomUUID(),
      gameId,
      baseId: candidate.baseId,
      proof: { type: 'geo', lat: fix.lat, lng: fix.lng, accuracy: fix.accuracy, capturedAt: new Date(fix.capturedAt).toISOString(), claimed: false },
      prerequisiteCheckInIds: [],
    })
    const report = await services.queue.sync()
    const outcome = report.outcomes.find((o) => o.id === action.id)
    if (outcome?.result === 'synced') {
      await queries.invalidateQueries({ queryKey: ['snapshot', gameId] })
      await queries.invalidateQueries({ queryKey: ['gameData', gameId] })
      if (!alive) return
      pushArrivalNotice({ baseId: candidate.baseId, title: titleFor(queries, gameId, candidate.baseId), state: 'synced', hidden: candidate.hidden })
      return
    }
    if (outcome?.result === 'failed') {
      // Silent refusals were never a player action: drop them and keep watching.
      if (outcome.code && SILENT_REFUSALS.has(outcome.code)) await services.queue.discard(action.id)
      return
    }
    const stored = (await services.queue.list()).find((a) => a.id === action.id)
    if (stored?.state === 'failed') {
      if (stored.lastErrorCode && SILENT_REFUSALS.has(stored.lastErrorCode)) await services.queue.discard(action.id)
      return
    }
    if (!alive) return
    pushArrivalNotice({ baseId: candidate.baseId, title: titleFor(queries, gameId, candidate.baseId), state: 'queued', hidden: candidate.hidden })
  }

  const run = async () => {
    if (working || !alive) return
    const fix = latest
    latest = null
    if (!fix) return
    const gameId = playerGameId(services)
    if (!gameId || !playerGameIsLive(services, queries)) return
    working = true
    try {
      const candidates = await candidatesFor(gameId)
      if (!candidates.length) {
        setArrivalDwell({}, {})
        return
      }
      const result = evaluateArrival(fix, candidates, state, Date.now())
      state = result.state
      setArrivalDwell(
        { ...result.state.dwell },
        Object.fromEntries(result.claimable.map((baseId) => [baseId, true])),
      )
      for (const candidate of result.fire) {
        if (!alive) break
        try { await fire(gameId, candidate, fix) }
        catch { /* Storage or network failures stay in the durable queue for the next fix. */ }
      }
    } finally {
      working = false
      if (alive && latest) void run()
    }
  }

  const unsubscribe = useLocationStore.subscribe((next, previous) => {
    if (!next.fix || next.fix === previous.fix) return
    latest = next.fix
    void run()
  })

  return () => {
    alive = false
    unsubscribe()
    state = emptyArrivalState()
    setArrivalDwell({}, {})
  }
}
```

In `web/src/app/player/runtime.ts`, add these imports after `import { apiOrigin } from '@/platform/config'`:

```ts
import { refreshLocationWatch, startLocationStore } from './locationStore'
import { playerGameIsLive, startArrivalDetector } from './arrival'
```

Inside `startPlayerRuntime`, replace the block

```ts
  const offForeground = onForeground(resume)
  const offAuth = services.client.session.subscribe(() => { void sync() })
  const offQueue = services.queue.onChange(() => { void sync() })
```

with

```ts
  const offForeground = onForeground(() => { resume(); refreshLocationWatch() })
  const offAuth = services.client.session.subscribe(() => { void sync(); refreshLocationWatch() })
  const offQueue = services.queue.onChange(() => { void sync() })
  // The foreground watch belongs to the app, not the map screen: operators rely on
  // team positions in every live game and arrivals must fire from any screen.
  const offLocation = startLocationStore(() => playerGameIsLive(services, queries))
  const offArrival = startArrivalDetector(services, queries)
  const offCache = queries.getQueryCache().subscribe((event) => {
    if (event.query.queryKey[0] === 'snapshot') refreshLocationWatch()
  })
```

and replace the returned teardown

```ts
  return () => { alive = false; offForeground(); offAuth(); offQueue(); offPush(); offNotification?.(); window.clearInterval(timer); window.removeEventListener('online', resume) }
```

with

```ts
  return () => { alive = false; offForeground(); offAuth(); offQueue(); offPush(); offNotification?.(); offArrival(); offLocation(); offCache(); window.clearInterval(timer); window.removeEventListener('online', resume) }
```

- [ ] **Step 4: Run test to verify it passes**

```sh
bun run --cwd web test -- src/app/player/arrival.test.ts
```

- [ ] **Step 5: Commit** — no commit in this task.

---

### Task 7: `openLocationSettings()` platform helper

**Files:**
- Modify: `web/src/platform/geolocation.ts` (append after `watchLocation`)
- Test: `web/src/platform/geolocation.test.ts` (create)

**Interfaces:**
- Consumes: `isNative` from `./runtime`.
- Produces: `export async function openLocationSettings(): Promise<void>`

- [ ] **Step 1: Write the failing test**

Create `web/src/platform/geolocation.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as runtime from './runtime'
import { openLocationSettings } from './geolocation'

afterEach(() => vi.restoreAllMocks())

describe('openLocationSettings', () => {
  it('does nothing in a browser, where there is no app settings page', async () => {
    vi.spyOn(runtime, 'isNative').mockReturnValue(false)
    await expect(openLocationSettings()).resolves.toBeUndefined()
  })

  it('never throws when the native settings screen refuses to open', async () => {
    vi.spyOn(runtime, 'isNative').mockReturnValue(true)
    await expect(openLocationSettings()).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```sh
bun run --cwd web test -- src/platform/geolocation.test.ts
```

Expected failure: `openLocationSettings is not a function` / no matching export in `./geolocation`.

- [ ] **Step 3: Write minimal implementation**

Append to `web/src/platform/geolocation.ts`:

```ts
/**
 * Take the player to the OS screen where location permission can be restored.
 *
 * `@tauri-apps/plugin-geolocation` exposes only `checkPermissions`,
 * `requestPermissions`, `watchPosition`, `getCurrentPosition` and `clearWatch`;
 * it has no settings entry point. The barcode-scanner plugin's `openAppSettings`
 * opens this application's own system settings page, which is the same screen
 * that lists location permission on both iOS and Android, so we reuse it here.
 * Failures are swallowed: the panel already tells the player what to do.
 */
export async function openLocationSettings(): Promise<void> {
  if (!isNative()) return
  try {
    await (await import('@tauri-apps/plugin-barcode-scanner')).openAppSettings()
  } catch {
    /* No settings screen is reachable; the denied copy stays on screen. */
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```sh
bun run --cwd web test -- src/platform/geolocation.test.ts
```

- [ ] **Step 5: Commit** — no commit in this task.

---

### Task 8: Generalised `QrScannerOverlay`

**Files:**
- Modify: `web/src/features/player/components/QrScannerOverlay.tsx` (whole file)
- Modify: `web/src/features/player/Join.tsx` (the `if (scanning) return <QrScannerOverlay ... />` line)
- Test: `web/src/features/player/components/QrScannerOverlay.test.tsx` (extend)

**Interfaces:**
- Consumes: `Button` from `@/components`; `useTranslation`.
- Produces: `export function QrScannerOverlay(props: { onBack: () => void; caption: string; testId?: string }): JSX.Element` — default `testId` is `player-qr-scanner`; the back button keeps `player-join-scan-back-btn`.

- [ ] **Step 1: Write the failing test**

Replace `web/src/features/player/components/QrScannerOverlay.test.tsx` with:

```tsx
import { afterEach, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QrScannerOverlay } from './QrScannerOverlay'

afterEach(() => document.documentElement.classList.remove('native-scanner-active'))

it('keeps a visible back action above the native QR camera', async () => {
  const onBack = vi.fn()
  const { unmount } = render(<QrScannerOverlay onBack={onBack} caption="Scan QR code" />)

  expect(document.documentElement).toHaveClass('native-scanner-active')
  expect(screen.getByTestId('player-qr-scanner')).toBeInTheDocument()
  expect(screen.getByText('Scan QR code')).toBeInTheDocument()
  await userEvent.click(screen.getByTestId('player-join-scan-back-btn'))
  expect(onBack).toHaveBeenCalledOnce()

  unmount()
  expect(document.documentElement).not.toHaveClass('native-scanner-active')
})

it('carries the caption and test id the caller passes', () => {
  render(<QrScannerOverlay onBack={() => {}} caption="Scan code" testId="player-base-qr-scanner" />)
  expect(screen.getByTestId('player-base-qr-scanner')).toBeInTheDocument()
  expect(screen.queryByTestId('player-qr-scanner')).not.toBeInTheDocument()
  expect(screen.getByText('Scan code')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to verify it fails**

```sh
bun run --cwd web test -- src/features/player/components/QrScannerOverlay.test.tsx
```

Expected failure: TypeScript/runtime rejects the `caption` and `testId` props and the second case fails because the overlay always renders `join.scanQr` under `player-qr-scanner`.

- [ ] **Step 3: Write minimal implementation**

Replace `web/src/features/player/components/QrScannerOverlay.tsx` with:

```tsx
import { useEffect } from 'react'
import { ArrowLeft, QrCode } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components'

/**
 * Chrome drawn over the Tauri windowed camera. The webview goes transparent while
 * the scanner runs, so this owns the only visible controls: a safe-area Back action
 * and a caption naming what the caller wants scanned.
 */
export function QrScannerOverlay({ onBack, caption, testId = 'player-qr-scanner' }: {
  onBack: () => void
  caption: string
  testId?: string
}) {
  const { t } = useTranslation(undefined, { keyPrefix: 'playerApp' })

  useEffect(() => {
    document.documentElement.classList.add('native-scanner-active')
    return () => document.documentElement.classList.remove('native-scanner-active')
  }, [])

  return (
    <main className="fixed inset-0 z-50 flex flex-col bg-transparent text-foreground" data-testid={testId}>
      <div className="safe-gutter flex justify-start pt-[calc(var(--safe-top)+0.75rem)]">
        <Button type="button" variant="secondary" size="lg" onClick={onBack} data-testid="player-join-scan-back-btn">
          <ArrowLeft className="mr-2 h-5 w-5" aria-hidden />
          {t('common.back')}
        </Button>
      </div>
      <div className="flex flex-1 items-center justify-center p-8" aria-hidden>
        <div className="aspect-square w-full max-w-sm rounded-lg border-2 border-primary" />
      </div>
      <div className="safe-gutter pb-[calc(var(--safe-bottom)+1rem)] text-center">
        <span className="inline-flex items-center gap-2 rounded-md bg-card/95 px-3 py-2 text-sm font-medium text-card-foreground">
          <QrCode className="h-5 w-5" aria-hidden />
          {caption}
        </span>
      </div>
    </main>
  )
}
```

In `web/src/features/player/Join.tsx`, replace

```tsx
  if (scanning) return <QrScannerOverlay onBack={() => scanAbort.current?.abort()} />
```

with

```tsx
  if (scanning) return <QrScannerOverlay onBack={() => scanAbort.current?.abort()} caption={t('join.scanQr')} />
```

- [ ] **Step 4: Run test to verify it passes**

```sh
bun run --cwd web test -- src/features/player/components/QrScannerOverlay.test.tsx src/features/player/Join.test.tsx
```

- [ ] **Step 5: Commit** — no commit in this task.

---

### Task 9: `LocationCheckInPanel`

**Files:**
- Create: `web/src/features/player/components/LocationCheckInPanel.tsx`
- Test: `web/src/features/player/components/LocationCheckInPanel.test.tsx` (create)

**Interfaces:**
- Consumes: `useLocationStore` from `@/app/player/locationStore`; `openLocationSettings` from `@/platform/geolocation`; `autoAccepts`, `insideWideRing`, `distanceM` from `@pointfinder/game-core`; `Alert`, `Button`, `Card`, `CardContent` from `@/components`.
- Produces: `export function LocationCheckInPanel(props: { baseId: string; base: { lat: number; lng: number; radiusM: number }; onClaim: () => void; claimable: boolean; busy: boolean }): JSX.Element` — testid `player-location-panel`, claim button testid `player-im-here-btn`.

- [ ] **Step 1: Write the failing test**

Create `web/src/features/player/components/LocationCheckInPanel.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useLocationStore } from '@/app/player/locationStore'
import { LocationCheckInPanel } from './LocationCheckInPanel'

const BASE = { lat: 40.09, lng: -8.87, radiusM: 20 }

function setLocation(state: Partial<ReturnType<typeof useLocationStore.getState>>) {
  useLocationStore.setState({ fix: null, heading: null, status: 'watching', claimable: {}, dwell: {}, ...state })
}

function renderPanel(props: Partial<React.ComponentProps<typeof LocationCheckInPanel>> = {}) {
  return render(<LocationCheckInPanel baseId="b1" base={BASE} onClaim={() => {}} claimable={false} busy={false} {...props} />)
}

beforeEach(() => setLocation({}))

describe('LocationCheckInPanel', () => {
  it('says it is locating before the first fix', () => {
    setLocation({ status: 'requesting' })
    renderPanel()
    expect(screen.getByTestId('player-location-panel')).toHaveTextContent('Finding your position…')
  })

  it('offers the settings screen when permission was denied', async () => {
    const geolocation = await import('@/platform/geolocation')
    const open = vi.spyOn(geolocation, 'openLocationSettings').mockResolvedValue()
    setLocation({ status: 'denied' })
    renderPanel()
    expect(screen.getByTestId('player-location-panel')).toHaveTextContent("Location is off, so this base can't unlock.")
    await userEvent.click(screen.getByRole('button', { name: 'Open settings' }))
    expect(open).toHaveBeenCalledOnce()
  })

  it('reports the distance while far away', () => {
    setLocation({ fix: { lat: 40.098, lng: -8.87, accuracy: 8, capturedAt: Date.now() } })
    renderPanel()
    expect(screen.getByTestId('player-location-panel')).toHaveTextContent(/About \d+ m away/)
  })

  it('explains a close but inexact fix', () => {
    setLocation({ fix: { lat: 40.0903, lng: -8.87, accuracy: 90, capturedAt: Date.now() } })
    renderPanel()
    expect(screen.getByTestId('player-location-panel')).toHaveTextContent("You're close. GPS accuracy ±90 m, move into the open")
  })

  it('confirms arrival once the fix is accepted', () => {
    setLocation({ fix: { lat: 40.09, lng: -8.87, accuracy: 6, capturedAt: Date.now() } })
    renderPanel()
    expect(screen.getByTestId('player-location-panel')).toHaveTextContent("You're at the base.")
  })

  it('reports an unavailable sensor', () => {
    setLocation({ status: 'unavailable' })
    renderPanel()
    expect(screen.getByTestId('player-location-panel')).toHaveTextContent("This phone can't report a position right now.")
  })

  it('keeps the claim disabled with a hint until the dwell rule is met', () => {
    setLocation({ fix: { lat: 40.0903, lng: -8.87, accuracy: 90, capturedAt: Date.now() } })
    renderPanel({ claimable: false })
    expect(screen.getByTestId('player-im-here-btn')).toBeDisabled()
    expect(screen.getByText('Stay near the base for a minute to enable this.')).toBeInTheDocument()
  })

  it('claims presence once the dwell rule is met', async () => {
    const onClaim = vi.fn()
    setLocation({ fix: { lat: 40.0903, lng: -8.87, accuracy: 90, capturedAt: Date.now() } })
    renderPanel({ claimable: true, onClaim })
    const button = screen.getByTestId('player-im-here-btn')
    expect(button).toBeEnabled()
    await userEvent.click(button)
    expect(onClaim).toHaveBeenCalledOnce()
  })

  it('disables the claim while a check-in is in flight', () => {
    setLocation({ fix: { lat: 40.0903, lng: -8.87, accuracy: 90, capturedAt: Date.now() } })
    renderPanel({ claimable: true, busy: true })
    expect(screen.getByTestId('player-im-here-btn')).toBeDisabled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```sh
bun run --cwd web test -- src/features/player/components/LocationCheckInPanel.test.tsx
```

Expected failure: `Failed to resolve import "./LocationCheckInPanel"`.

- [ ] **Step 3: Write minimal implementation**

Create `web/src/features/player/components/LocationCheckInPanel.tsx`:

```tsx
import { useTranslation } from 'react-i18next'
import { MapPin } from 'lucide-react'
import { autoAccepts, distanceM, insideWideRing } from '@pointfinder/game-core'
import { Alert, Button, Card, CardContent } from '@/components'
import { useLocationStore } from '@/app/player/locationStore'
import { openLocationSettings } from '@/platform/geolocation'

type PanelState = 'locating' | 'denied' | 'unavailable' | 'far' | 'near' | 'arrived'

/**
 * Honest live feedback for a base that unlocks by position. The detector does the
 * actual check-in; this panel exists so waiting never feels broken, and it carries
 * the dwell-gated claim for the case where GPS never converges.
 */
export function LocationCheckInPanel({ baseId, base, onClaim, claimable, busy }: {
  baseId: string
  base: { lat: number; lng: number; radiusM: number }
  onClaim: () => void
  claimable: boolean
  busy: boolean
}) {
  const { t } = useTranslation(undefined, { keyPrefix: 'playerApp' })
  const fix = useLocationStore((s) => s.fix)
  const status = useLocationStore((s) => s.status)

  let state: PanelState = 'locating'
  if (status === 'denied') state = 'denied'
  else if (status === 'unavailable' && !fix) state = 'unavailable'
  else if (fix) {
    if (autoAccepts(fix, base, base.radiusM).ok) state = 'arrived'
    else state = insideWideRing(fix, base, base.radiusM) ? 'near' : 'far'
  }

  const message =
    state === 'locating' ? t('location.locating')
      : state === 'denied' ? t('location.denied')
        : state === 'unavailable' ? t('location.unavailable')
          : state === 'arrived' ? t('location.arrived')
            : state === 'near' ? t('location.near', { accuracy: Math.round(fix!.accuracy) })
              : t('location.far', { meters: Math.round(distanceM(fix!, base)) })

  return (
    <Card data-testid="player-location-panel" data-base-id={baseId}>
      <CardContent className="flex flex-col gap-3 pt-6">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
            <MapPin className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-medium" role="status">{message}</p>
            {state === 'denied' && (
              <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={() => void openLocationSettings()}>
                {t('location.openSettings')}
              </Button>
            )}
          </div>
        </div>
        {state === 'arrived' && <Alert variant="info" className="bg-success/10 text-success">{t('checkIn.scanning')}</Alert>}
        <Button
          size="lg"
          variant="outline"
          className="w-full text-base"
          disabled={!claimable || busy}
          onClick={onClaim}
          data-testid="player-im-here-btn"
        >
          {t('checkIn.imHere')}
        </Button>
        {!claimable && <p className="text-xs text-muted-foreground">{t('checkIn.imHereHint')}</p>}
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

```sh
bun run --cwd web test -- src/features/player/components/LocationCheckInPanel.test.tsx
```

- [ ] **Step 5: Commit** — no commit in this task.

---

### Task 10: `BaseScreen` check-in by method

**Files:**
- Modify: `web/src/features/player/BaseScreen.tsx` (imports; `checkInWith`; the `?token=` effect; `tapTag`; new `scanCode` and `claimPresence`; `confirmPresence`; the `needsCheckIn` card block)
- Test: `web/src/features/player/BaseScreen.test.tsx` (append a `BaseScreen check-in methods` describe block)

**Interfaces:**
- Consumes: `usePlayerGame().checkIn(baseId, proof: CheckInProof)`; `proofTypeForMethod`, `insideWideRing`, `CheckInProof` from `@pointfinder/game-core`; `parseTagUrl` from `@pointfinder/game-core`; `scanQr` from `@/platform/qr`; `useLocationStore` from `@/app/player/locationStore`; `LocationCheckInPanel`, `QrScannerOverlay`.
- Produces: no new exports; new test ids `player-tap-nfc-btn`, `player-scan-qr-btn`; QR overlay rendered with `testId="player-base-qr-scanner"`.

- [ ] **Step 1: Write the failing test**

Append to `web/src/features/player/BaseScreen.test.tsx`:

```tsx
describe('BaseScreen check-in methods', () => {
  const LOCATION_BASE = { ...NOT_VISITED, baseId: 'b1', nfcLinked: false, checkInMethod: 'LOCATION', checkInRadiusM: 20 }

  /** Same stateful fixture as above, with the method fields the player DTO now carries. */
  function methodOverride(method: 'NFC' | 'QR' | 'LOCATION', progressRow: Record<string, unknown> = {}) {
    const progress = [{ ...NOT_VISITED, checkInMethod: method, checkInRadiusM: 20, ...progressRow }]
    server.use(
      http.get('/api/player/games/:gameId/data', () => HttpResponse.json({
        gameStatus: 'live', unlockTrigger: 'CHECK_IN',
        bases: [{ id: 'b1', gameId: 'g1', lat: 40.09, lng: -8.87, nfcLinked: method === 'NFC', hidden: false, fixedChallengeId: null, checkInMethod: method, checkInRadiusM: 20 }],
        challenges: [{ id: 'c1', gameId: 'g1', title: 'The old mill', description: 'Count the wheels', content: '<p>How many wheels?</p>', answerType: 'text', points: 10 }],
        assignments: [{ id: 'a1', gameId: 'g1', baseId: 'b1', challengeId: 'c1', teamId: null }],
        progress,
      })),
      http.get('/api/games/:gameId/snapshot', () => HttpResponse.json({
        stateVersion: 1, serverTime: '2026-09-05T10:30:00Z', game: { id: 'g1', name: 'Serra da Estrela', status: 'live' },
        team: { id: 'team1', name: 'Falcons', memberCount: 4 }, progress, submissions: [], uploadSessions: [],
      })),
    )
  }

  it('sends a qr proof for the scanned code at a QR base', async () => {
    methodOverride('QR')
    const bodies: Array<Record<string, unknown>> = []
    server.use(http.post('/api/player/games/:gameId/bases/:baseId/check-in', async ({ params, request }) => {
      bodies.push((await request.json()) as Record<string, unknown>)
      return HttpResponse.json({ checkInId: 'ci-qr', baseId: params.baseId, checkedInAt: '2026-09-05T10:45:00Z' })
    }))
    const platform = await import('@/platform')
    vi.spyOn(platform, 'isNative').mockReturnValue(true)
    const qr = await import('@/platform/qr')
    vi.spyOn(qr, 'scanQr').mockResolvedValue('https://pointfinder.pt/tag/00000000-0000-4000-8000-0000000000b1?t=code1')
    await renderPlayer(<BaseScreen />, { route: '/base/00000000-0000-4000-8000-0000000000b1', path: '/base/:baseId' })

    await userEvent.click(await screen.findByTestId('player-scan-qr-btn'))
    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(bodies[0]).toEqual({ method: 'qr', token: 'code1' })
  })

  it('refuses a code printed for another base', async () => {
    methodOverride('QR')
    const sent = vi.fn()
    server.use(http.post('/api/player/games/:gameId/bases/:baseId/check-in', () => { sent(); return HttpResponse.json({}) }))
    const platform = await import('@/platform')
    vi.spyOn(platform, 'isNative').mockReturnValue(true)
    const qr = await import('@/platform/qr')
    vi.spyOn(qr, 'scanQr').mockResolvedValue('https://pointfinder.pt/tag/00000000-0000-4000-8000-0000000000b9?t=other')
    await renderPlayer(<BaseScreen />, { route: '/base/b1', path: '/base/:baseId' })

    await userEvent.click(await screen.findByTestId('player-scan-qr-btn'))
    expect(await screen.findByRole('status')).toHaveTextContent('That code belongs to a different base.')
    expect(sent).not.toHaveBeenCalled()
  })

  it('shows the live location panel instead of a tag button at a location base', async () => {
    methodOverride('LOCATION')
    const platform = await import('@/platform')
    vi.spyOn(platform, 'isNative').mockReturnValue(true)
    const { useLocationStore } = await import('@/app/player/locationStore')
    useLocationStore.setState({ fix: { lat: 40.098, lng: -8.87, accuracy: 8, capturedAt: Date.now() }, heading: null, status: 'watching', claimable: {}, dwell: {} })
    await renderPlayer(<BaseScreen />, { route: '/base/b1', path: '/base/:baseId' })

    expect(await screen.findByTestId('player-location-panel')).toHaveTextContent(/About \d+ m away/)
    expect(screen.queryByTestId('player-tap-nfc-btn')).not.toBeInTheDocument()
    expect(screen.queryByTestId('player-scan-qr-btn')).not.toBeInTheDocument()
  })

  it('sends a claimed geo proof with the dwell buffer when the player says they are here', async () => {
    methodOverride('LOCATION')
    const bodies: Array<Record<string, unknown>> = []
    server.use(http.post('/api/player/games/:gameId/bases/:baseId/check-in', async ({ params, request }) => {
      bodies.push((await request.json()) as Record<string, unknown>)
      return HttpResponse.json({ checkInId: 'ci-claim', baseId: params.baseId, checkedInAt: '2026-09-05T10:45:00Z' })
    }))
    const platform = await import('@/platform')
    vi.spyOn(platform, 'isNative').mockReturnValue(true)
    const { useLocationStore } = await import('@/app/player/locationStore')
    const dwell = [
      { lat: 40.0903, lng: -8.87, accuracy: 80, capturedAt: 1_700_000_000_000 },
      { lat: 40.0903, lng: -8.87, accuracy: 80, capturedAt: 1_700_000_020_000 },
      { lat: 40.0903, lng: -8.87, accuracy: 80, capturedAt: 1_700_000_040_000 },
      { lat: 40.0903, lng: -8.87, accuracy: 80, capturedAt: 1_700_000_070_000 },
    ]
    useLocationStore.setState({
      fix: { lat: 40.0903, lng: -8.87, accuracy: 80, capturedAt: 1_700_000_070_000 },
      heading: null, status: 'watching', claimable: { b1: true }, dwell: { b1: dwell },
    })
    await renderPlayer(<BaseScreen />, { route: '/base/b1', path: '/base/:baseId' })

    await userEvent.click(await screen.findByTestId('player-im-here-btn'))
    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(bodies[0]).toMatchObject({ method: 'geo', claimed: true, lat: 40.0903, lng: -8.87, accuracy: 80 })
    expect((bodies[0] as { dwell: unknown[] }).dwell).toHaveLength(4)
  })

  it('keeps the NFC button and its behaviour at an NFC base', async () => {
    methodOverride('NFC')
    const bodies: Array<Record<string, unknown>> = []
    server.use(http.post('/api/player/games/:gameId/bases/:baseId/check-in', async ({ params, request }) => {
      bodies.push((await request.json()) as Record<string, unknown>)
      return HttpResponse.json({ checkInId: 'ci-nfc', baseId: params.baseId, checkedInAt: '2026-09-05T10:45:00Z' })
    }))
    const platform = await import('@/platform')
    vi.spyOn(platform, 'isNative').mockReturnValue(true)
    const nfc = await import('@/platform/nfc')
    vi.spyOn(nfc, 'scanTag').mockResolvedValue({ tag: { baseId: 'b1', token: 'tag1' }, raw: { id: null, url: null, records: [] } })
    await renderPlayer(<BaseScreen />, { route: '/base/b1', path: '/base/:baseId' })

    await userEvent.click(await screen.findByTestId('player-tap-nfc-btn'))
    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(bodies[0]).toEqual({ method: 'nfc', token: 'tag1' })
  })

  it('uses the base method for a check-in arriving from a scanned link', async () => {
    methodOverride('QR')
    const bodies: Array<Record<string, unknown>> = []
    server.use(http.post('/api/player/games/:gameId/bases/:baseId/check-in', async ({ params, request }) => {
      bodies.push((await request.json()) as Record<string, unknown>)
      return HttpResponse.json({ checkInId: 'ci-link', baseId: params.baseId, checkedInAt: '2026-09-05T10:45:00Z' })
    }))
    await renderPlayer(<BaseScreen />, { route: '/base/b1?token=linked', path: '/base/:baseId' })

    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(bodies[0]).toEqual({ method: 'qr', token: 'linked' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```sh
bun run --cwd web test -- src/features/player/BaseScreen.test.tsx
```

Expected failure: `Unable to find an element by: [data-testid="player-scan-qr-btn"]`, `player-tap-nfc-btn` and `player-location-panel`; the link case sends `{ method: 'nfc', token: 'linked' }`.

- [ ] **Step 3: Write minimal implementation**

In `web/src/features/player/BaseScreen.tsx`, replace the import block at the top of the file with:

```tsx
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom'
import { ChevronLeft, Nfc, QrCode } from 'lucide-react'
import { insideWideRing, missingPreviousBase, parseTagUrl, proofTypeForMethod, type CheckInProof } from '@pointfinder/game-core'
import { BaseSequenceBadge } from '@/components/status/BaseSequenceBadge'
import { BaseRouteNotice } from './components/BaseRouteNotice'
import type { SubmissionResponse } from '@pointfinder/api'
import { Alert, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Label, Skeleton, Textarea } from '@/components'
import { usePlayerGame, type ActionResult } from '@/features/player/usePlayerGame'
import { challengeForBase } from '@/features/player/logbook'
import { nfcErrorMessage, scanTag } from '@/platform/nfc'
import { scanQr } from '@/platform/qr'
import { isNative } from '@/platform'
import { Screen } from '@/features/player/components/Screen'
import { BaseStatusBadge } from '@/features/player/components/BaseStatusBadge'
import { RichContent } from '@/features/player/components/RichContent'
import { SubmissionResult, type SubmissionOutcome } from '@/features/player/components/SubmissionResult'
import { MediaAnswer } from '@/features/player/components/MediaAnswer'
import { SyncBanner } from '@/features/player/components/SyncBanner'
import { LocationCheckInPanel } from '@/features/player/components/LocationCheckInPanel'
import { QrScannerOverlay } from '@/features/player/components/QrScannerOverlay'
import { describeError } from '@/app/player/errors'
import { useAuth } from '@/app/player/services'
import { useLocationStore } from '@/app/player/locationStore'
```

Immediately after the `const autoToken = useRef<string | null>(null)` line inside `BaseContent`, add:

```tsx
  const [scanning, setScanning] = useState(false)
  const scanAbort = useRef<AbortController | null>(null)
  const fix = useLocationStore((s) => s.fix)
  const claimable = useLocationStore((s) => s.claimable[baseId] === true)
  const dwell = useLocationStore((s) => s.dwell[baseId])
  useEffect(() => () => scanAbort.current?.abort(), [])
```

Immediately after the `const status = view?.effectiveStatus ?? 'not_visited'` line, add:

```tsx
  const method = view?.checkInMethod ?? 'NFC'
  const radiusM = view?.checkInRadiusM ?? 15
```

Replace the `checkInWith` function with:

```tsx
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

Replace the `?token=` effect with:

```tsx
  // Arrived straight from a tag tap or a camera-app scan of the printed code.
  useEffect(() => {
    const token = params.get('token')
    const scanKey = `${location.key}:${token}`
    if (token === null || scanKey === autoToken.current || !view || !needsCheckIn || !gameLive) return
    const type = proofTypeForMethod(view.checkInMethod)
    autoToken.current = scanKey
    setParams({}, { replace: true })
    // A location base has no token proof; the detector owns its check-in.
    if (type === 'geo') return
    void checkInWith({ type, token })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, needsCheckIn, params, gameLive, location.key])
```

Replace `tapTag` and add `scanCode` and `claimPresence` right after it:

```tsx
  async function tapTag() {
    setNotice(null)
    try {
      const { tag } = await scanTag(t, { baseTitle: entry?.kind === 'open' ? entry.title : undefined })
      if (!tag) return setNotice({ tone: 'destructive', text: t('nfc.invalid') })
      if (tag.baseId !== baseId) return setNotice({ tone: 'destructive', text: t('base.wrongTag') })
      await checkInWith({ type: 'nfc', token: tag.token ?? '' })
    } catch (err) {
      setNotice({ tone: 'destructive', text: nfcErrorMessage(err, t) })
    }
  }

  /** QR bases carry the same payload as the tag, read through the windowed camera. */
  async function scanCode(): Promise<{ token: string } | null> {
    scanAbort.current?.abort()
    const controller = new AbortController()
    scanAbort.current = controller
    setScanning(true)
    try {
      // Let React paint the transparent overlay before the camera takes the webview.
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      const text = await scanQr({ signal: controller.signal, windowed: true })
      if (text === null) return null
      const tag = parseTagUrl(text)
      if (!tag) { setNotice({ tone: 'destructive', text: t('base.unknownTag') }); return null }
      if (tag.baseId !== baseId) { setNotice({ tone: 'destructive', text: t('checkIn.wrongCode') }); return null }
      return { token: tag.token ?? '' }
    } catch (err) {
      const code = (err as { code?: string }).code ?? 'failed'
      setNotice({ tone: 'destructive', text: code === 'denied' ? t('join.cameraDisabled') : code === 'unavailable' ? t('join.scanUnavailable') : t('common.unknownError') })
      return null
    } finally {
      if (scanAbort.current === controller) scanAbort.current = null
      setScanning(false)
    }
  }

  async function checkInByCode() {
    setNotice(null)
    const scanned = await scanCode()
    if (scanned) await checkInWith({ type: 'qr', token: scanned.token })
  }

  /** The dwell-gated claim: accepted by the server but recorded as CLAIMED, not VERIFIED. */
  async function claimPresence() {
    setNotice(null)
    if (!fix) return setNotice({ tone: 'warning', text: t('location.locating') })
    await checkInWith({
      type: 'geo',
      lat: fix.lat,
      lng: fix.lng,
      accuracy: fix.accuracy,
      capturedAt: new Date(fix.capturedAt).toISOString(),
      claimed: true,
      dwell: (dwell ?? []).map((f) => ({ lat: f.lat, lng: f.lng, accuracy: f.accuracy, capturedAt: new Date(f.capturedAt).toISOString() })),
    })
  }
```

Replace `confirmPresence` with:

```tsx
  /** Challenges flagged requirePresenceToSubmit make the team prove presence again, in the base's own way. */
  async function confirmPresence(): Promise<boolean> {
    if (!needsPresence) return true
    if (method === 'LOCATION') {
      if (fix && view && insideWideRing(fix, { lat: view.lat, lng: view.lng }, radiusM)) return true
      setNotice({ tone: 'destructive', text: t('solve.wrongBase', { name: entry?.kind === 'open' ? entry.title : '' }) })
      return false
    }
    if (method === 'QR') {
      const scanned = await scanCode()
      return scanned !== null
    }
    try {
      const { tag } = await scanTag(t, { baseTitle: entry?.kind === 'open' ? entry.title : undefined })
      if (!tag) { setNotice({ tone: 'destructive', text: t('nfc.invalid') }); return false }
      if (tag.baseId !== baseId) { setNotice({ tone: 'destructive', text: t('solve.wrongBase', { name: entry?.kind === 'open' ? entry.title : '' }) }); return false }
      return true
    } catch (err) {
      setNotice({ tone: 'destructive', text: nfcErrorMessage(err, t) })
      return false
    }
  }
```

Immediately before the component's `return (` statement, add the overlay short-circuit:

```tsx
  if (scanning) return <QrScannerOverlay onBack={() => scanAbort.current?.abort()} caption={t('checkIn.scanQr')} testId="player-base-qr-scanner" />
```

Replace the `needsCheckIn` card block with:

```tsx
          {needsCheckIn && (
            <Card>
              <CardHeader>
                <CardTitle>{t('checkIn.title')}</CardTitle>
                <CardDescription>
                  {method === 'LOCATION' ? t('location.locating') : method === 'QR' ? t('checkIn.scanQr') : view.nfcLinked ? t('base.tapToCheckIn') : t('base.noNfc')}
                </CardDescription>
              </CardHeader>
              {isNative() && gameLive && (
                <CardContent className="flex flex-col gap-3">
                  {method === 'NFC' && view.nfcLinked && (
                    <Button size="lg" className="w-full text-base" disabled={busy} onClick={tapTag} data-testid="player-tap-nfc-btn">
                      <Nfc className="mr-2 h-5 w-5" aria-hidden /> {busy ? t('checkIn.scanning') : t('checkIn.tapTag')}
                    </Button>
                  )}
                  {method === 'QR' && (
                    <Button size="lg" className="w-full text-base" disabled={busy} onClick={() => void checkInByCode()} data-testid="player-scan-qr-btn">
                      <QrCode className="mr-2 h-5 w-5" aria-hidden /> {busy ? t('checkIn.scanning') : t('checkIn.scanQr')}
                    </Button>
                  )}
                  {method === 'LOCATION' && (
                    <LocationCheckInPanel
                      baseId={baseId}
                      base={{ lat: view.lat, lng: view.lng, radiusM }}
                      onClaim={() => void claimPresence()}
                      claimable={claimable}
                      busy={busy}
                    />
                  )}
                </CardContent>
              )}
            </Card>
          )}
```

- [ ] **Step 4: Run test to verify it passes**

```sh
bun run --cwd web test -- src/features/player/BaseScreen.test.tsx
```

- [ ] **Step 5: Commit** — no commit in this task.

---

### Task 11: Map radius circles, method-aware scan control and the denied notice

**Files:**
- Create: `web/src/features/player/mapShapes.ts`
- Modify: `web/src/features/player/PlayerMap.tsx` (imports; `open`/derived method flags; the `Map` children; the header alerts; the bottom action block)
- Test: `web/src/features/player/mapShapes.test.ts` (create)
- Test: `web/src/features/player/PlayerMap.test.tsx` (create)

**Interfaces:**
- Consumes: `distanceM` from `@pointfinder/game-core`; `Source`, `Layer` from `react-map-gl/maplibre`; `lightColorValues` from `@/generated/colorValues`; `scanQr` from `@/platform/qr`; `parseTagUrl` from `@pointfinder/game-core`.
- Produces:
  - `export function circlePolygon(lat: number, lng: number, radiusM: number, steps?: number): GeoJSON.Feature<GeoJSON.Polygon, { radiusM: number }>`
  - `export function radiusCollection(bases: Array<{ baseId: string; lat: number; lng: number; radiusM: number }>): GeoJSON.FeatureCollection<GeoJSON.Polygon>`
  - `export const CHECK_IN_RADIUS_SOURCE_ID = 'player-check-in-radius'`

- [ ] **Step 1: Write the failing test**

Create `web/src/features/player/mapShapes.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { distanceM } from '@pointfinder/game-core'
import { circlePolygon, radiusCollection } from './mapShapes'

describe('circlePolygon', () => {
  it('closes the ring and keeps every vertex at the requested radius', () => {
    const feature = circlePolygon(40.09, -8.87, 50, 32)
    const ring = feature.geometry.coordinates[0]!
    expect(ring).toHaveLength(33)
    expect(ring[0]).toEqual(ring[ring.length - 1])
    for (const [lng, lat] of ring) {
      expect(distanceM({ lat: lat!, lng: lng! }, { lat: 40.09, lng: -8.87 })).toBeCloseTo(50, 0)
    }
  })

  it('carries the radius as a property for the label layer', () => {
    expect(circlePolygon(40.09, -8.87, 25).properties.radiusM).toBe(25)
  })
})

describe('radiusCollection', () => {
  it('builds one polygon per base and nothing for an empty list', () => {
    const collection = radiusCollection([
      { baseId: 'b1', lat: 40.09, lng: -8.87, radiusM: 20 },
      { baseId: 'b2', lat: 40.10, lng: -8.88, radiusM: 40 },
    ])
    expect(collection.type).toBe('FeatureCollection')
    expect(collection.features).toHaveLength(2)
    expect(collection.features.map((f) => f.id)).toEqual(['b1', 'b2'])
    expect(radiusCollection([]).features).toEqual([])
  })
})
```

Create `web/src/features/player/PlayerMap.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { renderPlayer } from '@/features/player/test/renderPlayer'
import { useLocationStore } from '@/app/player/locationStore'

let lastSourceProps: Record<string, unknown> = {}

vi.mock('react-map-gl/maplibre', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="map-container">{children}</div>,
  Source: (props: Record<string, unknown>) => { lastSourceProps = props; return <div data-testid="source">{props.children as React.ReactNode}</div> },
  Layer: (props: Record<string, unknown>) => <div data-testid={`layer-${props.id}`} />,
  Marker: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  useMap: () => ({ current: undefined }),
  NavigationControl: () => null,
}))

function gameWithMethods(methods: Array<'NFC' | 'QR' | 'LOCATION'>) {
  const bases = methods.map((method, i) => ({ id: `b${i + 1}`, gameId: 'g1', lat: 40.09 + i / 1000, lng: -8.87, nfcLinked: method === 'NFC', hidden: false, fixedChallengeId: null, checkInMethod: method, checkInRadiusM: 20 }))
  const progress = methods.map((method, i) => ({ baseId: `b${i + 1}`, challengeTitle: `Base ${i + 1}`, lat: 40.09 + i / 1000, lng: -8.87, nfcLinked: method === 'NFC', status: 'not_visited', checkedInAt: null, challengeId: null, submissionStatus: null, checkInMethod: method, checkInRadiusM: 20 }))
  server.use(
    http.get('/api/player/games/:gameId/data', () => HttpResponse.json({ gameStatus: 'live', unlockTrigger: 'CHECK_IN', bases, challenges: [], assignments: [], progress })),
    http.get('/api/games/:gameId/snapshot', () => HttpResponse.json({ stateVersion: 1, game: { id: 'g1', name: 'Serra da Estrela', status: 'live', tileSource: 'osm' }, team: { id: 'team1', name: 'Falcons', memberCount: 4 }, progress, submissions: [], uploadSessions: [] })),
  )
}

async function renderMap() {
  const platform = await import('@/platform')
  vi.spyOn(platform, 'isNative').mockReturnValue(true)
  const { default: PlayerMap } = await import('./PlayerMap')
  return renderPlayer(<PlayerMap />, { route: '/' })
}

describe('PlayerMap check-in methods', () => {
  it('draws a radius ring for visible location bases only', async () => {
    lastSourceProps = {}
    gameWithMethods(['LOCATION', 'NFC'])
    useLocationStore.setState({ fix: null, heading: null, status: 'watching', claimable: {}, dwell: {} })
    await renderMap()
    await waitFor(() => expect((lastSourceProps.data as GeoJSON.FeatureCollection | undefined)?.features).toHaveLength(1))
    expect((lastSourceProps.data as GeoJSON.FeatureCollection).features[0]!.id).toBe('b1')
  })

  it('offers a QR scan action when the game has QR bases', async () => {
    gameWithMethods(['QR'])
    await renderMap()
    expect(await screen.findByTestId('player-map-scan-qr-btn')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Tap a base tag' })).not.toBeInTheDocument()
  })

  it('offers only the NFC action when no QR base exists', async () => {
    gameWithMethods(['NFC'])
    await renderMap()
    expect(await screen.findByRole('button', { name: 'Tap a base tag' })).toBeInTheDocument()
    expect(screen.queryByTestId('player-map-scan-qr-btn')).not.toBeInTheDocument()
  })

  it('warns that location bases will not unlock while permission is denied', async () => {
    gameWithMethods(['LOCATION'])
    useLocationStore.setState({ fix: null, heading: null, status: 'denied', claimable: {}, dwell: {} })
    await renderMap()
    expect(await screen.findByTestId('player-map-location-warning'))
      .toHaveTextContent('Location is off. Bases that unlock by position will not open.')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```sh
bun run --cwd web test -- src/features/player/mapShapes.test.ts src/features/player/PlayerMap.test.tsx
```

Expected failure: `Failed to resolve import "./mapShapes"`, and the PlayerMap cases fail on the missing `player-map-scan-qr-btn`, `player-map-location-warning` and radius `Source`.

- [ ] **Step 3: Write minimal implementation**

Create `web/src/features/player/mapShapes.ts`:

```ts
const EARTH_RADIUS_M = 6_371_000

/**
 * A base's check-in radius as a GeoJSON polygon. MapLibre circle layers size in
 * screen pixels, so a ring that means metres on the ground has to be a polygon.
 */
export function circlePolygon(lat: number, lng: number, radiusM: number, steps = 64): GeoJSON.Feature<GeoJSON.Polygon, { radiusM: number }> {
  const toRad = (d: number) => (d * Math.PI) / 180
  const toDeg = (r: number) => (r * 180) / Math.PI
  const angular = radiusM / EARTH_RADIUS_M
  const lat1 = toRad(lat)
  const lng1 = toRad(lng)
  const ring: GeoJSON.Position[] = []
  for (let i = 0; i <= steps; i++) {
    const bearing = (2 * Math.PI * i) / steps
    const lat2 = Math.asin(Math.sin(lat1) * Math.cos(angular) + Math.cos(lat1) * Math.sin(angular) * Math.cos(bearing))
    const lng2 = lng1 + Math.atan2(
      Math.sin(bearing) * Math.sin(angular) * Math.cos(lat1),
      Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2),
    )
    ring.push([toDeg(lng2), toDeg(lat2)])
  }
  ring[ring.length - 1] = [...ring[0]!]
  return { type: 'Feature', properties: { radiusM }, geometry: { type: 'Polygon', coordinates: [ring] } }
}

export const CHECK_IN_RADIUS_SOURCE_ID = 'player-check-in-radius'
export const CHECK_IN_RADIUS_FILL_LAYER_ID = 'player-check-in-radius-fill'
export const CHECK_IN_RADIUS_LINE_LAYER_ID = 'player-check-in-radius-line'

/** One polygon per visible location base. Hidden bases are never passed in. */
export function radiusCollection(bases: Array<{ baseId: string; lat: number; lng: number; radiusM: number }>): GeoJSON.FeatureCollection<GeoJSON.Polygon> {
  return {
    type: 'FeatureCollection',
    features: bases.map((b) => ({ ...circlePolygon(b.lat, b.lng, b.radiusM), id: b.baseId })),
  }
}
```

In `web/src/features/player/PlayerMap.tsx`, replace the two map imports

```tsx
import Map, { Marker, type MapRef } from 'react-map-gl/maplibre'
```

with

```tsx
import Map, { Layer, Marker, Source, type MapRef } from 'react-map-gl/maplibre'
```

replace the icon import

```tsx
import { Bell, List, LocateFixed, Nfc, Settings } from 'lucide-react'
```

with

```tsx
import { Bell, List, LocateFixed, Nfc, QrCode, Settings } from 'lucide-react'
```

and add after the `import { SyncBanner } from '@/features/player/components/SyncBanner'` line:

```tsx
import { parseTagUrl } from '@pointfinder/game-core'
import { scanQr } from '@/platform/qr'
import { QrScannerOverlay } from '@/features/player/components/QrScannerOverlay'
import { lightColorValues } from '@/generated/colorValues'
import { CHECK_IN_RADIUS_FILL_LAYER_ID, CHECK_IN_RADIUS_LINE_LAYER_ID, CHECK_IN_RADIUS_SOURCE_ID, radiusCollection } from '@/features/player/mapShapes'
```

Add below the `const LEGEND = ...` line:

```tsx
const RADIUS_FILL = { id: CHECK_IN_RADIUS_FILL_LAYER_ID, type: 'fill' as const, paint: { 'fill-color': lightColorValues['status.checkedIn'], 'fill-opacity': 0.08 } }
const RADIUS_LINE = { id: CHECK_IN_RADIUS_LINE_LAYER_ID, type: 'line' as const, paint: { 'line-color': lightColorValues['status.checkedIn'], 'line-width': 1.5, 'line-opacity': 0.5 } }
```

Inside `PlayerMap`, add after `const [scanError, setScanError] = useState<string | null>(null)`:

```tsx
  const [scanning, setScanning] = useState(false)
  const scanAbort = useRef<AbortController | null>(null)
  useEffect(() => () => scanAbort.current?.abort(), [])
```

Add after the `const open = useMemo(...)` block:

```tsx
  // Hidden location bases arrive as geofence-only rows and must never be drawn.
  const radiusData = useMemo(
    () => radiusCollection(open.filter((e) => e.view.checkInMethod === 'LOCATION').map((e) => ({ baseId: e.baseId, lat: e.view.lat, lng: e.view.lng, radiusM: e.view.checkInRadiusM ?? 15 }))),
    [open],
  )
  const methods = useMemo(() => new Set((game.data?.bases ?? []).map((b) => b.checkInMethod)), [game.data])
  const hasNfcBases = methods.has('NFC')
  const hasQrBases = methods.has('QR')
  const hasLocationBases = methods.has('LOCATION')
```

Add the QR handler next to `tapAnyTag`:

```tsx
  async function scanAnyCode() {
    setScanError(null)
    scanAbort.current?.abort()
    const controller = new AbortController()
    scanAbort.current = controller
    setScanning(true)
    try {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      const text = await scanQr({ signal: controller.signal, windowed: true })
      if (text === null) return
      const tag = parseTagUrl(text)
      if (!tag) return setScanError(t('base.unknownTag'))
      navigate(`/base/${encodeURIComponent(tag.baseId)}?token=${encodeURIComponent(tag.token ?? '')}`)
    } catch (err) {
      const code = (err as { code?: string }).code ?? 'failed'
      setScanError(code === 'denied' ? t('join.cameraDisabled') : code === 'unavailable' ? t('join.scanUnavailable') : t('common.unknownError'))
    } finally {
      if (scanAbort.current === controller) scanAbort.current = null
      setScanning(false)
    }
  }
```

Immediately before the component's `return (`, add:

```tsx
  if (scanning) return <QrScannerOverlay onBack={() => scanAbort.current?.abort()} caption={t('checkIn.scanQr')} testId="player-map-qr-scanner" />
```

Inside the `<Map>` element, add the radius source directly above the `{open.map((e) => (` block:

```tsx
        {radiusData.features.length > 0 && (
          <Source id={CHECK_IN_RADIUS_SOURCE_ID} type="geojson" data={radiusData}>
            <Layer {...RADIUS_FILL} />
            <Layer {...RADIUS_LINE} />
          </Source>
        )}
```

Replace the existing denied alert line in the header block

```tsx
        {location.status === 'denied' && status === 'live' && <Alert variant="warning" className="pointer-events-auto">{t('map.locationOff')}</Alert>}
```

with

```tsx
        {location.status === 'denied' && status === 'live' && <Alert variant="warning" className="pointer-events-auto">{t('map.locationOff')}</Alert>}
        {location.status === 'denied' && status === 'live' && hasLocationBases && (
          <Alert variant="warning" className="pointer-events-auto" data-testid="player-map-location-warning">{t('location.basesWontUnlock')}</Alert>
        )}
```

Replace the bottom scan action

```tsx
        {isNative() && (
          <Button size="lg" className="w-full text-base shadow-overlay" onClick={tapAnyTag}>
            <Nfc className="mr-2 h-5 w-5" aria-hidden /> {t('logbook.tapAny')}
          </Button>
        )}
```

with

```tsx
        {/* The scan control offers only the methods this game actually uses. */}
        {isNative() && (hasNfcBases || hasQrBases) && (
          <div className="flex flex-col gap-2">
            {hasNfcBases && (
              <Button size="lg" className="w-full text-base shadow-overlay" onClick={tapAnyTag}>
                <Nfc className="mr-2 h-5 w-5" aria-hidden /> {t('logbook.tapAny')}
              </Button>
            )}
            {hasQrBases && (
              <Button size="lg" variant={hasNfcBases ? 'outline' : 'default'} className="w-full text-base shadow-overlay" onClick={() => void scanAnyCode()} data-testid="player-map-scan-qr-btn">
                <QrCode className="mr-2 h-5 w-5" aria-hidden /> {t('checkIn.scanQr')}
              </Button>
            )}
          </div>
        )}
```

- [ ] **Step 4: Run test to verify it passes**

```sh
bun run --cwd web test -- src/features/player/mapShapes.test.ts src/features/player/PlayerMap.test.tsx
```

- [ ] **Step 5: Commit** — no commit in this task.

---

### Task 12: Visual-system and validation docs, full verification, one atomic commit

**Files:**
- Modify: `docs/visual-system/component-inventory.md` (append a new dated section at the end; update the existing `QrScannerOverlay` entry at lines 342–347)
- Modify: `docs/visual-system/preview-matrix.md` (append rows to the fixture table)
- Modify: `docs/native-platform-validation.md` (append a new dated section at the end)
- Test: the full frontend suite plus the design-system check (commands in Step 4)

**Interfaces:**
- Consumes: nothing new.
- Produces: documentation entries for `LocationCheckInPanel`, `ArrivalToast`, the generalised `QrScannerOverlay`, and the five manual device scenarios from the spec.

- [ ] **Step 1: Write the failing test**

There is no unit test for prose. The verification for this task is the full suite plus the design-system check; run it first so the failure is recorded before the docs land:

```sh
bun run --cwd web typecheck && bun run --cwd web lint && bun run --cwd web test && bun run --cwd packages/game-core test && bun run --cwd packages/i18n test && make design-system-check
```

- [ ] **Step 2: Run test to verify it fails**

Expected at this point: everything above passes (Tasks 1–11 are green) except that the repository still has no inventory or preview-matrix entry for the new player components, which the project's definition of done requires. If any command fails, fix the cause before continuing — do not proceed to the commit with a red check.

- [ ] **Step 3: Write minimal implementation**

In `docs/visual-system/component-inventory.md`, replace the existing `QrScannerOverlay` entry (lines 342–347) with:

```markdown
Component: QrScannerOverlay
Status: canonical
Location: `web/src/features/player/components/QrScannerOverlay.tsx`
Modes: Auth / Onboarding, Player Field
States: scanning, cancel, join caption, base check-in caption
Notes: Tauri windowed-camera chrome with a safe-area-aware Back action and transparent scan target. The caller supplies `caption` and an optional `testId`; the default test id stays `player-qr-scanner` and the Back action keeps `player-join-scan-back-btn`. Camera permission and scanner lifecycle remain in the platform boundary.
```

Append to the end of `docs/visual-system/component-inventory.md`:

```markdown
## Player check-in methods (2026-09-05)

Component: LocationCheckInPanel
Status: canonical
Location: `web/src/features/player/components/LocationCheckInPanel.tsx`
Modes: Player Field
States: locating, permission denied with open-settings, far (distance), near but
inexact (accuracy), arrived, sensor unavailable, claim disabled with hint, claim
enabled, claim busy, long localized copy
Notes: Reads the shared player location store; it never starts a watch of its own.
The panel reports, it does not check in: the runtime arrival detector owns the
automatic proof. "I'm here" sends a claimed geo proof with the dwell buffer and is
disabled until the dwell rule passes. Test ids `player-location-panel` and
`player-im-here-btn`. See `docs/specs/2026-09-05-check-in-methods-design.md`.

Component: ArrivalToast
Status: canonical
Location: `web/src/features/player/components/ArrivalToast.tsx`
Modes: Player Field
States: synced named base, synced hidden base discovered, queued offline without a
name, several notices stacked, dismissed, long localized copy
Notes: Rendered once above the router outlet in `TagIntake`, so an arrival that
happens on the map, in the logbook, or at another base is never missed. Notices
come from `web/src/app/player/arrivalNotices.ts`; the component holds no timers and
adds no entrance animation, so reduced-motion behaviour is unchanged. Test id
`player-arrival-notice`.
```

Append these rows to the fixture table in `docs/visual-system/preview-matrix.md`, immediately after the `| Player onboarding and QR scanner chrome | partial | n/a | n/a |` row:

```markdown
| Player location check-in panel: locating, denied, far, near, arrived, claim gating | pending | n/a | n/a |
| Player arrival notice: named base, hidden base found, queued offline | pending | n/a | n/a |
| Player map check-in radius rings and method-aware scan control | pending | n/a | n/a |
```

Append to the end of `docs/native-platform-validation.md`:

```markdown
# Check-in methods: manual device validation (2026-09-05)

The programmatic tests carry the check-in logic; the product owner validates the
experience on a device. These five scenarios are the release gate for QR and
location bases. Legacy iOS and Android builds cannot complete a game that has any
non-NFC base, so run these on the Tauri player build only.

- [ ] **QR base, scanned in the app.** Open the base screen at a QR base, tap
  "Scan code", and read the printed code. The check-in is accepted and the
  challenge appears. Read a code printed for a different base and confirm the
  refusal names a different base and queues nothing.
- [ ] **QR base, scanned with the phone's camera app.** Scan the printed code from
  the OS camera. The universal link opens the app at that base and checks in with
  the base's own method; no second scan is required.
- [ ] **Location base, walked into with the app open.** Approach a location base
  with the app in the foreground and any screen showing. The base unlocks without
  a tap and an arrival notice names it. Confirm the operator feed shows the
  check-in as verified.
- [ ] **Location base in airplane mode.** Repeat the walk-in with the radio off.
  The proof queues with its captured fix and the logbook shows the queued state.
  Re-enable the network and confirm the check-in syncs with the captured time, not
  the reconnect time.
- [ ] **Hidden location base.** Walk into a hidden location base that never
  appeared on the map. Confirm the map never drew it or its radius before arrival,
  and that the notice reads "You found <name>" once the name arrives.
- [ ] **Dwell-gated claim.** At a location base where GPS will not converge,
  confirm "I'm here" stays disabled with its hint until a full minute inside the
  wider ring has passed, then produces a claimed row that the operator feed shows
  with the claimed badge and the teammate snapshot.
```

- [ ] **Step 4: Run test to verify it passes**

```sh
bun run --cwd web typecheck && bun run --cwd web lint && bun run --cwd web test && bun run --cwd packages/game-core test && bun run --cwd packages/i18n test && make design-system-check
```

- [ ] **Step 5: Commit** (only at the end of the phase — ONE atomic commit)

Run the final gate, then commit everything from Tasks 1–12 as a single commit. Do not stage `docs/superpowers/plans/2026-09-05-check-in-methods-4-player.md`.

```sh
bun run --cwd web typecheck
bun run --cwd web lint
bun run --cwd web test
make design-system-check
git add packages/i18n/src/locales/en.json packages/i18n/src/locales/de.json packages/i18n/src/locales/pt.json \
  web/src/app/player/errors.ts web/src/app/player/errors.test.ts \
  web/src/app/player/locationStore.ts web/src/app/player/locationStore.test.ts \
  web/src/app/player/arrival.ts web/src/app/player/arrival.test.ts \
  web/src/app/player/arrivalNotices.ts web/src/app/player/runtime.ts web/src/app/player/TagIntake.tsx \
  web/src/features/player/useTeamLocation.ts web/src/features/player/useTeamLocation.test.tsx \
  web/src/features/player/arrivalCandidates.ts web/src/features/player/arrivalCandidates.test.ts \
  web/src/features/player/components/ArrivalToast.tsx web/src/features/player/components/ArrivalToast.test.tsx \
  web/src/features/player/components/LocationCheckInPanel.tsx web/src/features/player/components/LocationCheckInPanel.test.tsx \
  web/src/features/player/components/QrScannerOverlay.tsx web/src/features/player/components/QrScannerOverlay.test.tsx \
  web/src/features/player/Join.tsx web/src/features/player/BaseScreen.tsx web/src/features/player/BaseScreen.test.tsx \
  web/src/features/player/PlayerMap.tsx web/src/features/player/PlayerMap.test.tsx \
  web/src/features/player/mapShapes.ts web/src/features/player/mapShapes.test.ts \
  web/src/platform/geolocation.ts web/src/platform/geolocation.test.ts \
  docs/visual-system/component-inventory.md docs/visual-system/preview-matrix.md docs/native-platform-validation.md
git commit -m "$(cat <<'MSG'
feat(player): QR and location check-in with auto arrival and presence claims

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
MSG
)"
```
