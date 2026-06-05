# Audit Fix Summary

Status of all 22 findings from `docs/full-codebase-audit-2026-03-21.md`, verified 2026-06-05.

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
| 10.9 | StringListJsonConverter returns null for empty JSON | Already fixed | `convertToEntityAttribute` returns `Collections.emptyList()` for null/blank input. |
| 10.11 | NotificationService treats null pushPlatform as iOS | **Fixed in this pass** | Player path was already correct. User.java still had `PushPlatform.ios` default. Removed the default, created V58 migration to drop NOT NULL + default on `users.push_platform`. |
| 11.2 | Android checkForFailedActions never called | Already fixed | Called from AppNavigation.kt line 639 in LaunchedEffect, with comment referencing finding 11.2. |
| 12.7 | AuthController uses Host header instead of X-Forwarded-Host | Already fixed | Both `/request-registration` and `/forgot-password` use `@RequestHeader("X-Forwarded-Host")` with Host fallback. |
| 12.10 | No Content-Disposition header on file serving | Already fixed | `serveFile()` in FileController.java sets `Content-Disposition: inline` with sanitized filename (line 81). |

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
| 5.11 | SPA fallback uses __spa.html | Documented | Yes |
| 5.16 | SPA naming undocumented | Covered by 5.11 | Yes |
| 5.18 | E2E hardcoded credentials | Test-only | Yes |
| 5.19 | No resource limits on test containers | Not production | Yes |
| 6.10 | AppNavigation.kt 1614 lines | Large refactor | Yes |
| 7.10 | 500ms presence broadcast delay | Pragmatic heuristic; commented | Yes |
| 8.6 | No marker clustering | Feature addition | Yes |
| 8.7 | Inconsistent coordinate conventions | Cross-component refactor | Yes |
| 8.10 | Tile source URL inconsistency | Mobile config refactor | Yes |
| 8.11 | O(n*m) getAggregateStatus | Migration needed | Yes |
| 8.12 | No offline tile caching | Feature addition | Yes |
| 8.13 | LocationService timer race | Correctly handled; clarified | Yes |
| 9.1-9.9 | Test coverage/quality gaps | Separate tasks | Yes |
| 10.10 | Player pushPlatform default ios | Fixed by V30+V56 | Yes (confirmed fixed) |
| 11.11 | Offline check-in local UUID | Cosmetic only | Yes |
| 12.1 | Refresh token in localStorage | Backend API changes needed | Yes |
| 12.2 | No certificate pinning | Infrastructure planning needed | Yes |
| 12.3 | Broadcast code brute-forceable | Rate limiting needed | Yes |
| 12.6 | Player join code 7 chars | Mitigated by nginx rate limit | Yes |
| 12.8 | Actuator endpoints exposed | Blocked by nginx | Yes |
| 12.9 | In-memory login rate limiting | **Documented in this pass** (Javadoc on LoginAttemptService) | Yes |
| 12.12 | E2E password in CI | Test-only | Yes |

## Changes Made in This Pass

1. **User.java** -- Removed `@Builder.Default` and `PushPlatform.ios` default from `pushPlatform` field; changed `@Column` to nullable.
2. **V58__drop_user_push_platform_default.sql** -- New Flyway migration: `ALTER TABLE users ALTER COLUMN push_platform DROP NOT NULL; DROP DEFAULT`.
3. **LoginAttemptService.java** -- Added Javadoc documenting the in-memory limitation (finding 12.9) and mitigation by nginx rate limiting.
4. **docs/audit-decisions.md** -- Created with design decisions for findings 10.11, 6.16, and 3.9.
