# Audit Fix Summary

Summary of all findings from `docs/full-codebase-audit-2026-03-21.md` and their resolution status as of 2026-05-22.

## Overview

The audit documented 22 remaining findings (7 unfixed gaps + 15 acknowledged deferrals). Most non-deferred findings had already been fixed in the codebase since the audit was written (2026-03-21). Two findings required new fixes: 10.11 (push_platform DB default) and 6.16 (Android contentDescription accessibility). The 15 deferred findings remain as documented technical debt.

---

## Non-Deferred Findings (7)

| # | Finding | Status | Evidence |
|---|---------|--------|----------|
| 1.19 | ChallengeResponse missing fixedBaseId | ALREADY FIXED | `ChallengeResponse.java:40` has `private UUID fixedBaseId` |
| 3.5 | MobileRealtimeClient receive loop MainActor awareness | ALREADY FIXED | Comment at lines 120-128 of `MobileRealtimeClient.swift` explains serialization with "(Audit finding 3.5.)" |
| 3.9 | AppState.swift god object | DOCUMENTED | Doc comment at lines 7-16 acknowledges debt and outlines extraction plan. Decision in `audit-decisions.md`. |
| 3.14 | MapLibreMapView missing parent-child VC at call site | ALREADY FIXED | Line 433 now passes `parentViewController: parentVC` |
| 4.13 | Alt text hardcoded English on submission media | ALREADY FIXED | `SubmissionDetail.tsx:181,463,473` uses `t('submissions.altFile', ...)` translation key |
| 6.16 | 56 contentDescription = null in Android | FIXED (2026-05-22) | Fixed 31 of 34 remaining instances across 15 files. 3 truly decorative instances left as null. Decision in `audit-decisions.md`. |
| 10.9 | StringListJsonConverter returns null for empty JSON | ALREADY FIXED | `convertToEntityAttribute()` returns `Collections.emptyList()` for null/blank input |

---

## Priority Matrix Findings (cross-referenced)

| # | Finding | Status | Evidence |
|---|---------|--------|----------|
| 10.11 | NotificationService treats null pushPlatform as iOS | FIXED (2026-05-22) | NotificationService code was already correct, but DB column still had `DEFAULT 'ios'` from V2. Created V56 migration to drop the default. Decision in `audit-decisions.md`. |
| 11.2 | Android hides permanently failed sync (checkForFailedActions never called) | ALREADY FIXED | `AppNavigation.kt:639` calls `viewModel.checkForFailedActions(auth)`. Shows error via `solveError` state. |
| 12.7 | AuthController uses Host header instead of X-Forwarded-Host | ALREADY FIXED | Both `requestRegistration` (line 79) and `forgotPassword` (line 102) use `@RequestHeader("X-Forwarded-Host")` with Host fallback. |
| 12.10 | No Content-Disposition header on file serving | ALREADY FIXED | `FileController.java:81` sets `Content-Disposition: inline; filename="..."` with sanitized filename. |

---

## Deferred Findings (15)

These remain as documented technical debt with `[DEFERRED: ...]` annotations in the audit.

| # | Category | Finding | Deferral Reason |
|---|----------|---------|-----------------|
| 1.11 | API | `/api/player` singular naming | Semantically justified |
| 1.12 | API | PUT on collection without ID | Correct for bulk-set |
| 1.13 | API | POST for idempotent location update | Acceptable, documented |
| 1.14 | API | POST returns 204 for association | Acceptable, documented |
| 2.13 | Backend | PlayerService 14 dependencies | Partial extraction done; full refactor deferred |
| 2.14 | Backend | GameService 16 dependencies | Documented for future refactoring |
| 2.16 | Backend | No spring.datasource.url in application.yml | **NEW: Comment added to application.yml** |
| 2.17 | Backend | 5 services without tests | Test writing deferred |
| 2.18 | Backend | DTOs could be records | Large refactor deferred |
| 2.19 | Backend | Enums could use sealed interfaces | Deferred to dedicated task |
| 4.1 | Frontend | MapPage.tsx 567 lines | Large component extraction deferred |
| 4.2 | Frontend | ChallengesPage.tsx 510 lines | Large component extraction deferred |
| 5.6 | Infra | No database backup strategy | Operational concern, documented |
| 5.11 | Infra | SPA fallback uses __spa.html | Documented in nginx.conf |
| 5.16 | Infra | __spa.html naming undocumented | Covered by 5.11 |
| 5.18 | Infra | E2E hardcoded credentials | Test-only, not production |
| 5.19 | Infra | No resource limits on test containers | Not production concern |
| 6.10 | Android | AppNavigation.kt 1614 lines | Massive refactor deferred |
| 7.10 | Realtime | 500ms presence broadcast delay | Pragmatic heuristic, commented |
| 8.6 | Map | No marker clustering | Significant feature addition |
| 8.7 | Map | Inconsistent coordinate conventions | Cross-component refactor |
| 8.10 | Map | Tile source URL inconsistency | Mobile config refactor |
| 8.11 | Map | O(n*m) getAggregateStatus | Migration to BroadcastMap impl |
| 8.12 | Map | No offline tile caching | Significant feature |
| 8.13 | Map | LocationService timer race | Actually handled correctly |
| 9.1 | Tests | 5 backend services untested | Test writing deferred |
| 9.2 | Tests | Zero frontend component tests | Deferred |
| 9.3 | Tests | Zero Android ViewModel tests | Deferred |
| 9.4 | Tests | Zero Android instrumentation tests | Maestro E2E mitigates |
| 9.5 | Tests | MobileRealtimeClient test gaps | Deferred |
| 9.6 | Tests | Zero iOS View/ViewModel tests | Deferred |
| 9.7 | Tests | E2E parity gaps | Documented |
| 9.8 | Tests | ChunkedUploadServiceTest uses ReflectionTestUtils | Deferred |
| 9.9 | Tests | SubmissionServiceTest duplicate mock setup | Deferred |
| 10.10 | Data | Player pushPlatform defaults to ios | Fixed (nullable, no default) |
| 11.11 | UX | Offline check-in UUID not reconciled | Cosmetic only |
| 12.1 | Security | Refresh token in localStorage | Requires backend API changes |
| 12.2 | Security | No certificate pinning | Infrastructure planning needed |
| 12.3 | Security | Broadcast code brute-forceable | Rate limiting needed |
| 12.6 | Security | Player join code only 7 chars | Mitigated by nginx rate limit |
| 12.8 | Security | Actuator endpoints exposed | Blocked by nginx |
| 12.9 | Security | In-memory rate limiting | Documented limitation |
| 12.12 | Security | E2E password in CI | Test-only |

---

## Changes Made (2026-05-22 session)

1. **`backend/src/main/resources/db/migration/V56__drop_push_platform_default.sql`** -- New Flyway migration to drop `DEFAULT 'ios'` from players.push_platform column (finding 10.11).
2. **31 Android files** -- Added contentDescription strings to interactive Icon composables across 15 feature files (finding 6.16).
3. **`docs/audit-decisions.md`** -- Updated with decisions for findings 10.11 and 6.16.
4. **`docs/audit-fix-summary.md`** -- Updated this file.

### Previous session changes (2026-05-21)

1. **`backend/src/main/resources/application.yml`** -- Added comment block documenting datasource config requirement (finding 2.16).
2. **`docs/audit-decisions.md`** -- Created with initial decisions.
3. **`docs/audit-fix-summary.md`** -- Created.
