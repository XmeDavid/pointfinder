# Audit Decisions

> Decisions made during audit fix verification (2026-05-24, updated 2026-05-27, 2026-06-01).

---

## Fixes Applied (2026-06-01 Session)

### 2.18 -- DTO Record Conversion (Java 21)

**Decision:** Convert simple response DTOs to Java records; skip DTOs whose tests call `.getId()` / `.getName()` (Lombok-generated getters), since records use accessor-style methods (`.id()`, `.name()`).

**Converted:** `UnseenCountResponse`, `AuthResponse`, `TagResponse`, `TeamResponse`, `PlayerResponse`, `UserResponse`, `AssignmentResponse`. All use `@Builder` (Lombok) on the record for backwards-compatible construction.

**Skipped:** `BroadcastTeamResponse`, `BroadcastBaseResponse` -- test files call `.getId()`, `.getName()` etc. Converting these would require updating all test getter calls, better done in a dedicated pass.

**Trade-off:** `@Builder` on a record is slightly unusual but avoids changing every call site that constructs these objects via builder pattern.

### 4.2 -- ChallengeDetail.tsx Extraction

**Decision:** Extract the assignment section (~250 lines) into `ChallengeAssignmentSection.tsx`. This was the most self-contained chunk: it owns its own state (`showBaseDropdown`, `showTeamPicker`) and has clear prop boundaries.

**Result:** ChallengeDetail.tsx reduced from ~1002 to ~755 lines. The remaining size is acceptable since the challenge form itself is inherently complex (multiple answer types, auto-validation config, content editor).

### 5.19 -- Docker Compose Test Resource Limits

**Decision:** Added `mem_limit` and `cpus` to `docker-compose.test.yml`: backend-test gets 2GB/2 CPUs, frontend-test gets 1GB/1 CPU. These match typical CI runner constraints and prevent OOM kills.

### 8.11 -- getAggregateStatus O(n*m) Fix

**Decision:** Added `getAggregateStatusFlat()` to `map-utils.ts` for the flat `Map<string, Map<string, string>>` shape used by broadcast components. This avoids the reverse-lookup pattern entirely by tracking `minStatus` directly during iteration.

Both `BroadcastMap.tsx` and `BroadcastBasesList.tsx` had independent inline copies of a better algorithm. Replaced both with the shared `getAggregateStatusFlat()` import.

The original `getAggregateStatus()` is kept for callers using the nested `Map<string, Map<string, BaseStatus>>` shape.

### 9.8 -- ChunkedUploadService @ConfigurationProperties

**Decision:** Extracted 7 `@Value` fields into `ChunkedUploadProperties` with `@ConfigurationProperties(prefix = "app.uploads")`. Nested classes (`Chunk`, `Limits`) preserve the config hierarchy. Tests now construct the properties object directly instead of using `ReflectionTestUtils.setField`.

`@EnableConfigurationProperties(ChunkedUploadProperties.class)` added to `PointFinderApplication.java`.

### 9.9 -- SubmissionServiceTest Helper Extraction

**Decision:** Extracted two helpers: `stubDefaultRepositories(String fileUrl)` (stubs fileStorageService, teamRepository, challengeRepository, baseRepository) and `stubSubmissionSave()` (stubs submissionRepository.save with ID/timestamp assignment). Refactored all test methods that had the repeated 4-stub + save-answer pattern.

Tests that need non-standard save behavior (e.g., throwing `DataIntegrityViolationException`) call `stubDefaultRepositories()` then override the save mock separately.

---

## Deferred Findings -- Rationale (2026-06-01)

### Won't Fix (Acceptable As-Is)

**1.11-1.14 (API naming):** Singular `/api/player` is semantically correct (it operates on "the current player"). PUT on collection, POST for location, POST returning 204 for associations are all defensible REST choices. Changing these would break all three clients for marginal consistency gain.

**5.18 (CI credentials):** E2E job is currently commented out. Credentials are test-only, not production.

**7.10 (500ms presence delay):** Pragmatic heuristic that works in practice. A proper solution would require STOMP broker subscription acknowledgment, which SockJS/Spring STOMP does not expose.

**11.11 (offline check-in UUID):** Local UUID serves only as a temporary correlation key. Server assigns the real ID on sync. No user-visible impact.

**12.6 (join code length):** 7-char join code with nginx 5r/m rate limiting makes brute force infeasible from a single IP. Distributed attacks require thousands of IPs for a meaningful chance.

**12.8 (actuator endpoints):** Blocked by nginx. Only reachable from internal network.

**12.9 (in-memory rate limiting):** Acceptable for current scale. Redis-backed limiting would be the upgrade path if needed.

### Too Large for Automated Session

**12.1 (HttpOnly cookie for refresh token):** Requires backend cookie-setting logic, CSRF protection, frontend auth flow rewrite, and mobile client updates. Estimated 2-3 days.

**12.2 (certificate pinning):** Requires pin rotation strategy, backup pins, and coordinated mobile releases. Infrastructure planning needed first.

**12.3 (broadcast code brute-force):** Already mitigated by nginx rate limiting (commit 0108475) and code widening to 10 chars (V57). Further hardening is a separate security task.

**8.6 (marker clustering):** Feature addition requiring MapLibre cluster source on all three platforms. Not a bug fix.

**8.7 (coordinate conventions):** Cross-component refactor touching map components on all platforms. Risk of introducing lat/lng swap bugs during migration.

**8.12 (offline tiles):** Feature requiring tile cache management on mobile. Significant storage and lifecycle complexity.

**2.13/2.14 (service extraction):** PlayerService (14 deps) and GameService (16 deps) are large but functional. Extraction risks breaking transactional boundaries. Better done as part of a dedicated architecture review.

**2.17/9.1-9.7 (missing tests):** Writing tests for untested services plus frontend/mobile component tests is weeks of work. Should be prioritized in a test coverage sprint.

**6.10 (AppNavigation.kt):** 2114-line composable needs decomposition into per-feature navigation graphs. Requires understanding the full Android navigation flow and testing on device.

---

## Prior Decisions

## Finding 6.16 -- Remaining contentDescription = null instances

**Decision:** Keep the 3 remaining `contentDescription = null` instances as-is.

**Alternatives considered:**
- Add content descriptions to all 3 icon instances
- Remove only standalone interactive icons' null descriptions

**Rationale:** The 3 remaining instances (in `PlayerGameplayScreens.kt` and `SetupHubScreen.kt`) are all decorative icons placed inside `Button` or `OutlinedButton` composables that already have `Text` children. Android TalkBack reads the button's text content, making an icon description redundant. Adding a description would cause screen readers to announce the icon separately, creating a worse experience (e.g., "Location, Check in at base" instead of just "Check in at base"). The original finding targeted 56 instances; the 53 that were standalone interactive icons have already been fixed.

## Finding 3.9 -- AppState god object tendency

**Decision:** No refactoring at this time.

**Alternatives considered:**
- Split AppState into domain-specific state holders (AuthState, GameState, SyncState, etc.)
- Extract extension files into separate @Observable classes composed by AppState

**Rationale:** AppState is the central observable in the iOS app. Splitting it would require changes to every SwiftUI view that accesses it via @Environment, plus careful coordination of cross-domain state (e.g., auth state affecting sync state). The current structure uses MARK sections and extension files for organization. The risk of introducing bugs during a split outweighs the maintainability benefit. This should be done as a dedicated, well-tested refactoring task with full iOS test coverage first.
