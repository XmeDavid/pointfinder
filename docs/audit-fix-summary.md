# Audit Fix Summary

Status of all 22 findings from `docs/full-codebase-audit-2026-03-21.md`, verified 2026-06-08 (updated from 2026-06-05).

## Key Discovery

Most "unfixed" findings (7 of 7) were already resolved in post-audit commits (the post-pilot reliability workstream, 2026-04-01 to 2026-04-08). One residual issue on the User entity was found and fixed in this pass.

---

## Unfixed Findings (originally 7)

| # | Finding | Status | Action Taken |
|---|---------|--------|--------------|
| 1.19 | ChallengeResponse missing fixedBaseId | Already fixed | Field exists in DTO (line 40) and is mapped in ChallengeService (line 292). No action needed. |
| 3.5 | MobileRealtimeClient receive loop MainActor awareness | Already fixed | Comment documenting MainActor serialization exists at lines 120-128 of MobileRealtimeClient.swift, referencing audit finding 3.5. |
| 3.9 | AppState God Object (~700 lines) | Partially addressed | Split into 5 files (AppState.swift + 4 extensions). Main file is 256 lines. Tech-debt comment at lines 7-16. See audit-decisions.md. |
| 3.14 | MapLibreMapView missing parent-child VC at call site | Already fixed | Line 433 now calls `configure(with: item.view, parentViewController: parentVC)`. |
| 4.13 | Alt text hardcoded English in SubmissionsPage/ReviewLayout | Already fixed | Both files were restructured. Current code in SubmissionDetail.tsx uses `t('submissions.altFile', ...)` i18n keys. |
| 6.16 | 56 instances of contentDescription = null | Mostly fixed | Reduced to 3 instances, all in decorative icons within labeled Buttons (correct per Compose a11y guidelines). See audit-decisions.md. |
| 10.9 | StringListJsonConverter returns null for empty JSON | **Fixed in this pass (2026-07-01)** | Added null guard after Jackson deserialization to handle JSON literal `null`. |
| 10.11 | NotificationService treats null pushPlatform as iOS | **Fixed** | Player path was already correct (null drops from both lists). User.java default fixed in prior pass. Warning log added 2026-07-02 for observability when players have null pushPlatform. |
| 11.2 | Android checkForFailedActions never called | **Fixed** | checkForFailedActions was already called. 2026-07-02: added reactive failedCountFlow to DAO/Repository/ViewModel and visible warning on CheckInScreen (matching iOS's red warning triangle). |
| 12.7 | AuthController uses Host header instead of X-Forwarded-Host | **Fixed** | 2026-07-02: Removed Host header fallback from AuthController, UserController, InviteController, OrganizationController. Only X-Forwarded-Host used; null falls back to configured app.frontend-url via EmailService. See audit-decisions.md. |
| 12.10 | No Content-Disposition header on file serving | **Fixed in this pass (2026-07-01)** | Local path was already fixed. S3 presigned URL path now includes `responseContentDisposition` override via `generatePresignedUrl(key, filename)`. |

## Deferred Findings (15) -- Verification Status

| # | Finding | Deferral Reason | Verified Still Deferred |
|---|---------|-----------------|------------------------|
| 1.11 | /api/player singular naming | Semantically justified | Yes |
| 1.12 | PUT on collection without ID | Correct for bulk-set | Yes |
| 1.13 | POST for location update | Acceptable | Yes |
| 1.14 | POST returns 204 for association | Acceptable | Yes |
| 2.13 | PlayerService 14 dependencies | Large refactor | Yes |
| 2.14 | GameService 16 dependencies | Large refactor | Yes |
| 2.16 | No spring.datasource.url in application.yml | Documented | Yes |
| 2.17 | Missing tests for 5 services | Separate task | Yes |
| 2.18 | DTOs could be records | Large refactor | Yes |
| 2.19 | Sealed interfaces for enums | Large refactor | Yes |
| 4.1 | MapPage 567 lines | Large refactor | Yes |
| 4.2 | ChallengesPage 510 lines | Large refactor | Yes |
| 5.6 | No database backup strategy | Operational | Yes |
| 5.11 | SPA fallback uses __spa.html | No longer applicable | **Resolved** -- nginx.conf now uses standard `index.html`; `__spa.html` no longer exists |
| 5.16 | SPA naming undocumented | No longer applicable | **Resolved** -- covered by 5.11 resolution |
| 5.18 | E2E hardcoded credentials | Test-only; job disabled | **Mitigated** -- E2E CI job is commented out |
| 5.19 | No resource limits on test containers | Not production | Yes |
| 6.10 | AppNavigation.kt 1614 lines | Large refactor | Yes |
| 7.10 | 500ms presence broadcast delay | Pragmatic heuristic; commented | Yes |
| 8.6 | No marker clustering | Partially resolved | **iOS fixed** -- MapLibreMapView.swift has GeoJSON cluster layers (circle + count). Web and Android still pending. |
| 8.7 | Inconsistent coordinate conventions | Cross-component refactor | Yes |
| 8.10 | Tile source URL inconsistency | Mobile config refactor | Yes |
| 8.11 | O(n*m) getAggregateStatus | **Resolved** | Refactored to use Map-indexed progressIndex; now O(teams_per_base) per call |
| 8.12 | No offline tile caching | Feature addition | Yes |
| 8.13 | LocationService timer race | Correctly handled; clarified | Yes |
| 9.1-9.7 | Test coverage gaps | Separate tasks | Yes |
| 9.8 | ChunkedUploadServiceTest ReflectionTestUtils | **Resolved** | No longer uses ReflectionTestUtils; uses proper Mockito setup |
| 9.9 | SubmissionServiceTest helper extraction | Separate task | Yes |
| 10.10 | Player pushPlatform default ios | Fixed by V30+V56 | Yes (confirmed fixed) |
| 11.11 | Offline check-in local UUID | Cosmetic only | Yes |
| 12.1 | Refresh token in localStorage | Backend API changes needed | Yes |
| 12.2 | No certificate pinning | Infrastructure planning needed | Yes |
| 12.3 | Broadcast code brute-forceable | **Mitigated** | **Resolved** -- nginx.conf has `broadcast_limit` zone (10r/m per IP, burst=5) on `/api/broadcast/` endpoints |
| 12.6 | Player join code 7 chars | Mitigated by nginx rate limit | Yes |
| 12.8 | Actuator endpoints exposed | Blocked by nginx | Yes |
| 12.9 | In-memory login rate limiting | **Documented in this pass** (Javadoc on LoginAttemptService) | Yes |
| 12.12 | E2E password in CI | Test-only | Yes |

## Changes Made (2026-06-05 pass)

1. **User.java** -- Removed `@Builder.Default` and `PushPlatform.ios` default from `pushPlatform` field; changed `@Column` to nullable.
2. **V58__drop_user_push_platform_default.sql** -- New Flyway migration: `ALTER TABLE users ALTER COLUMN push_platform DROP NOT NULL; DROP DEFAULT`.
3. **LoginAttemptService.java** -- Added Javadoc documenting the in-memory limitation (finding 12.9) and mitigation by nginx rate limiting.
4. **docs/audit-decisions.md** -- Created with design decisions for findings 10.11, 6.16, and 3.9.

## Changes Made (2026-06-08 verification pass)

1. **docs/audit-fix-summary.md** -- Updated deferred findings table with corrected statuses:
   - 5.11/5.16: Marked resolved (nginx no longer uses __spa.html)
   - 8.6: Updated to reflect iOS clustering implementation
   - 9.8: Marked resolved (ReflectionTestUtils no longer used)
   - 12.3: Marked mitigated (nginx broadcast_limit zone at 10r/m)
   - 5.18: Marked mitigated (CI job disabled)
2. **BroadcastController.java** -- Added comment documenting nginx rate limiting for the unauthenticated endpoint (finding 12.3).
3. **web-admin/src/lib/auth/store.ts** -- Added security comment documenting the localStorage XSS risk, current mitigations, and deferred HttpOnly cookie migration (finding 12.1).
4. **docs/audit-decisions.md** -- Added decision for finding 12.3 broadcast code mitigation approach.
5. Updated deferred findings table: 8.11 marked resolved (getAggregateStatus refactored to Map-indexed lookup).

## Changes Made (2026-07-01 pass)

1. **StringListJsonConverter.java** -- Added null guard after Jackson deserialization in `convertToEntityAttribute` so JSON literal `null` returns `Collections.emptyList()` instead of Java null (finding 10.9).
2. **ObjectStorageService.java** -- Added `generatePresignedUrl(key, filename)` overload that sets `responseContentDisposition` on the S3 presigned URL (finding 12.10).
3. **FileController.java** -- Updated `serveFile()` to pass filename to `generatePresignedUrl` so S3-served files include `Content-Disposition` header.
4. **docs/audit-decisions.md** -- Added decision for finding 10.9 (StringListJsonConverter null safety approach).

## Changes Made (2026-07-02 pass)

1. **NotificationService.java** -- Added warning log when players with null pushPlatform are silently dropped from push delivery (finding 10.11).
2. **AuthController.java** -- Removed Host header fallback; only uses X-Forwarded-Host. Removed HttpServletRequest parameter (finding 12.7).
3. **UserController.java** -- Same Host header fix as AuthController (finding 12.7).
4. **InviteController.java** -- Same Host header fix as AuthController (finding 12.7).
5. **OrganizationController.java** -- Same Host header fix as AuthController (finding 12.7).
6. **CompanionDatabase.kt** -- Added `failedCountFlow()` DAO query for reactive permanently-failed count (finding 11.2).
7. **PlayerRepository.kt** -- Exposed `failedCountFlow()` from DAO (finding 11.2).
8. **AppSessionViewModel.kt** -- Added `failedActionsCount` to state and observer (finding 11.2).
9. **AppNavigation.kt** -- Plumbed `failedActionsCount` through PlayerRootScreen to CheckInScreen (finding 11.2).
10. **PlayerGameplayScreens.kt** -- Added `failedActionsCount` parameter and red warning row with Warning icon on CheckInScreen (finding 11.2).
11. **strings.xml (en/pt/de)** -- Added `label_failed_sync_count` and `label_failed_sync_warning` string resources (finding 11.2).
12. **docs/audit-decisions.md** -- Added decisions for findings 12.7 and 11.2.
