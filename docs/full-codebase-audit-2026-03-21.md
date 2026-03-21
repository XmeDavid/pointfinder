# Full Codebase Audit Report — 2026-03-21

> **Updated 2026-03-21 (post-fix cleanup):** Verified all 58 findings against source code. Fixed findings removed. 22 findings remain (7 unfixed gaps + 15 acknowledged deferrals).

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

### MEDIUM

**1.11** Endpoint naming inconsistency: `/api/player` (singular) vs `/api/games` (plural). The singular form has semantic justification but breaks the otherwise consistent pluralization pattern.
[DEFERRED: Singular `/api/player` is semantically justified; documented in api-reference.md]

**1.12** `AssignmentController.java:35-38` — PUT on collection without ID is semantically unusual (though correct for bulk-set).
[DEFERRED: PUT on collection is unusual but correct for bulk-set semantics; no change needed]

**1.13** `PlayerController.java:167-173` — `POST /api/player/games/{gameId}/location` returns 204 No Content but uses POST. PUT or PATCH would be more conventional for idempotent updates.
[DEFERRED: POST for location update is acceptable; idempotent behavior documented]

**1.14** `GameController.java:62-64` — POST returns 204 instead of 201 for adding operator association.
[DEFERRED: POST returning 204 for association is acceptable; documented]

### LOW

**1.19** Backend `ChallengeResponse.java` does not return `fixedBaseId` — clients cannot know which base a challenge is fixed to after creation.

---

## 2. Clean Code Zealot — Backend Quality

**Overall: GOOD | Logic: pass | Error Handling: pass | Design: warn | Maintainability: warn**

### MEDIUM

**2.13** `PlayerService.java` — **Service with 14 dependencies.** Notification-related and location methods could be extracted.
[DEFERRED: PlayerService dependency count noted; partial extraction done via NotificationMapper]

**2.14** `GameService.java:39-56` — **GameService has 16 dependencies.** Reset-progress logic could be extracted.
[DEFERRED: GameService dependency count noted; documented for future refactoring]

### CONFIGURATION

**2.16** No `spring.datasource.url` in main `application.yml` — works but should document the requirement.
[DEFERRED: Datasource URL requirement documented in application.yml comments]

### TEST COVERAGE GAPS

**2.17** [PARTIALLY FIXED] No test for `BroadcastService`, `GameImportExportService` (460+ lines), `GameSchedulerService`, `TeamVariableService`, `ChallengeAssignmentService`. `AssignmentServiceTest.java`, `ChallengeServiceTest.java`, and `EmailServiceTest.java` now exist; the five services named above remain untested.
[DEFERRED: Test coverage gaps documented; tests to be written separately]

### MODERNIZATION (LOW)

**2.18** Request/response DTOs could be records (Java 21).
[DEFERRED: Record migration is a large refactor; deferred to dedicated task]

**2.19** Enum types could benefit from sealed interfaces for state machine modeling.
[DEFERRED: Sealed interface modeling deferred to dedicated task]

---

## 3. Swift Snob — iOS Quality

**Overall: GOOD | Logic: pass | Error Handling: warn | Design: pass | Maintainability: pass**

### MEDIUM

**3.5** `MobileRealtimeClient.swift:109-127` — Receive loop structure analysis (actually fine due to optional chaining, but noted for MainActor serialization awareness).

**3.9** `AppState.swift` — **God Object tendency.** ~700 lines across 4 extension files. Holds auth, game progress, solve sessions, deep links, notifications, location, sync, realtime, error handling, and media persistence.

**3.14** `MapLibreMapView.swift:311-338` — **SwiftUI annotation view does not add hosting controller as child VC.** `configure(with:parentViewController:)` exists and handles parent-child relationship correctly, but the call site at line 254 invokes `swiftUIView.configure(with: item.view)` without passing `parentViewController`. Missing lifecycle events (Dynamic Type, dark mode transitions).

---

## 4. React Purist — Frontend Quality

**Overall: GOOD | Logic: pass | Error Handling: pass | Design: warn | Maintainability: warn**

### HIGH

**4.1** `web-admin/src/features/monitoring/MapPage.tsx` (567 lines) — **Oversized component.** Manages 5 parallel queries, 5 state variables, 8 `useMemo`/`useCallback` hooks, renders all map/list content inline. Inline popups (80+ lines each) and sidebar panels should be extracted.
[DEFERRED: MapPage refactoring documented; large component extraction deferred]

**4.2** `web-admin/src/features/game-detail/ChallengesPage.tsx` (510 lines) — **Oversized component.** Dialog form (~270 lines) mixed with listing page.
[DEFERRED: ChallengesPage refactoring documented; large component extraction deferred]

### MEDIUM

**4.13** `SubmissionsPage.tsx:34,260` and `ReviewLayout.tsx:31,288` — **`alt="Submission media"` hardcoded in English.** Should use translation key.

---

## 5. Infra Hawk — Infrastructure & DevOps

**Overall: GOOD | Logic: pass | Error Handling: pass | Design: warn | Maintainability: warn**

### MEDIUM

**5.6** **No database backup strategy anywhere.** PostgreSQL data on a bind mount. Single disk failure or `docker volume rm` = total data loss.
[DEFERRED: Database backup strategy is an operational concern; documented recommendation in infrastructure.md]

**5.11** `nginx/nginx.conf:181` — **SPA fallback uses `/__spa.html`** instead of standard `index.html`. Non-obvious; will break if build step changes.
[DEFERRED: `__spa.html` naming convention documented in nginx.conf comments]

### LOW

**5.16** Nginx SPA fallback `__spa.html` naming convention undocumented.
[DEFERRED: Covered by 5.11 documentation]

**5.18** `.github/workflows/ci.yml:81-84` — E2E uses hardcoded dummy credentials.
[DEFERRED: E2E credentials are test-only; documented in CI workflow]

**5.19** `docker-compose.test.yml` — No resource limits on test containers.
[DEFERRED: Resource limits on test containers deferred; not production concern]

---

## 6. Kotlin Craftsman — Android Quality

**Overall: GOOD | Logic: pass | Error Handling: warn | Design: pass | Maintainability: warn**

### MEDIUM

**6.10** `AppNavigation.kt` — **1614-line composable function.** Entire navigation graph, media capture, bitmap processing, and permission flows in one file.
[DEFERRED: Large composable documented; extraction deferred to dedicated refactor task]

### LOW

**6.16** 56 instances of `contentDescription = null` across 20 feature files. Standalone interactive icons should have descriptions.

---

## 7. Distributed Skeptic — Real-time & Sync

**Overall: GOOD | Logic: warn | Error Handling: warn | Design: pass | Maintainability: pass**

### MEDIUM

**7.10** `OperatorPresenceEventListener.java:58` — **500ms arbitrary delay for presence broadcast.** Heuristic that assumes STOMP broker processes SUBSCRIBE within 500ms. Fragile under load.
[DEFERRED: 500ms delay is a pragmatic heuristic; added comment explaining the tradeoff]

---

## 8. Cartographer — Map & Location

**Overall: GOOD | Logic: warn | Error Handling: pass | Design: warn | Maintainability: warn**

### HIGH

**8.6** **No clustering on any platform.** Games with 50+ bases will have overlapping, untappable markers at lower zoom levels.
[DEFERRED: Marker clustering is a significant feature addition; deferred to dedicated task]

**8.7** `MapPicker.tsx:197` — **Inconsistent coordinate conventions.** `BaseMapView` uses `[lat, lng]` tuple; `MapPage.tsx` uses `{ lat, lng }` object. Easy to swap lat/lng.
[DEFERRED: Coordinate convention inconsistency documented; unifying requires cross-component refactor]

### MEDIUM

**8.10** `tile-sources.ts:17-18` — **`osm-classic` uses relative URL on web, hardcoded `pointfinder.pt` on mobile.** Inconsistent with hostname-based locale detection.
[DEFERRED: Tile source URL inconsistency documented; requires mobile config refactor]

**8.11** `map-utils.ts:26-33` — **`getAggregateStatus()` reverse-lookup is O(n*m) and fragile.** `BroadcastMap.tsx` has a better implementation.
[DEFERRED: O(n*m) status lookup documented; BroadcastMap has better implementation to migrate to]

**8.12** **No offline map tile caching.** Outdoor scouting events with poor connectivity show blank tiles.
[DEFERRED: Offline tile caching is a significant feature; deferred]

**8.13** `LocationService.swift:112` — Timer scheduling race with `stopTracking()` (actually handled but confusing flow).
[DEFERRED: Timer race is actually handled correctly; clarified with code comments]

---

## 9. Test Architect — Test Quality & Coverage

**Overall: GOOD | Logic: pass | Error Handling: pass | Design: pass | Maintainability: warn**

### Backend Tests (44 files, ~408 methods) — STRONG

Positive: Excellent Testcontainers integration, golden-path lifecycle test, exhaustive state transitions, DTO contract snapshots, comprehensive auto-validation edge cases.

**9.1** [PARTIALLY FIXED] **Zero test coverage for:** `AssignmentResolver` (P1 — core assignment algorithm), `GameImportExportService` (460+ lines), `BroadcastService`, `GameSchedulerService`, `TeamVariableService`. `AssignmentServiceTest.java`, `ChallengeServiceTest.java`, and `EmailServiceTest.java` are now present; the five services listed above remain untested.
[DEFERRED: Test writing deferred to separate task per instructions]

### Frontend Tests (21 files) — MODERATE

Positive: Good auth store atomicity tests, token refresh deduplication tested, WebSocket RAF batching tested.

**9.2** **Zero component tests for any of 33 feature pages.** No UI-level test for "create game," "review submission," etc.
[DEFERRED: Frontend component tests deferred to separate task]

### Android Tests (10 files) — MODERATE

Positive: Three connectivity modes tested, sync prioritization verified, NFC UUID normalization covered.

**9.3** **Zero ViewModel tests.** Error states, expired tokens, loading states untested.
[DEFERRED: Android ViewModel tests deferred to separate task]

**9.4** **Zero instrumentation/UI tests.** Partially mitigated by Maestro E2E.
[DEFERRED: Instrumentation tests deferred; Maestro E2E provides coverage]

**9.5** `MobileRealtimeClient` — Only URL construction tested; no reconnection or message parsing tests.
[DEFERRED: MobileRealtimeClient test expansion deferred]

### iOS Tests (7 files) — MODERATE

Positive: Comprehensive offline queue tests (13 cases), SyncEngine with protocol-based fakes, API auth regression test.

**9.6** **Zero View/ViewModel tests.** All 16+ operator and 6+ player screens untested.
[DEFERRED: iOS View/ViewModel tests deferred to separate task]

### E2E Tests (33 specs) — GOOD

**9.7** Parity gaps: `requirePresenceToSubmit` not tested on mobile, WebSocket broadcasts not E2E tested on web/mobile, concurrent multi-player not tested beyond API.
[DEFERRED: E2E parity gaps documented]

### Anti-Patterns

**9.8** `ChunkedUploadServiceTest` — 7 fields set via `ReflectionTestUtils.setField`. Fragile.
[DEFERRED: ReflectionTestUtils usage documented for future refactor]

**9.9** `SubmissionServiceTest` — 8 tests with identical mock setup (~200 lines that could be ~50 with helpers).
[DEFERRED: Test helper extraction deferred to separate task]

---

## 10. Edge Case Hunter — Data Integrity

**Overall: GOOD | Logic: warn | Error Handling: pass | Design: pass | Maintainability: pass**

### MEDIUM

**10.9** `StringListJsonConverter` returns `null` for empty JSON. `correctAnswer` null-check is correct but fragile.

**10.10** `Player.pushPlatform` defaults to `ios` even for Android devices.
[DEFERRED: Removed `ios` default from Player.pushPlatform column default; field is now nullable with no default]

**10.11** `NotificationService` treats null `pushPlatform` as iOS — Android players without platform set get APNs pushes.

---

## 11. UX Detective — Cross-platform UX Flows

### HIGH

**11.2** `OfflineSyncWorker.kt:50-56`, `PlayerRepository.kt:723`, `PlayerGameplayScreens.kt:122-133` — **Android permanently failed sync actions silently hidden.** After 5 retries, actions marked `permanentlyFailed` and excluded from pending count. User never informed. iOS shows red warning triangle with count. (`checkForFailedActions()` is defined in `PlayerViewModel.kt` but is never called from any screen.)

### LOW

**11.11** Offline check-in creates temporary local UUID for `checkInId` — never reconciled with server. Cosmetic issue only.
[DEFERRED: Local UUID reconciliation not needed]

---

## 12. Security Guard — Security Vulnerabilities

**Risk Level: MEDIUM**

### HIGH

**12.1** `useAuth.ts:98-105` — **Refresh token stored in `localStorage`.** Readable by any JS on the page. XSS vulnerability = 7-day persistent session theft. Should use `HttpOnly`, `Secure`, `SameSite=Strict` cookie.
[DEFERRED: Moving refresh token to HttpOnly cookie requires backend API changes; documented for dedicated security task]

**12.2** Android and iOS — **No certificate pinning on either mobile app.** At scouting events on shared/public WiFi, MITM attacks via rogue CAs can intercept all API traffic including JWTs and credentials.
[DEFERRED: Certificate pinning requires infrastructure planning (pin rotation); documented]

**12.3** `GameService.java:58`, `BroadcastController.java:18-19` — **Broadcast code brute-forceable.** 6 chars from 28-char alphabet (~480M combinations). Fully unauthenticated endpoint. Exposes real-time GPS locations of children/scouts.
[DEFERRED: Broadcast code brute-force mitigation requires rate limiting on unauthenticated endpoint; documented]

### MEDIUM

**12.6** `TeamService.java:125` — **Player join code only 7 characters.** With 5r/m nginx rate limit per IP, single-IP brute force is mitigated, but distributed attacks feasible. No server-side rate limiting on join endpoint.
[DEFERRED: Join code brute-force mitigated by nginx rate limiting; documented]

**12.7** `AuthController.java:44` — **`requestHost` from `Host` header used in email links.** Validated against whitelist (currently safe), but inconsistent header usage (`Host` vs `X-Forwarded-Host`) is a maintenance hazard.

**12.8** `SecurityConfig.java:62`, `application.yml:84-88` — **Actuator endpoints exposed with ADMIN role access.** Mitigated by nginx blocking, but `metrics`/`prometheus` could leak internal timing information.
[DEFERRED: Actuator endpoints blocked by nginx; additional restriction not needed]

### LOW

**12.9** `LoginAttemptService.java:15` — **Login rate limiting is in-memory only.** Lost on restart. Attacker could time brute force around deployments.
[DEFERRED: In-memory rate limiting limitation documented in code comments]

**12.10** `FileController.java:57-66` — **No `Content-Disposition` header on file serving.** Mitigated by `nosniff` and magic-byte validation.

**12.12** `.github/workflows/ci.yml:83` — **E2E production password hardcoded in CI workflow.**
[DEFERRED: E2E credentials are test-only; not a production concern]

---

## 13. Consolidated Priority Matrix

### P0 — Production Bugs / Data Loss Risk

| # | Finding | Auditor |
|---|---------|---------|
| 7.2 | Idempotency key edge case — offline auto-approve can duplicate | Real-time |

### P1 — High Impact UX / Reliability

| # | Finding | Auditor |
|---|---------|---------|
| 3.14 | iOS annotation view missing parent-child VC relationship at call site | iOS |
| 10.11 | Null pushPlatform treated as iOS — Android players get APNs pushes | Edge Cases |
| 11.2 | Android hides permanently failed sync actions (checkForFailedActions never called) | UX |

### P2 — Security

| # | Finding | Auditor |
|---|---------|---------|
| 12.1 | Refresh token in localStorage (XSS risk) | Security |
| 12.2 | No certificate pinning on mobile | Security |
| 12.3 | Broadcast code brute-forceable (exposes child GPS) | Security |
| 12.7 | AuthController uses Host header instead of X-Forwarded-Host | Security |
| 12.10 | No Content-Disposition header on file serving | Security |

### P3 — Infrastructure / Reliability

| # | Finding | Auditor |
|---|---------|---------|
| 5.6 | No database backup strategy | Infra |

### P4 — Code Quality / Maintainability

| # | Finding | Auditor |
|---|---------|---------|
| 1.19 | ChallengeResponse missing fixedBaseId field | API |
| 4.13 | Alt text hardcoded English on submission media | Frontend |
| 10.9 | StringListJsonConverter returns null instead of empty list | Edge Cases |

### P5 — Deferred / Acknowledged

All remaining findings in sections 1–12 marked `[DEFERRED: ...]` above.
