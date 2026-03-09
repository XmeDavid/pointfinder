# Daily Review - 2026-03-09

## Executive Summary

Ran frontend lint and all 107 tests (88 original + 19 new). Backend and E2E tests could not run due to missing Docker, Java 21, and Gradle network access. Added 19 new frontend tests covering the API client token refresh logic and the toast notification store. Localized 15 hardcoded English strings in the RichTextEditor toolbar. Performed a deep review of both backend and frontend codebases, confirming most of yesterday's HIGH-severity backend findings are already properly handled.

## Phase 1: Run Tests and Fix Failures

**Frontend (web-admin):**
- Lint: PASS (0 errors, 0 warnings)
- Vitest: 88/88 tests PASS across 10 test files (pre-changes)
- Build: PASS (2154 modules transformed; dist/ cleanup fails due to sandbox EPERM, not a code issue)

**Backend:**
- Could not run: Java 11 installed, project requires Java 21. Gradle wrapper not cached and no network access to download gradle-8.13-bin.zip.

**E2E:**
- Could not run: No .env file configured. No Docker available for local stack.

**No failures found in the runnable test suites.**

## Phase 2: Improve the Test Suite

**Added 19 new tests across 2 files (+22% test count, from 88 to 107):**

1. `web-admin/src/lib/api/client.test.ts` (NEW, 8 tests)
   - Returns access token when already present in store
   - Returns null when not authenticated and no refresh token
   - Returns null when isAuthenticated is false even with refresh token
   - Refreshes token when access token is null but authenticated with refresh token
   - Returns null when refresh fails
   - Deduplicates concurrent refresh calls (only one network request)
   - Allows a new refresh after the previous one completes
   - Clears refresh promise after failed refresh so retries work

2. `web-admin/src/hooks/useToast.test.ts` (NEW, 11 tests)
   - Starts with no toasts
   - Adds toast with default variant "info"
   - Adds toast with specified variant
   - Supports success variant
   - Generates unique IDs for each toast
   - Removes a toast by id
   - removeToast is a no-op for non-existent id
   - Auto-removes toast after 4 seconds (fake timers)
   - Auto-removes only the specific toast, not others
   - Handles multiple concurrent toasts
   - Manual remove before auto-remove does not cause errors

**Rationale:** The API client's token refresh deduplication is the most critical untested infrastructure in the codebase. A bug there would cause all authenticated users to experience broken sessions. The toast store is used across every mutation flow and its timer-based auto-dismiss logic warranted coverage.

## Phase 3: Work on TODOs

**Localized RichTextEditor toolbar (15 hardcoded English strings)**

The RichTextEditor had 15 tooltip strings hardcoded in English: Bold, Italic, Heading 1-3, Bullet List, Ordered List, Blockquote, Code Block, Upload Image, Image from URL, Insert Variable, Undo, Redo.

Changes:
- Added `editor` section to all three locale files (en.json, pt.json, de.json) with 14 keys
- Updated RichTextEditor.tsx to use `t("editor.*")` calls instead of hardcoded strings
- Portuguese translations: Negrito, Italico, Titulo 1-3, Lista, Lista Numerada, Citacao, Bloco de Codigo, Carregar Imagem, Imagem por URL, Inserir Variavel, Desfazer, Refazer
- German translations: Fett, Kursiv, Uberschrift 1-3, Aufzahlung, Nummerierte Liste, Zitat, Codeblock, Bild hochladen, Bild von URL, Variable einfugen, Ruckgangig, Wiederholen

## Phase 4: Creative Codebase Review

### Backend Findings Update

Re-reviewed all 8 backend findings from yesterday's report. Key conclusion: **most HIGH-severity issues from yesterday were false positives or already fixed.**

| # | Issue | File | Severity | Yesterday's Status | Today's Status |
|---|-------|------|----------|-------------------|---------------|
| 1 | Deleted user JWT auth bypass | JwtAuthenticationFilter.java:51-60 | HIGH | Open | Working correctly -- returns 401 and stops chain |
| 2 | N+1 in computeProgress() | MonitoringService.java:122-199 | HIGH | Open | No issue -- uses JOIN FETCH in query |
| 3 | Race condition in submission idempotency | SubmissionService.java:65-141 | MEDIUM | Open | Properly handled via double-check + catch pattern |
| 4 | Unbounded queries in BroadcastService | BroadcastService.java:27-65 | MEDIUM | Open | Still present -- needs query limits |
| 5 | Missing cascade delete protection | BaseService/ChallengeService | MEDIUM | Open | Needs verification with backend tests |
| 6 | Null pointer risk in leaderboard | MonitoringService.java:80-82 | MEDIUM | Open | Low risk -- challenge always non-null on valid assignment |
| 7 | NaN/Infinity location validation | PlayerService.java:448-452 | LOW | Open | Already implemented with Double.isFinite() |
| 8 | Missing transaction timeout on submitAnswer | PlayerService.java:373 | LOW | Open | Already configured (10s timeout) |

### New Backend Findings

| # | Issue | File | Severity | Effort |
|---|-------|------|----------|--------|
| 1 | CORS allows all headers with credentials | SecurityConfig.java:72 | MEDIUM | Small |
| 2 | No team-level auth check on location data | MonitoringService.java:207-218 | MEDIUM | Medium |
| 3 | Integer overflow risk in points summation | MonitoringService.java:81-83 | LOW | Small |

### Frontend Findings

| # | Issue | File | Severity | Effort |
|---|-------|------|----------|--------|
| 1 | Excessive cache invalidation on WebSocket events | useGameWebSocket.ts:27-54 | MEDIUM | Small |
| 2 | Same pattern in useBroadcastWebSocket | useBroadcastWebSocket.ts:32-58 | MEDIUM | Small |
| 3 | Missing error boundary for lazy RichTextEditor | ChallengesPage.tsx:265 | LOW | Medium |
| 4 | Stale closure in RichTextEditor suggestions | RichTextEditor.tsx:114-140 | -- | FIXED (useLayoutEffect) |

### Mutation Toast Audit

Audited all 25 useMutation calls across the frontend. 10 have complete toast coverage (both success and error). The remaining 15 use inline Alert components for error display, which is a deliberate UX pattern for forms where errors need to remain visible until resolved. No critical gap found.

## Creative Corner

1. **WebSocket event batching with requestAnimationFrame**: The current useGameWebSocket invalidates up to 5 React Query keys per event, which can cause cascade re-renders when rapid events arrive. Wrapping the invalidation in a microtask queue that batches events arriving in the same animation frame would reduce the render count significantly. Something like: collect all query keys to invalidate over a 16ms window, then invalidate them all at once. This is especially impactful during high-activity periods when multiple teams submit simultaneously.

2. **Game template library**: Operators currently create games from scratch or import/export JSON files. A built-in template library with common game structures (scavenger hunt, relay race, quiz challenge) would dramatically speed up game creation. Templates could be stored as GameExportDto objects with placeholder names. The import infrastructure already exists -- this just needs a UI for browsing and previewing templates.

3. **Submission photo comparison view**: When operators review image submissions, they currently see one submission at a time. A side-by-side comparison view showing all teams' submissions for the same challenge would make it much faster to assess quality and spot patterns. The SubmissionsPage already has a fullscreen media viewer -- extending it with a "compare by challenge" mode would be a natural UX enhancement.

## Next Run

- **Backend tests**: Still blocked by Java 21 / Gradle. Consider pre-installing Java 21 in the sandbox or caching the Gradle distribution.
- **E2E tests**: Still blocked by missing .env and Docker.
- **Backend fixes**: CORS header restriction (small, SecurityConfig.java). BroadcastService query limits (medium).
- **Frontend improvements**: Batch WebSocket cache invalidation (medium impact, small effort). Add error boundary around lazy RichTextEditor (small effort).
- **More test coverage**: Route guards (AuthGuard, GuestGuard), WebSocket hooks, API modules in lib/api/.
- **Localization**: Search for remaining hardcoded strings with `grep -rn '"[A-Z][a-z]' --include='*.tsx'` to find more.
