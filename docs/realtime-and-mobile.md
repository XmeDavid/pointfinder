# Real-time & Mobile Features

**PointFinder** - NFC-based gaming platform. This document covers WebSocket real-time updates, push notifications, offline support, NFC tag handling, location tracking, and deep linking across backend, iOS, and Android.

---

## 1. WebSocket Real-time Updates

### Backend (STOMP)

The backend exposes a STOMP WebSocket endpoint with SockJS fallback.

- **Endpoint**: `/ws`
- **Message broker prefix**: `/topic`
- **Auth**: JWT token passed in STOMP `CONNECT` headers

**Broadcast topics (Wave A layout, post-audit split)** — the backend fans out across three topic families so players cannot eavesdrop on other teams' scoring data:

| Topic family | Events carried | Who can subscribe |
|---|---|---|
| `/topic/games/{gameId}` | `activity`, `location`, `presence`, `notification`, `game_status`, `game_config`, `stage_unlock` | Any game member (operator / player / broadcast viewer) |
| `/topic/games/{gameId}/operator/{type}` (`submission_status`, `leaderboard`) | Full review payload (`points`, `feedback`, `reviewedBy`) and leaderboard refresh signal | Operators / admins / game creators only — subscribe-auth rejects players and broadcast viewers |
| `/topic/games/{gameId}/team/{teamId}/submission_status` | Sanitized per-team review payload: `id`, `teamId`, `challengeId`, `baseId`, `status`, `submittedAt`. No `points`, `feedback`, or `reviewedBy`. | The player whose JWT `teamId` matches; operators/admins may also read for monitoring |

Wave A audit remediation: before 2026-04-16, `submission_status` (with `points`/`feedback`/`reviewedBy`) and `leaderboard` broadcast on `/topic/games/{gameId}` directly, so any player subscribed to the game channel could harvest other teams' scores. The split above enforces "players don't see scores or leaderboards" at the transport layer.

**Mobile raw WebSocket (`/ws/mobile`)** follows the same split conceptually but without STOMP topics: `MobileRealtimeHub` filters each broadcast on the handshake-authenticated principal (operator vs player) and, for team-scoped events, the handshake-captured `teamId` attribute. Players whose JWT lacks a `teamId` claim are rejected at handshake.

### Frontend (STOMP Client)

Two hooks manage WebSocket subscriptions:

- **`useGameWebSocket`**: Subscribes to game topics with JWT auth. On message receipt, triggers React Query cache invalidation so UI data refreshes automatically. Also passes an `onReconnect` callback to `connectWebSocket` that fires the snapshot-supersede invalidation on every reconnect after the first (Slice 3 — see §7).
- **`useBroadcastWebSocket`**: Public broadcast for spectator/broadcast games. Uses `X-Broadcast-Code` header instead of JWT (no authentication required).
- **`useGameSnapshot` / `useVisibilityRefresh`**: Canonical recovery hooks for the operator dashboard. `useVisibilityRefresh(gameId)` is mounted at the game-detail root (`GameShell`) and invalidates the snapshot-supersede query key set whenever `document.visibilityState` flips to `visible` — the web-admin equivalent of iOS `scenePhase == .active` and Android `ON_RESUME` wiring. See §7.

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

**Foreground resumption**: `ensureConnected()` pings to verify connection when app returns to foreground. Wired in `OperatorGameView` and `CheckInTabView` via the `UIApplication.willEnterForegroundNotification` publisher. The method is a no-op when `desiredSession == nil` (no player/operator is logged into this view), and otherwise either sends a ping that reconnects on failure (if the socket is still considered connected) or re-opens the socket directly (if the socket is in `disconnected` state).

> Note: foreground reconnection is necessary but not sufficient. Realtime connections can drop silently, miss broadcasts, or race state transitions — which is why the backend exposes `GET /api/games/{id}/snapshot` as the canonical recovery call. See §7 below.

### Mobile WebSocket Session Limits

The backend (`MobileRealtimeHub`) enforces:
- **Max 200 WebSocket sessions per game** — additional connections are rejected
- **Stale session cleanup** every 60 seconds — disconnected sessions are automatically purged
- **Transaction-safe broadcasting** — all events are deferred until the database transaction commits via `TransactionSynchronization`

### Android (Skeleton)

- **Class**: `MobileRealtimeClient` (singleton, Hilt-managed)
- **Status**: Skeleton implementation only — not fully wired to UI
- **Feature flag**: Configurable via `BuildConfig.ENABLE_MOBILE_REALTIME`
- **Tests**: `MobileRealtimeClientUrlTest` covers URL construction only

### WebSocket Error Codes

The backend emits STOMP ERROR frames with error codes in the `error-code` header. Clients must parse and handle these codes.

| Code | Meaning | Operator action | Client action |
|------|---------|-----------------|----------------|
| `WS_ACCESS_DENIED` | Operator JWT expired or revoked mid-session | Check operator login session in `JwtTokenProvider` (15-min access token TTL); verify user account is not revoked | **iOS**: call `forceLogout()` to bounce to login screen. **Android**: call `triggerForcedLogout()` to cancel operator session and return to auth screen. **Web**: treat as a manual reconnect cue; display message prompting user to re-authenticate. |

**Troubleshooting WS_ACCESS_DENIED incidents**:
1. Check `JwtTokenProvider.OPERATOR_ACCESS_TOKEN_VALIDITY_MINUTES` (default 15) — if the operator has an idle session, access token may have expired. The operator must re-login to get a fresh token.
2. Verify the user's operator account is active and not suspended in the database (`users` table, `active` column).
3. Check for clock skew between backend and clients — mismatched system clocks can cause premature token expiry. Use `timedatectl` or `ntpstat` on the backend host.
4. If the incident affects multiple operators simultaneously, check backend JWT key rotation or recent changes to `JWT_SECRET` env var. All connected clients will be rejected with `WS_ACCESS_DENIED` if the secret is reloaded.

**Implementation note**: The `StompAuthErrorHandler` class (backend) intercepts `AccessDeniedException` during STOMP frame validation and emits a STOMP ERROR frame with `error-code: WS_ACCESS_DENIED` instead of dropping the connection silently. This allows clients to distinguish between auth failures and network disconnects.

---

## 2. Push Notifications

### Backend

Both APNs (iOS) and FCM (Android) are supported. Both are **disabled by default** and must be enabled via configuration.

**Trigger events**:
- New submission received
- Submission reviewed (approved/rejected)
- Game status change

**Operator preferences**: Each operator can configure per-game which events they receive notifications for, via `GET/PUT /api/games/{gameId}/operator-notification-settings/me`.

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
- After writing tag: calls `OperatorRepository.linkBaseNfc(gameId, baseId)` to register the tag server-side (`PATCH /api/games/{gameId}/bases/{baseId}/nfc-link`)

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

## 7. State Snapshot Contract

**Realtime is invalidation. Snapshot is canonical.**

Full product contract: `docs/business-logic.md` §4 "State Snapshot and Version Contract". API reference: `docs/api-reference.md` `GET /games/:id/snapshot`. Source spec: `docs/specs/2026-04-08-post-pilot-reliability-and-operator-workflow.md` (P0 Track 2 Slice 1).

### Why realtime alone is not enough

The field pilot exposed a "game is not active" symptom: players joined during `setup`, cached `gameStatus = setup` at join time, and never learned when the operator pressed Go Live because the realtime event was missed (dropped WebSocket, app backgrounded, network blip). Recovery required killing and relaunching the app.

The fix is structural: no client should ever depend on catching every realtime event to stay correct. Realtime is the fast invalidation channel; when in doubt, any client can call `GET /api/games/{gameId}/snapshot` and receive the full authoritative state for its role.

### Backend: `games.state_version`

Every state-mutating, snapshot-relevant broadcast (`game_status`, `game_config`, `activity`, `submission_status`, `leaderboard`, `notification`) bumps `games.state_version` atomically via a single `UPDATE ... RETURNING` statement before dispatching the WebSocket/mobile payload. Transient events (`location`, `presence`) deliberately do NOT bump — location updates arrive every 30 seconds per player, and thrashing the counter would force pointless snapshot refetches.

The new version is included in the broadcast envelope alongside `type` and `data`:

```json
{
  "version": 1,
  "type": "game_status",
  "gameId": "d4e5f6a7-b8c9-0123-defa-234567890123",
  "emittedAt": "2026-04-08T14:23:05.817Z",
  "stateVersion": 42,
  "data": { "status": "live" }
}
```

A failed bump never blocks the broadcast — the exception is caught, logged, and the realtime event still fires. Honest realtime beats version-correct silence.

### Client recovery pattern

The pattern every realtime client should implement:

1. Subscribe to the realtime channel as today.
2. On every envelope, capture `envelope.stateVersion` as `lastSeenVersion` (if present).
3. On app foreground, reconnect, screen focus, network return, or any suspected missed event, call `GET /api/games/{gameId}/snapshot`.
4. Compare `snapshot.stateVersion` to `lastSeenVersion`:
   - `snapshot.stateVersion > lastSeenVersion` → replace local game/team/progress caches from the snapshot.
   - Equal → no-op, already fresh.
5. Update `lastSeenVersion = snapshot.stateVersion`.

### Response shapes

- **Player JWT** → `PlayerSnapshotResponse`: game lifecycle metadata, team info (no score), per-base progress, recent submissions (status only, no points), player upload sessions. **Player snapshots carry no scoring information at any nesting depth** — no `score`, `points`, `leaderboard`, or `rank` keys.
- **Operator JWT** → `OperatorSnapshotResponse`: full game config, all teams with scores, full leaderboard, pending review count, active upload count, needs-attention count.

See `docs/api-reference.md` for full field-by-field examples.

### Wiring status per platform (as of Slice 5)

| Platform | Snapshot wired? | JWT refresh on WS reconnect? | Realtime Health Observability (Slice 5)? |
|---|---|---|---|
| Backend | Yes | N/A (serves `/api/auth/refresh`) | **Slice 5: complete** — `backend/src/main/java/com/prayer/pointfinder/websocket/StompSessionMetricsListener.java` — STOMP connect/disconnect/reconnect counters; `backend/src/main/java/com/prayer/pointfinder/websocket/MobileRealtimeHub.java:102` — mobile session gauge; `backend/src/main/java/com/prayer/pointfinder/service/RealtimeMetricsService.java` — rolling-hour aggregation; `backend/src/main/java/com/prayer/pointfinder/controller/RealtimeStatsController.java` — `GET /api/games/{gameId}/realtime-stats` endpoint |
| Web admin | **Slice 3: complete** | **Slice 4: complete** | **Slice 5: complete** — `web-admin/src/components/RealtimeHealthWidget.tsx` — mounts on DashboardPage, polls `/realtime-stats` every 30s, renders health indicator; `web-admin/src/lib/api/monitoring.ts:16` — `getRealtimeStats(gameId)` function; `web-admin/src/lib/realtimeHealth.ts` — `classifyHealth()` health status classifier |
| iOS | **Slice 2: complete** | **Shipped in earlier waves** | N/A (player app only; observability is operator feature) |
| Android | **Slice 2: complete** | **Slice 4: complete** | N/A (player app only; observability is operator feature) |

Slice 1 is strictly backend. Slices 2 and 3 wire the snapshot clients. Slice 4 closes the remaining reliability gap by rotating operator JWTs on WebSocket reconnect across all three clients. Slice 5 completes P0 Track 2 by adding operator observability: the realtime health stats endpoint, counters on both hubs, and the dashboard widget that surfaces reconnect churn and zero-client alerts.

### JWT refresh on WebSocket reconnect (Slice 4 detail)

Operator access JWTs are 15 minutes; refresh tokens are 7 days. Before
Slice 4, the realtime client on web-admin and Android would happily
reconnect forever with whatever token it was given at login time — and
because the backend rejects expired tokens during the STOMP/WebSocket
handshake, every reconnect attempt past minute 15 would fail silently.
The dashboard would still *look* alive (React Query caches held),
but nothing new would arrive.

iOS shipped the fix in earlier waves via a `tokenProvider: (() -> String?)?`
callback on `MobileRealtimeClient`; on every `openConnection` call the
client asks the session layer for a fresh token and falls back to the
connect-time token if the provider is absent. Slice 4 mirrors that
contract on the other two clients:

- **Android** (`core/network/src/main/kotlin/.../MobileRealtimeClient.kt`):
  a new `tokenProvider: (() -> String?)?` field is consumed inside
  `openSocket()` via the pure helper `resolveRealtimeToken()`. The helper
  is extracted as a top-level function so it can be unit-tested without
  spinning up a real WebSocket (see `MobileRealtimeTokenProviderTest.kt`).
  Wiring lives in `AppSessionViewModel.configureRealtimeTokenProvider()`:
  for operators it calls `AuthRepository.refreshOperatorAccessTokenBlocking()`
  (thin passthrough to the existing `OperatorTokenRefresher` mutex + cache);
  for players it returns the current session token; on operator refresh
  failure it fires a one-shot `triggerForcedLogout()` so the dashboard
  does not loop forever on a dead session.

- **Web admin** (`web-admin/src/lib/api/websocket.ts`): `connectWebSocket`
  gains an optional fifth parameter `tokenProvider?: () => Promise<string | null>`.
  The existing `hasConnectedOnce` flag (introduced in Slice 3) doubles as
  the "is this a reconnect?" gate: on the first connect we keep using
  `getValidAccessToken()` directly (React Query has already fetched with
  whatever token is in memory, so there is no point issuing an extra
  refresh); on every subsequent `beforeConnect` we call `tokenProvider`
  first, and only fall back to `getValidAccessToken()` if it returns
  null or throws. A null-null case (both refresh paths fail) strips the
  `Authorization` header so the STOMP CONNECT fails fast and the existing
  `onStompError` handler clears auth and triggers logout. Wired from
  `useGameWebSocket.ts` with a closure that clears the in-memory access
  token (so `getValidAccessToken()` does not short-circuit to the stale
  cached value) and awaits a fresh refresh.

Both clients now match the iOS invariant: a long-running operator
session survives past the 15-minute access-token TTL without manual
reload, and a permanently dead refresh token surfaces as an explicit
logout instead of a silently frozen dashboard.

### Web admin foreground & reconnect refresh (Slice 3 detail)

The operator dashboard has two refresh entry points that both converge on
the same "invalidate the snapshot-supersede query key set" behaviour:

1. **Tab re-focus** — `useVisibilityRefresh(gameId)` listens for
   `document.visibilitychange` and, when the tab transitions to
   `visible`, invalidates the snapshot-supersede set. React Query then
   refetches each key lazily as widgets read it. This matters because
   `staleTime: 30s` (the web-admin default) only marks data as stale for
   the *next* access — it never auto-refetches a backgrounded tab. A tab
   that sits behind another window for 30 minutes previously drifted
   silently until the next inbound broadcast, which may never arrive if
   the WebSocket dropped while backgrounded.
2. **WebSocket reconnect** — `connectWebSocket` tracks a per-instance
   `hasConnectedOnce` flag and only fires `onReconnect` on the second
   and subsequent successful `onConnect`s. The first connection at mount
   time is skipped because React Query has already fetched fresh data.
   `useGameWebSocket` passes a reconnect callback that runs the same
   invalidation as `useVisibilityRefresh`.

Both entry points log a single `console.info` line of the form
`[snapshot] … refreshing operator dashboard for game {gameId}` for
observability. The supersede set lives in a single `const` inside
`useGameSnapshot.ts` and intentionally omits `team-locations` (those
arrive on their own 30s channel and do not bump `games.state_version`).

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
| State snapshot | Full (P0 Track 2 Slice 1) | Wired (Slice 2) | Wired (Slice 2) |
