# Full Codebase Audit Report — 2026-03-21

> **Findings marked [FIXED] were verified as resolved on 2026-03-21.**

12 specialized agents performed a comprehensive audit of the PointFinder codebase across backend, web-admin, Android, iOS, infrastructure, and cross-platform concerns.

---

## Table of Contents

1. [API Perfectionist — API Consistency](#1-api-perfectionist--api-consistency)
2. [Clean Code Zealot — Backend Quality](#2-clean-code-zealot--backend-quality)
3. [Swift Snob — iOS Quality](#3-swift-snob--ios-quality)
4. [React Purist — Frontend Quality](#4-react-purist--frontend-quality)
5. [Infra Hawk — Infrastructure & DevOps](#5-infra-hawk--infrastructure--devops)
6. [Kotlin Craftsman — Android Quality](#6-kotlin-craftsman--android-quality)
7. [Distributed Skeptic — Real-time & Sync](#7-distributed-skeptic--real-time--sync)
8. [Cartographer — Map & Location](#8-cartographer--map--location)
9. [Test Architect — Test Quality & Coverage](#9-test-architect--test-quality--coverage)
10. [Edge Case Hunter — Data Integrity](#10-edge-case-hunter--data-integrity)
11. [UX Detective — Cross-platform UX Flows](#11-ux-detective--cross-platform-ux-flows)
12. [Security Guard — Security Vulnerabilities](#12-security-guard--security-vulnerabilities)
13. [Consolidated Priority Matrix](#13-consolidated-priority-matrix)

---

## 1. API Perfectionist — API Consistency

**Overall: GOOD | Logic: warn | Error Handling: pass | Design: warn | Maintainability: warn**

### CRITICAL

**1.1** `ios-app/dbv-nfc-games/Models/OperatorRequests.swift:19-21` — **iOS `UpdateGameStatusRequest` missing `resetProgress` field.** The backend `UpdateGameStatusRequest` has two fields: `status` and `resetProgress`. Web-admin sends both, Android includes both, but iOS only sends `status`. When an iOS operator resets a game to "setup" status, the `resetProgress` flag is never sent. The backend defaults it to `false`, so progress data (check-ins, submissions) is silently preserved when the operator may expect it to be wiped.

**1.2** `ios-app/dbv-nfc-games/Models/OperatorRequests.swift:224-226` — **iOS `ImportGameRequest` missing `startDate`/`endDate` fields.** Backend expects `gameData`, `startDate`, and `endDate`. Web-admin and Android send all three. iOS only sends `gameData`. Imported games on iOS always have null start/end dates.

**1.3** `ios-app/dbv-nfc-games/Models/OperatorRequests.swift:4-7` — **iOS `CreateGameRequest` missing multiple fields.** Backend accepts `name`, `description`, `startDate`, `endDate`, `uniformAssignment`, and `tileSource`. iOS only sends `name` and `description`.

### HIGH

**1.4** `backend/.../dto/response/LeaderboardEntry.java:16` — **`points` type mismatch: `long` vs `int`.** Backend declares `points` as `long`. Android (`val points: Int`) and iOS (`let points: Int`) will overflow/crash above 2,147,483,647 points.

**1.5** `backend/.../dto/response/UnseenCountResponse.java:9` — **`count` type mismatch: `long` vs `Int`.** Backend returns `long count`. iOS models it as `Int`. Android correctly uses `Long`.

**1.6** `backend/.../dto/response/DashboardResponse.java:13-18` — **Field type mismatch for dashboard stats.** Backend uses `Instant` for dates; web-admin declares them as optional strings — misleading since backend always includes them.

**1.7** `ios-app/dbv-nfc-games/Models/OperatorRequests.swift:192-198` — **iOS `GameExportBase` missing `hidden` field.** If a game with hidden bases is exported from iOS, the hidden flag is dropped. Re-imported bases default to visible.

**1.8** `ios-app/dbv-nfc-games/Models/OperatorRequests.swift:200-210` — **iOS `GameExportChallenge` missing 5 fields.** Missing `autoValidate`, `correctAnswer`, `locationBound`, `completionContent`, and `requirePresenceToSubmit`. Export/import from iOS silently loses auto-validation settings, correct answers, location-bound status, and presence requirements.

**1.9** `ios-app/dbv-nfc-games/Models/Team.swift:19-23` — **iOS `Player` model missing `teamId`.** Backend `PlayerResponse` includes `teamId`. iOS cannot display which team a player belongs to.

**1.10** Android/iOS operator models missing `createdAt` from `UserResponse`. Tolerable but a contract gap.

### MEDIUM

**1.11** Endpoint naming inconsistency: `/api/player` (singular) vs `/api/games` (plural). The singular form has semantic justification but breaks the otherwise consistent pluralization pattern.

**1.12** `AssignmentController.java:35-38` — PUT on collection without ID is semantically unusual (though correct for bulk-set).

**1.13** `PlayerController.java:167-173` — `POST /api/player/games/{gameId}/location` returns 204 No Content but uses POST. PUT or PATCH would be more conventional for idempotent updates.

**1.14** `GameController.java:62-64` — POST returns 204 instead of 201 for adding operator association.

~~**1.15** **No pagination on any list endpoint.** All list endpoints return unbounded `List<>` responses. Submissions and activity endpoints are most concerning — a long-running game could accumulate thousands of items.~~ [FIXED] `SubmissionRepository.findByGameId` now takes a `Pageable` parameter; `NotificationService` uses `PageRequest.of(0, 500)`.

**1.16** `AuthController.java:41-47` — Inconsistent error response format. Returns `Map<String, String>` while `GlobalExceptionHandler` returns structured `ErrorResponse`.

**1.17** `ios-app/.../OperatorRequests.swift:186-189` — iOS `GameExportGame` includes `startDate`/`endDate` but backend `GameMetadataDto` does not.

### LOW

**1.18** `web-admin/src/lib/api/submissions.ts:21` — `gameId` parameter is optional but always required. If undefined, URL becomes `/games/undefined/submissions/...`.

**1.19** Backend `ChallengeResponse.java` does not return `fixedBaseId` — clients cannot know which base a challenge is fixed to after creation.

**1.20** Android `InviteResponse.inviterName` is non-nullable but backend can return null — deserialization crash risk.

---

## 2. Clean Code Zealot — Backend Quality

**Overall: GOOD | Logic: pass | Error Handling: pass | Design: warn | Maintainability: warn**

### CRITICAL

**2.1** `GameService.java:155-169` — **File deletion outside transaction rollback scope.** `deleteGame()` calls `fileStorageService.deleteGameFiles(id)` inside the transaction. If it takes a long time (large game), it holds the transaction open and can exceed the 10-second timeout. File cleanup should be moved to `afterCommit()`.

**2.2** `ChunkedUploadService.java:311,320,347` — **Raw `RuntimeException` thrown instead of domain exceptions.** Three places throw `new RuntimeException(...)` for I/O failures. These bypass the `GlobalExceptionHandler` typed exception mapping and return 500 with generic "Internal server error".

**2.3** `MonitoringService.java:43-44` — **Incorrect "completed submissions" calculation.** `completedSubmissions = totalSubmissions - pendingSubmissions` includes rejected submissions in the "completed" count.

**2.4** `GameService.java:288-294` — **Go-live prerequisite logic checks challenge count against base count, not team count.** In per-team mode with 3 bases and 4 teams, you need 12 challenges, not 3. The current check would pass with only 3 challenges, and `autoAssignChallenges` would silently skip bases.

### HIGH

**2.5** `ChallengeAssignmentService.java:104-118` — **Silent failure when challenge pool is exhausted in per-team mode.** When `teamPool.isEmpty()`, the code simply skips the assignment with no error or log. Teams could find bases with no challenge.

**2.6** `ChallengeAssignmentService.java:76-119` — **N+1 database writes in assignment creation.** Every assignment saved individually via `assignmentRepository.save()` inside nested loops. Should use `saveAll()`.

**2.7** `PlayerService.java:170-249` — **`getProgress()` loads all assignments for the entire game.** Fetches every assignment for every team, then filters in memory. Should filter at the database level.

**2.8** `BroadcastService.java:41-43` — **`.limit(500)` applied before `.filter(hidden)`.** If the first 500 bases are all hidden, the result would be empty even if visible bases exist.

### MEDIUM

~~**2.9** `PlayerService.java` and `ChunkedUploadService.java` — **Duplicated `loadPlayer()` method** with different fetch strategies.~~ [FIXED] `PlayerService` has a single `private Player loadPlayer(Player authPlayer)` helper at line 507, called consistently across all 11 call sites.

~~**2.10** `TeamService.java:123-131` and `GameImportExportService.java:469-477` — **Duplicated `generateUniqueJoinCode()`** with different parameters.~~ [FIXED] `backend/src/main/java/com/prayer/pointfinder/util/CodeGenerator.java` exists with a shared `generate(int length)` / `generate(int length, String alphabet)` utility backed by `SecureRandom`.

**2.11** `NotificationService.java:128-137` and `PlayerService.java:492-501` — **Duplicated `toNotificationResponse()` mapper.**

~~**2.12** `NotificationService.java:87-123` — **Duplicated push notification dispatch logic** between `NotificationService` and `OperatorPushNotificationService`.~~ [FIXED] `NotificationService` uses `findByTeamIdAndPushTokenIsNotNull` / `findByTeamGameIdAndPushTokenIsNotNull` repository queries with explicit null filters and platform splitting into APNs/FCM lists before dispatch.

**2.13** `PlayerService.java` — **Service with 14 dependencies.** Notification-related and location methods could be extracted.

**2.14** `GameService.java:39-56` — **GameService has 16 dependencies.** Reset-progress logic could be extracted.

### CONFIGURATION

**2.15** `application.yml:49` — **Hardcoded default JWT secret in main config.** The enforcement check relies on `prod`/`production` profile being active. Custom profile names would accept the insecure default.

**2.16** No `spring.datasource.url` in main `application.yml` — works but should document the requirement.

### TEST COVERAGE GAPS

**2.17** [PARTIALLY FIXED] No test for `BroadcastService`, `GameImportExportService` (460+ lines), `GameSchedulerService`, `TeamVariableService`, `ChallengeAssignmentService`. `AssignmentServiceTest.java`, `ChallengeServiceTest.java`, and `EmailServiceTest.java` now exist; the five services named above remain untested.

### MODERNIZATION (LOW)

**2.18** Request/response DTOs could be records (Java 21).

**2.19** Enum types could benefit from sealed interfaces for state machine modeling.

**2.20** ~50% of `.collect(Collectors.toList())` calls could use `.toList()`.

---

## 3. Swift Snob — iOS Quality

**Overall: GOOD | Logic: pass | Error Handling: warn | Design: pass | Maintainability: pass**

### CRITICAL

**3.1** `NFCWriterService.swift:26-27` — **Force-unwrap on URL and payload construction.** Both lines force-unwrap during NFC write. Crash during physical NFC operation is the worst possible UX.

**3.2** `NFCReaderService.swift:34-36` — **Continuation stored without guarding against double-scan.** If `scanForBaseId()` is called while a scan is in progress, the previous continuation is silently overwritten and never resumed. The caller's Task hangs forever. Same issue in `NFCWriterService.swift:29`.

**3.3** `SyncEngine.swift:342-349` — **FileHandle seek position not advanced efficiently for skipped chunks.** During resume, previously-uploaded chunks are still read from disk (advancing the pointer) but discarded. Should `seek(toOffset:)` to the first non-uploaded chunk instead.

### HIGH

**3.4** `AppState.swift:74-86` — **Init fires Tasks that capture `self` before init completes.** The async Task on line 75 races with `configureRealtimeClient()`, `restoreSession()`, and `configureSyncEngine()`. Auth handler might fire before setup completes.

**3.5** `MobileRealtimeClient.swift:109-127` — Receive loop structure analysis (actually fine due to optional chaining, but noted for MainActor serialization awareness).

**3.6** `LocationService.swift:112-117` — **Timer closure creates a new unstructured Task on every fire.** If `sendCurrentLocation()` takes longer than 30 seconds, multiple overlapping Tasks accumulate.

**3.7** `AppState+Auth.swift:117-122` — **Logout clears offline queue in fire-and-forget Task.** User could log in as a new player before the old queue finishes clearing. New session queue could be wiped by still-running cleanup.

**3.8** `OfflineQueue.swift:21` — **`onCountChanged` callback is not `@Sendable`.** Potential data race under strict concurrency.

### MEDIUM

**3.9** `AppState.swift` — **God Object tendency.** ~700 lines across 4 extension files. Holds auth, game progress, solve sessions, deep links, notifications, location, sync, realtime, error handling, and media persistence.

**3.10** `GameMapView.swift:109-115` and `CheckInTabView.swift:132-138` — **Duplicated polling logic.** Identical polling patterns copy-pasted between two views.

**3.11** `OperatorLiveView.swift:187-195` — **`ISO8601DateFormatter` instantiated on every cell render.** Two formatters allocated per call. GC pressure during scrolling.

**3.12** `SolveView.swift:297-342` — **Full video data loaded into memory.** `Data(contentsOf: videoURL)` loads entire video. With 2GB max and 5 media items, this could consume 10GB and crash.

**3.13** `NFCReaderService.swift:4-5` — **`@Observable` on NFC delegate class without `@MainActor` isolation.** Properties mutated from `DispatchQueue.main.async` technically cross isolation boundaries.

**3.14** `MapLibreMapView.swift:311-338` — **SwiftUI annotation view does not add hosting controller as child VC.** Missing lifecycle events (Dynamic Type, dark mode transitions).

### LOW

**3.15** `Configuration.swift:18` — Force-unwrap on `URL(string:)` for compile-time constant.

**3.16** `OperatorLiveView.swift:116-118` — Hardcoded RGB colors for medal ranks. Won't adapt to dark mode or accessibility.

**3.17** `SyncEngine.swift:534` — Module-level constant uses `UPPER_SNAKE_CASE` instead of Swift `lowerCamelCase`.

---

## 4. React Purist — Frontend Quality

**Overall: GOOD | Logic: pass | Error Handling: pass | Design: warn | Maintainability: warn**

### HIGH

**4.1** `web-admin/src/features/monitoring/MapPage.tsx` (567 lines) — **Oversized component.** Manages 5 parallel queries, 5 state variables, 8 `useMemo`/`useCallback` hooks, renders all map/list content inline. Inline popups (80+ lines each) and sidebar panels should be extracted.

**4.2** `web-admin/src/features/game-detail/ChallengesPage.tsx` (510 lines) — **Oversized component.** Dialog form (~270 lines) mixed with listing page.

**4.3** Multiple pages use `gameId!` without `enabled: !!gameId` guard — `MapPage.tsx:62-71`, `DashboardPage.tsx:16-18`, `SubmissionsPage.tsx:104-107`, `ChallengesPage.tsx:44-46`, `BasesPage.tsx:41,60-61`. If components are ever reused, queries fire with `undefined` gameId.

**4.4** **No optimistic updates for review actions.** The submission review flow uses `invalidateQueries` on success but no optimistic updates. Perceivable lag in rapid keyboard-driven review.

~~**4.5** `SubmissionsPage.tsx:26-60` and `ReviewLayout.tsx:23-57` — **`FullScreenMediaViewer` + `getMediaUrls` duplicated verbatim.** Shared components already exist but aren't used.~~ [FIXED] `web-admin/src/components/common/FullScreenMediaViewer.tsx` is present as a shared component.

~~**4.6** `SubmissionsPage.tsx:75-99` and `ReviewLayout.tsx:77` — **Blob cache logic duplicated.** Existing `useBlobCache` hook not used by these consumers.~~ [FIXED] `web-admin/src/hooks/useBlobCache.ts` exists as a shared hook.

**4.7** Map popups lack keyboard accessibility — triggered only via `onClick` on `<Marker>` components.

### MEDIUM

**4.8** `map-utils.ts:28,33` — **Unsafe `as` casts** for `BaseStatus`. No runtime guard.

**4.9** All API modules cast `data as Type[]` on raw responses — `apiClient.get<T>` generic never used.

**4.10** `games.ts:75-76` — `isGameExportDto` type guard doesn't validate all required fields. Malformed import passes guard.

**4.11** **No route-level code splitting.** `routes/index.tsx` eagerly imports every page. MapLibre GL, TipTap, 691-line LandingPage all loaded on initial page load. Only `RichTextEditor` is lazy.

**4.12** `SubmissionsPage.tsx:169-171` — **O(n*m) `.find()` lookups on every render.** Three `.find()` calls scan teams, challenges, and bases arrays per submission. Same in `ReviewLayout.tsx:213-214`. Should use `Map.get()`.

**4.13** `SubmissionsPage.tsx:34,260` and `ReviewLayout.tsx:31,288` — **`alt="Submission media"` hardcoded in English.** Should use translation key.

**4.14** `ChallengesPage.tsx:252` — **`parseInt` without min enforcement.** `-5` accepted despite `<Input min={0}>`.

**4.15** `BasesPage.tsx:241,247` — **`parseFloat` for lat/lng returns `NaN`** if input cleared. Stored in form state.

**4.16** `ChallengesPage.tsx` — **`actionError` persists across edit dialogs.** Error from challenge A shown when editing challenge B.

**4.17** `ReviewLayout.tsx:82` — **`refetchInterval: 15000` redundant with WebSocket.** Polling alongside real-time updates.

**4.18** `SubmissionsPage.tsx` and `ReviewLayout.tsx` — Prev/next navigation buttons lack `aria-label`.

**4.19** Landing page SVG icons lack `aria-hidden="true"`.

**4.20** `SettingsPage.tsx:143` — Redundant cast `game.status as GameStatus`.

---

## 5. Infra Hawk — Infrastructure & DevOps

**Overall: GOOD | Logic: pass | Error Handling: pass | Design: warn | Maintainability: warn**

### CRITICAL

**5.1** `docker-compose.yml:70` — **`secrets/` directory is NOT gitignored.** APNs keys and Firebase service account will be committed if anyone runs `git add .`.

**5.2** `docker-compose.yml:141-148` — **Prometheus, Grafana, Certbot use unpinned `:latest` tags.** A `docker compose pull` during an incident could silently upgrade to a breaking version.

**5.3** `application.yml:49` — **Hardcoded JWT dev secret as default in production config.** If `JWT_SECRET` env var is missing and no `prod` profile is active, backend starts with known insecure key.

**5.4** `backend/Dockerfile:32` / `docker-compose.yml:31` — **`JAVA_OPTS` vs `JAVA_TOOL_OPTIONS` mismatch.** Dockerfile uses `$JAVA_OPTS` but docker-compose sets `JAVA_TOOL_OPTIONS`. Adding JVM flags via `JAVA_OPTS` silently does nothing.

### HIGH

**5.5** **No graceful shutdown configuration.** No `server.shutdown: graceful` or `stop_grace_period`. In-flight HTTP requests (including chunked uploads) terminated on SIGTERM. Docker gives only 10 seconds before SIGKILL.

**5.6** **No database backup strategy anywhere.** PostgreSQL data on a bind mount. Single disk failure or `docker volume rm` = total data loss.

**5.7** `docker-compose.yml:103` — **`frontend` container has no restart policy.** If it crashes, `frontend_dist` volume has stale files and nginx serves 404s.

**5.8** `docker-compose.yml:133-139` — **`certbot` container has no restart policy.** Certificates will silently expire in 90 days.

**5.9** `nginx/nginx.conf:89-100` — **Main `/api/` location missing `limit_req_status 429`.** Returns 503 instead, which clients interpret as "server down" — no backoff.

**5.10** `nginx/nginx.conf:88-100` — **No proxy timeout on API endpoints.** Nginx defaults to 60 seconds. Slow chunked upload assembly could time out at nginx while backend continues.

### MEDIUM

**5.11** `nginx/nginx.conf:181` — **SPA fallback uses `/__spa.html`** instead of standard `index.html`. Non-obvious; will break if build step changes.

**5.12** **No logback configuration file.** No structured logging, no file rotation, no separate error channel.

**5.13** `docker-compose.yml:120-122` — **Certbot volumes mounted read-write on nginx.** Nginx doesn't need write access.

**5.14** `docker-compose.yml:67` — **Dead nginx uploads volume mount.** Static file serving was removed but the volume mount remains.

**5.15** `ChunkedUploadService.java:311,320,347` — `RuntimeException` instead of `FileStorageException`. (Same as 2.2 — not fixed; lines 311, 320, 347 still throw `RuntimeException`.)

### LOW

**5.16** Nginx SPA fallback `__spa.html` naming convention undocumented.

**5.17** `nginx:1.27-alpine` reveals version in `Server` header.

**5.18** `.github/workflows/ci.yml:81-84` — E2E uses hardcoded dummy credentials.

**5.19** `docker-compose.test.yml` — No resource limits on test containers.

---

## 6. Kotlin Craftsman — Android Quality

**Overall: GOOD | Logic: pass | Error Handling: warn | Design: pass | Maintainability: warn**

### CRITICAL

**6.1** `CompanionMessagingService.kt:39` — **Unscoped `CoroutineScope` leaks on every FCM token refresh.** Creates unparented scope with no `SupervisorJob` and no cancellation. Every `onNewToken()` creates an orphan coroutine.

**6.2** `PlayerRepository.kt:88` — **`loadProgress` silently swallows ALL exceptions via `runCatching`.** Including `HttpException` 401/403/500. If auth has expired, the app silently serves stale cached data without alerting the user.

**6.3** `NfcService.kt:60-71` — **NFC write does not close connection on failure.** If `writeNdefMessage()` throws, `close()` is never called. NDEF connection leaks; subsequent tag writes fail with "Tag was lost."

### HIGH

**6.4** `OfflineSyncWorker.kt:54,89` — **Magic number `5` duplicates `MAX_RETRIES` / `MAX_OFFLINE_RETRIES`.** The constants are declared but never referenced. All three retry check sites use literal `5`.

**6.5** `OperatorRepository.kt:54-57` — **In-memory `ConcurrentHashMap` caches never bounded, never cleared on logout.** Stale entries accumulate across game switches.

**6.6** `PlayerLocationService.kt:80-81` — **`scope?.cancel()` followed by immediate recreation creates a race.** The idempotency guard makes lines 80-81 dead code.

**6.7** `AppNavigation.kt:563-567` — **Infinite polling loop — `state` captured once, never updates.** `state.gameStatus` never changes within the lambda. Polling continues forever even after game goes live.

**6.8** `AuthRepository.kt:103` — **`runBlocking` on OkHttp callback thread.** Can deadlock if dispatcher pool is exhausted.

### MEDIUM

~~**6.9** `OperatorViewModel.kt` — **God Object: 931 lines, 30+ public methods, 25+ state fields.** Consider splitting into per-feature ViewModels.~~ [FIXED] `OperatorViewModel` now delegates to 9 injected use cases (`GameCrudUseCase`, `BaseManagementUseCase`, `ChallengeManagementUseCase`, `TeamManagementUseCase`, `VariableManagementUseCase`, `SubmissionUseCase`, `NotificationUseCase`, `OperatorManagementUseCase`, `LiveDataUseCase`) in `app/src/main/java/com/prayer/pointfinder/session/usecase/`.

**6.10** `AppNavigation.kt` — **1614-line composable function.** Entire navigation graph, media capture, bitmap processing, and permission flows in one file.

**6.11** `CompanionDatabase.kt` — **No indexes on frequently queried columns.** `pending_actions` queried by `gameId + baseId + type` and `permanentlyFailed` with no composite index.

**6.12** `PlayerViewModel.kt:363-369` — **`ByteArray` in `data class` uses reference equality.** Two instances with identical bytes won't be equal.

**6.13** `RichTextEditorScreen.kt:342,461` — **`LazyColumn` `items()` calls without `key` parameter.**

**6.14** `TeamsListScreen.kt:262` — **Color picker `LazyRow` items without `key`.**

### LOW

**6.15** `PlayerScreens.kt:41` and `OperatorScreens.kt:58` — Duplicate `PRIVACY_POLICY_URL` constant.

**6.16** 56 instances of `contentDescription = null` across 20 feature files. Standalone interactive icons should have descriptions.

**6.17** `PlayerRepository.kt:113` — **Missing `requirePresenceToSubmit` field when caching from game data.** Defaults to `false`, bypassing presence check in offline mode.

---

## 7. Distributed Skeptic — Real-time & Sync

**Overall: GOOD | Logic: warn | Error Handling: warn | Design: pass | Maintainability: pass**

### CRITICAL

**7.1** `SubmissionService.java:198-266` — **Two operators can review the same submission concurrently.** No `@Version` optimistic locking on `Submission` entity. Last transaction to commit wins silently. No conflict detection.

**7.2** `SubmissionService.java:76-87` — **Idempotency key edge cases.** Idempotency key is properly handled by catch block for concurrent requests, but submissions without an idempotency key (e.g., auto-approve `none` type from offline queue) can create duplicates.

### HIGH

**7.3** `MobileRealtimeHub.java:44-47` — **Unregister iterates all games on every disconnect.** O(N*M) scan. No reverse session mapping.

**7.4** `SyncEngine.swift:85-115` — **No game-state validation before syncing queued actions.** If game ended while offline, queued submissions are silently discarded with only a log message. Same issue on Android `OfflineSyncWorker.kt:67-97`.

**7.5** `ApnsPushService.java:131-145` — **Invalid APNs tokens logged but never cleaned up.** Every subsequent push retries dead tokens forever. Same for FCM: `FcmPushService.java:88-95`.

**7.6** `GameEventBroadcaster.java:84-101` — **Messages between disconnect and reconnect are permanently lost.** No message persistence, sequence numbering, or catchup mechanism. Web mitigates by invalidating caches on reconnect. **Mobile clients don't trigger data refresh after reconnect.**

### MEDIUM

**7.7** `OperatorPresenceTracker.java:20-29` — **Mixed synchronization strategy.** `register`/`unregister` are `synchronized`, but `getOperators` is not. Read-vs-write visibility issue.

**7.8** `ChunkedUploadService.java:128-176` — **No chunk-level duplicate detection.** No unique constraint on `(session_id, chunk_index)`. Retry could create duplicate rows.

**7.9** `MobileRealtimeClient.swift:131-136` — **Optimistic connection state after timeout.** Marks as `.connected` after 2 seconds even if no message received.

**7.10** `OperatorPresenceEventListener.java:58` — **500ms arbitrary delay for presence broadcast.** Heuristic that assumes STOMP broker processes SUBSCRIBE within 500ms. Fragile under load.

---

## 8. Cartographer — Map & Location

**Overall: GOOD | Logic: warn | Error Handling: pass | Design: warn | Maintainability: warn**

### CRITICAL

**8.1** `PlayerMapScreen.kt:148-149` — **Marker-to-data matching uses floating-point equality.** `it.lat == marker.position.latitude && it.lng == marker.position.longitude`. Fragile — will silently break if coordinates are ever transformed. Same in `OperatorMapScreen.kt:294` and iOS `MapLibreMapView.swift:217-219`.

**8.2** `OperatorMapScreen.kt:294` — **Same coordinate-equality issue, but worse.** Both base markers and team location markers on the map. If coordinates collide, wrong type is matched.

**8.3** `UpdateLocationRequest.java:8-12` / `CreateBaseRequest` — **No coordinate range validation on base creation/update.** `UpdateLocationRequest` validates range for player location, but base coordinates have no range check. Operator can save lat=999, causing map rendering failures on all clients.

### HIGH

**8.4** `OperatorMapScreen.kt:164` — **Every data change removes and recreates ALL annotations.** Causes visible map flicker on every update. Same in `PlayerMapScreen.kt:113-136`.

**8.5** `OperatorMapView.swift:376-392` — **Operator map requests location permission immediately** without explanation. If denied, "center on me" button silently returns nil.

**8.6** **No clustering on any platform.** Games with 50+ bases will have overlapping, untappable markers at lower zoom levels.

**8.7** `MapPicker.tsx:197` — **Inconsistent coordinate conventions.** `BaseMapView` uses `[lat, lng]` tuple; `MapPage.tsx` uses `{ lat, lng }` object. Easy to swap lat/lng.

### MEDIUM

**8.8** `PlayerMapScreen.kt` and `OperatorMapScreen.kt` — **Duplicated `createPinMarkerBitmap()` (~80 lines each).** Core drawing logic copy-pasted.

**8.9** `PlayerLocationService.kt:95` — **Android uses `PRIORITY_HIGH_ACCURACY` vs iOS `kCLLocationAccuracyHundredMeters`.** Materially different battery drain for the same feature.

**8.10** `tile-sources.ts:17-18` — **`osm-classic` uses relative URL on web, hardcoded `pointfinder.pt` on mobile.** Inconsistent with hostname-based locale detection.

**8.11** `map-utils.ts:26-33` — **`getAggregateStatus()` reverse-lookup is O(n*m) and fragile.** `BroadcastMap.tsx` has a better implementation.

**8.12** **No offline map tile caching.** Outdoor scouting events with poor connectivity show blank tiles.

**8.13** `LocationService.swift:112` — Timer scheduling race with `stopTracking()` (actually handled but confusing flow).

---

## 9. Test Architect — Test Quality & Coverage

**Overall: GOOD | Logic: pass | Error Handling: pass | Design: pass | Maintainability: warn**

### Backend Tests (44 files, ~408 methods) — STRONG

Positive: Excellent Testcontainers integration, golden-path lifecycle test, exhaustive state transitions, DTO contract snapshots, comprehensive auto-validation edge cases.

**9.1** [PARTIALLY FIXED] **Zero test coverage for:** `AssignmentResolver` (P1 — core assignment algorithm), `GameImportExportService` (460+ lines), `BroadcastService`, `GameSchedulerService`, `TeamVariableService`. `AssignmentServiceTest.java`, `ChallengeServiceTest.java`, and `EmailServiceTest.java` are now present; the five services listed above remain untested.

### Frontend Tests (21 files) — MODERATE

Positive: Good auth store atomicity tests, token refresh deduplication tested, WebSocket RAF batching tested.

**9.2** **Zero component tests for any of 33 feature pages.** No UI-level test for "create game," "review submission," etc.

### Android Tests (10 files) — MODERATE

Positive: Three connectivity modes tested, sync prioritization verified, NFC UUID normalization covered.

**9.3** **Zero ViewModel tests.** Error states, expired tokens, loading states untested.

**9.4** **Zero instrumentation/UI tests.** Partially mitigated by Maestro E2E.

**9.5** `MobileRealtimeClient` — Only URL construction tested; no reconnection or message parsing tests.

### iOS Tests (7 files) — MODERATE

Positive: Comprehensive offline queue tests (13 cases), SyncEngine with protocol-based fakes, API auth regression test.

**9.6** **Zero View/ViewModel tests.** All 16+ operator and 6+ player screens untested.

### E2E Tests (33 specs) — GOOD

**9.7** Parity gaps: `requirePresenceToSubmit` not tested on mobile, WebSocket broadcasts not E2E tested on web/mobile, concurrent multi-player not tested beyond API.

### Anti-Patterns

**9.8** `ChunkedUploadServiceTest` — 7 fields set via `ReflectionTestUtils.setField`. Fragile.

**9.9** `SubmissionServiceTest` — 8 tests with identical mock setup (~200 lines that could be ~50 with helpers).

---

## 10. Edge Case Hunter — Data Integrity

**Overall: GOOD | Logic: warn | Error Handling: pass | Design: pass | Maintainability: pass**

### CRITICAL

**10.1** **`games.created_by` FK blocks user deletion.** V1 migration has `REFERENCES users(id)` with no `ON DELETE` clause (defaults to RESTRICT). V25 fixed `submissions.reviewed_by` and `game_notifications.sent_by` but missed `games.created_by` and `operator_invites.invited_by`. Any attempt to delete a user who created games throws unhandled `DataIntegrityViolationException`.

**10.2** **`CreateTeamRequest.name` has no `@Size` constraint.** Only `@NotBlank`, no `@Size(max = 255)`. Names >255 chars hit VARCHAR limit with cryptic error. Same for `CreateBaseRequest.name` and `CreateChallengeRequest.title`.

**10.3** `MonitoringService.java:43` — **Dashboard `completedSubmissions` counts rejected as "completed."** (Also flagged as 2.3)

### HIGH

**10.4** **Game deletion does not clean up chunk upload temp directories.** `deleteGameFiles(id)` deletes `{uploads}/{gameId}/` but chunks live in `{uploads}/_chunk_sessions/{sessionId}/`. DB rows cascade-delete but temp files on disk orphaned.

**10.5** **No game-status guard on `SubmissionService.createSubmission()`.** TOCTOU race: game can transition `live→ended` between status check and save. Operators can also submit for ended games.

**10.6** **Frontend date parsing uses local timezone.** `new Date(year, month - 1, day, hours, minutes)` uses browser local timezone. Multi-timezone operator teams see inconsistent game start/end times.

### MEDIUM

**10.7** Join code collision — 7 chars from 36-char alphabet (~78B combinations). Retry loop (20 attempts) is reasonable but error message is unfriendly.

**10.8** Broadcast code — 6 chars from 28-char alphabet (~481M combinations). 10 retries.

**10.9** `StringListJsonConverter` returns `null` for empty JSON. `correctAnswer` null-check is correct but fragile.

**10.10** `Player.pushPlatform` defaults to `ios` even for Android devices.

**10.11** `NotificationService` treats null `pushPlatform` as iOS — Android players without platform set get APNs pushes.

### LOW

**10.12** `endDate` before `startDate` is not validated. Scheduler could immediately end a game.

**10.13** `NaN`/`Infinity` latitude/longitude accepted in `CreateBaseRequest` (unlike `UpdateLocationRequest` which checks `isFinite()`).

**10.14** `formatDateTimeInputValue` displays local time without timezone indicator.

---

## 11. UX Detective — Cross-platform UX Flows

### HIGH

**11.1** `PlayerGameplayScreens.kt:317-319` — **Android SolveScreen has no submission loading indicator.** No spinner, no disabled state during submission. Users can double-tap and submit duplicates. iOS correctly shows `ProgressView` and disables the button.

**11.2** `OfflineSyncWorker.kt:50-56`, `PlayerRepository.kt:723`, `PlayerGameplayScreens.kt:122-133` — **Android permanently failed sync actions silently hidden.** After 5 retries, actions marked `permanentlyFailed` and excluded from pending count. User never informed. iOS shows red warning triangle with count.

**11.3** `AppState.swift:77-81` — **iOS auth expiry silently logs out and destroys pending offline data.** `logout()` calls `OfflineQueue.shared.clearAll()`, permanently deleting unsynced submissions. No alert, no explanation.

### MEDIUM

**11.4** `PlayerMapScreen.kt:386-389` — **Android map shows "Challenge locked" but no "Go to Check-In" button.** Also no pull-to-refresh on Android map (iOS has it).

**11.5** `SolveView.swift:377-384` — **iOS blocks submission when game ends mid-solve, Android doesn't.** Behavioral mismatch leads to server-rejected submissions on Android.

**11.6** `PlayerViewModel.kt:586-588` — **Android notification loading failure silently swallowed.** Spinner disappears, empty list, no error message.

**11.7** `PlayerViewModel.kt:569-574` — **`loadUnseenCount()` silently swallows errors.** Badge count remains stale.

**11.8** `AppState+GameActions.swift:41-46` — **iOS shows empty map with no offline indicator** when there's no cached data.

**11.9** `AppNavigation.kt:451-455` — **Android camera uses single shared temp file `capture.jpg`.** Second capture overwrites first before processing. iOS uses unique filenames.

### LOW

**11.10** `PlayerJoinView.swift:17-20` — **iOS QR scan auto-navigates without confirmation.** Android requires explicit tap.

**11.11** Offline check-in creates temporary local UUID for `checkInId` — never reconciled with server. Cosmetic issue only.

**11.12** Inconsistent join code validation: iOS accepts any characters, Android enforces `[A-Z0-9]` only.

---

## 12. Security Guard — Security Vulnerabilities

**Risk Level: MEDIUM**

### HIGH

**12.1** `useAuth.ts:98-105` — **Refresh token stored in `localStorage`.** Readable by any JS on the page. XSS vulnerability = 7-day persistent session theft. Should use `HttpOnly`, `Secure`, `SameSite=Strict` cookie.

**12.2** Android and iOS — **No certificate pinning on either mobile app.** At scouting events on shared/public WiFi, MITM attacks via rogue CAs can intercept all API traffic including JWTs and credentials.

**12.3** `GameService.java:58`, `BroadcastController.java:18-19` — **Broadcast code brute-forceable.** 6 chars from 28-char alphabet (~480M combinations). Fully unauthenticated endpoint. Exposes real-time GPS locations of children/scouts.

### MEDIUM

**12.4** `AndroidManifest.xml:21` — **`allowBackup="true"`.** JWT tokens, SQLCipher passphrase, and encrypted shared preferences extractable via ADB backup on rooted devices.

**12.5** `HtmlSanitizer.java:33` — **`style` attribute allowed globally.** CSS injection for UI overlay/phishing via challenge content. Should restrict to safe CSS properties.

**12.6** `TeamService.java:125` — **Player join code only 7 characters.** With 5r/m nginx rate limit per IP, single-IP brute force is mitigated, but distributed attacks feasible. No server-side rate limiting on join endpoint.

**12.7** `AuthController.java:44` — **`requestHost` from `Host` header used in email links.** Validated against whitelist (currently safe), but inconsistent header usage (`Host` vs `X-Forwarded-Host`) is a maintenance hazard.

**12.8** `SecurityConfig.java:62`, `application.yml:84-88` — **Actuator endpoints exposed with ADMIN role access.** Mitigated by nginx blocking, but `metrics`/`prometheus` could leak internal timing information.

### LOW

**12.9** `LoginAttemptService.java:15` — **Login rate limiting is in-memory only.** Lost on restart. Attacker could time brute force around deployments.

**12.10** `FileController.java:57-66` — **No `Content-Disposition` header on file serving.** Mitigated by `nosniff` and magic-byte validation.

**12.11** `HtmlSanitizer.java:27` — **`data:` URI protocol allowed in image sources.** Minor phishing risk via base64-encoded deceptive images.

**12.12** `.github/workflows/ci.yml:83` — **E2E production password hardcoded in CI workflow.**

---

## 13. Consolidated Priority Matrix

### P0 — Production Bugs / Data Loss Risk

| # | Finding | Auditor |
|---|---------|---------|
| 1.1 | iOS `UpdateGameStatusRequest` missing `resetProgress` — silently preserves data | API |
| 1.2 | iOS `ImportGameRequest` missing `startDate`/`endDate` — silent data loss | API |
| 1.7-1.8 | iOS export DTOs missing 6+ fields — export/import loses game config | API |
| 2.4 | Go-live validation doesn't account for team count in per-team mode | Backend |
| 2.5 | Silent challenge assignment failure — teams find empty bases | Backend |
| 7.1 | Two operators can review same submission (no optimistic locking) | Real-time |
| 10.1 | `games.created_by` FK blocks user deletion | Edge Case |
| 11.3 | iOS auth expiry destroys unsynced offline submissions | UX |

### P1 — High Impact UX / Reliability

| # | Finding | Auditor |
|---|---------|---------|
| 3.2 | iOS NFC double-scan hangs Task forever | iOS |
| 3.12 | iOS loads entire video into memory — OOM crash | iOS |
| 6.2 | Android `loadProgress` silently swallows 401s | Android |
| 6.3 | Android NFC write doesn't close connection on failure | Android |
| 6.7 | Android polling loop never terminates (stale state capture) | Android |
| 7.6 | Mobile WebSocket reconnect doesn't trigger data refresh | Real-time |
| 7.5 | Invalid push tokens never cleaned up | Real-time |
| 8.1 | Marker matching uses float equality — fragile | Map |
| 8.3 | No coordinate range validation on base creation | Map |
| 10.2 | No `@Size` on name fields — >255 chars gives cryptic error | Edge Case |
| 11.1 | Android SolveScreen no loading indicator — double-submit | UX |
| 11.2 | Android hides permanently failed sync actions | UX |

### P2 — Security

| # | Finding | Auditor |
|---|---------|---------|
| 5.1 | `secrets/` not gitignored | Infra |
| 12.1 | Refresh token in localStorage (XSS risk) | Security |
| 12.2 | No certificate pinning on mobile | Security |
| 12.3 | Broadcast code brute-forceable (exposes child GPS) | Security |
| 12.5 | HTML sanitizer allows arbitrary CSS | Security |

### P3 — Infrastructure / Reliability

| # | Finding | Auditor |
|---|---------|---------|
| 5.5 | No graceful shutdown | Infra |
| 5.6 | No database backup strategy | Infra |
| 5.7-5.8 | Frontend/certbot no restart policy | Infra |
| 5.2 | Unpinned `:latest` image tags | Infra |
| 5.4 | JAVA_OPTS / JAVA_TOOL_OPTIONS mismatch | Infra |
| 5.9 | Rate limit returns 503 instead of 429 | Infra |

### P4 — Code Quality / Maintainability

| # | Finding | Auditor |
|---|---------|---------|
| 2.1 | File deletion outside transaction safety | Backend |
| 2.2 | RuntimeException instead of domain exception (3 places) | Backend |
| 2.6 | N+1 writes in assignment creation | Backend |
| 2.7 | getProgress loads all assignments | Backend |
| 2.9-2.14 | 5 instances duplicated code in backend | Backend |
| 3.9 | iOS AppState God Object (~700 lines) | iOS |
| 4.1-4.2 | Oversized React components (500+ lines) | Frontend |
| 4.5-4.6 | Duplicated FullScreenMediaViewer + blob cache | Frontend |
| 4.11 | No route-level code splitting | Frontend |
| 6.9 | Android OperatorViewModel God Object (931 lines) | Android |
| 6.10 | Android AppNavigation 1614 lines | Android |
| 8.4 | Full annotation rebuild on data change (flicker) | Map |
| 8.8 | Duplicated marker bitmap creation | Map |

### P5 — Test Gaps

| # | Finding | Auditor |
|---|---------|---------|
| 9.1 | Zero tests for AssignmentResolver (core algorithm) | Tests |
| 9.2 | Zero frontend component tests | Tests |
| 9.3 | Zero Android ViewModel tests | Tests |
| 9.6 | Zero iOS View/ViewModel tests | Tests |
| 2.17 | Zero tests for 5 backend services | Backend |
