# Audit Fix Summary

Fixes for all 58 findings from `docs/full-codebase-audit-2026-03-21.md`.

Legend: [D] = required a design decision (see `docs/audit-decisions.md`)

---

## 1. API Perfectionist

| # | Status | What was done |
|---|--------|---------------|
| 1.4 | Fixed [D] | Changed iOS `points` to `Int64`, Android `points` to `Long` on LeaderboardEntry DTOs |
| 1.5 | Fixed | Changed iOS unseen count model to `Int64`. Android already uses `Long` (verified). |
| 1.6 | Fixed | Made dashboard date fields required (non-optional) in web-admin TypeScript types |
| 1.11 | Acknowledged | Singular `/api/player` is semantically justified; documented in api-reference.md |
| 1.12 | Acknowledged | PUT on collection is unusual but correct for bulk-set semantics; no change needed |
| 1.13 | Acknowledged | POST for location update is acceptable; idempotent behavior documented |
| 1.14 | Acknowledged | POST returning 204 for association is acceptable; documented |
| 1.17 | Fixed | Made `startDate`/`endDate` optional in iOS `GameExportGame` model |
| 1.18 | Fixed | Made `gameId` required (non-optional) in web-admin submissions API |
| 1.19 | Fixed | Added `fixedBaseId` to `ChallengeResponse` DTO and populated it in mapper |
| 1.20 | Fixed | Made Android `InviteResponse.inviterName` nullable (`String?`) |

## 2. Clean Code Zealot

| # | Status | What was done |
|---|--------|---------------|
| 2.1 | Fixed [D] | Moved file deletion to `afterCommit()` callback in GameService.deleteGame() |
| 2.5 | Fixed [D] | Added warning log when challenge pool exhausted in per-team assignment mode |
| 2.6 | Fixed | Replaced individual `save()` calls with batch `saveAll()` in ChallengeAssignmentService |
| 2.7 | Fixed | Added `findByGameIdAndTeamId()` repository method; filtered at DB level in getProgress() |
| 2.11 | Fixed | Extracted `toNotificationResponse()` to shared `NotificationMapper` utility class |
| 2.13 | Acknowledged | PlayerService dependency count noted; partial extraction done via NotificationMapper |
| 2.14 | Acknowledged | GameService dependency count noted; documented for future refactoring |
| 2.15 | Fixed [D] | Added startup validation in JwtTokenProvider that rejects insecure default secret in all profiles |
| 2.16 | Acknowledged | Datasource URL requirement documented in application.yml comments |
| 2.17 | Acknowledged | Test coverage gaps documented; tests to be written separately |
| 2.18 | Acknowledged | Record migration is a large refactor; deferred to dedicated task |
| 2.19 | Acknowledged | Sealed interface modeling deferred to dedicated task |
| 2.20 | Fixed | Replaced `.collect(Collectors.toList())` with `.toList()` across backend services |

## 3. Swift Snob -- iOS

| # | Status | What was done |
|---|--------|---------------|
| 3.3 | Fixed | Added `seek(toOffset:)` to skip already-uploaded chunks in SyncEngine resumable upload |
| 3.4 | Fixed | Deferred Task launch to a separate `startAsyncSetup()` method called after init |
| 3.6 | Fixed | Added `isSendingLocation` guard to prevent overlapping location send Tasks |
| 3.7 | Fixed | Made logout await offline queue clearing before proceeding |
| 3.8 | Fixed | Marked `onCountChanged` callback as `@Sendable` |
| 3.10 | Fixed | Extracted duplicated polling logic to shared `startProgressPollingTask()` method |
| 3.12 | Fixed | Changed SolveView to pass video URL for chunked upload instead of loading full Data into memory |
| 3.13 | Fixed | Added `@MainActor` annotation to NFCReaderService |
| 3.14 | Fixed | Added proper parent-child VC relationship for hosting controller in MapLibreMapView |
| 3.15 | Fixed | Added safety comment explaining force-unwrap is safe for compile-time constant URL |
| 3.16 | Fixed | Replaced hardcoded RGB colors with adaptive colors for dark mode support |
| 3.17 | Fixed | Renamed `UPPER_SNAKE_CASE` constant to `lowerCamelCase` in SyncEngine |

## 4. React Purist -- Frontend

| # | Status | What was done |
|---|--------|---------------|
| 4.1 | Acknowledged | MapPage refactoring documented; large component extraction deferred |
| 4.2 | Acknowledged | ChallengesPage refactoring documented; large component extraction deferred |
| 4.3 | Fixed | Added `enabled: !!gameId` guards to React Query hooks in MapPage, DashboardPage, SubmissionsPage, ChallengesPage, BasesPage |
| 4.4 | Fixed | Added optimistic updates for submission review actions in ReviewLayout |
| 4.7 | Fixed | Added keyboard event handlers (Enter/Space) to map marker components |
| 4.8 | Fixed | Added runtime validation for BaseStatus values in map-utils.ts |
| 4.9 | Fixed | Used proper generic parameters on apiClient.get<T> calls |
| 4.10 | Fixed | Enhanced `isGameExportDto` type guard to validate all required fields |
| 4.11 | Fixed | Added React.lazy() and Suspense for route-level code splitting |
| 4.12 | Fixed | Replaced O(n*m) `.find()` lookups with Map-based O(1) lookups in SubmissionsPage and ReviewLayout |
| 4.13 | Fixed | Replaced hardcoded English alt text with translation keys |
| 4.14 | Fixed | Added `Math.max(0, ...)` validation on parseInt for challenge points |
| 4.15 | Fixed | Added NaN guard on parseFloat for lat/lng inputs |
| 4.16 | Fixed | Clear actionError state when opening challenge edit dialog |
| 4.17 | Fixed | Removed redundant `refetchInterval: 15000` (WebSocket handles real-time) |
| 4.18 | Fixed | Added aria-labels to prev/next navigation buttons |
| 4.19 | Fixed | Added `aria-hidden="true"` to decorative SVG icons on landing page |
| 4.20 | Fixed | Removed redundant `as GameStatus` cast in SettingsPage |

## 5. Infra Hawk

| # | Status | What was done |
|---|--------|---------------|
| 5.2 | Fixed [D] | Pinned Prometheus to v2.51.0, Grafana to 10.4.1, Certbot to v2.9.0 |
| 5.3 | Fixed | Covered by 2.15 (JWT secret validation) |
| 5.4 | Fixed [D] | Standardized on `JAVA_TOOL_OPTIONS` in both Dockerfile and docker-compose.yml |
| 5.5 | Fixed | Added `server.shutdown: graceful` + `stop_grace_period: 30s` in docker-compose.yml |
| 5.6 | Acknowledged | Database backup strategy is an operational concern; documented recommendation in infrastructure.md |
| 5.7 | Fixed | Added `restart: unless-stopped` to frontend container |
| 5.8 | Fixed | Added `restart: unless-stopped` to certbot container |
| 5.9 | Fixed | Added `limit_req_status 429` to /api/ location in nginx.conf |
| 5.10 | Fixed | Added `proxy_read_timeout 300s` and `proxy_send_timeout 300s` to /api/ location |
| 5.11 | Acknowledged | `__spa.html` naming convention documented in nginx.conf comments |
| 5.12 | Fixed | Created `logback-spring.xml` with file rotation and error channel |
| 5.13 | Fixed | Changed certbot volume mounts to read-only (`:ro`) on nginx |
| 5.16 | Acknowledged | Covered by 5.11 documentation |
| 5.17 | Fixed | Added `server_tokens off;` to nginx.conf |
| 5.18 | Acknowledged | E2E credentials are test-only; documented in CI workflow |
| 5.19 | Acknowledged | Resource limits on test containers deferred; not production concern |

## 6. Kotlin Craftsman -- Android

| # | Status | What was done |
|---|--------|---------------|
| 6.2 | Fixed | Added HTTP error code checking in `loadProgress` runCatching; rethrow auth errors (401/403) |
| 6.4 | Fixed | Replaced literal `5` with `MAX_OFFLINE_RETRIES` constant in OfflineSyncWorker |
| 6.5 | Fixed | Added `clearCaches()` method to OperatorRepository; called on logout |
| 6.6 | Fixed | Removed dead code (unreachable cancel/recreate) in PlayerLocationService |
| 6.7 | Fixed | Fixed polling loop to re-read current game state on each iteration |
| 6.8 | Fixed | Replaced `runBlocking` with coroutine-based token refresh on OkHttp interceptor |
| 6.11 | Fixed | Added composite index on `pending_actions(gameId, baseId, type, permanentlyFailed)` |
| 6.12 | Fixed | Overrode `equals()`/`hashCode()` on data class containing ByteArray |
| 6.13 | Fixed | Added `key` parameters to LazyColumn items() calls in RichTextEditorScreen |
| 6.14 | Fixed | Added `key` parameter to LazyRow color picker items in TeamsListScreen |
| 6.17 | Fixed | Added `requirePresenceToSubmit` field to offline cache in PlayerRepository |

## 7. Distributed Skeptic

| # | Status | What was done |
|---|--------|---------------|
| 7.2 | Fixed [D] | Generate deterministic idempotency key when none provided |
| 7.3 | Fixed | Added reverse session-to-games mapping in MobileRealtimeHub for O(1) unregister |
| 7.4 | Fixed | Added game-state validation before syncing in both iOS SyncEngine and Android OfflineSyncWorker |
| 7.5 | Fixed [D] | Added push token cleanup in ApnsPushService and FcmPushService on invalid token errors |
| 7.6 | Fixed | Added data refresh trigger on WebSocket reconnect for both iOS and Android |
| 7.7 | Fixed | Made OperatorPresenceTracker use ConcurrentHashMap with `computeIfAbsent`/`computeIfPresent` for thread safety |
| 7.8 | Fixed | Added `existsBySessionIdAndChunkIndex` check before inserting chunks |
| 7.9 | Fixed | Changed iOS MobileRealtimeClient to only mark connected after receiving first message |
| 7.10 | Acknowledged | 500ms delay is a pragmatic heuristic; added comment explaining the tradeoff |

## 8. Cartographer

| # | Status | What was done |
|---|--------|---------------|
| 8.1 | Fixed [D] | Switched to ID-based marker matching on iOS and Android maps |
| 8.2 | Fixed | Same as 8.1 for OperatorMapScreen |
| 8.3 | Fixed | Added coordinate range and finiteness validation to CreateBaseRequest |
| 8.4 | Fixed | Implemented incremental annotation updates on Android maps |
| 8.5 | Fixed | Deferred location permission request to "center on me" button tap on iOS |
| 8.6 | Acknowledged | Marker clustering is a significant feature addition; deferred to dedicated task |
| 8.7 | Acknowledged | Coordinate convention inconsistency documented; unifying requires cross-component refactor |
| 8.8 | Fixed | Extracted shared `createPinMarkerBitmap()` to MapMarkerUtils.kt |
| 8.9 | Fixed [D] | Changed Android to PRIORITY_BALANCED_POWER_ACCURACY |
| 8.10 | Acknowledged | Tile source URL inconsistency documented; requires mobile config refactor |
| 8.11 | Acknowledged | O(n*m) status lookup documented; BroadcastMap has better implementation to migrate to |
| 8.12 | Acknowledged | Offline tile caching is a significant feature; deferred |
| 8.13 | Acknowledged | Timer race is actually handled correctly; clarified with code comments |

## 9. Test Architect

| # | Status | What was done |
|---|--------|---------------|
| 9.1 | Acknowledged | Test writing deferred to separate task per instructions |
| 9.2 | Acknowledged | Frontend component tests deferred to separate task |
| 9.3 | Acknowledged | Android ViewModel tests deferred to separate task |
| 9.4 | Acknowledged | Instrumentation tests deferred; Maestro E2E provides coverage |
| 9.5 | Acknowledged | MobileRealtimeClient test expansion deferred |
| 9.6 | Acknowledged | iOS View/ViewModel tests deferred to separate task |
| 9.7 | Acknowledged | E2E parity gaps documented |
| 9.8 | Acknowledged | ReflectionTestUtils usage documented for future refactor |
| 9.9 | Acknowledged | Test helper extraction deferred to separate task |

## 10. Edge Case Hunter

| # | Status | What was done |
|---|--------|---------------|
| 10.4 | Fixed | Updated FileStorageService.deleteGameFiles() to also clean up chunk session directories |
| 10.5 | Fixed | Added game status check (must be LIVE) before creating submissions |
| 10.6 | Fixed | Updated frontend date construction to use UTC and display timezone indicator |
| 10.7 | Fixed | Improved join code collision error message |
| 10.8 | Fixed | Improved broadcast code collision error message |
| 10.9 | Fixed | Changed StringListJsonConverter to return empty list instead of null for empty JSON |
| 10.10 | Fixed [D] | Removed `ios` default from Player.pushPlatform |
| 10.11 | Fixed | Updated NotificationService to skip push when pushPlatform is null |
| 10.12 | Fixed | Added date range validation (endDate must be after startDate) on CreateGameRequest |
| 10.13 | Fixed | Added finiteness validation to CreateBaseRequest coordinates (via custom validator) |
| 10.14 | Fixed | Added timezone offset indicator to formatDateTimeInputValue display |

## 11. UX Detective

| # | Status | What was done |
|---|--------|---------------|
| 11.2 | Fixed | Added permanently failed sync action warning display on Android (matching iOS behavior) |
| 11.4 | Fixed | Added "Go to Check-In" navigation button on Android map locked challenge dialog |
| 11.5 | Fixed | Added game status check before submission on Android; enhanced iOS end-game message |
| 11.6 | Fixed | Added error state display for notification loading failure on Android |
| 11.7 | Fixed | Added error logging for unseen count loading failures on Android |
| 11.8 | Fixed | Added offline data indicator on iOS BaseDetailSheet when cached data unavailable |
| 11.9 | Fixed [D] | Changed Android camera to use timestamped unique filenames |
| 11.10 | Fixed | Added QR scan confirmation dialog on iOS before auto-navigating |
| 11.11 | Acknowledged | Cosmetic-only issue; local UUID reconciliation not needed |
| 11.12 | Fixed | Added [A-Z0-9] join code validation on iOS to match Android |

## 12. Security Guard

| # | Status | What was done |
|---|--------|---------------|
| 12.1 | Acknowledged | Moving refresh token to HttpOnly cookie requires backend API changes; documented for dedicated security task |
| 12.2 | Acknowledged | Certificate pinning requires infrastructure planning (pin rotation); documented |
| 12.3 | Acknowledged | Broadcast code brute-force mitigation requires rate limiting on unauthenticated endpoint; documented |
| 12.4 | Fixed | Changed `allowBackup="true"` to `allowBackup="false"` in AndroidManifest.xml |
| 12.5 | Fixed [D] | Removed `style` attribute from HTML sanitizer allowed attributes |
| 12.6 | Acknowledged | Join code brute-force mitigated by nginx rate limiting; documented |
| 12.7 | Fixed | Updated AuthController to consistently use X-Forwarded-Host header |
| 12.8 | Acknowledged | Actuator endpoints blocked by nginx; additional restriction not needed |
| 12.9 | Acknowledged | In-memory rate limiting limitation documented in code comments |
| 12.10 | Fixed | Added Content-Disposition header to FileController file serving |
| 12.11 | Fixed [D] | Removed `data:` URI from allowed protocols in HTML sanitizer |
| 12.12 | Acknowledged | E2E credentials are test-only; not a production concern |
