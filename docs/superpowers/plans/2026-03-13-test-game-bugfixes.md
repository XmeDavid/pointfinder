# Test Game Bugfixes Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 4 bugs identified during test game: iOS operator realtime, Android check-in lock, iOS location permissions, and assignment visibility across all platforms.

**Architecture:** Targeted bug fixes across iOS (Swift), Android (Kotlin), and backend (Spring Boot). Each fix is independent and can be implemented/tested separately.

**Tech Stack:** Swift/SwiftUI, Kotlin/Jetpack Compose, Spring Boot/Java, PostgreSQL

**Spec:** `docs/superpowers/specs/2026-03-13-test-game-bugfixes-design.md`

---

## Chunk 1: iOS Operator Realtime + iOS Location Permissions

### Task 1: Enable iOS operator realtime

**Files:**
- Modify: `ios-app/dbv-nfc-games/App/AppState+Auth.swift:78` (remove disconnect in operatorLogin)
- Modify: `ios-app/dbv-nfc-games/App/AppState+Auth.swift:220` (remove disconnect in restoreSession)

- [ ] **Step 1: Remove disconnect in `operatorLogin()`**

In `AppState+Auth.swift`, remove line 78 (`realtimeClient.disconnect()`):

```swift
// BEFORE (lines 73-78):
            authType = .userOperator(
                accessToken: response.accessToken,
                refreshToken: response.refreshToken,
                userId: response.user.id
            )
            realtimeClient.disconnect()

// AFTER (lines 73-77):
            authType = .userOperator(
                accessToken: response.accessToken,
                refreshToken: response.refreshToken,
                userId: response.user.id
            )
```

- [ ] **Step 2: Remove disconnect in `restoreSession()` operator branch**

In `AppState+Auth.swift`, remove line 220 (`realtimeClient.disconnect()`):

```swift
// BEFORE (lines 218-222):
            Task { await configureApiClientAuth(refreshToken: refreshToken) }
            realtimeClient.disconnect()
            PushNotificationService.shared.configureForOperator(apiClient: apiClient, operatorToken: token)

// AFTER (lines 218-221):
            Task { await configureApiClientAuth(refreshToken: refreshToken) }
            PushNotificationService.shared.configureForOperator(apiClient: apiClient, operatorToken: token)
```

- [ ] **Step 3: Build iOS to verify compilation**

Run: `cd ios-app && xcodebuild -scheme dbv-nfc-games -destination 'platform=iOS Simulator,name=iPhone 16' build 2>&1 | tail -5`
Expected: `** BUILD SUCCEEDED **`

- [ ] **Step 4: Commit**

```bash
git add ios-app/dbv-nfc-games/App/AppState+Auth.swift
git commit -m "fix(ios): enable realtime WebSocket for operators

Remove realtimeClient.disconnect() calls from operator login and session
restore. OperatorGameView already has connect/disconnect lifecycle per-game.
Backend /ws/mobile already accepts operator tokens. This enables the existing
.onReceive(.mobileRealtimeEvent) handlers in operator views and reduces
polling load."
```

---

### Task 2: Fix iOS location permission send timer

**Files:**
- Modify: `ios-app/dbv-nfc-games/Services/LocationService.swift:133-142` (authorization callback)

- [ ] **Step 1: Add `pauseUpdates()` method**

In `LocationService.swift`, add after `stopTracking()` (after line 65):

```swift
    /// Pause location updates and timer without clearing credentials.
    /// Allows recovery via `resumeIfNeeded()` or authorization callback.
    private func pauseUpdates() {
        locationManager.stopUpdatingLocation()
        sendTimer?.invalidate()
        sendTimer = nil
    }
```

- [ ] **Step 2: Update `locationManagerDidChangeAuthorization`**

Replace the current implementation at lines 133-142:

```swift
// BEFORE:
    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        switch manager.authorizationStatus {
        case .authorizedWhenInUse, .authorizedAlways:
            manager.startUpdatingLocation()
        case .denied, .restricted:
            Logger(subsystem: "com.prayer.pointfinder", category: "LocationService").debug(" Location access denied")
        default:
            break
        }
    }

// AFTER:
    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        switch manager.authorizationStatus {
        case .authorizedWhenInUse, .authorizedAlways:
            manager.startUpdatingLocation()
            Task { @MainActor in
                self.scheduleSendTimer()
            }
        case .denied, .restricted:
            Logger(subsystem: "com.prayer.pointfinder", category: "LocationService").debug(" Location access denied")
            Task { @MainActor in
                self.pauseUpdates()
            }
        default:
            break
        }
    }
```

Note: `scheduleSendTimer()` has a guard (`guard apiClient != nil, gameId != nil, token != nil`) that prevents premature timer starts. `pauseUpdates()` is a safe no-op if tracking was never started.

- [ ] **Step 3: Build iOS to verify compilation**

Run: `cd ios-app && xcodebuild -scheme dbv-nfc-games -destination 'platform=iOS Simulator,name=iPhone 16' build 2>&1 | tail -5`
Expected: `** BUILD SUCCEEDED **`

- [ ] **Step 4: Commit**

```bash
git add ios-app/dbv-nfc-games/Services/LocationService.swift
git commit -m "fix(ios): restart send timer when location permission granted

Add scheduleSendTimer() to locationManagerDidChangeAuthorization so that
granting permission from Settings mid-session starts sending locations
without requiring an app restart. Add pauseUpdates() for denial to cleanly
stop updates while preserving credentials for recovery."
```

---

## Chunk 2: Android Check-in Lock

### Task 3: Fix check-in coroutine race condition

**Files:**
- Modify: `android-app/app/src/main/java/com/prayer/pointfinder/session/PlayerViewModel.kt:190-224`

- [ ] **Step 1: Add `checkInJob` field**

In `PlayerViewModel.kt`, add after line 87 (`private var lastOnline: Boolean = true`):

```kotlin
    private var checkInJob: Job? = null
```

Add import if not present (it should be via `kotlinx.coroutines.Job`— verify `Job` is already imported or add: `import kotlinx.coroutines.Job`).

- [ ] **Step 2: Store job in `startCheckIn()`**

Replace line 191 (`viewModelScope.launch {`) with:

```kotlin
// BEFORE:
    fun startCheckIn(auth: AuthType.Player, baseId: String, online: Boolean) {
        viewModelScope.launch {

// AFTER:
    fun startCheckIn(auth: AuthType.Player, baseId: String, online: Boolean) {
        checkInJob?.cancel()
        checkInJob = viewModelScope.launch {
```

- [ ] **Step 3: Cancel job in `clearCheckIn()`**

Replace `clearCheckIn()` at lines 222-224:

```kotlin
// BEFORE:
    fun clearCheckIn() {
        _state.value = _state.value.copy(activeCheckIn = null)
    }

// AFTER:
    fun clearCheckIn() {
        checkInJob?.cancel()
        checkInJob = null
        _state.value = _state.value.copy(activeCheckIn = null)
    }
```

- [ ] **Step 4: Build Android to verify compilation**

Run: `cd android-app && ./gradlew :app:compileDebugKotlin 2>&1 | tail -5`
Expected: `BUILD SUCCESSFUL`

- [ ] **Step 5: Commit**

```bash
git add android-app/app/src/main/java/com/prayer/pointfinder/session/PlayerViewModel.kt
git commit -m "fix(android): cancel in-flight check-in coroutine on back

Store startCheckIn() Job and cancel it in clearCheckIn(). Prevents the
race condition where the coroutine completes after clearCheckIn() and
overwrites activeCheckIn back to a non-null value."
```

---

### Task 4: Add BackHandler for player flow screens

**Files:**
- Modify: `android-app/app/src/main/java/com/prayer/pointfinder/navigation/AppNavigation.kt`

- [ ] **Step 1: Add BackHandler import**

Add to the imports section of `AppNavigation.kt`:

```kotlin
import androidx.activity.compose.BackHandler
```

- [ ] **Step 2: Add BackHandler for `latestSubmission`**

Inside the `state.latestSubmission != null` branch (around line 602-608), add `BackHandler` before the `SubmissionResultScreen`:

```kotlin
            state.latestSubmission != null -> {
                BackHandler { backToMapFromSubmission() }
                val submission = state.latestSubmission!!
                SubmissionResultScreen(
                    submission = submission,
                    onBack = backToMapFromSubmission,
                )
            }
```

- [ ] **Step 3: Add BackHandler for `solving`**

Inside the `solving != null` branch (around line 610), add `BackHandler` at the start:

```kotlin
            solving != null -> {
                BackHandler { solving = null }
                val (baseId, challengeId) = solving ?: return@PlayerHomeScaffold
```

- [ ] **Step 4: Add BackHandler for `activeCheckIn`**

Inside the `state.activeCheckIn != null` branch (around line 725), add `BackHandler` before the `BaseCheckInDetailScreen`:

```kotlin
            state.activeCheckIn != null -> {
                BackHandler {
                    viewModel.clearCheckIn()
                    viewModel.refresh(auth, isOnline)
                }
                val checkIn = state.activeCheckIn!!
                BaseCheckInDetailScreen(
```

- [ ] **Step 5: Add BackHandler for `selectedBase`**

Find the `state.selectedBase != null` branch and add `BackHandler`:

```kotlin
            state.selectedBase != null -> {
                BackHandler { viewModel.clearSelectedBase() }
```

Note: Locate the exact position by searching for `selectedBase` in the `when` block.

- [ ] **Step 6: Build Android to verify compilation**

Run: `cd android-app && ./gradlew :app:compileDebugKotlin 2>&1 | tail -5`
Expected: `BUILD SUCCESSFUL`

- [ ] **Step 7: Commit**

```bash
git add android-app/app/src/main/java/com/prayer/pointfinder/navigation/AppNavigation.kt
git commit -m "fix(android): add BackHandler for all player flow screens

Add system back gesture handling for check-in detail, solve, submission
result, and base detail screens. Without this, system back either exits
the app or does nothing since the player flow uses state-driven UI
switching within a single composable route."
```

---

## Chunk 3: Assignment Visibility

### Task 5: Fix iOS assignment visibility check

**Files:**
- Modify: `ios-app/dbv-nfc-games/Features/Operator/OperatorSetupHubView.swift:49-50`

- [ ] **Step 1: Update the assignment check to include fixedChallengeId**

Replace lines 49-50 in `OperatorSetupHubView.swift`:

```swift
// BEFORE:
        let assignedChallengeIds = Set(assignments.map { $0.challengeId })
        let unassignedLocationBound = challenges.filter { $0.locationBound && !assignedChallengeIds.contains($0.id) }.count

// AFTER:
        let fixedChallengeIds = Set(bases.compactMap { $0.fixedChallengeId })
        let assignedChallengeIds = Set(assignments.map { $0.challengeId })
        let unassignedLocationBound = challenges.filter {
            $0.locationBound && !fixedChallengeIds.contains($0.id) && !assignedChallengeIds.contains($0.id)
        }.count
```

- [ ] **Step 2: Build iOS to verify compilation**

Run: `cd ios-app && xcodebuild -scheme dbv-nfc-games -destination 'platform=iOS Simulator,name=iPhone 16' build 2>&1 | tail -5`
Expected: `** BUILD SUCCEEDED **`

- [ ] **Step 3: Commit**

```bash
git add ios-app/dbv-nfc-games/Features/Operator/OperatorSetupHubView.swift
git commit -m "fix(ios): check fixedChallengeId in assignment visibility

Match web admin logic: a location-bound challenge is considered assigned
if either a base has fixedChallengeId pointing to it OR an assignment
record exists. Prevents false warnings blocking go-live."
```

---

### Task 6: Fix Android assignment visibility check

**Files:**
- Modify: `android-app/feature/operator/src/main/kotlin/com/prayer/pointfinder/feature/operator/SetupHubScreen.kt:283-284`

- [ ] **Step 1: Update the assignment check to include fixedChallengeId**

Replace lines 283-284 in `SetupHubScreen.kt`:

```kotlin
// BEFORE:
    val assignedChallengeIds = assignments.map { it.challengeId }.toSet()
    val unassignedLocationBound = challenges.count { it.locationBound && it.id !in assignedChallengeIds }

// AFTER:
    val fixedChallengeIds = bases.mapNotNull { it.fixedChallengeId }.toSet()
    val assignedChallengeIds = assignments.map { it.challengeId }.toSet()
    val unassignedLocationBound = challenges.count {
        it.locationBound && it.id !in fixedChallengeIds && it.id !in assignedChallengeIds
    }
```

- [ ] **Step 2: Build Android to verify compilation**

Run: `cd android-app && ./gradlew :feature:operator:compileDebugKotlin 2>&1 | tail -5`
Expected: `BUILD SUCCESSFUL`

- [ ] **Step 3: Commit**

```bash
git add android-app/feature/operator/src/main/kotlin/com/prayer/pointfinder/feature/operator/SetupHubScreen.kt
git commit -m "fix(android): check fixedChallengeId in assignment visibility

Same fix as iOS — match web admin logic for location-bound challenge
assignment detection during setup."
```

---

### Task 7: Add backend go-live validation for location-bound assignments

**Files:**
- Modify: `backend/src/main/java/com/prayer/pointfinder/service/GameService.java:288-293`
- Test: `backend/src/test/java/com/prayer/pointfinder/service/GameServiceTest.java` (if exists, otherwise verify with existing tests)

- [ ] **Step 1: Add location-bound assignment validation**

In `GameService.java`, add the following after the team variables check (after line 292, before the closing `}` of `validateGoLivePrerequisites`):

```java
        // Ensure all location-bound challenges are assigned (via fixedChallengeId or assignment record)
        List<Challenge> locationBoundChallenges = challengeRepository.findByGameId(game.getId()).stream()
                .filter(Challenge::isLocationBound)
                .collect(Collectors.toList());
        if (!locationBoundChallenges.isEmpty()) {
            List<Base> bases = baseRepository.findByGameId(game.getId());
            Set<UUID> fixedChallengeIds = bases.stream()
                    .map(Base::getFixedChallenge)
                    .filter(java.util.Objects::nonNull)
                    .map(Challenge::getId)
                    .collect(Collectors.toSet());
            List<Assignment> assignments = assignmentRepository.findByGameId(game.getId());
            Set<UUID> assignedChallengeIds = assignments.stream()
                    .map(a -> a.getChallenge().getId())
                    .collect(Collectors.toSet());

            long unassignedCount = locationBoundChallenges.stream()
                    .filter(c -> !fixedChallengeIds.contains(c.getId()) && !assignedChallengeIds.contains(c.getId()))
                    .count();
            if (unassignedCount > 0) {
                throw new BadRequestException(
                        String.format("%d location-bound challenge(s) not assigned to any base", unassignedCount));
            }
        }
```

Note: `GameService` already has `baseRepository`, `challengeRepository`, and `assignmentRepository` injected via `@RequiredArgsConstructor`. `java.util.Objects` is in `java.util` which is already imported via `java.util.List` and `java.util.UUID`. Add `import java.util.Set;` and `import java.util.Objects;` if not already present (check existing imports at line 9: `import com.prayer.pointfinder.entity.*;` covers entity classes, and `java.util.stream.Collectors` is at line 25).

- [ ] **Step 2: Build backend to verify compilation**

Run: `cd backend && ./gradlew compileJava 2>&1 | tail -5`
Expected: `BUILD SUCCESSFUL`

- [ ] **Step 3: Run existing backend tests**

Run: `cd backend && ./gradlew test 2>&1 | tail -10`
Expected: All tests pass. If any go-live tests exist, they should still pass since valid games have their location-bound challenges properly assigned via `fixedChallengeId`.

- [ ] **Step 4: Commit**

```bash
git add backend/src/main/java/com/prayer/pointfinder/service/GameService.java
git commit -m "fix(backend): validate location-bound assignments before go-live

Add server-side validation to validateGoLivePrerequisites() ensuring all
location-bound challenges are assigned via either fixedChallengeId on a
base or an explicit assignment record. Defensive guardrail matching the
client-side checks in web admin, iOS, and Android."
```

---

## Testing Checklist

After all tasks are complete, verify with manual testing:

- [ ] **iOS operator realtime**: Log in as operator on iOS, open a game. Make changes on web admin (create a team, edit a base). Verify changes appear on iOS without pull-to-refresh.
- [ ] **Android check-in**: Check in at a base on Android, immediately press system back button. Verify the app returns to the map without being stuck on check-in. Also test the in-app "Back to map" button.
- [ ] **iOS location**: Deny location permission on first prompt. Go to Settings > Privacy > Location Services, grant permission. Return to app. Verify location pin appears on operator map / locations are being sent.
- [ ] **Assignment visibility (iOS)**: Create a game with a base that has a fixed challenge (location-bound). Open setup on iOS. Verify no false "unassigned" warning.
- [ ] **Assignment visibility (Android)**: Same test on Android.
- [ ] **Backend validation**: Use curl/API to attempt go-live on a game with an unassigned location-bound challenge. Verify 400 error with descriptive message.
