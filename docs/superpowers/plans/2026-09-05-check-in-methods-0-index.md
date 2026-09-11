# Check-in methods — plan index

Spec: `docs/specs/2026-09-05-check-in-methods-design.md`
Contract used by every phase: copied below from the planning session's scratchpad so it survives.

Phases run strictly in order; each phase is one atomic commit on `master`:

1. `2026-09-05-check-in-methods-1-backend.md` — `feat(backend): per-base check-in methods with location verification`
2. `2026-09-05-check-in-methods-2-shared.md` — `feat(shared): check-in proof, geofence rules and arrival detector`
3. `2026-09-05-check-in-methods-3-operator.md` — `feat(web): operator check-in method setup, codes sheet and readiness rules`
4. `2026-09-05-check-in-methods-4-player.md` — `feat(player): QR and location check-in with auto arrival and presence claims`

Plans and specs are never committed.

## Working-tree caveat (2026-09-05 23:50)

The tree holds an uncommitted, separate "enforced base order" wave (spec `docs/specs/2026-09-05-enforced-base-order.md`, `V59__enforced_base_order.sql`, `BaseOrderService`, `packages/game-core/src/baseOrder.ts`, `BaseRouteEditor`, and edits in `PlayerService`, `BaseScreen`, `GameSettingsPanel`, the locale files) plus the join-flow QR overlay work (`QrScannerOverlay`, `NfcLinkControl`, `platform/qr.ts`, `platform/runtime.ts`). Those files overlap with every phase here. Commit that wave first, or stage phase commits by explicit path only.

## Contract deviations accepted during planning

- Backend `CheckInVerificationService.verify(Base, Team, CheckInRequest, Instant)` (team needed for the snapshot); `VerifiedProof` carries `teammatesInRing`/`teammatesTotal`; `ActivityEvent.metadata` is a `Map<String,Object>` jsonb; `Base.resolvedCheckInRadiusM()` returns `int` with a 15 m fallback when detached; `CHECK_IN_FIX_TOO_COARSE` also covers missing lat/lng; CLAIMED rows keep receipt time as `checked_in_at`.
- Operator: the drawer tab `nfc` becomes visible in the browser (codes print there); `qrcode` package already present, no new dependency.
- Player: new test ids `player-map-scan-qr-btn`, `player-map-location-warning` in addition to the contract's list.
# Shared interface contract — check-in methods (NFC / QR / LOCATION)

Every plan phase MUST use exactly these names. Do not invent alternatives.
Spec: docs/specs/2026-09-05-check-in-methods-design.md (read it fully first).
Repo: /Users/xmedavid/dev/dbvnfc, trunk branch `master`.

## Enums (backend Java, `com.prayer.pointfinder.entity`)
- `CheckInMethod { NFC, QR, LOCATION }` — new file `entity/CheckInMethod.java`.
- `CheckInVerification { VERIFIED, CLAIMED, OPERATOR }` — new file `entity/CheckInVerification.java`.
Persisted as VARCHAR(16) with `@Enumerated(EnumType.STRING)`.

## DB migration
`backend/src/main/resources/db/migration/V60__check_in_methods.sql` (latest today is V59). Columns:
- `bases.check_in_method VARCHAR(16) NOT NULL DEFAULT 'NFC'`
- `bases.check_in_radius_m INTEGER NULL`
- `games.default_check_in_method VARCHAR(16) NOT NULL DEFAULT 'NFC'`
- `games.default_check_in_radius_m INTEGER NOT NULL DEFAULT 15`
- `check_ins.method VARCHAR(16) NOT NULL DEFAULT 'NFC'`
- `check_ins.verification VARCHAR(16) NOT NULL DEFAULT 'VERIFIED'` then `UPDATE check_ins SET verification='OPERATOR' WHERE source_surface='operator_rescue'`
- `check_ins.proof_lat DOUBLE PRECISION NULL`, `proof_lng DOUBLE PRECISION NULL`, `proof_accuracy_m DOUBLE PRECISION NULL`, `proof_distance_m DOUBLE PRECISION NULL`, `proof_captured_at TIMESTAMPTZ NULL`, `team_positions_snapshot JSONB NULL`
- `player_locations.accuracy_m DOUBLE PRECISION NULL`, `player_locations.captured_at TIMESTAMPTZ NULL`

## Backend entity fields (Java names)
- `Base.checkInMethod : CheckInMethod` (column check_in_method), `Base.checkInRadiusM : Integer` (nullable)
- `Game.defaultCheckInMethod : CheckInMethod`, `Game.defaultCheckInRadiusM : Integer`
- `CheckIn.method : CheckInMethod`, `CheckIn.verification : CheckInVerification`, `CheckIn.proofLat/proofLng/proofAccuracyM/proofDistanceM : Double`, `CheckIn.proofCapturedAt : Instant`, `CheckIn.teamPositionsSnapshot : String` (JSON text, column type jsonb via `@JdbcTypeCode(SqlTypes.JSON)`)
- `PlayerLocation.accuracyM : Double`, `PlayerLocation.capturedAt : Instant`
- Radius resolution helper: `Base.resolvedCheckInRadiusM()` → `checkInRadiusM != null ? checkInRadiusM : game.getDefaultCheckInRadiusM()`
- Clamp constants in `service/CheckInVerificationService.java`: `MIN_RADIUS_M = 5`, `MAX_RADIUS_M = 200`.

## Backend request/response DTO field names (JSON)
Check-in request `dto/request/CheckInRequest.java` (replace the single-field class; keep class name):
```
method: "nfc" | "qr" | "geo" | null   (null => legacy body)
token: string | null                   (nfc/qr)
nfcToken: string | null                (legacy; treated as method=nfc)
lat, lng, accuracy: Double | null      (geo)
capturedAt: Instant | null             (geo)
claimed: Boolean | null                (geo; default false)
dwell: List<FixDto> | null             (geo claimed) where FixDto { lat, lng, accuracy: Double; capturedAt: Instant }
```
Bean validation moves into the service (structure-dependent), so remove `@NotBlank` on nfcToken.
- `CheckInResponse` adds `method: String` ("NFC"|"QR"|"LOCATION") and `verification: String` ("VERIFIED"|"CLAIMED"|"OPERATOR").
- Player base DTO `PlayerBaseResponse` adds `checkInMethod: String` and `checkInRadiusM: Integer` (resolved, never null).
- Operator `BaseResponse` adds `checkInMethod: String`, `checkInRadiusM: Integer|null`.
- `CreateBaseRequest` / `UpdateBaseRequest` add `checkInMethod: String|null` (null on create => game default; null on update => unchanged), `checkInRadiusM: Integer|null` (`@Min(5) @Max(200)`).
- `GameResponse`, `CreateGameRequest`, `UpdateGameRequest`, `GameMetadataDto` (export) add `defaultCheckInMethod: String`, `defaultCheckInRadiusM: Integer`.
- Location update request adds `accuracy: Double|null`, `capturedAt: Instant|null` (client already sends `accuracy` and `capturedAt`; check `dto/request/LocationUpdateRequest.java` or equivalent and the `PlayerService.updateLocation` signature).
- `GameDataResponse.bases` additionally includes hidden LOCATION bases not yet visited by the team as geofence-only `PlayerBaseResponse` rows with `hidden=true`, `checkInMethod="LOCATION"`, `checkInRadiusM`, `lat`, `lng`, `id`, `gameId`, and `nfcLinked=false`, `fixedChallengeId=null`. Hidden NFC/QR bases are NOT added (existing behaviour).
- Activity event payload for check-ins: append `method` and `verification` and, for CLAIMED, `teammatesInRing` and `teammatesTotal`. Look at how `ActivityEvent` carries structured data today (`metadata`/`payload` column or message only) and extend the least invasive way; if only `message` exists, add a `metadata` JSONB column in V60 named `activity_events.metadata`.

## Error codes (`exception/ErrorCode.java`, group "Check-in")
`CHECK_IN_METHOD_MISMATCH`, `CHECK_IN_TOKEN_INVALID`, `CHECK_IN_FIX_TOO_COARSE`, `CHECK_IN_FIX_STALE`, `CHECK_IN_OUT_OF_RANGE` (details `distanceM`, `allowedM`), `CHECK_IN_CLAIM_NOT_DWELLED` (details `reason` ∈ `too_few_fixes|span_too_short|outside_ring|fix_too_coarse|buffer_stale`). Keep existing `NFC_TOKEN_REQUIRED` for a body with no usable proof.
Error detail maps: follow how `PREVIOUS_BASE_REQUIRED` attaches `nextRequiredBaseNumber` details today (BadRequestException with details map).

## Verification order in `PlayerService.checkIn`
guards (player in game, game live, base in game) → dedup (existing active row returned as-is) → base order (`baseOrderService.requirePreviousBases`) → `CheckInVerificationService.verify(base, request, now)` → save row → activity event → broadcast → push.
`CheckInVerificationService.verify` returns `VerifiedProof { method, verification, proofLat, proofLng, proofAccuracyM, proofDistanceM, proofCapturedAt, teamPositionsSnapshotJson (null unless CLAIMED), checkedInAt }`.

## Verification constants (server; mirrored in game-core)
- AUTO_ACCURACY_CAP_M = 50; ACCURACY_CREDIT_CAP_M = 30; accept auto when `distance <= radius + min(accuracy, 30)`.
- STALE_PAST = 24h; STALE_FUTURE = 10min.
- CLAIM_ACCURACY_CAP_M = 100; wide ring `R = max(3 * radius, 50)`.
- DWELL_MIN_FIXES = 4; DWELL_MIN_SPAN_MS = 60_000; DWELL_MAX_GAP_TO_MAIN_MS = 120_000.
- Haversine with Earth radius 6_371_000 m.

## game-core (packages/game-core/src)
- `proof.ts`:
```ts
export type CheckInProof =
  | { type: 'nfc'; token: string }
  | { type: 'qr'; token: string }
  | { type: 'geo'; lat: number; lng: number; accuracy: number; capturedAt: string; claimed: false }
  | { type: 'geo'; lat: number; lng: number; accuracy: number; capturedAt: string; claimed: true; dwell: DwellFix[] }
export interface DwellFix { lat: number; lng: number; accuracy: number; capturedAt: string }  // ISO
export type CheckInMethod = 'NFC' | 'QR' | 'LOCATION'   // server enum names, used on DTOs
export type CheckInRequestBody =
  | { method: 'nfc' | 'qr'; token: string }
  | { method: 'geo'; lat: number; lng: number; accuracy: number; capturedAt: string; claimed: boolean; dwell?: DwellFix[] }
export function toCheckInRequest(proof: CheckInProof): CheckInRequestBody
export function proofTypeForMethod(method: CheckInMethod): 'nfc' | 'qr' | 'geo'
```
  `UnsupportedProofError` and `PresenceProvider` are deleted (check for consumers first: only proof.test.ts today).
- `geofence.ts` (new):
```ts
export const AUTO_ACCURACY_CAP_M = 50, ACCURACY_CREDIT_CAP_M = 30, CLAIM_ACCURACY_CAP_M = 100
export const DWELL_MIN_FIXES = 4, DWELL_MIN_SPAN_MS = 60_000, DWELL_SAMPLE_INTERVAL_MS = 10_000, DWELL_BUFFER_MAX_MS = 300_000
export function wideRingM(radiusM: number): number                       // max(3*radius, 50)
export function autoAccepts(fix: Fix, base: { lat: number; lng: number }, radiusM: number): { ok: true; distanceM: number } | { ok: false; distanceM: number; allowedM: number; reason: 'inaccurate' | 'out_of_range' }
export function insideWideRing(fix: Fix, base: { lat: number; lng: number }, radiusM: number): boolean
export function dwellSatisfied(buffer: Fix[], now: number): boolean       // ≥4 fixes, span ≥60s, last within 120s of now
export function pushDwellSample(buffer: Fix[], fix: Fix): Fix[]           // append if ≥10s since last sample, drop samples older than 300s
```
  `Fix` is the existing type from `location.ts` (`capturedAt` epoch ms). `distanceM` already exists in `location.ts` — reuse, do not duplicate.
- `arrival.ts` (new): pure detector.
```ts
export interface ArrivalCandidate { baseId: string; lat: number; lng: number; radiusM: number; hidden: boolean }
export interface ArrivalState { attemptedAt: Record<string, number>; dwell: Record<string, Fix[]> }
export const ARRIVAL_RETRY_MS = 30_000
export function emptyArrivalState(): ArrivalState
export function evaluateArrival(fix: Fix, candidates: ArrivalCandidate[], state: ArrivalState, now: number): { state: ArrivalState; fire: ArrivalCandidate[]; claimable: string[] }
```
  `fire` = candidates passing `autoAccepts` whose last attempt is older than 30s; `claimable` = candidate baseIds whose dwell buffer satisfies `dwellSatisfied`. Callers mark attempts via returned state.
- `queue.ts`: `PendingCheckIn.nfcToken` replaced by `proof: CheckInProof`. Migration of persisted records: a record with `nfcToken` and no `proof` is read as `{ type: 'nfc', token: nfcToken }` (do it in `OfflineQueue.list` normalisation or the store adapter; must not break existing SQLite rows).
- `progress.ts` `BaseView`: add `checkInMethod: CheckInMethod`, `checkInRadiusM: number`.

## packages/api
- `types.ts`: `Base` and `BaseProgress` add `checkInMethod: CheckInMethod` (string union 'NFC'|'QR'|'LOCATION') and `checkInRadiusM?: number | null`; `CheckInRequest` becomes the `CheckInRequestBody` shape above (re-export from game-core is NOT allowed, api must not depend on game-core: define the same union locally as `CheckInRequest`); `CheckInResponse` adds `method: CheckInMethod`, `verification: 'VERIFIED' | 'CLAIMED' | 'OPERATOR'`; `Game` adds `defaultCheckInMethod: CheckInMethod`, `defaultCheckInRadiusM: number`.
- `endpoints.ts`: `player.checkIn(gameId, baseId, body: CheckInRequest)`; operator `bases.create/update` payloads and `games.update` payloads carry the new fields.

## web operator API (`web/src/lib/api/bases.ts`, `web/src/types/base.ts`, games api/types)
- `Base` type adds `checkInMethod: 'NFC' | 'QR' | 'LOCATION'`, `checkInRadiusM?: number | null`.
- `CreateBaseDto`/update adds the same optional fields.
- Game type adds `defaultCheckInMethod`, `defaultCheckInRadiusM`.

## web player
- Location store: `web/src/app/player/locationStore.ts` exporting `startLocationStore(enabled: () => boolean)`, `useLocationStore()` (zustand, like `web/src/stores/*`) with `{ fix: Fix | null; heading: number | null; status: LocationStatus }` where `LocationStatus` is the existing type from `useTeamLocation.ts`. `useTeamLocation` becomes a thin consumer that only handles reporting.
- Arrival runtime: `web/src/app/player/arrival.ts` exporting `startArrivalDetector(services: AppServices, queries: QueryClient): () => void`, wired in `startPlayerRuntime`. It subscribes to the location store, builds candidates from cached game data + logbook, enqueues `{type:'geo', claimed:false}` proofs, and publishes notices through `web/src/app/player/arrivalNotices.ts` (`useArrivalNotices()` → `{ notices: ArrivalNotice[]; dismiss(id) }`, `ArrivalNotice { id; baseId; title: string | null; state: 'synced' | 'queued' }`).
- `usePlayerGame().checkIn(baseId, proof: CheckInProof)` replaces `checkIn(baseId, token)`.
- Components: `web/src/features/player/components/LocationCheckInPanel.tsx` (states `locating|denied|far|near|arrived`, props `{ baseId, base: {lat,lng,radiusM}, onClaim(): void, claimable: boolean, busy: boolean }`, testid `player-location-panel`, button testid `player-im-here-btn`), `QrScannerOverlay` gains props `{ onBack, caption: string, testId?: string }` (default testid stays `player-qr-scanner`), `ArrivalToast.tsx` (testid `player-arrival-notice`).
- Test IDs on BaseScreen: keep existing; new `player-scan-qr-btn`, `player-tap-nfc-btn` (existing button gets this id only if it has none today — check and do not rename existing ids).

## i18n (packages/i18n/src/locales/{en,de,pt}.json — all three, every key)
Player (`playerApp.*`):
- `checkIn.scanQr`, `checkIn.wrongCode`, `checkIn.imHere`, `checkIn.imHereHint`, `checkIn.arrived` ("Arrived at {{name}}"), `checkIn.found` ("You found {{name}}"), `checkIn.foundUnknown` ("You found a base"), `checkIn.claimed`
- `location.locating`, `location.denied`, `location.openSettings`, `location.far` ("About {{meters}} m away"), `location.near` ("You're close. GPS accuracy ±{{accuracy}} m, move into the open"), `location.arrived`, `location.unavailable`, `location.basesWontUnlock`
- `errors.CHECK_IN_METHOD_MISMATCH`, `errors.CHECK_IN_TOKEN_INVALID`, `errors.CHECK_IN_FIX_TOO_COARSE`, `errors.CHECK_IN_FIX_STALE`, `errors.CHECK_IN_OUT_OF_RANGE`, `errors.CHECK_IN_CLAIM_NOT_DWELLED` (check how `describeError` in `web/src/app/player/errors.ts` maps codes today and follow it)
Operator (`build.*`, `command.*`, `settings.*` — inspect the existing namespaces before choosing):
- `checkIn.method`, `checkIn.methodNfc`, `checkIn.methodQr`, `checkIn.methodLocation`, `checkIn.radius`, `checkIn.radiusHint`, `checkIn.inheritsDefault`, `checkIn.defaultMethod`, `checkIn.defaultRadius`, `checkIn.tagsAndCodes`, `checkIn.printCode`, `checkIn.printAll`, `checkIn.noTagNeeded`, `checkIn.claimedBadge`, `checkIn.teammatesInRing` ("{{inside}} of {{total}} teammates within {{meters}} m"), `readiness.nfcLinked`, `readiness.locationCoords`, `readiness.locationOverlap`, `readiness.legacyAppsNote`.

## House rules (apply to every phase)
- Tests: backend via `make test-backend-docker` (full) — for focused runs use `docker compose -f <TEST_COMPOSE_FILE from Makefile> run --rm backend-test ./gradlew test --no-daemon --tests 'com.prayer.pointfinder.service.CheckInVerificationServiceTest'`. Frontend via `make test-frontend-docker` (lint + typecheck + vitest); focused: `bun run --cwd web test -- <path>` and `bun run --cwd packages/game-core test`.
- Never rename existing test IDs, routes, API paths, or accessibility ids.
- English, Portuguese, German for every new key, same commit.
- Generated files say "Do not edit"; change sources and run `make design-system-generate`.
- Update `docs/visual-system/component-inventory.md` and `preview-matrix.md` for new components; update `docs/business-logic.md` § 2 in the backend phase.
- Plans and specs are NOT committed (user rule). Source changes are committed per phase with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Legacy iOS/Android apps: do not touch.
