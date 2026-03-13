# Real-time & Mobile Features

**PointFinder** - NFC-based gaming platform. This document covers WebSocket real-time updates, push notifications, offline support, NFC tag handling, location tracking, and deep linking across backend, iOS, and Android.

---

## 1. WebSocket Real-time Updates

### Backend (STOMP)

The backend exposes a STOMP WebSocket endpoint with SockJS fallback.

- **Endpoint**: `/ws`
- **Message broker prefix**: `/topic`
- **Auth**: JWT token passed in STOMP `CONNECT` headers

**7 broadcast topics** under `/topic/game/{gameId}/`:

| Topic | Purpose |
|---|---|
| `activity` | New activity events (check-ins, submissions) |
| `submission_status` | Submission reviewed/updated |
| `leaderboard` | Leaderboard score changes |
| `location` | Team location updates |
| `notification` | Player/operator notifications |
| `game_status` | Game status transitions (CREATED → ACTIVE → COMPLETED) |
| `presence` | Player presence at bases |

### Frontend (STOMP Client)

Two hooks manage WebSocket subscriptions:

- **`useGameWebSocket`**: Subscribes to game topics with JWT auth. On message receipt, triggers React Query cache invalidation so UI data refreshes automatically.
- **`useBroadcastWebSocket`**: Public broadcast for spectator/broadcast games. Uses `X-Broadcast-Code` header instead of JWT (no authentication required).

### iOS (Native WebSocket)

iOS uses `URLSessionWebSocketTask` directly — no STOMP library.

- **Endpoint**: `/ws/mobile?gameId={uuid}`
- **Auth**: `Authorization: Bearer {token}` request header
- **Implementation**: `MobileRealtimeClient.swift` (`@MainActor` class)

**Connection lifecycle**:
```
connect(gameId, token)
  → Build WSS URL: /ws/mobile?gameId={uuid}
  → Set Bearer auth header
  → Start URLSessionWebSocketTask
  → Begin receive loop
```

**Keep-alive**: Ping sent every 15 seconds. Ping failure triggers reconnect.

**Reconnection**: Exponential backoff — `min(30, 1 << attempt)` seconds. Max wait is 30 seconds. Reconnect attempts are unbounded.

**Connection states**: `disconnected`, `connecting`, `connected`, `reconnecting(attempt: Int)`

**Events handled in `AppState.handleRealtimeEvent`**:

| Event type | Action |
|---|---|
| `game_status` | Updates `currentGame`, triggers progress reload |
| `submission_status` | Triggers progress reload |
| `activity` | Triggers progress reload |
| `notification` | Increments `unseenNotificationCount` |

**Foreground resumption**: `ensureConnected()` pings to verify connection when app returns to foreground.

### Android (Skeleton)

- **Class**: `MobileRealtimeClient` (singleton, Hilt-managed)
- **Status**: Skeleton implementation only — not fully wired to UI
- **Feature flag**: Configurable via `BuildConfig.ENABLE_MOBILE_REALTIME`
- **Tests**: `MobileRealtimeClientUrlTest` covers URL construction only

---

## 2. Push Notifications

### Backend

Both APNs (iOS) and FCM (Android) are supported. Both are **disabled by default** and must be enabled via configuration.

**Trigger events**:
- New submission received
- Submission reviewed (approved/rejected)
- Game status change

**Operator preferences**: Each operator can configure per-game which events they receive notifications for, via `GET/PATCH /api/games/{gameId}/notifications/settings`.

### iOS (APNs)

**Class**: `PushNotificationService` (singleton, `@MainActor`)

**Token flow**:
```
AppDelegate.didRegisterForRemoteNotificationsWithDeviceToken
  → Convert Data to hex string
  → PushNotificationService.shared.didReceiveToken(token)
  → sendTokenToBackend()
```

**Dual endpoint routing** based on session type:
- Player: `PUT /api/player/push-token`
- Operator: `PUT /api/users/me/push-token`

**Configuration methods**:
```swift
configureForPlayer(apiClient, playerToken)   // sets recipient = .player
configureForOperator(apiClient, operatorToken) // sets recipient = .userOperator
```

**Foreground presentation**: Returns `[.banner, .sound]` so notifications appear even when app is active.

**Notification tap**: Logged; deep link routing can be extended in `AppDelegate.userNotificationCenter(_:didReceive:)`.

**Reset on logout**: `reset()` clears apiClient, recipient, and currentToken.

### Android (FCM)

**Class**: `CompanionMessagingService` extends `FirebaseMessagingService`

**Token routing** (same dual-endpoint pattern as iOS):
```kotlin
onNewToken(token) → authRepository.registerPushToken(token)
  → /api/player/push-token (player session)
  → /api/users/me/push-token (operator session)
```

**Token registration trigger**: Called on player/operator login via `AppSessionViewModel.registerPushTokenIfPossible()`.

**Notification channel**: `"pointfinder-default"` (created via `NotificationManager`).

---

## 3. Offline Support

### iOS

**Queue**: `actor OfflineQueue` — disk-persisted JSON at `Documents/pending_actions.json`

**Action types**:
- `check_in`: baseId only
- `submission`: baseId + challengeId + answer text
- `media_submission`: multiple media items + notes

**Queue operations**: `enqueue`, `dequeue`, `allPending` (FIFO by createdAt), `hasPendingCheckIn`, `hasPendingSubmission`, `incrementRetryCount`, `update`, `clearAll`

**Media management**: Local copies stored in `Documents/pending-media/`. Deleted on `dequeue()` or `clearAll()`. Files > 100 MB are not copied (source path preserved).

**Sync engine**: `SyncEngine` singleton (`@MainActor @Observable`)

```
syncPendingActions()
  1. Process checkIns → submissions → mediaSubmissions (in order)
  2. Per action: retryCount >= 5 → dequeue silently
                 else → retry with exponential backoff
  3. On complete: onSyncComplete() → appState.loadProgress()
```

**Retry policy**: Max 5 retries. Backoff: `min(30, 2 << min(retryCount, 5))` seconds. Auto-triggers on network reconnect via `NetworkMonitor`. `isSyncing` flag prevents concurrent syncs.

**Media uploads**: Chunked for files > 100 MB. Resumable via tracked `uploadSessionId`, `uploadChunkIndex`, `uploadTotalChunks`. Failed chunks retry the same chunk with backoff.

### Android

**Queue**: `PendingActionEntity` stored in Room DB with **SQLCipher encryption**.

**Entity fields**: id (UUID), type, gameId, baseId, challengeId, answer, createdAtEpochMs, retryCount, mediaContentType, mediaLocalPath, mediaSourceUri, mediaSizeBytes, mediaFileName, uploadSessionId, uploadChunkIndex, uploadTotalChunks, requiresReselect, lastError.

**Sync worker**: `OfflineSyncWorker` (WorkManager, `HiltWorker` with AssistedInject)
- Background sync, FIFO processing
- Exponential backoff with retry counter
- Triggered when network becomes available via `NetworkMonitor`

**Media uploads**: Chunked session management mirrors iOS — same API endpoints, same resumability pattern.

**Chunked upload API** (shared iOS/Android):
```
POST   /api/player/games/{gameId}/uploads/sessions                              → UploadSessionResponse
PUT    /api/player/games/{gameId}/uploads/sessions/{sessionId}/chunks/{index}   → UploadSessionResponse
GET    /api/player/games/{gameId}/uploads/sessions/{sessionId}                  → UploadSessionResponse
POST   /api/player/games/{gameId}/uploads/sessions/{sessionId}/complete         → UploadSessionResponse
DELETE /api/player/games/{gameId}/uploads/sessions/{sessionId}                  → void
```

---

## 4. NFC Tag Handling

### Tag Format

| Format | Record type | Payload |
|---|---|---|
| Current | NDEF URI record | `https://pointfinder.{pt\|ch}/tag/{uuid}` |
| Legacy (JSON MIME) | MIME `application/json` | `{ "baseId": "uuid-string" }` |
| Legacy (text) | NDEF text record | JSON payload (skip language prefix byte) |

Both `pointfinder.pt` and `pointfinder.ch` domains are recognized on all platforms.

### iOS Reading (`NFCReaderService`)

**Class**: `@Observable NFCReaderService: NSObject, NFCTagReaderSessionDelegate`

```swift
func scanForBaseId() async throws -> UUID
  → NFCTagReaderSession(pollingOption: .iso14443, delegate: self)
  → Connect to first detected tag
  → Read NDEF via readNDEFFromTag()
  → processRecord() extracts base UUID
```

**Record parsing priority**:
1. URI record — `wellKnownTypeURIPayload()`, extracts UUID from path `/tag/{uuid}`
2. JSON MIME record — parses `{ "baseId": "..." }`
3. NDEF text record — strips language byte, parses as JSON

**Errors**: `NFCError` enum — `notAvailable`, `cancelled`, `readFailed(String)`, `noData`, `invalidData`. Simulator throws `notAvailable`.

### iOS Writing (`NFCWriterService`)

**Class**: `@Observable NFCWriterService: NSObject, NFCTagReaderSessionDelegate`

```swift
func writeBaseId(_ baseId: UUID) async throws
  → Creates NFCNDEFPayload.wellKnownTypeURIPayload(url: "https://pointfinder.pt/tag/{uuid}")
  → Starts NFCTagReaderSession
  → Connects to tag
  → queryNDEFStatus() — must return .readWrite
  → tag.writeNDEF(NFCNDEFMessage([payload]))
```

Always writes with `pointfinder.pt` domain (canonical).

### Android Reading (`NfcService`)

**Mode**: Reader Mode API (Android API 23+). Avoids Background Activity Launch restrictions on Android 14+ (API 35).

**Polling flags**: `NFC_A | NFC_B | NFC_F | NFC_V`

**Parsing** (`NfcPayloadCodec`):
- Extracts baseId from URI path or legacy JSON records
- Normalizes UUID to lowercase canonical form

**Event bus** (`NfcEventBus`):
- `scannedBaseIds: SharedFlow<String?>` — scan results
- `discoveredTags: SharedFlow<Tag>` — raw tags for write operations
- `deepLinkBaseId: StateFlow<String?>` — deep link results

**MainActivity integration**:
- `handleIntent(intent)` on cold start
- Reader mode enabled in `onResume()`, disabled in `onPause()`

### Android Writing

- Constructs NDEF message with URI payload (`https://pointfinder.pt/tag/{baseId}`)
- Operator-only — accessible via `OperatorMapScreen`
- After writing tag: calls `OperatorRepository.linkBaseNfc(gameId, baseId)` to register the tag server-side (`POST /api/games/{gameId}/bases/{baseId}/nfc/link`)

---

## 5. Location Tracking

### iOS (`LocationService`)

**Class**: `@MainActor LocationService: NSObject, CLLocationManagerDelegate`

| Setting | Value |
|---|---|
| Authorization | `whenInUseAuthorization` |
| Desired accuracy | 100 meters |
| Distance filter | 10 meters |
| Send interval | Every 30 seconds |
| Immediate send | After check-in or submission |

**Startup**:
```swift
func startTracking(apiClient, gameId, token)
  → requestWhenInUseAuthorization()
  → startUpdatingLocation()
  → scheduleSendTimer() — fires every 30s
```

**Silent failure**: Location update errors are logged but not surfaced to the user.

**Cleanup**: `stopTracking()` on logout — stops updates, clears credentials, cancels timer.

### Android (`PlayerLocationService`)

| Setting | Value |
|---|---|
| Provider | FusedLocationProviderClient (Google Play Services) |
| Priority | `PRIORITY_HIGH_ACCURACY` |
| Update interval | 30 seconds |
| Min distance | 10 meters |
| Permissions | `ACCESS_FINE_LOCATION` or `ACCESS_COARSE_LOCATION` |

**Bootstrap**: Requests last-known location immediately on `start(gameId)`.

**Periodic send**: `sendLocationNow()` resets the 30-second timer. Location sent immediately on first fix.

**Background scope**: `CoroutineScope(SupervisorJob() + Dispatchers.IO)` — silently swallows offline errors.

**UI integration**: `AppSessionViewModel` checks `isPermissionDisclosureSeen()` before starting the service.

### Backend

```
POST /api/player/games/{gameId}/location
  body: { "lat": Double, "lng": Double }

GET /api/games/{gameId}/monitoring/locations
  → [TeamLocationResponse] — all current team positions for operator map
```

---

## 6. Deep Linking

### NFC Tag Scan to App

**URL pattern**: `https://pointfinder.{pt|ch}/tag/{uuid}`

| Platform | Handler | Flow |
|---|---|---|
| iOS | `AppState.handleDeepLink(url)` | Sets `pendingDeepLinkBaseId` → `MainTabView` routes to tab 1 (CheckIn) → `CheckInTabView` auto-triggers check-in |
| Android | `NfcEventBus.deepLinkBaseId: StateFlow<String?>` | MainActivity parses `/tag/{baseId}` from `Intent.ACTION_VIEW` → navigation to check-in flow |

**iOS deep link consumption**: `consumeDeepLink()` clears `pendingDeepLinkBaseId` after use to prevent duplicate triggers.

**Android deep link entry**: Also handles cold start — `handleIntent(intent)` called in `onCreate`.

### Web Fallback

- The `/tag/` route in nginx is configured to serve the frontend SPA.
- Devices without the app see a fallback page with install instructions.

---

## Platform Feature Matrix

| Feature | Backend | iOS | Android |
|---|---|---|---|
| WebSocket (STOMP) | Full | Native (non-STOMP) | Skeleton only |
| Push notifications | APNs + FCM | APNs (full) | FCM (full) |
| Offline queue | N/A | Swift actor + JSON file | Room DB + WorkManager |
| NFC reading | N/A | NFCTagReaderSession | Reader Mode API |
| NFC writing | Link endpoint | NFCWriterService | OperatorMapScreen |
| Location tracking | Store + serve | CLLocationManager | FusedLocationProvider |
| Deep linking | nginx fallback | AppState.handleDeepLink | NfcEventBus StateFlow |
| Chunked media upload | Full | SyncEngine | OfflineSyncWorker |
