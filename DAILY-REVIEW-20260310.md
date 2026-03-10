# Daily Review - 2026-03-10

## Executive Summary

Ran frontend lint, build, and all 117 tests (107 existing + 10 new). Backend and E2E tests remain blocked by environment constraints (Java 11 vs required 21, no Docker). Added 10 new tests for AuthGuard and GuestGuard route guards. Added app-level ErrorBoundary, loading/error states to ActivityPage and LeaderboardPage, and memoized expensive sorting in SubmissionsPage. Performed deep code review of both backend and frontend, identifying 10 backend findings and 10 frontend findings.

## Phase 1: Run Tests and Fix Failures

**Frontend (web-admin):**

- Lint: PASS (0 errors, 0 warnings)
- Vitest: 107/107 tests PASS across 12 test files (pre-changes)
- Build: PASS (modules transformed successfully; dist/ cleanup fails due to sandbox EPERM, not a code issue)

**Backend:**

- Could not run: Java 11 installed, project requires Java 21. Gradle wrapper not cached.

**E2E:**

- Could not run: No .env file configured. No Docker available for local stack.

**No failures found in the runnable test suites.**

## Phase 2: Improve the Test Suite

**Added 10 new tests across 2 files (+9% test count, from 107 to 117):**

1. `web-admin/src/routes/AuthGuard.test.tsx` (NEW, 7 tests)
   - Shows loading spinner before store has hydrated
   - Redirects to /login when not authenticated and hydrated
   - Shows loading spinner while verifying session
   - Renders children when authenticated and session is valid
   - Calls handleAuthFailure when session verification fails
   - Verifies session by calling GET /games
   - Does not attempt session verification when not authenticated

2. `web-admin/src/routes/GuestGuard.test.tsx` (NEW, 3 tests)
   - Shows loading spinner before store has hydrated
   - Renders children when not authenticated and hydrated
   - Redirects to /games when authenticated

**Rationale:** The route guards are the authentication gateway for the entire app. AuthGuard verifies sessions server-side on every page load and handles the critical redirect-loop prevention between AuthGuard and GuestGuard. These were the highest-impact untested components identified in the previous review's "Next Run" section.

## Phase 3: Improvements (No Code TODOs Available)

The TODO file contains only feature requests and ops tasks, with no code-level items. Instead, implemented improvements identified in code review:

**1. App-level ErrorBoundary** (App.tsx, ErrorBoundary.tsx)

- Added `AppErrorFallback` component with a full-screen error message and reload button
- Wrapped the entire app (`QueryClientProvider` + `RouterProvider`) in an `ErrorBoundary`
- Previously, unhandled runtime errors would crash the app with a white screen; now users see a clear "Something went wrong" message with a reload button
- Also updated the default ErrorBoundary fallback message from editor-specific "Failed to load editor" to generic "Something went wrong"

**2. Loading/error states for ActivityPage** (ActivityPage.tsx)

- Added `isLoading` and `isError` destructuring from the activity query
- Shows skeleton loading placeholders while data is being fetched
- Shows an error alert if the query fails
- Previously, a failed query would silently show "No activity" which is misleading

**3. Loading/error states for LeaderboardPage** (LeaderboardPage.tsx)

- Added `isLoading` and `isError` destructuring from the leaderboard query
- Shows skeleton loading placeholders while data is being fetched
- Shows an error alert if the query fails
- Previously, a failed query would silently show "No scores yet" which is misleading

**4. Memoized sorting in SubmissionsPage** (SubmissionsPage.tsx)

- Wrapped `pendingCount` and `sorted` computations in `useMemo`
- Previously, every render re-sorted the entire submissions array and re-filtered for pending count
- Now only recomputes when `submissions` or `filter` change

## Phase 4: Creative Codebase Review

### Backend Findings (New)

Previous review's findings status update: the CORS issue (headers allowing all) and BroadcastService unbounded queries have both been resolved. CORS properly restricts to Authorization and Content-Type, and all BroadcastService queries use `.limit()`.

| # | Issue | File | Severity | Effort |
|---|-------|------|----------|--------|
| 1 | Integer overflow in ChunkedUploadService.expectedChunkSize -- `int` cast of `long` result | ChunkedUploadService.java:157-161 | HIGH | Small |
| 2 | Missing JOIN FETCH in getPlayerNotifications -- potential N+1 on sentBy access | PlayerController.java:185-196 | MEDIUM | Medium |
| 3 | Null pointer inconsistency in resolveAssignedChallenge -- returns null, some callers don't check | PlayerService.java:514-530 | MEDIUM | Small |
| 4 | No assembled file size validation in ChunkedUploadService -- corrupted uploads not detected | ChunkedUploadService.java:332-350 | MEDIUM | Medium |
| 5 | Race condition in joinTeam -- no unique constraint on (team_id, device_id) | PlayerService.java:50-102 | MEDIUM | Medium |
| 6 | Instant.EPOCH fallback for unseenNotificationCount -- first call returns all notifications ever | PlayerService.java:185-203 | LOW | Small |
| 7 | Missing index on (game_id, sent_at DESC) for game_notifications | V1__initial_schema.sql | LOW | Small |
| 8 | Silent failure in FileStorageService.deleteGameFiles -- catches IOException, only logs warning | FileStorageService.java:171-189 | LOW | Small |

### Frontend Findings (New)

| # | Issue | File | Severity | Effort | Status |
|---|-------|------|----------|--------|--------|
| 1 | Missing loading/error states in ActivityPage | ActivityPage.tsx:24-25 | LOW | Small | FIXED |
| 2 | Missing loading state in LeaderboardPage | LeaderboardPage.tsx:14 | LOW | Small | FIXED |
| 3 | No app-level ErrorBoundary | App.tsx | LOW | Small | FIXED |
| 4 | Unnecessary re-sort on every render in SubmissionsPage | SubmissionsPage.tsx:111-113 | LOW | Small | FIXED |
| 5 | Toast timeout not cancelled on manual remove | useToast.ts:21-26 | MEDIUM | Low | Open |
| 6 | Unused blobCache in SubmissionsPage | SubmissionsPage.tsx:76-79 | LOW | Small | Open |
| 7 | 30s interval in BroadcastMap regardless of visibility | BroadcastMap.tsx:92-96 | LOW | Low | Open |
| 8 | Race condition risk in SettingsPage dialog state management | SettingsPage.tsx:390-461 | LOW | Medium | Open |

## Creative Corner

1. **Operator annotation layer on the live map**: Allow operators to draw temporary annotations (circles, arrows, text labels) on the Leaflet map during a game to mark danger zones, route suggestions, or meeting points. These annotations would broadcast via WebSocket to all connected operators and optionally to teams via push notification. The existing WebSocket infrastructure and Leaflet map already support custom overlays -- this would add a drawing toolbar and a new `annotation` message type. Useful for scouting events where terrain conditions change mid-game (muddy path, closed area).

2. **Game replay timeline**: After a game ends, operators and teams would benefit from a visual timeline replay showing all events chronologically on the map. The activity feed data already contains timestamps and team/base references -- a slider-based timeline component that replays events on the Leaflet map (animating team markers moving between bases, showing submission pop-ups) would be a compelling post-game analysis tool. Could reuse the existing BroadcastMap component with a time-filtered data source.

3. **Challenge difficulty auto-calibration**: Track the approval rate and average completion time per challenge across multiple games. Surface this data to operators when they're creating new games so they can balance difficulty. Challenges that are always approved quickly might be too easy; ones that are frequently rejected might have unclear instructions. This metadata could be stored as aggregate stats on the Challenge entity and displayed in the challenge creation UI as a difficulty indicator.

## Next Run

- **Backend tests**: Still blocked by Java 21 / Gradle. Consider pre-installing Java 21 in the sandbox or caching the Gradle distribution.
- **E2E tests**: Still blocked by missing .env and Docker.
- **Backend fixes to implement**: ChunkedUploadService int overflow (HIGH, small effort), joinTeam unique constraint (MEDIUM), getPlayerNotifications JOIN FETCH (MEDIUM).
- **Frontend fixes to implement**: Toast timeout cleanup on manual remove, remove unused blobCache in SubmissionsPage.
- **More test coverage**: WebSocket hooks (useGameWebSocket, useBroadcastWebSocket), API modules (games, submissions, monitoring), useTheme store.
