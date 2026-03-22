# Real-time Game Config Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Broadcast WebSocket invalidation events when operators mutate game configuration so all connected clients refetch stale data.

**Architecture:** Add a `broadcastGameConfig()` method to the existing `GameEventBroadcaster`, call it from every operator-facing service mutation, and handle the new `game_config` event type on iOS, Android, and web admin to trigger targeted refetches.

**Tech Stack:** Spring Boot (backend), Kotlin/Compose (Android), Swift/SwiftUI (iOS), React/TypeScript (web admin)

**Spec:** `docs/specs/2026-03-22-realtime-game-config-sync.md`

---

### Task 1: Backend — Add `broadcastGameConfig` to `GameEventBroadcaster`

**Files:**
- Modify: `backend/src/main/java/com/prayer/pointfinder/websocket/GameEventBroadcaster.java`

- [ ] **Step 1: Add the `broadcastGameConfig` method**

Add after the existing `broadcastSubmissionStatus` method (after line 74):

```java
public void broadcastGameConfig(UUID gameId, String entity, String action) {
    Map<String, Object> payload = new HashMap<>();
    payload.put("entity", entity);
    payload.put("action", action);
    broadcast(gameId, "game_config", payload);
}
```

This follows the exact same pattern as `broadcastGameStatus` — a simple payload map passed to the private `broadcast()` helper, which handles transaction-deferred sending and dual STOMP + mobile WebSocket delivery.

- [ ] **Step 2: Verify backend compiles**

Run: `cd backend && ./gradlew compileJava`
Expected: BUILD SUCCESSFUL

- [ ] **Step 3: Commit**

```
feat: add broadcastGameConfig method to GameEventBroadcaster
```

---

### Task 2: Backend — Wire broadcasts into service layer

**Files:**
- Modify: `backend/src/main/java/com/prayer/pointfinder/service/ChallengeService.java`
- Modify: `backend/src/main/java/com/prayer/pointfinder/service/BaseService.java`
- Modify: `backend/src/main/java/com/prayer/pointfinder/service/TeamService.java`
- Modify: `backend/src/main/java/com/prayer/pointfinder/service/AssignmentService.java`
- Modify: `backend/src/main/java/com/prayer/pointfinder/service/GameService.java`
- Modify: `backend/src/main/java/com/prayer/pointfinder/service/TeamVariableService.java`

**Important:** `GameEventBroadcaster` is NOT yet injected into `ChallengeService`, `BaseService`, `AssignmentService`, or `TeamVariableService`. You must add it as a constructor dependency in each. These services use `@RequiredArgsConstructor` (Lombok), so just add a `private final GameEventBroadcaster eventBroadcaster;` field.

`TeamService` and `GameService` already have `GameEventBroadcaster` injected (used for activity/status broadcasts). `NotificationService` also already has it, but notification preferences are stored client-side or via a separate mechanism — skip for now unless you find an `updateOperatorNotificationSettings` method.

- [ ] **Step 1: ChallengeService — inject broadcaster and add calls**

Add field:
```java
private final GameEventBroadcaster eventBroadcaster;
```

Add broadcast call at the end of each method, after the save/delete:
- `createChallenge()` (line ~41): `eventBroadcaster.broadcastGameConfig(game.getId(), "challenges", "created");`
- `updateChallenge()` (line ~87): `eventBroadcaster.broadcastGameConfig(gameId, "challenges", "updated");`
  - Note: `updateChallenge` takes a `UUID gameId` parameter directly.
- `deleteChallenge()` (line ~133): `eventBroadcaster.broadcastGameConfig(gameId, "challenges", "deleted");`
  - Note: need to capture `gameId` before deleting. Check if the method already has access to it.

- [ ] **Step 2: BaseService — inject broadcaster and add calls**

Add field:
```java
private final GameEventBroadcaster eventBroadcaster;
```

- `createBase()`: `eventBroadcaster.broadcastGameConfig(game.getId(), "bases", "created");`
- `updateBase()`: `eventBroadcaster.broadcastGameConfig(gameId, "bases", "updated");`
- `deleteBase()`: `eventBroadcaster.broadcastGameConfig(gameId, "bases", "deleted");`
- `setNfcLinked()`: `eventBroadcaster.broadcastGameConfig(gameId, "bases", "updated");`

- [ ] **Step 3: TeamService — add calls (already has broadcaster)**

`TeamService` already has `GameEventBroadcaster` injected. Add calls to:
- `createTeam()`: `eventBroadcaster.broadcastGameConfig(game.getId(), "teams", "created");`
- `updateTeam()`: `eventBroadcaster.broadcastGameConfig(gameId, "teams", "updated");`
- `deleteTeam()`: `eventBroadcaster.broadcastGameConfig(gameId, "teams", "deleted");`

Do NOT add to check-in methods — those already broadcast `activity` events.

- [ ] **Step 4: AssignmentService — inject broadcaster and add calls**

Add field:
```java
private final GameEventBroadcaster eventBroadcaster;
```

- `createAssignment()`: `eventBroadcaster.broadcastGameConfig(gameId, "assignments", "created");`
- `bulkSetAssignments()`: `eventBroadcaster.broadcastGameConfig(gameId, "assignments", "updated");`
- `deleteAssignment()`: `eventBroadcaster.broadcastGameConfig(gameId, "assignments", "deleted");`

- [ ] **Step 5: GameService — add call for settings update (already has broadcaster)**

`GameService` already has `GameEventBroadcaster` injected. Add to:
- `updateGame()` (line ~125): `eventBroadcaster.broadcastGameConfig(gameId, "game_settings", "updated");`

Do NOT add to `updateStatus()` — that already broadcasts `game_status`.

- [ ] **Step 6: TeamVariableService — inject broadcaster and add calls**

Add field:
```java
private final GameEventBroadcaster eventBroadcaster;
```

- `saveGameVariables()`: `eventBroadcaster.broadcastGameConfig(gameId, "variables", "updated");`
- `saveChallengeVariables()`: `eventBroadcaster.broadcastGameConfig(gameId, "variables", "updated");`

- [ ] **Step 7: Verify backend compiles**

Run: `cd backend && ./gradlew compileJava`
Expected: BUILD SUCCESSFUL

- [ ] **Step 8: Commit**

```
feat: broadcast game_config events from all operator-facing service mutations
```

---

### Task 3: Web Admin — Handle `game_config` event in `useGameWebSocket`

**Files:**
- Modify: `web-admin/src/hooks/useGameWebSocket.ts`

- [ ] **Step 1: Add `game_config` case to the switch statement**

In `useGameWebSocket.ts`, the switch statement is at lines 44-73. Add a new case before the `default` case (before line 71):

```typescript
case "game_config": {
  const configData = payload.data as { entity?: string } | null;
  const entity = configData?.entity;
  switch (entity) {
    case "challenges":
      scheduleInvalidate("challenges");
      break;
    case "bases":
      scheduleInvalidate("bases");
      break;
    case "teams":
      scheduleInvalidate("teams");
      break;
    case "assignments":
      scheduleInvalidate("assignments");
      break;
    case "game_settings":
      scheduleInvalidate("game", "dashboard-stats");
      break;
    case "variables":
      scheduleInvalidate("game-variables", "challenge-variables", "team-variables-completeness");
      break;
    case "notifications_config":
      scheduleInvalidate("notifications");
      break;
    default:
      // Unknown entity — broad invalidation as safety net
      scheduleInvalidate("challenges", "bases", "teams", "assignments", "game");
  }
  break;
}
```

This uses the existing `scheduleInvalidate()` helper which batches invalidations via `requestAnimationFrame`.

- [ ] **Step 2: Verify frontend builds**

Run: `cd web-admin && npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 3: Commit**

```
feat: handle game_config WebSocket events in web admin
```

---

### Task 4: Android — Handle `game_config` event in `OperatorViewModel`

**Files:**
- Modify: `android-app/app/src/main/java/com/prayer/pointfinder/session/OperatorViewModel.kt`
- Modify: `android-app/core/data/src/main/kotlin/com/prayer/pointfinder/core/data/repo/OperatorRepository.kt`

- [ ] **Step 1: Add `invalidateConfigCache` method to `OperatorRepository`**

Add a public method to `OperatorRepository` (after the existing cache fields, around line 59):

```kotlin
fun invalidateConfigCache(entity: String, gameId: String) {
    when (entity) {
        "challenges" -> {
            challengesCache.remove(gameId)
            basesCache.remove(gameId) // fixedBaseId cross-reference
        }
        "bases" -> basesCache.remove(gameId)
        "teams" -> teamsCache.remove(gameId)
        "assignments" -> assignmentsCache.remove(gameId)
        else -> {
            // game_settings, variables, notifications_config have no cache
            // but we clear all to be safe
            basesCache.remove(gameId)
            challengesCache.remove(gameId)
            teamsCache.remove(gameId)
            assignmentsCache.remove(gameId)
        }
    }
}
```

- [ ] **Step 2: Handle `game_config` event in `OperatorViewModel`**

In `OperatorViewModel.kt`, find the `when (event.type)` block inside the `realtimeClient.events.collectLatest` collector (lines 127-144). Add a new branch:

```kotlin
"game_config" -> {
    val data = event.data
    val entity = data?.jsonObject?.get("entity")?.jsonPrimitive?.contentOrNull
    val gameId = _state.value.selectedGame?.id ?: return@collectLatest
    operatorRepository.invalidateConfigCache(entity ?: "", gameId)
    // Refetch meta (teams, challenges, assignments, variables)
    loadGameMeta(gameId)
    // Also refresh live data (bases, submissions, etc.)
    refreshSelectedGameData()
}
```

Check imports — `jsonObject`, `jsonPrimitive`, `contentOrNull` come from `kotlinx.serialization.json`. Verify these are already imported or add them.

- [ ] **Step 3: Verify Android compiles**

Run: `cd android-app && ./gradlew :app:compileDebugKotlin`
Expected: BUILD SUCCESSFUL

- [ ] **Step 4: Commit**

```
feat: handle game_config WebSocket events on Android with cache invalidation
```

---

### Task 5: iOS — Handle `game_config` event in operator views

**Files:**
- Modify: `ios-app/dbv-nfc-games/Features/Operator/ChallengesManagementView.swift`
- Modify: `ios-app/dbv-nfc-games/Features/Operator/BasesManagementView.swift`
- Modify: `ios-app/dbv-nfc-games/Features/Operator/TeamsManagementView.swift`
- Modify: `ios-app/dbv-nfc-games/Features/Operator/GameSettingsView.swift`
- Modify: `ios-app/dbv-nfc-games/Features/Operator/OperatorGameView.swift`

The pattern for handling realtime events already exists in `OperatorGameView.swift` (line 93) — `.onReceive(NotificationCenter.default.publisher(for: .mobileRealtimeEvent))`. We add the same pattern to each management view.

**Important:** Each iOS view has a `loadData()` async function and a `game.id` property. The event's `gameId` must match the current game (compare as lowercase strings since `UUID.uuidString` is uppercase).

- [ ] **Step 1: ChallengesManagementView — add event listener**

Add after the existing `.refreshable` modifier (around line 138):

```swift
.onReceive(NotificationCenter.default.publisher(for: .mobileRealtimeEvent)) { notification in
    guard let rawGameId = notification.userInfo?["gameId"] as? String,
          rawGameId.lowercased() == game.id.uuidString.lowercased(),
          let type = notification.userInfo?["type"] as? String,
          type == "game_config",
          let data = notification.userInfo?["data"] as? [String: Any],
          let entity = data["entity"] as? String,
          entity == "challenges" else { return }
    Task { await loadData() }
}
```

- [ ] **Step 2: BasesManagementView — add event listener**

Same pattern, add after `.refreshable` (around line 137), filtering for `entity == "bases"`:

```swift
.onReceive(NotificationCenter.default.publisher(for: .mobileRealtimeEvent)) { notification in
    guard let rawGameId = notification.userInfo?["gameId"] as? String,
          rawGameId.lowercased() == game.id.uuidString.lowercased(),
          let type = notification.userInfo?["type"] as? String,
          type == "game_config",
          let data = notification.userInfo?["data"] as? [String: Any],
          let entity = data["entity"] as? String,
          entity == "bases" else { return }
    Task { await loadData() }
}
```

- [ ] **Step 3: TeamsManagementView — add event listener**

Same pattern, filter for `entity == "teams"`:

```swift
.onReceive(NotificationCenter.default.publisher(for: .mobileRealtimeEvent)) { notification in
    guard let rawGameId = notification.userInfo?["gameId"] as? String,
          rawGameId.lowercased() == game.id.uuidString.lowercased(),
          let type = notification.userInfo?["type"] as? String,
          type == "game_config",
          let data = notification.userInfo?["data"] as? [String: Any],
          let entity = data["entity"] as? String,
          entity == "teams" else { return }
    Task { await loadData() }
}
```

- [ ] **Step 4: GameSettingsView — add event listener**

GameSettingsView already handles `mobileRealtimeEvent` for `game_status` (line 301). Add a second `.onReceive` for `game_config` with `entity == "game_settings"`. This view needs to refetch the game object. Find how settings are loaded (likely from a `game` binding or fetched via API) and trigger a reload.

```swift
.onReceive(NotificationCenter.default.publisher(for: .mobileRealtimeEvent)) { notification in
    guard let rawGameId = notification.userInfo?["gameId"] as? String,
          rawGameId.lowercased() == game.id.uuidString.lowercased(),
          let type = notification.userInfo?["type"] as? String,
          type == "game_config",
          let data = notification.userInfo?["data"] as? [String: Any],
          let entity = data["entity"] as? String,
          entity == "game_settings" else { return }
    Task { await loadGame() }
}
```

Note: Check if `GameSettingsView` has a `loadGame()` function or similar. If settings come from a `@Binding var game: Game`, the parent view needs to refresh instead. Adapt accordingly.

- [ ] **Step 5: OperatorGameView — extend existing handler for broad config refresh**

`OperatorGameView.swift` (line 93) already handles `game_status`. Extend it to also handle `game_config` by refreshing bases (used for the map/overview). Add a separate `.onReceive`:

```swift
.onReceive(NotificationCenter.default.publisher(for: .mobileRealtimeEvent)) { notification in
    guard let rawGameId = notification.userInfo?["gameId"] as? String,
          rawGameId.lowercased() == game.id.uuidString.lowercased(),
          let type = notification.userInfo?["type"] as? String,
          type == "game_config" else { return }
    Task { await loadBases() }
}
```

- [ ] **Step 6: Verify iOS builds**

Run: `cd ios-app && xcodebuild -project dbv-nfc-games.xcodeproj -scheme dbv-nfc-games -destination 'platform=iOS Simulator,name=iPhone 17 Pro' build 2>&1 | grep "error:" | grep -v OperatorMoreView`
Expected: No errors from our modified files (OperatorMoreView has a pre-existing error)

- [ ] **Step 7: Commit**

```
feat: handle game_config WebSocket events in iOS operator views
```

---

### Task 6: Integration verification

- [ ] **Step 1: Run backend tests**

Run: `cd backend && ./gradlew test`
Expected: All existing tests pass (no behavior changed for existing events)

- [ ] **Step 2: Run web admin build + lint**

Run: `cd web-admin && npm run build && npm run lint`
Expected: No errors

- [ ] **Step 3: Run Android build**

Run: `cd android-app && ./gradlew :app:assembleDebug`
Expected: BUILD SUCCESSFUL

- [ ] **Step 4: Final commit if any fixups needed**

```
fix: address any integration issues from game_config sync
```
