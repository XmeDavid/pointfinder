# Test Game Bugfixes — Design Spec

Date: 2026-03-13

## Overview

Five bugs identified during test game feedback. Each has been investigated and verified by dedicated analysis agents confirming the root causes and that the proposed fixes are safe.

---

## Fix 1: APNs Production Config

### Problem
`APNS_PRODUCTION` is not set in the production `.env`, defaulting to `false` in all three config layers (`ApnsConfig.java:17`, `application.yml:60`, `docker-compose.yml:40`). The backend sends push notifications to Apple's sandbox gateway (`api.sandbox.push.apple.com`), which silently rejects production device tokens from TestFlight/App Store builds.

### Fix
Add to production `.env`:
```
APNS_PRODUCTION=true
APNS_ENABLED=true   # add if missing — without this, the APNs client never initializes
```
Restart backend container.

### Files Changed
- `.env` (deployment config only, not checked into repo)

### Risks
- Xcode debug builds pointing at the production backend won't receive push — this is expected and correct behavior.
- Stale sandbox tokens in the DB will fail silently and get overwritten on next app launch.
- FCM (Android) is completely independent and unaffected.

---

## Fix 2: iOS Operator Realtime

### Problem
`AppState+Auth.swift` calls `realtimeClient.disconnect()` on operator login (line 78) and session restore (line 220). This was defensive cleanup from the initial implementation when realtime was player-only. As a result, operators rely solely on polling (5-20s intervals). All `.onReceive(.mobileRealtimeEvent)` handlers in operator views are dead code.

### Root Cause Verification
- The disconnect was not a deliberate architectural decision — added in the initial file creation commit.
- Backend `/ws/mobile` explicitly accepts operator tokens via `MobileWebSocketAuthHandshakeInterceptor.authorizeUser()` with game access validation.
- All operator event handlers have correct `gameId` guards and are safely written.
- `OperatorGameView` already has `.task { connectRealtime() }` / `.onDisappear { disconnectRealtime() }` lifecycle code.
- Adaptive polling in operator views already checks `realtimeConnected` to back off when connected.

### Fix
Remove 2 lines:
- `AppState+Auth.swift:78` — `realtimeClient.disconnect()` in `operatorLogin()`
- `AppState+Auth.swift:220` — `realtimeClient.disconnect()` in `restoreSession()` operator branch

No other changes needed. The operator realtime connection is **view-driven, not login-driven**: `OperatorGameView` connects when it appears (with the specific game ID) and disconnects on disappear. Removing the disconnect at login just stops actively preventing this existing lifecycle from working. `ensureConnected()` on foreground return is a safe no-op when no `desiredSession` is set (i.e., before navigating to a game).

### Files Changed
- `ios-app/dbv-nfc-games/App/AppState+Auth.swift`

### Risks
- Token expiry during long WebSocket sessions — pre-existing issue for players too. Can be addressed separately by reconnecting on token refresh.
- Receiving duplicate events (local `NotificationCenter` post + WebSocket) for go-live — handlers are idempotent, so this is harmless.

---

## Fix 3: Android Check-in Lock

### Problem
Two distinct bugs:

**Bug A — Race condition**: `startCheckIn()` launches an async coroutine (`PlayerViewModel.kt:191`). If the user presses "Back to map" before it completes, `clearCheckIn()` sets `activeCheckIn = null`, but then the coroutine's `onSuccess` block overwrites it back with the result at line 196.

**Bug B — Missing BackHandler**: There is zero `BackHandler` usage in the entire player flow. System back gesture does not trigger `clearCheckIn()`. Since the player flow uses a single composable route with state-driven UI switching (not navigation stack), system back either does nothing or exits the app — it never clears stale state.

### Root Cause Verification
- `refresh()` does NOT touch `activeCheckIn` (lines 138-171 only update `progress`, `gameStatus`, `isLoading`). The original "refresh re-populates" theory was wrong.
- `activeCheckIn` is only set in `startCheckIn():196` and only cleared in `clearCheckIn():222`.
- The race is confirmed: `clearCheckIn()` and the `startCheckIn` coroutine operate on the same `MutableStateFlow` without cancellation.

### Fix

**A. Cancel in-flight coroutine** (`PlayerViewModel.kt`):
- Add `private var checkInJob: Job? = null`
- In `startCheckIn()`: cancel previous job, store new one: `checkInJob = viewModelScope.launch { ... }`
- In `clearCheckIn()`: cancel the job before clearing state: `checkInJob?.cancel()`

**B. Add BackHandler** (`AppNavigation.kt`):
- Add `BackHandler` when `state.activeCheckIn != null` → calls `clearCheckIn()` + `refresh()`
- Add `BackHandler` when `solving != null` → sets `solving = null`
- Add `BackHandler` when `state.latestSubmission != null` → calls `backToMapFromSubmission()`
- Add `BackHandler` when `state.selectedBase != null` → calls `clearSelectedBase()`

**C. Keep `refresh()` in back handler**: The `ON_RESUME` observer only fires on app foreground, not internal navigation. Periodic polling is 10-30s. Removing `refresh()` would leave stale map data.

### Files Changed
- `android-app/app/src/main/java/com/prayer/pointfinder/session/PlayerViewModel.kt`
- `android-app/app/src/main/java/com/prayer/pointfinder/navigation/AppNavigation.kt`

### Risks
- Cancelling `startCheckIn` coroutine mid-flight means the check-in may succeed server-side but the client discards the result. This is acceptable — the next `refresh()` will show the correct status.

---

## Fix 4: iOS Location Permission Handling

### Problem
`locationManagerDidChangeAuthorization` (LocationService.swift:133-142) calls `startUpdatingLocation()` when authorized but does NOT restart the send timer. If permission is denied initially then granted from Settings while the app stays in foreground, locations are collected but never sent to the server.

### Root Cause Verification
- In the normal flow (disclosure → `startTracking()` → system dialog), the timer is already running from `startTracking()`. The gap is only for the Settings-granted-while-foreground scenario.
- Android location handling is already correct: `FusedLocationProviderClient` deduplicates callbacks, `onLocationPermissionResult()` calls `start()` (superset of `resumeIfNeeded()`), and `ON_RESUME` already triggers `resumeLocationIfNeeded()`. No Android changes needed.

### Fix

**A. Add `scheduleSendTimer()` to authorization callback** (`LocationService.swift`):
In `locationManagerDidChangeAuthorization`, when authorized, dispatch `scheduleSendTimer()` to MainActor:
```swift
case .authorizedWhenInUse, .authorizedAlways:
    manager.startUpdatingLocation()
    Task { @MainActor in
        self.scheduleSendTimer()
    }
```
The guard clause at line 99 (`guard apiClient != nil, gameId != nil, token != nil`) prevents premature timer starts.

**B. Defensive hardening: `pauseUpdates()` on denial** (`LocationService.swift`):
The current denial branch only logs. This is not a bug, but adding active cleanup ensures no resources are wasted if location was previously running and the user revokes permission from Settings mid-session:
```swift
private func pauseUpdates() {
    locationManager.stopUpdatingLocation()
    sendTimer?.invalidate()
    sendTimer = nil
}
```
This preserves `apiClient`/`gameId`/`token` (unlike `stopTracking()` which nulls them) so `resumeIfNeeded()` and the authorization callback can recover the service when permission is later granted.

Use in the denial branch:
```swift
case .denied, .restricted:
    Task { @MainActor in
        self.pauseUpdates()
    }
```
Note: if `startTracking()` was never called, this is a safe no-op.

### Files Changed
- `ios-app/dbv-nfc-games/Services/LocationService.swift`

### Risks
- `scheduleSendTimer()` call from `nonisolated` delegate method must be dispatched to `@MainActor` — matches existing pattern in `didUpdateLocations` at line 119.
- Credentials staying in memory while denied is fine — no resources are consumed since updates and timer are paused.

---

## Fix 5: Assignment Visibility (iOS + Android + Backend)

### Problem
iOS `OperatorSetupHubView.swift:49-50` and Android `SetupHubScreen.kt:283-284` only check the `assignments` table to determine if location-bound challenges are linked to bases. During setup, no assignment records exist — they are auto-created by `autoAssignChallenges()` at go-live. The `fixedChallengeId` on bases is the primary indicator during setup. The web admin correctly checks both; mobile apps do not.

### Root Cause Verification
- iOS `Base` model has `fixedChallengeId: UUID?` at `Game.swift:76` — available and used in other views.
- Android `Base` model has `fixedChallengeId: EntityId? = null` at `Models.kt:113` — available.
- Web admin logic at `OverviewPage.tsx:54-58` checks both `bases.some(b => b.fixedChallengeId === c.id)` and `assignments.some(a => a.challengeId === c.id)`.
- Backend `validateGoLivePrerequisites()` has no location-bound validation currently.
- `autoAssignChallenges()` handles fixed challenges correctly at go-live, but the missing client-side check shows false warnings during setup, blocking go-live.

### Fix

**A. iOS** (`OperatorSetupHubView.swift:49-50`):
```swift
let fixedChallengeIds = Set(bases.compactMap { $0.fixedChallengeId })
let assignedChallengeIds = Set(assignments.map { $0.challengeId })
let unassignedLocationBound = challenges.filter {
    $0.locationBound && !fixedChallengeIds.contains($0.id) && !assignedChallengeIds.contains($0.id)
}.count
```

**B. Android** (`SetupHubScreen.kt:283-284`):
```kotlin
val fixedChallengeIds = bases.mapNotNull { it.fixedChallengeId }.toSet()
val assignedChallengeIds = assignments.map { it.challengeId }.toSet()
val unassignedLocationBound = challenges.count {
    it.locationBound && it.id !in fixedChallengeIds && it.id !in assignedChallengeIds
}
```

**C. Backend** (`GameService.java`, after line 292):
Query location-bound challenges, check each has either a base with matching `fixedChallengeId` or an assignment record. Throw `BadRequestException` if any are unassigned.

### Files Changed
- `ios-app/dbv-nfc-games/Features/Operator/OperatorSetupHubView.swift`
- `android-app/feature/operator/src/main/kotlin/com/prayer/pointfinder/feature/operator/SetupHubScreen.kt`
- `backend/src/main/java/com/prayer/pointfinder/service/GameService.java`

### Risks
- No existing games would break — `locationBound` is auto-synced with `fixedChallengeId` by `BaseService`.
- Backend validation is a defensive guardrail; `autoAssignChallenges()` already handles the happy path.

---

## Implementation Order

1. **Fix 1 (APNs)** — config-only, deploy independently
2. **Fix 2 (iOS operator realtime)** — 2-line removal, lowest risk
3. **Fix 5 (Assignment visibility)** — small logic changes across 3 files
4. **Fix 4 (iOS location)** — iOS-only, moderate complexity
5. **Fix 3 (Android check-in)** — most complex, needs careful testing

## Testing Strategy

- **Fix 1**: Send test push from backend, verify iOS receives it
- **Fix 2**: Open operator on iOS, make changes on web admin, verify they appear without manual refresh
- **Fix 3**: Check in at a base, immediately press system back, verify no stuck state; check in, press "Back to map" before network responds, verify clean exit
- **Fix 4**: Deny location on first prompt, grant from Settings, verify location starts sending without app restart
- **Fix 5**: Create base with fixed challenge, verify no false warning on iOS/Android setup screen; attempt go-live via API without assignments, verify backend rejects
