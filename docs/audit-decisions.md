# Audit Decisions Log

Design decisions made while resolving findings from `docs/full-codebase-audit-2026-03-21.md`.

---

## Finding 1.14 -- POST addOperator returns 204 instead of 201

**Decision:** Change `GameController.addOperator()` to return `HttpStatus.CREATED` (201) instead of `ResponseEntity.noContent()` (204).

**Alternatives considered:**
- Keep 204 (the association already exists semantically as a join table row, so "no content" is defensible)
- Return 201 with a Location header pointing to the operator resource

**Rationale:** POST endpoints that create a new resource or association should return 201 Created per HTTP semantics. The other resource-creating POST in the same controller (`createGame`) already returns 201. Consistency within the controller is more important than the semantic nuance of whether an association row is a "resource." A Location header was not added because the operator association has no dedicated GET endpoint.

---

## Finding 10.11 -- User.java PushPlatform default

**Decision:** Remove `PushPlatform.ios` default from `User.java` entity and create migration V58 to drop `NOT NULL` + default on the `users.push_platform` column.

**Alternatives considered:**
- Keep the default and add explicit null handling in OperatorPushNotificationService
- Change default to a sentinel value (e.g. `UNKNOWN`)

**Rationale:** Mirrors the Player entity fix (V30 + V56). The `sendByPlatform` method in `OperatorPushNotificationService` already correctly handles null pushPlatform by skipping those users (null matches neither `== PushPlatform.ios` nor `== PushPlatform.android`). Users who register push tokens always set the platform explicitly via `UserService.updatePushToken`, so only users without push tokens would have null -- and those are correctly skipped anyway since they have no token to send to.

---

## Finding 6.16 -- Remaining contentDescription = null instances

**Decision:** Fix 13 standalone/interactive icons with meaningful descriptions; keep 4 remaining `contentDescription = null` instances that are decorative icons inside labeled Buttons.

**Alternatives considered:**
- Add string resource descriptions to all Icon composables (including decorative ones)
- Leave all as null

**Rationale:** The 4 remaining instances are decorative icons inside Buttons that already have explicit Text labels providing the accessible name (PlayerLiveComponents: preview Row icon with Text; PlayerGameplayScreens: two icons inside Button/OutlinedButton with Text; SetupBuilderComponents: PlayArrow inside Button with Text). The OperatorRescueActionButton icon was fixed (2026-07-23) because its container is a clickable Surface rather than a proper Button composable, making the icon description more valuable for TalkBack clarity. Per Compose accessibility guidelines, setting `contentDescription = null` is the correct approach for decorative icons within labeled containers. The 12 fixed instances were standalone interactive icons or icons in non-labeled containers where the description was the only accessible name. Where possible, existing localized parameters (`title`, `label`, `openMapLabel`) were reused; inline English strings have TODO comments for string resource extraction.

---

## Finding 12.3 -- Broadcast code brute-force mitigation

**Decision:** Rely on nginx rate limiting (10r/m per IP) combined with the widened broadcast code (10 chars, 28-char alphabet) rather than adding application-level rate limiting.

**Alternatives considered:**
- Add a Spring-level rate limiter (e.g. Bucket4j or custom service similar to PlayerJoinRateLimiter)
- Require lightweight authentication (e.g. a short-lived viewer token)

**Rationale:** V57 widened the broadcast code from 6 to 10 characters, increasing the search space from ~480M to ~280 trillion combinations. The nginx `broadcast_limit` zone (10r/m per IP, burst=5) makes enumeration impractical even from distributed sources given the code entropy. Application-level rate limiting would add complexity for marginal benefit. If the threat model changes (e.g. targeted attacks with botnets), the next step would be adding a CAPTCHA or requiring a lightweight viewer token.

---

## Finding 10.9 -- StringListJsonConverter null safety

**Decision:** Add a null guard after Jackson deserialization in `convertToEntityAttribute` so the converter never returns null, even if the database column contains the JSON literal `null`.

**Alternatives considered:**
- Also change `convertToDatabaseColumn` to write `"[]"` instead of SQL NULL for null input
- Leave as-is since callers already handle nulls

**Rationale:** The converter's contract should be: always return a non-null list. The `convertToEntityAttribute` already returns `Collections.emptyList()` for SQL NULL and blank strings, but Jackson can deserialize the JSON string `"null"` to Java null, which would slip through. Adding a post-deserialization null check makes the contract airtight without changing write behavior (which could affect queries that check `IS NULL`).

---

## Finding 3.9 -- AppState God Object

**Decision:** Accept the current extension-based decomposition. Updated doc comment with accurate line count (~1,400 lines across 5 files, not ~700) and a concrete extraction plan naming 4 subsystems.

**Extraction plan (documented in AppState.swift lines 7-16):**
1. `NotificationManager` -- push registration, token refresh, permission prompts (+Notifications)
2. `LocationTracker` -- CLLocationManager lifecycle, geofencing, background updates
3. `RealtimeSession` -- WebSocket connection, reconnect logic, message dispatch
4. `SyncCoordinator` -- offline queue, conflict resolution, retry policy (+Snapshot)

**Alternatives considered:**
- Perform the extraction in this pass
- Extract only the largest extension (GameActions at 666 lines)

**Rationale:** AppState is split across 5 files (AppState.swift + 4 extensions: Auth, GameActions, Notifications, Snapshot). The main file is 256 lines, but `AppState+GameActions.swift` at 666 lines is the largest single file. Extraction into dedicated `@Observable` classes requires threading those classes through the SwiftUI environment and updating every View that reads state, which is a significant architectural change affecting the entire iOS app's dependency graph. The extraction plan is now documented in source so it can be picked up in a dedicated refactor sprint.

---

## Finding 12.7 -- AuthController Host header fallback (2026-07-02)

**Decision:** Remove Host header fallback from all controllers. Only use `X-Forwarded-Host` (set by nginx reverse proxy). When absent, pass null through to `EmailService.resolveFrontendBaseUrl`, which falls back to the configured `app.frontend-url`.

**Alternatives considered:**
- Keep Host fallback but validate it against `SUPPORTED_FRONTEND_HOSTS` at the controller level
- Add a centralized utility to resolve request host

**Rationale:** The `Host` header is user-controlled and spoofable. Although `EmailService` already validates against a whitelist, relying on Host creates a maintenance hazard: any new code path using `requestHost` before validation could introduce a vulnerability. The `X-Forwarded-Host` header is set by nginx and is trustworthy behind the reverse proxy. In development (no proxy), the fallback to `app.frontend-url` is the correct behavior. Applied the same fix to `UserController`, `InviteController`, and `OrganizationController` which had the same pattern.

---

## Finding 11.2 -- Android failed sync actions visibility (2026-07-02)

**Decision:** Add reactive `failedCountFlow()` to the DAO and display a red warning with count on the CheckInScreen, matching iOS's red warning triangle behavior.

**Alternatives considered:**
- Only rely on the existing `solveError` message from `checkForFailedActions()`
- Add a full-screen overlay for failed actions

**Rationale:** The existing `checkForFailedActions()` call is a one-shot check that sets `solveError`, which is only visible on the solve screen and can be cleared. A reactive flow ensures the warning stays visible whenever failed actions exist, regardless of screen transitions. Showing it on CheckInScreen (the idle/home screen for players) maximizes visibility. The count format matches the existing pending actions pattern, and the red color + Warning icon matches iOS's treatment.

---

## Finding 8.10 -- Tile source URL inconsistency (2026-08-26)

**Decision:** Change the "osm" tile source on Android and iOS from CartoDB Voyager to OpenFreeMap Liberty (`https://tiles.openfreemap.org/styles/liberty`), matching the web admin. Keep "osm-classic" using an absolute URL on mobile (`https://pointfinder.pt/styles/osm-classic.json`) vs relative on web (`/styles/osm-classic.json`).

**Alternatives considered:**
- Change web to match mobile (use CartoDB Voyager for "osm")
- Unify osm-classic to use absolute URL everywhere

**Rationale:** The "osm" key should semantically point to an OpenStreetMap-based style. CartoDB Voyager is already available under the "voyager" key, so having "osm" also point to Voyager on mobile made the two keys indistinguishable. OpenFreeMap Liberty is the correct semantic match and is what the web admin already uses. For "osm-classic", the relative URL on web resolves correctly against the hosting domain and works in all environments (dev, staging, prod). Mobile cannot use relative URLs since the WebView/map SDK needs absolute URLs, so the difference is inherent to the platform. Both resolve to the same style.json.

---

## Finding 2.18 -- DTO record migration (2026-08-27 through 2026-08-31)

**Decision:** Convert all response DTOs from Lombok @Data/@Builder classes to Java 21 records. Completed in 6 batches: batch 1 (4 simple 2-field DTOs), batch 2 (5 DTOs with 3-5 fields), batch 3 (14 DTOs with 6-8 fields), batch 4 (10 DTOs with 9-16 fields including inner classes), batch 5 (5 complex DTOs with @NoArgsConstructor/@JsonInclude and multiple inner classes), batch 6 (2 remaining: LeaderboardEntry and AuditEntryDto with 6 inner classes). Also cleaned vestigial @Builder annotations from 6 records converted in earlier passes.

**Result:** All ~57 response DTOs + ~17 inner classes are now records. Zero Lombok annotations remain in dto/response/.

**Alternatives considered:**
- Leave complex DTOs (10+ fields, many inner classes) as Lombok classes
- Use @Builder on records for named-parameter construction

**Rationale:** Java 21 records are the idiomatic representation for immutable data carriers. All response DTOs in this codebase are pure data carriers with no inheritance, no custom methods, and no @Builder.Default values. Modern Jackson (2.12+) handles record deserialization natively, making @NoArgsConstructor unnecessary. The positional constructor risk was mitigated by updating all builder call sites in the same pass and verifying parameter order against the record definition. Getter-to-accessor renames (.getFoo() to .foo()) were applied across all test and production call sites. For DTOs that had setter calls (e.g. SubmissionResponse.setCompletionContent), the code was rewritten to construct a new record instance since records are immutable.

---

## Finding 2.13 -- PlayerService dependency extraction (2026-08-31)

**Decision:** Extract three helper services from PlayerService, reducing dependencies from 21 to 16:
- `PlayerJoinService` (joinTeam method) -- removed teamRepository, tokenProvider, quotaService (-3 deps)
- `PlayerNotificationQueryService` (getNotifications, getUnseenNotificationCount, markNotificationsSeen) -- removed gameNotificationRepository (-1 dep)
- Moved `linkUploadSessionsToSubmission` into SubmissionService -- removed uploadSessionRepository (-1 dep)

**Alternatives considered:**
- Extract only PlayerJoinService (largest single reduction)
- Also extract PlayerLocationService (updateLocation) and PlayerProgressService (getProgress, getBases)

**Rationale:** The three extracted groups were chosen because: (1) PlayerJoinService's 3 dependencies are used exclusively in joinTeam() with no shared state; (2) PlayerNotificationQueryService's 3 methods form a cohesive notification read/mark API that doesn't use core gameplay repositories; (3) linkUploadSessionsToSubmission logically belongs in SubmissionService (which already owns submission creation). Further extraction of location and progress methods was deferred because they share the loadPlayer/gameAccess patterns and eventBroadcaster with the remaining methods.

---

## Finding 2.14 -- GameService dependency extraction (2026-08-31)

**Decision:** Extract two helper services and remove pass-through delegation, reducing dependencies from 18 to 9:
- `GameProgressResetService` (resetProgress) -- removed submissionRepository, checkInRepository, activityEventRepository, uploadSessionRepository, teamLocationRepository (-5 deps)
- `GameReadinessValidator` (validateGoLivePrerequisites) -- removed baseRepository, challengeRepository, teamRepository, teamVariableService (-4 deps)
- Removed exportGame/importGame pass-through methods -- removed gameImportExportService (-1 dep), controller now calls it directly

**Alternatives considered:**
- Keep reset-progress inline (previous decision) -- overridden because the 5-dependency reduction is too significant
- Also extract the status transition validation

**Rationale:** GameProgressResetService runs inside the same @Transactional context via Spring's transaction propagation (REQUIRED default), so the pessimistic lock concern from the previous decision is addressed. The 5 repositories it uses are each called exactly once with a single `deleteByGameId`/`markArchivedByGameId` pattern. GameReadinessValidator is a pure validation method with no side effects, making extraction safe. The import/export pass-through was pure delegation adding no logic.

---

## Finding 2.19 -- Sealed interfaces for enum state machines (2026-08-31)

**Decision:** Keep all 19 enums as standard Java enums. Thorough evaluation performed; no sealed interface conversion warranted.

**Alternatives considered:**
- Convert state-machine enums (GameStatus, SubmissionStatus, SubscriptionStatus) to sealed interfaces
- Convert BaseStatus (computed, not persisted) to a sealed interface

**Rationale:** Evaluated all 19 enums across 5 categories: simple value labels (11), state machines (5), computed (1), bitmask flags (1), error catalog (1). None benefit from sealed interfaces because: (1) 15 of 19 are JPA-persisted via @Enumerated(STRING), which doesn't work with sealed interfaces without custom AttributeConverters; (2) state-machine enums carry no per-variant data (associated timestamps live on entities, not status values); (3) Java 21 already provides exhaustive switch on enums; (4) the API contract serializes enums as strings, which would break with sealed interface type discriminators. The codebase already uses pattern matching effectively on its enums.

---

## Finding 6.10 -- AppNavigation.kt extraction (2026-08-31)

**Decision:** Extract both large composables into separate files, reducing AppNavigation.kt from 2119 to 347 lines:
- `PlayerRootScreen.kt` (835 lines): PlayerRootScreen composable + GameNotLiveOverlay, PermissionDisclosureDialog, DisclosureRow helpers + scaleBitmapDown, PickedMediaMetadata, resolvePickedMediaMetadata utilities
- `OperatorGameRoot.kt` (970 lines): OperatorGameRoot composable with all operator in-game navigation

**Alternatives considered:**
- Defer extraction (previous decision) -- overridden because both composables were already fully parameterized with no implicit shared state
- Also extract OperatorHomeRoot (69 lines) -- kept in AppNavigation.kt since it's small

**Rationale:** The previous deferral cited shared state concerns, but examination revealed both composables already receive all dependencies as explicit parameters (auth, viewModel, sessionState fields). Neither creates implicit shared state. The only change needed was `private` to `internal` visibility. No parameter threading was required. OperatorHomeRoot was kept in AppNavigation.kt because at 69 lines it doesn't warrant a separate file and shares the OperatorViewModel instantiation with the NavHost setup.

---

## Finding 8.6 -- Web marker clustering (2026-08-31)

**Decision:** Implement web clustering for team/player location markers using MapLibre's built-in GeoJSON source clustering. Base markers remain unclustered (matching iOS/Android behavior).

**Changes:**
- `TeamMarkers.tsx`: Rewritten from individual `<Marker>` components to `<Source type="geojson" cluster={true}>` with three `<Layer>` components (cluster circles, count text, individual points). Click handler zooms to cluster expansion zoom. Stale detection preserved.
- `BroadcastMap.tsx`: Team locations similarly converted to clustered source+layer. Base markers kept as individual `<Marker>` components.
- `TeamMarkers.test.tsx`: Rewritten to test Source/Layer architecture.

**Alternatives considered:**
- supercluster library with DOM-based markers
- Cluster only in broadcast view (operators see fewer markers)

**Rationale:** MapLibre's built-in clustering was chosen over supercluster for platform parity (iOS and Android both use MapLibre's native `cluster: true`), zero new dependencies, GPU-rendered performance, and simpler code. Base markers are not clustered because they are operator-placed, fewer in number, and require interactive features (selection, editing) that style layers don't support. Team locations are transient position dots that cluster naturally.

---

## Finding 8.12 -- Offline tile caching (2026-08-31)

**Decision:** Configure MapLibre's ambient tile cache to 100 MB on both iOS and Android (up from the 50 MB default). Proactive region download deferred.

**Changes:**
- iOS `AppDelegate.swift`: Added `configureOfflineMapCache()` setting `MLNOfflineStorage.shared.setMaximumAmbientCacheSize(100 MB)`
- Android `CompanionApp.kt`: Added `configureOfflineMapCache()` setting `OfflineManager.getInstance(this).setMaximumAmbientCacheSize(100 MB)`

**Alternatives considered:**
- Implement full region download UI (pre-download map areas before events)
- Use a custom tile-serving proxy with local storage

**Rationale:** MapLibre's ambient cache automatically stores every tile viewed by the user. At outdoor events, the map area is typically explored during setup, so ambient caching naturally pre-warms the cache with the event area's tiles. Doubling from 50 MB to 100 MB retains more tiles across zoom levels and panning. Full region download would require an operator UI to select areas and manage storage, which is a significant feature addition deferred to a dedicated task.

---

## Finding 12.1 -- Refresh token HttpOnly cookie (2026-08-31)

**Decision:** Implemented. Backend sets HttpOnly cookie on auth endpoints; frontend no longer stores refresh token in localStorage. Mobile apps continue using body-based approach (backward compatible).

**Changes:**
- `AuthController.java`: Login/register set `pf_refresh` HttpOnly cookie (Secure, SameSite=Strict, Path=/api/auth). Refresh endpoint reads from cookie with body fallback. Logout clears cookie.
- `RefreshTokenRequest.java`, `ChangePasswordRequest.java`: Removed @NotBlank on refreshToken field (web clients send empty body).
- `web/src/lib/auth/store.ts`: Removed refreshToken from state. Zustand persist version bump (0->1) strips leftover refreshToken from localStorage.
- `web/src/lib/api/client.ts`: Added `withCredentials: true`. Refresh sends empty body (cookie sent automatically).
- Frontend test files updated to match new API.

**Alternatives considered:**
- Cookie-only (break mobile apps) -- rejected for backward compatibility
- CSRF token alongside cookie -- rejected because SameSite=Strict prevents CSRF

**Rationale:** The HttpOnly cookie is not accessible to JavaScript, eliminating the XSS session-theft vector. SameSite=Strict prevents CSRF without needing a separate CSRF token. The Secure flag is derived from `app.frontend-url` (true for HTTPS in production, false for localhost in dev). Mobile apps (iOS/Android) continue sending refresh tokens in the request body, unaffected by this change.

---

## Finding 12.2 -- Certificate pinning (2026-08-31)

**Decision:** Implemented. Both platforms now pin to Let's Encrypt root CA SPKI hashes.

**Implementation:**
- Android: `CertificatePinning.kt` provides an OkHttp `CertificatePinner` applied to all three `OkHttpClient` instances (refresh, authenticated, WebSocket). `network_security_config.xml` adds declarative pin-set entries.
- iOS: `CertificatePinningDelegate.swift` implements `URLSessionDelegate` with SPKI hash extraction using Security framework + CryptoKit. Applied to `APIClient` and `MobileRealtimeClient` via `makePinnedSession()`.
- Both platforms pin ISRG Root X1 (RSA, expires 2035) and ISRG Root X2 (ECDSA, expires 2040).
- Pinning is only enforced for `pointfinder.pt` and subdomains; localhost/staging traffic passes through.

**Pin rotation strategy:** Root CA pins are stable for 10-15+ years (unlike leaf/intermediate pins that rotate every 90 days). When a root approaches end-of-life, add the new root's SPKI hash in an app update before removing the old one. Always maintain at least two pins. The backup ISRG Root X2 pin ensures continuity if Let's Encrypt migrates from X1.

**Alternatives considered:**
- Pinning to leaf/intermediate certificates (rejected: rotates every 90 days with Let's Encrypt, high bricking risk)
- TrustKit (iOS) or third-party library (rejected: unnecessary complexity for root CA pinning)
- Remote pin config / kill-switch (deferred: root CA stability makes this lower priority; can be added if threat model changes)

---

## Findings 9.3, 9.4, 9.5, 9.6, 9.7 -- Mobile test coverage gaps (2026-09-02)

**Decision (updated 2026-09-08):** 9.3 and 9.5 resolved. 9.4, 9.6, 9.7 remain deferred.

**9.3 -- Android ViewModel tests: Resolved.**
Created `PlayerViewModelTest.kt` with 11 tests covering initial state, refresh success/error, base selection, failed action detection, realtime connection state, and error clearing. Added `mockk` and `kotlinx-coroutines-test` dependencies to app module. Uses `UnconfinedTestDispatcher` + `mockkStatic(Log::class)` pattern.

**9.5 -- MobileRealtimeClient reconnection tests: Resolved.**
Extracted `computeReconnectBackoffSeconds()` as a testable top-level function. Created `MobileRealtimeReconnectTest.kt` with 8 tests covering exponential backoff (1/2/4/8/16/32s), cap at 30s, configurable cap, state machine shape, initial state, disabled client behavior, and auth callback defaults. Combined with existing `MobileRealtimeTokenProviderTest` (6 tests) and `RealtimeEnvelopeParsingTest` (5 tests), the client now has 19 unit tests.

**9.4, 9.6, 9.7 -- Still deferred.**

**Alternatives considered:**
- Write stub ViewModel tests for all Android/iOS ViewModels (rejected: iOS requires test architecture with @Observable fakes that doesn't exist yet)
- Require tests before any new feature merges (deferred: would block velocity without clear ROI)

**Rationale for remaining deferrals:** 9.4 (instrumentation tests) requires Compose test rules that need a dedicated sprint. 9.7 (E2E parity) is incremental by nature. Both mitigated by 33 Maestro E2E specs.

---

## Finding 2.13 -- PlayerService further extraction (2026-09-09)

**Decision:** Extract PlayerLocationService and PlayerPushTokenService from PlayerService, reducing dependencies from 21 to 18.

**Changes:**
- `PlayerLocationService.java`: Contains both `updateLocation` overloads with coordinate validation, persistence, and WebSocket broadcasting. Dependencies: PlayerRepository, PlayerLocationRepository, GameAccessService, GameEventBroadcaster.
- `PlayerPushTokenService.java`: Contains `updatePushToken` delegating to PushTokenService. Single dependency.
- `PlayerLocationServiceTest.java`: 6 tests moved from PlayerServiceTest covering coordinate validation.
- `PlayerController.java`: Updated to inject new services for location and push token endpoints.

**Alternatives considered:**
- Extract only location methods (push token is one method)
- Also extract progress methods

**Rationale:** Location methods use two dependencies (PlayerLocationRepository, GameEventBroadcaster) not needed by any other PlayerService method, making them clean extraction candidates. Push token registration is a single method but its dependency (PushTokenService) is also unused elsewhere in PlayerService.

---

## Finding 2.19 -- GameStatus sealed interface (2026-09-09)

**Decision:** Added a `GameStatusTransition` sealed interface alongside the existing GameStatus enum, rather than replacing it.

**Changes:**
- `GameStatusTransition.java`: Sealed interface with 5 record subtypes modeling valid transitions (GoLive, EndGame, RevertToSetup, ResetToSetup, ReLive). Static methods `allowedTransitions()` and `canTransition()`.
- `GameStatus.java`: Added `canTransitionTo(GameStatus)` delegate method.
- `GameService.java`: `validateStatusTransition` now uses `current.canTransitionTo(target)`.

**Alternatives considered:**
- Replace enum with sealed interface (breaks JPA @Enumerated)
- Keep enum only with inline transition logic

**Rationale:** This approach provides compile-time documentation of the state machine and centralizes transition rules in one place, while preserving JPA compatibility. The previous decision (2026-08-31) evaluated all 19 enums and correctly concluded most don't benefit from sealed interfaces; GameStatus is the exception because its transitions were previously scattered across GameService's switch expression.

---

## Finding 12.6 -- Join code length increase (2026-09-09)

**Decision:** Increased join code length from 7 to 8 characters.

**Changes:**
- `TeamService.java`: `generateUniqueJoinCode()` now calls `CodeGenerator.generate(8, ...)`.

**Alternatives considered:**
- Keep 7 chars and rely only on PlayerJoinRateLimiter
- Increase to 10 chars (matching broadcast code)

**Rationale:** 8 characters with a 36-char alphabet gives ~2.8 trillion combinations (up from ~78 billion). Combined with the existing PlayerJoinRateLimiter (per-IP + per-device rate limiting) and nginx rate limiting, this makes brute-force impractical. 10 chars was rejected as unnecessarily long for codes players type manually.

---

## Finding 5.6 -- Database backup strategy (2026-09-09)

**Decision:** Created backup script and documented strategy.

**Changes:**
- `scripts/db-backup.sh`: pg_dump via docker exec, timestamped gzip, configurable retention.
- `docs/infrastructure.md`: Backup section with cron schedule, restore procedure.

**Alternatives considered:**
- pg_basebackup with WAL archiving (PITR)
- Managed backup service

**Rationale:** pg_dump is simple, reliable, and sufficient for the current single-instance deployment. The script can be cron-scheduled for daily backups. WAL archiving would be appropriate if the database grows beyond what nightly dumps can handle.

---

## Finding 9.6 -- iOS ViewModel tests (2026-09-09)

**Decision:** Created AppStateViewModelTests.swift with 7 functional areas and 15+ test methods.

**Rationale:** AppState is the central observable object, making it the highest-impact test target. Tests cover auth state, error handling, deep links, solve sessions, base status, and logout guards.

---

## Finding 9.5 -- MobileRealtimeClient message parsing tests (2026-09-09)

**Decision:** Created MobileRealtimeClientMessageTest.kt with 10 tests covering envelope deserialization.

**Rationale:** Reconnection was already tested (MobileRealtimeReconnectTest.kt). Message parsing was the remaining gap. Tests cover all event types, forward compatibility, malformed input, and edge cases.

---

## Finding 9.9 -- SubmissionServiceTest consolidation (2026-09-09)

**Decision:** Extracted 3 helper methods consolidating duplicate mock setup.

**Changes:**
- `buildDefaultRequest(answer)`: Eliminates repeated 4-line request construction
- `givenAutoValidationChallenge(answers)`: Consolidates repeated auto-validation setup
- `assertAutoValidationStatus(answer, expected)`: Consolidates repeated assertion pattern

6 auto-validation tests reduced from ~15 lines each to 2 lines each.
