# Check-in methods: NFC, QR, and location

Date: 2026-09-05
Status: approved design, not yet planned
Trunk: `master`

## Goal

Let an operator choose, per base, how a team proves it reached that base:

- **NFC**: tap the tag written for the base. This is today's only method.
- **QR**: scan a printed code that carries the same payload as the tag.
- **Location**: the base unlocks when the phone's GPS fix is inside the base's radius. No tap. If GPS never converges, a player may claim presence after dwelling nearby; the claim is accepted but marked and reported to operators.

The player surface is the native Tauri app only. The browser is the operator surface. Legacy iOS and Android apps are out of scope and keep working for NFC bases.

## Decisions taken during brainstorming

| Fork | Decision |
|---|---|
| Where the method lives | Per base, with a game-level default copied onto new bases at creation. |
| When GPS won't confirm | Wait with honest feedback, plus an "I'm here" claim gated by a dwell. Operator rescue remains the escape hatch. |
| Where arrival detection runs | App-wide while the app is in the foreground. Background geofencing is deferred. |
| QR in the browser | Not needed. Players are native only. |
| Who verifies location | The phone detects and the server verifies against the base. One check-in endpoint carries a typed proof. |
| Hidden location bases | Sent to the phone as geofence-only entries (id, coordinates, radius, method) so detection works offline. No name, challenge, or content. |

## Data model

### Base

- `check_in_method` VARCHAR(16) NOT NULL, values `NFC`, `QR`, `LOCATION`. Backfill `NFC`.
- `check_in_radius_m` INTEGER NULL. Null means "use the game default". Clamped to 5..200 on write.

The method is copied from the game default when a base is created. Changing the game default later does not change existing bases.

### Game

- `default_check_in_method` VARCHAR(16) NOT NULL DEFAULT `NFC`.
- `default_check_in_radius_m` INTEGER NOT NULL DEFAULT 15. Clamped to 5..200.

### CheckIn

- `method` VARCHAR(16) NOT NULL. Backfill `NFC`.
- `verification` VARCHAR(16) NOT NULL, values `VERIFIED`, `CLAIMED`, `OPERATOR`. Backfill: rows with `source_surface = 'operator_rescue'` become `OPERATOR`, everything else `VERIFIED`.
- `proof_lat`, `proof_lng` DOUBLE PRECISION NULL.
- `proof_accuracy_m`, `proof_distance_m` DOUBLE PRECISION NULL.
- `proof_captured_at` TIMESTAMPTZ NULL.
- `team_positions_snapshot` JSONB NULL. One entry per player on the team: `playerId`, `displayName`, `lat`, `lng`, `accuracyM`, `ageSeconds`, `distanceM`. Only filled for `CLAIMED`.

For `VERIFIED` geo rows, `checked_in_at` is the proof's `capturedAt`, not receipt time. The activity event keeps receipt time.

### PlayerLocation

- `accuracy_m` DOUBLE PRECISION NULL.
- `captured_at` TIMESTAMPTZ NULL.

The phone already sends both fields; the server currently discards them.

### Migration

One Flyway migration, `V60__check_in_methods.sql`, following the house style (header comment naming this spec, additive columns, backfills, then NOT NULL).

## API

### Check-in request

`POST /api/player/games/{gameId}/bases/{baseId}/check-in`. Body is a discriminated proof:

```json
{ "method": "nfc", "token": "ab12cd34" }
{ "method": "qr",  "token": "ab12cd34" }
{ "method": "geo", "lat": 41.1, "lng": -8.6, "accuracy": 8.5, "capturedAt": "2026-09-05T10:00:00Z", "claimed": false }
{ "method": "geo", "lat": 41.1, "lng": -8.6, "accuracy": 22.0, "capturedAt": "2026-09-05T10:00:00Z", "claimed": true,
  "dwell": [ { "lat": 41.1, "lng": -8.6, "accuracy": 30.0, "capturedAt": "2026-09-05T09:58:50Z" } ] }
```

The legacy body `{ "nfcToken": "ab12cd34" }` stays accepted and is treated as `method: "nfc"`.

### Check-in response

Adds `method` and `verification`.

### Player base DTO

Adds `checkInMethod` and `checkInRadiusM` (resolved: base value or game default, never null).

Hidden location bases the team has not visited are included in game data as geofence-only entries: `id`, `lat`, `lng`, `checkInMethod`, `checkInRadiusM`, `hidden: true`, and nothing else. Hidden NFC and QR bases are not sent, as today.

### Operator base DTO

Adds raw `checkInMethod` and `checkInRadiusM` (nullable). Create and update requests accept both. Game create and update accept `defaultCheckInMethod` and `defaultCheckInRadiusM`.

### Activity events

Check-in events carry `method` and `verification` in their payload. Claimed events also carry `teammatesInRing` and `teammatesTotal`.

### Errors

| Code | Meaning |
|---|---|
| `CHECK_IN_METHOD_MISMATCH` | Proof method does not match the base's method. |
| `CHECK_IN_TOKEN_INVALID` | Token does not match the base token (replaces the uncoded 400). |
| `CHECK_IN_FIX_TOO_COARSE` | Accuracy missing, non-finite, or above the cap. |
| `CHECK_IN_FIX_STALE` | `capturedAt` more than 10 min in the future or older than 24 h. |
| `CHECK_IN_OUT_OF_RANGE` | Auto proof outside the accepted distance. Details: `distanceM`, `allowedM`. |
| `CHECK_IN_CLAIM_NOT_DWELLED` | Claim fails the dwell rule. Details name the failed condition. |

Existing `PREVIOUS_BASE_REQUIRED` and the game-not-live error keep their meaning and run before verification.

### Shared proof type (game-core)

```ts
type CheckInProof =
  | { type: 'nfc'; token: string }
  | { type: 'qr'; token: string }
  | { type: 'geo'; lat: number; lng: number; accuracy: number; capturedAt: string; claimed: false }
  | { type: 'geo'; lat: number; lng: number; accuracy: number; capturedAt: string; claimed: true; dwell: Fix[] }
```

`toCheckInRequest` maps every variant; `UnsupportedProofError` is removed. `PendingCheckIn` stores the whole proof instead of `nfcToken`. Distance, acceptance, ring, and dwell helpers live in game-core so the phone pre-check and the tests share one implementation with the server's rules mirrored exactly.

## Backend verification rules

Run inside the check-in service after the live-game, team, and base guards, after the team+base dedup (a repeat returns the existing row whatever proof was sent), and after the base-order rule.

1. **Method match.** Proof method must equal the base method, except the legacy body which is accepted only at NFC bases.
2. **Token proofs.** Constant-time compare against the base token.
3. **Geo auto proof.**
   - Accuracy must be finite and ≤ 50 m.
   - `capturedAt` within [now − 24 h, now + 10 min].
   - Haversine distance to base. Accept when `distance ≤ radius + min(accuracy, 30)`.
   - Row is `VERIFIED`; `checked_in_at = capturedAt`.
4. **Geo claimed proof.**
   - Main fix accuracy ≤ 100 m, same staleness window.
   - Wider ring `R = max(3 × radius, 50)`. Main fix must be within R.
   - `dwell` has ≥ 4 fixes, all within R, all accuracy ≤ 100 m, first-to-last span ≥ 60 s, last fix within 2 min of the main fix.
   - Row is `CLAIMED`. Server snapshots every teammate's latest known position with distance to base and age, stores it on the row, and the activity event reports how many teammates were inside R.
   - Operators are pushed as for any check-in, with the claimed flag.
5. **Radius resolution.** Base radius if set, else game default.
6. **Idempotency.** Unchanged: one active row per team and base; repeats return the existing row regardless of method.

## Player runtime and screens

### Location store

The foreground location watch moves from the map screen into the player runtime as a single store exposing the latest fix, heading, and permission state. The map, the position reporter, and the arrival detector all read from it. The watch runs whenever the game is live, as it does today, because operators rely on team positions in every game. The detector itself only does work while the team has at least one unvisited location base (visible or hidden). Position reporting to operators keeps its current throttling policy.

### Arrival detector

A pure module fed fixes and the candidate list, owned by the player runtime.

- Candidates: every location base not yet visited (hidden ones included), excluding bases blocked by base order.
- Pre-check with the shared acceptance helper. On pass, enqueue a `geo` proof (`claimed: false`) and sync. At most one attempt per base per 30 s.
- On success: if the base screen for that base is open, it updates in place; otherwise an app-wide "Arrived at X" notice with a link. For a hidden base the notice reads "You found X" once the name arrives; offline it says "You found a base".
- On `CHECK_IN_OUT_OF_RANGE`: back off for that base and keep watching.
- On `PREVIOUS_BASE_REQUIRED`: treat as "not now", keep watching, no notice.
- Offline: the proof queues with its captured fix; the logbook shows the pending state used for queued NFC check-ins today.

### Dwell tracker

Per location base. While inside the wider ring, sample fixes about every 10 s into a buffer capped at 5 minutes. Leaving the ring clears it. When the buffer spans ≥ 60 s and the strict rule has never passed for that base, the base screen enables "I'm here" and sends the buffer as `dwell`.

### Base screen by method

- **NFC**: existing tap button and behaviour.
- **QR**: "Scan code" opens the windowed camera overlay from the join flow, generalised (own caption, own test id). A code for another base is refused with the wrong-tag message. The scanned URL is parsed by the existing tag parser; the proof is `qr`.
- **Location**: a live panel with states: locating; permission denied with open-settings; far ("about 80 m away"); near but inexact ("you're close, GPS accuracy ±25 m, move into the open"); arrived. "I'm here" sits under it, disabled with a hint until the dwell rule is met.
- **Presence to submit** uses the base's own method: re-tap, re-scan, or currently inside the wider ring. It remains client-side.

### Arriving by link

A QR code scanned with the phone's camera app opens the universal link the tag intake already handles. The auto check-in from `?token=` sends the base's own method (`nfc` or `qr`) with the token.

### Map

Location bases draw their radius as a faint circle. Hidden location bases are never drawn. The scan control offers NFC tap and QR scan according to the methods present in the game. If location permission is denied and the game has location bases, a persistent notice says those bases will not unlock.

## Operator side

- **Game settings**: "Check-in" group with default method (three-way choice) and default radius (shown for location). Editable in setup, read-only once live.
- **Base detail**: method selector with an "inherits game default" hint until overridden. Location: radius field and the radius drawn on the location picker. QR: inline code with print. NFC: existing badge and link control.
- **Tags page** becomes "Tags & codes": NFC write control, QR code per base with print, "print all codes" sheet (one page per code with base and game name, SVG rendered in the browser so it works offline), location bases listed with radius. Filters by method and linked state.
- **Command view**: method icon per check-in in the feed and leaderboard; "claimed" badge with the teammate summary; team detail shows distance, accuracy, and the teammate snapshot on a small map. Rescue check-in unchanged.
- **Import/export**: method and radius travel with the base.

## Readiness, audit, docs

- **Go-live**: NFC bases linked; QR bases always pass; location bases need coordinates that are not 0,0, a radius within 5..200, and no two location bases with overlapping rings. The browser readiness indicator gets matching rows with counts and the dead "location-bound have coordinates" check is fixed to the 0,0 test. When any non-NFC base exists, the checklist shows a one-line note that legacy apps cannot complete the game.
- **Base editor**: remove the `parseFloat(...) || 0` fallback; unparseable coordinates fail validation.
- **Audit export**: `method` and `verification` as columns; proof and snapshot as one JSON column.
- **Docs**: rewrite the business-logic check-in section for three methods and the claim rule; correct the false statement that the backend enforces proximity for location-bound challenges; state that presence-to-submit is client-side. Update the visual-system component inventory and preview matrix for the new components.
- **Localization**: English, Portuguese, German in the same change.

## Testing

Fast programmatic tests carry the logic; the product owner validates the experience on a device. E2E suites are considered stale and get nothing new here.

- **Backend**: check-in service per method and base type; legacy body at NFC and non-NFC bases; distance boundary with and without accuracy; accuracy cap; staleness both ways; claim rule failures (count, span, ring, stale buffer); snapshot contents; base order before verification; idempotency across phone unlock and operator rescue. Readiness validator per method, overlapping rings, 0,0. Migration backfill test.
- **game-core**: proof mapper; distance, acceptance, ring, dwell helpers; queue replay of a geo proof.
- **Web Vitest**: base screen per method with facades mocked; location panel states; "I'm here" gating; arrival detector with synthetic fixes (fires once, backs off, skips visited and order-blocked, includes hidden); operator method and radius editing; readiness rows; codes sheet.
- **Manual device validation** (the real gate): QR base scanned in-app and via the camera app; location base walked into with the app open; the same in airplane mode with sync verified after reconnect; a hidden location base found without it ever appearing on the map; "I'm here" staying disabled until a minute inside the ring, then producing a claimed row with the teammate snapshot in the operator feed. These go into the native validation checklist.

## Delivery

Four atomic commits: backend model and verification (includes the 0,0 fix), shared proof and detector, operator surfaces, player surfaces. Each carries its docs and translations.

## Out of scope

Background geofencing, browser player QR scanning, legacy iOS and Android support for QR or location bases, server-side detection from the position feed, per-base multiple methods.
