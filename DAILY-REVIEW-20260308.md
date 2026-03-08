# Daily Review - 2026-03-08

## Executive Summary

Ran frontend lint and all 81 tests (68 original + 13 new). Backend and E2E tests could not run due to missing Docker and Gradle network access in the sandbox environment. Added 13 new frontend tests, implemented toast notification feedback on 3 pages (Settings, Assignments, Notifications), fixed a WebSocket connection leak, and localized 5 hardcoded strings in the map popup.

## Phase 1: Run Tests and Fix Failures

**Frontend (web-admin):**
- Lint: PASS (0 errors, 0 warnings)
- Vitest: 68/68 tests PASS across 7 test files

**Backend:**
- Could not run: Gradle wrapper needs to download gradle-8.13-bin.zip but the sandbox has no outbound network access to services.gradle.org.

**E2E:**
- Could not run: No .env file configured (only .env.example present). No Docker available for local stack.

**No failures found in the runnable test suites.**

## Phase 2: Improve the Test Suite

**Added 13 new tests across 2 files (+19% test count):**

1. `web-admin/src/hooks/useGameLayout.test.ts` (NEW, 5 tests)
   - Default layout returns "classic" for unknown games
   - Set/get layout for a single game
   - Multiple games with different layouts
   - Overwrite layout for same game
   - Isolation between games when updating one

2. `web-admin/src/lib/utils.test.ts` (expanded, +8 tests)
   - Empty and whitespace-only input returns null
   - Midnight (00:00) parsing
   - End-of-day (23:59) parsing
   - Minute overflow (14:60) rejection
   - Leap year Feb 29 acceptance (2028)
   - Non-leap year Feb 29 rejection (2026)
   - Day 0 rejection
   - Month 0 rejection

**Commit:** `c06f9db` - test: add useGameLayout store tests and date parsing edge cases

## Phase 3: Work on TODOs

**Implemented: Toast notifications on save/important actions (web-admin)**

The TODO file listed "Toasts on Save buttons and other important actions, both platforms." This was partially implemented (4 pages had toasts, 10+ did not).

Changes:
- **SettingsPage**: Replaced custom inline "saved" text with toast. Added toasts to game status change and broadcast toggle.
- **AssignmentsPage**: Added success toasts for create and delete assignment operations.
- **NotificationsPage**: Added success toast after sending a notification.
- Added `notifications.sent` i18n key in EN ("Notification sent"), PT ("Notificacao enviada"), DE ("Benachrichtigung gesendet").

**Commit:** `05ddc2f` - feat: add toast notifications to Settings, Assignments, and Notifications pages

## Phase 4: Creative Codebase Review

### Fixes Implemented

1. **WebSocket connection leak** (HIGH severity, small effort)
   - Files: `useBroadcastWebSocket.ts`, `lib/api/websocket.ts`
   - The cleanup functions only called `deactivate()` when `client.active === true`. During the connecting phase, `active` is false but the underlying SockJS transport is still opening. Skipping `deactivate()` orphans the connection.
   - Fix: Always call `deactivate()` unconditionally.

2. **Hardcoded English strings in MapPicker** (LOW severity, small effort)
   - File: `components/common/MapPicker.tsx`
   - Five strings ("Hidden", "NFC linked", "NFC not linked", "Fixed: ...", "Edit Base") were hardcoded in English instead of using existing i18n keys.
   - Fix: Added `useTranslation()` hook and replaced with `t()` calls using existing `bases.*` keys.

**Commit:** `8c7ca53` - fix: WebSocket cleanup and localize MapPicker hardcoded strings

### Backend Findings (not fixed, require backend test environment)

| # | Issue | File | Severity | Effort |
|---|-------|------|----------|--------|
| 1 | Deleted user with valid JWT can still pass auth filter silently | JwtAuthenticationFilter.java:59 | HIGH | Small |
| 2 | Potential N+1 in MonitoringService.computeProgress() | MonitoringService.java:137-162 | HIGH | Small |
| 3 | Race condition in submission idempotency check | SubmissionService.java:57-138 | MEDIUM | Medium |
| 4 | Unbounded queries in BroadcastService.getBroadcastData() | BroadcastService.java:27-59 | MEDIUM | Medium |
| 5 | Missing cascade delete protection for bases/challenges with submissions | BaseService.java:160, ChallengeService.java:107 | MEDIUM | Medium |
| 6 | Null pointer risk in leaderboard if challenge is deleted | MonitoringService.java:80-82 | MEDIUM | Small |
| 7 | Missing NaN/Infinity validation for location coordinates | PlayerService.java:448-451 | LOW | Small |
| 8 | Missing transaction timeout on submitAnswer() | PlayerService.java:374 | LOW | Small |

### Frontend Findings (not fixed, require deeper refactoring)

| # | Issue | File | Severity | Effort |
|---|-------|------|----------|--------|
| 1 | Stale closure risk in RichTextEditor suggestion system | RichTextEditor.tsx:114-140 | HIGH | Medium |
| 2 | Missing onError callback in SubmissionsPage reviewMutation | SubmissionsPage.tsx:100-103 | HIGH | Small |
| 3 | Excessive cache invalidation on WebSocket events (5 keys per activity event) | useGameWebSocket.ts:19-52 | MEDIUM | Medium |
| 4 | Unprotected external image URL in RichTextEditor | RichTextEditor.tsx:221-233 | MEDIUM | Medium |
| 5 | Missing loading skeleton in BaseMapView | BasesPage.tsx:60-61 | MEDIUM | Small |

## Creative Corner

1. **Offline-first submission queue for mobile**: Both Android and iOS apps could benefit from a local queue that stores submissions when network is unavailable and syncs when connectivity returns. This would be valuable for scouting events in rural areas with poor signal. The backend already has idempotency keys, so replaying queued submissions would be safe.

2. **Real-time operator collaboration indicators**: When multiple operators are monitoring the same game, show presence indicators (like Google Docs cursors) so they know who is reviewing which submission. This prevents duplicate reviews and improves coordination. The WebSocket infrastructure is already in place -- just needs a new event type.

3. **Progressive image loading for submission photos**: Submission images are currently loaded at full resolution. Generating thumbnails on upload (e.g., 200px wide) and using them in list views would dramatically reduce bandwidth during monitoring, especially when operators are reviewing many submissions on mobile hotspots at events.

## Next Run

- **Backend tests**: Need Docker or Gradle with network access to run. Consider caching the Gradle distribution in the sandbox or pre-installing it.
- **E2E tests**: Need .env configuration and either Docker for local stack or access to the staging server.
- **Backend fixes**: The JwtAuthenticationFilter deleted-user issue (HIGH) and MonitoringService N+1 query (HIGH) should be prioritized.
- **Frontend fixes**: Add onError to SubmissionsPage reviewMutation (quick win). Address the RichTextEditor stale closure.
- **More toast coverage**: GameOperatorsPage, OverviewPage, TeamDetailPage, ReviewLayout, and CreateGamePage still lack success toasts.
- **Remaining hardcoded strings**: Search for other non-localized strings across the frontend.
