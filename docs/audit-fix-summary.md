# Audit Fix Summary

Summary of all findings from `full-codebase-audit-2026-03-21.md` and their resolution status.

Generated: 2026-05-11

---

## Already Fixed (prior to this run)

These findings were listed as unfixed in the audit but have since been resolved:

| # | Finding | Status |
|---|---------|--------|
| 1.19 | ChallengeResponse missing fixedBaseId | **Fixed** -- `fixedBaseId` field present in ChallengeResponse.java |
| 3.14 | iOS annotation view missing parent-child VC at call site | **Fixed** -- `configure(with:parentViewController:)` now passes `parentVC` at line 433 of MapLibreMapView.swift |
| 4.13 | Alt text hardcoded English on submission media | **Fixed** -- Uses `t('submissions.altFile', ...)` translation key |
| 10.9 | StringListJsonConverter returns null for empty JSON | **Fixed** -- Returns `Collections.emptyList()` for null/blank input |
| 10.11 | NotificationService treats null pushPlatform as iOS | **Fixed** -- Filters explicitly by `PushPlatform.ios` and `PushPlatform.android`; null-platform players excluded from both |
| 11.2 | Android checkForFailedActions never called | **Fixed** -- Called in AppNavigation.kt line 639 on player screen launch |
| 12.7 | AuthController uses Host header instead of X-Forwarded-Host | **Fixed** -- Both `requestRegistration` and `forgotPassword` use `X-Forwarded-Host` with `Host` fallback |
| 12.10 | No Content-Disposition header on file serving | **Fixed** -- `serveFile()` sets `Content-Disposition: inline` with sanitized filename |

## Fixed in this run

| # | Finding | What was done | Decision? |
|---|---------|---------------|-----------|
| 6.16 | 47 instances of `contentDescription = null` across Android feature files | Added content descriptions to 12 standalone/interactive icons; left 35 decorative icons with null (correct per accessibility guidelines). Added 12 new string resources to both EN and DE strings.xml files. | Yes -- see `audit-decisions.md` |

### Files modified for 6.16:
- `android-app/core/i18n/src/main/res/values/strings.xml` (12 new strings)
- `android-app/core/i18n/src/main/res/values-de/strings.xml` (12 new strings)
- `android-app/feature/player/.../PlayerMapScreen.kt`
- `android-app/feature/player/.../PlayerGameplayScreens.kt`
- `android-app/feature/player/.../PlayerNotificationListScreen.kt`
- `android-app/feature/operator/.../SetupHubScreen.kt`
- `android-app/feature/operator/.../ActivityLogScreen.kt`
- `android-app/feature/operator/.../StagesListScreen.kt`
- `android-app/feature/operator/.../OperatorSubmissionsScreen.kt`
- `android-app/app/.../navigation/AppNavigation.kt`

## Noted (no code change needed)

| # | Finding | Notes |
|---|---------|-------|
| 3.5 | MobileRealtimeClient receive loop | Audit states "actually fine due to optional chaining" -- no change needed |
| 3.9 | AppState god object (~700 lines) | Architectural concern; documented for future refactoring |

## Acknowledged Deferrals

These findings were explicitly deferred in the audit with documented justification:

| # | Finding | Deferral reason |
|---|---------|----------------|
| 1.11 | `/api/player` singular naming | Semantically justified; documented |
| 1.12 | PUT on collection without ID | Correct for bulk-set semantics |
| 1.13 | POST for location update | Acceptable; idempotent behavior documented |
| 1.14 | POST returns 204 for association | Acceptable; documented |
| 2.13 | PlayerService 14 dependencies | Partial extraction done; future refactor |
| 2.14 | GameService 16 dependencies | Documented for future refactoring |
| 2.16 | No spring.datasource.url in main yml | Documented in application.yml comments |
| 2.17 | Test coverage gaps (5 services) | Tests to be written separately |
| 2.18 | DTOs could be records | Large refactor; deferred |
| 2.19 | Enums could use sealed interfaces | Deferred to dedicated task |
| 4.1 | MapPage.tsx oversized (567 lines) | Large component extraction deferred |
| 4.2 | ChallengesPage.tsx oversized (510 lines) | Large component extraction deferred |
| 5.6 | No database backup strategy | Operational concern; documented |
| 5.11 | SPA fallback uses `__spa.html` | Documented in nginx.conf comments |
| 5.16 | `__spa.html` naming undocumented | Covered by 5.11 |
| 5.18 | E2E hardcoded credentials | Test-only; documented |
| 5.19 | No resource limits on test containers | Not production concern |
| 6.10 | AppNavigation.kt 1614 lines | Extraction deferred to dedicated refactor |
| 7.10 | 500ms arbitrary presence delay | Pragmatic heuristic; commented |
| 8.6 | No marker clustering | Significant feature; deferred |
| 8.7 | Inconsistent coordinate conventions | Cross-component refactor needed |
| 8.10 | Tile source URL inconsistency | Requires mobile config refactor |
| 8.11 | getAggregateStatus O(n*m) | Better implementation exists in BroadcastMap |
| 8.12 | No offline map tile caching | Significant feature; deferred |
| 8.13 | LocationService timer race | Actually handled correctly; clarified |
| 9.1 | Backend test coverage gaps | Test writing deferred |
| 9.2 | Zero frontend component tests | Deferred to separate task |
| 9.3 | Zero Android ViewModel tests | Deferred to separate task |
| 9.4 | Zero Android instrumentation tests | Maestro E2E provides coverage |
| 9.5 | MobileRealtimeClient test gaps | Deferred |
| 9.6 | Zero iOS View/ViewModel tests | Deferred to separate task |
| 9.7 | E2E parity gaps | Documented |
| 9.8 | ReflectionTestUtils usage | Documented for future refactor |
| 9.9 | SubmissionServiceTest duplication | Deferred to separate task |
| 10.10 | Player.pushPlatform default ios | Removed; field now nullable |
| 11.11 | Offline check-in local UUID | Reconciliation not needed |
| 12.1 | Refresh token in localStorage | Requires backend API changes |
| 12.2 | No certificate pinning | Requires infrastructure planning |
| 12.3 | Broadcast code brute-forceable | Requires rate limiting |
| 12.6 | Player join code only 7 chars | Mitigated by nginx rate limiting |
| 12.8 | Actuator endpoints exposed | Blocked by nginx |
| 12.9 | Login rate limiting in-memory | Documented in code comments |
| 12.12 | E2E password in CI | Test-only |
