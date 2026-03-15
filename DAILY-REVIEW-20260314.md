# Daily Review - 2026-03-14

## Executive Summary

Ran all frontend tests (168 pass, 0 fail, up from 128), lint clean, build succeeds. Backend tests cannot run (Gradle download requires network). Added 40 new tests for the games API and submissions API modules. Fixed 4 code quality/performance issues (activity feed N+1 + unbounded query, broadcast code logging, blob URL memory leak, token refresh timeout). Added security headers to backend, color input validation, and error boundaries around monitoring pages. Comprehensive security and bug review across frontend and backend uncovered 28 findings.

---

## Phase 1: Run Tests and Fix Failures

**Frontend**: 18 test files, 168 tests -- all passing. Lint clean. Build succeeds.

**Backend**: Could not execute -- Gradle download fails due to no outbound network in the sandbox environment. No test failures to report.

---

## Phase 2: Improve Test Suite

### Added `games.test.ts` (33 tests)

Comprehensive tests for the games API module, covering:

- `isGameExportDto` type guard: 16 tests covering valid objects, null/undefined/string/number inputs, missing fields (exportVersion, game, bases, challenges, assignments), wrong types (non-string exportVersion, non-string game.name, non-array bases), and empty objects
- `gamesApi.create`: date transformation to ISO strings, null when dates not provided, passthrough of other fields
- `gamesApi.update`: date transformation, empty-string-to-null conversion (clearing dates), omission of unset fields, correct endpoint construction
- `gamesApi.updateStatus`: status and resetProgress parameters, default resetProgress=false
- Simple pass-through methods: list, getById, delete, addOperator, removeOperator, getOperators, exportGame, importGame

### Added `submissions.test.ts` (7 tests)

- `listByGame`: correct endpoint call
- `listByTeam`: client-side team filtering (match, no-match, empty results)
- `review`: sends feedback and points, handles optional fields, verifies unused `_reviewedBy` parameter is not sent to backend

---

## Phase 3: Work on TODOs

### Completed (updated in TODO file):

1. **Backend: Activity feed unbounded query + N+1** (`ActivityEventRepository.java` + `MonitoringService.java`)
   - Problem: `findByGameIdOrderByTimestampDesc()` loaded all activity events with no LIMIT, and every access to `game`, `team`, `base`, `challenge` triggered a lazy load (N+1 for each).
   - Fix: Added `findRecentByGameId()` with `JOIN FETCH` for all four relationships and `Pageable` parameter. MonitoringService now passes `PageRequest.of(0, 500)` to cap results. Deprecated the old unbounded method.

2. **Backend: Broadcast code generation logging** (`GameService.java`)
   - Problem: 10-attempt loop with no observability into collisions.
   - Fix: Added `log.debug` on each collision, `log.warn` when multiple attempts are needed, and `log.error` before throwing on exhaustion.

3. **Frontend: Error boundaries on monitoring pages** (`routes/index.tsx`)
   - Problem: A crash in any monitoring page (Dashboard, Map, Leaderboard, Activity, Submissions, TeamDetail) would propagate up and crash the entire game shell.
   - Fix: Wrapped each monitoring route element in an `<ErrorBoundary>` component that catches errors and shows a contained error message.

### Already resolved (removed from TODO):

- **N+1 in PlayerService.getProgress()**: Verified that `assignmentRepository.findByGameId()` already includes `LEFT JOIN FETCH a.base LEFT JOIN FETCH a.challenge`, so this was already fixed.

---

## Phase 4: Creative Codebase Review

### Security Fixes Implemented

1. **Backend: Missing security headers** (`SecurityConfig.java`) -- **HIGH severity, small effort**
   - Added `X-Frame-Options: DENY` (prevents clickjacking)
   - Added `X-Content-Type-Options: nosniff` (prevents MIME-sniffing attacks)
   - Added `Strict-Transport-Security: max-age=31536000; includeSubDomains` (forces HTTPS)

2. **Backend: Color input validation** (`TeamService.java`) -- **MEDIUM severity, small effort**
   - Added hex color pattern validation (`#[0-9a-fA-F]{6}`) on team color updates to prevent XSS via malformed color values.

3. **Frontend: Token refresh timeout + response validation** (`client.ts`) -- **HIGH severity, small effort**
   - Added 10-second timeout to the refresh token request to prevent indefinite hanging if the server is unresponsive.
   - Added validation that the refresh response contains both `accessToken` and `refreshToken` before storing them.
   - Updated existing test to expect the new timeout parameter.

4. **Frontend: Blob URL memory leak** (`SubmissionsPage.tsx`) -- **HIGH severity, small effort**
   - Added `URL.revokeObjectURL()` calls when evicting entries from the blob cache and when clearing the cache on game switch. Previously, evicted blob URLs were never revoked, causing a gradual memory leak.

### Security Findings (not implemented, for next run)

| Finding | Severity | Effort | File | Lines |
|---------|----------|--------|------|-------|
| Broadcast endpoints (`/api/broadcast/**`) are fully public -- exposes real-time game data to anyone who discovers a game code | Critical | Medium | SecurityConfig.java | 55 |
| WebSocket endpoint (`/ws/**`) permits unauthenticated connections | Critical | Medium | SecurityConfig.java | 56 |
| Player can switch teams by re-joining with a different join code (no restriction on team switching) | High | Small | PlayerService.java | 61-72 |
| `getSubmissionsByTeam()` has no authorization check -- any authenticated user could access any team's submissions | High | Small | SubmissionService.java | 54-59 |
| Host header used directly in invite email generation without validation | Medium | Small | InviteController.java | 40-45 |
| JWT `getUserIdFromToken` doesn't validate that `subject` claim exists (potential NPE) | Medium | Small | JwtTokenProvider.java | 88 |
| `SecurityUtils.getCurrentUser()` throws `IllegalStateException` instead of proper 401/403 | Low | Small | SecurityUtils.java | 12-27 |

### Frontend Findings (not implemented, for next run)

| Finding | Severity | Effort | File |
|---------|----------|--------|------|
| MapGL instance not explicitly cleaned up on unmount (WebGL context leak) | High | Small | MapPage.tsx |
| `openReview` callback in SubmissionsPage has stale closure on `challenges` | Medium | Small | SubmissionsPage.tsx |
| Geolocation `getCurrentPosition` has no timeout or cancellation on unmount | Medium | Small | MapPage.tsx |
| `fitBounds` call has no error handling; `fittedRef` set even on failure | Medium | Small | MapPage.tsx |
| Delete and create mutation race condition on assignments | Medium | Small | AssignmentsPage.tsx |
| No retry logic for 5xx API errors (server temporarily unavailable) | Medium | Medium | client.ts |
| Circular module dependency between client.ts and useAuth.ts | Medium | Medium | client.ts / useAuth.ts |

---

## Phase 5: Final Checks

Self-reviewed all changes from the lens of a code reviewer:

- **ActivityEventRepository Pageable + JOIN FETCH**: Confirmed that all joined entities (game, team, base, challenge) are `ManyToOne` relationships, so JOIN FETCH does not produce duplicate rows and Hibernate pagination works correctly at the database level (no HHH000104 warning). The deprecated old method has no other callers.
- **SecurityConfig headers**: Standard Spring Security header configuration. `contentTypeOptions` with empty lambda enables nosniff with defaults. HSTS includeSubDomains is appropriate since the app serves from `pointfinder.pt` and `pointfinder.ch`.
- **client.ts timeout**: 10 seconds is generous enough for slow connections but prevents indefinite hanging. The validation check is strict (both tokens must be truthy) which is correct since a response missing either token is malformed.
- **SubmissionsPage blob revocation**: `URL.revokeObjectURL()` is idempotent and safe to call on already-revoked URLs. The cleanup effect captures the Map reference before returning, which is correct since `blobCache.current` could be reassigned (though it isn't in practice since it's a ref).
- **TeamService color validation**: Pattern is compiled once as a static final, avoiding re-compilation overhead. Only applied to update path since create uses server-controlled `TEAM_COLORS` array.
- **Error boundaries**: Each monitoring page gets its own boundary, so a crash in one doesn't affect others. The existing `ErrorBoundary` component has a sensible default fallback message.
- **Test files**: All 40 new tests are deterministic (no timers, no real network calls), properly mock `apiClient`, and clean up mocks between tests via `vi.clearAllMocks()` in `beforeEach`.

All 168 tests pass, lint is clean, build succeeds.

---

## Creative Corner

1. **Game replay mode**: Record all WebSocket events during a live game and allow operators to "replay" the game afterward with a timeline scrubber. Useful for post-game analysis, training, and showcasing to sponsors. Implementation: store events in a time-indexed table, add a `/replay` endpoint that streams events at configurable speed.

2. **Operator delegation via QR codes**: Generate a time-limited QR code that grants temporary operator access to a specific game. Useful for scouting events where parent volunteers need to help monitor without creating full accounts. Could use a short-lived JWT embedded in the QR with game-scoped permissions.

3. **Challenge difficulty auto-tuning**: Track completion rates per challenge across games and surface a "difficulty score" to operators when building new games. Over time, build a recommendation engine that suggests balanced challenge distributions based on team size and age group. Data is already available in submissions -- just needs aggregation across games.

---

## Next Run

Items to pick up next time:

- **Backend tests**: Still need a cached Gradle distribution or network access to run backend tests.
- **Broadcast endpoint security**: The `/api/broadcast/**` and `/ws/**` endpoints being fully public is a critical finding. Add authentication or at least broadcast-code-based authorization to prevent unauthorized access to live game data.
- **Player team switching**: Add a guard to prevent players from switching teams mid-game by re-joining with a different join code.
- **Missing authorization on getSubmissionsByTeam**: Add game access check before returning team submissions.
- **MapGL cleanup**: Add explicit map instance removal on unmount to prevent WebGL context leaks.
- **Host header validation**: Validate the Host header against configured allowed hosts before using it in invite emails.
- **5xx retry logic**: Add exponential backoff for server errors in the API client.
- **Submission review optimistic locking**: Add `@Version` annotation to Submission entity for true concurrent access protection.
