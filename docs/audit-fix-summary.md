# Audit Fix Summary

> Generated 2026-05-24, updated 2026-06-01. Verification pass against `docs/full-codebase-audit-2026-03-21.md`.

All 22 remaining findings from the March 2026 audit have been verified. Every actionable finding has been addressed. This document records the current status of each finding.

---

## Non-Deferred Findings (Previously Listed as Unfixed)

### 1.19 -- ChallengeResponse missing fixedBaseId field
**Status: FIXED (prior commit)**
`ChallengeResponse.java` now includes `private UUID fixedBaseId` (line 40). The `ChallengeService.toResponse()` method queries `baseRepository.findByFixedChallengeId()` and populates the field (lines 273-274, 292).

### 3.5 -- MobileRealtimeClient receive loop MainActor awareness
**Status: ADDRESSED (prior commit)**
Comments added to `MobileRealtimeClient.swift` (lines 120-126) explaining that the detached Task hops back to MainActor for every `self?.` access, so state mutations are serialized. No data-race concern.

### 3.9 -- AppState god object tendency
**Status: ACKNOWLEDGED**
`AppState.swift` remains ~700 lines across extension files. This is a design observation, not a bug. The class is `@MainActor @Observable` and organized by MARK sections. Splitting it would require rearchitecting the iOS app's state management. No action taken; the finding is observational.

### 3.14 -- iOS annotation view missing parent-child VC relationship at call site
**Status: FIXED (prior commit)**
`MapLibreMapView.swift` line 433 now calls `swiftUIView.configure(with: item.view, parentViewController: parentVC)` with the parent view controller, ensuring correct lifecycle events for Dynamic Type and dark mode transitions.

### 4.13 -- Alt text hardcoded in English on submission media
**Status: FIXED (prior commit + 2026-05-27)**
All `alt` attributes in `SubmissionDetail.tsx` use `t('submissions.altFile', { index: ... })` with the i18n translation function. A remaining hardcoded English alt text in `TeamDetail.tsx` (`alt="QR code for ${team.joinCode}"`) was fixed on 2026-05-27 to use `t('teams.qrCodeAlt', { code: team.joinCode })`. Translation keys added to all three locale files (en.json: "QR code for {{code}}", pt.json: "Codigo QR para {{code}}", de.json: "QR-Code fur {{code}}").

### 6.16 -- 56 instances of contentDescription = null
**Status: FIXED (prior commit), 3 correct instances remain**
Reduced from 56 instances across 20 files to 3 instances in 2 files. The remaining 3 are decorative icons inside buttons that already have text labels (LocationOn in "Check in at base" button, Settings in "Open NFC settings" button, PlayArrow in "Go live" button). Per Android accessibility guidelines, `contentDescription = null` is correct for decorative icons inside labeled composables.

### 10.9 -- StringListJsonConverter returns null instead of empty list
**Status: FIXED (prior commit)**
`convertToEntityAttribute()` returns `Collections.emptyList()` for null or blank DB data (line 32). The round-trip is: empty list -> null in DB -> empty list on read. Consistent and safe.

### 10.11 -- Null pushPlatform treated as iOS
**Status: FIXED (prior commit)**
`NotificationService.java` filters players by `p.getPushPlatform() == PushPlatform.ios` and `== PushPlatform.android` (lines 97, 102). Null pushPlatform fails both comparisons, so players without a platform set receive neither APNs nor FCM pushes. Test `createNotificationSkipsPushForNullPlatform` confirms this behavior. Flyway V56 drops the legacy DEFAULT 'ios' from the push_platform column.

### 11.2 -- Android permanently failed sync actions silently hidden
**Status: FIXED (prior commit)**
`AppNavigation.kt` line 639 calls `viewModel.checkForFailedActions(auth)` on player home entry. `PlayerViewModel.checkForFailedActions()` checks for permanently failed actions and exposes a warning state.

### 12.7 -- AuthController uses Host header instead of X-Forwarded-Host
**Status: FIXED (prior commit)**
Both `/request-registration` and `/forgot-password` endpoints now use `@RequestHeader(value = "X-Forwarded-Host", required = false)` with Host header fallback. Comments explain the rationale.

### 12.10 -- No Content-Disposition header on file serving
**Status: FIXED (prior commit)**
`FileController.java` sets `Content-Disposition: inline; filename="..."` with a sanitized filename that strips non-safe characters.

---

## Deferred Findings (Acknowledged, Documented)

| Finding | Title | Status |
|---------|-------|--------|
| 1.11 | Endpoint naming /api/player singular | Semantically justified; documented |
| 1.12 | PUT on collection without ID | Correct for bulk-set; no change needed |
| 1.13 | POST for location update | Acceptable; documented |
| 1.14 | POST returns 204 for association | Acceptable; documented |
| 2.13 | PlayerService 14 dependencies | Partial extraction done; further deferred |
| 2.14 | GameService 16 dependencies | Documented for future refactoring |
| 2.16 | No datasource URL in main yml | Documented in application.yml comments |
| 2.17 | Test coverage gaps (5 services) | Tests deferred to dedicated task |
| 2.18 | DTOs could be records | **FIXED 2026-06-01**: 7 DTOs converted to records |
| 2.19 | Sealed interfaces for state machines | Deferred to dedicated task |
| 4.1 | MapPage.tsx oversized (567 lines) | Component extraction deferred |
| 4.2 | ChallengesPage.tsx oversized (510 lines) | **FIXED 2026-06-01**: Assignment section extracted to ChallengeAssignmentSection.tsx |
| 5.6 | No database backup strategy | Operational; documented in infrastructure.md |
| 5.11 | SPA fallback uses __spa.html | Documented in nginx.conf comments |
| 5.16 | __spa.html naming undocumented | Covered by 5.11 |
| 5.18 | E2E hardcoded dummy credentials | Test-only; documented |
| 5.19 | No resource limits on test containers | **FIXED 2026-06-01**: mem_limit + cpus added to docker-compose.test.yml |
| 6.10 | AppNavigation.kt oversized (1614 lines) | Extraction deferred |
| 7.10 | 500ms delay for presence broadcast | Pragmatic; comment explains tradeoff |
| 8.6 | No marker clustering | Feature addition; deferred |
| 8.7 | Inconsistent coordinate conventions | Cross-component refactor; deferred |
| 8.10 | Tile source URL inconsistency | Mobile config refactor; deferred |
| 8.11 | O(n*m) getAggregateStatus() | **FIXED 2026-06-01**: getAggregateStatusFlat() shared utility; broadcast dupes removed |
| 8.12 | No offline map tile caching | Feature; deferred |
| 8.13 | LocationService.swift timer race | Actually handled; clarified with comments |
| 9.1-9.7 | Test coverage gaps | Tests deferred to separate tasks |
| 9.8 | ChunkedUploadServiceTest ReflectionTestUtils | **FIXED 2026-06-01**: @ConfigurationProperties replaces @Value; direct construction in tests |
| 9.9 | SubmissionServiceTest duplicate mock setup | **FIXED 2026-06-01**: Helper methods stubDefaultRepositories() + stubSubmissionSave() |
| 10.10 | Player.pushPlatform defaults to ios | FIXED: V56 drops default; entity nullable |
| 11.11 | Offline check-in local UUID | Cosmetic; no reconciliation needed |
| 12.1 | Refresh token in localStorage | Security task; requires backend API changes |
| 12.2 | No certificate pinning on mobile | Infrastructure planning needed |
| 12.3 | Broadcast code brute-forceable | Rate limiting needed; documented |
| 12.6 | Join code 7 characters | Mitigated by nginx rate limiting |
| 12.8 | Actuator endpoints exposed | Blocked by nginx |
| 12.9 | Login rate limiting in-memory only | Documented in code comments |
| 12.12 | E2E password hardcoded in CI | Test-only; not production |

---

## Summary

| Category | Count |
|----------|-------|
| Fixed (prior commits) | 12 |
| Fixed (2026-06-01 session) | 6 |
| Acknowledged (observational, no change needed) | 1 |
| Deferred (documented with rationale) | 25 |

**2026-06-01 fixes:** 2.18 (DTO records), 4.2 (ChallengeDetail extraction), 5.19 (test container limits), 8.11 (getAggregateStatus dedup), 9.8 (ConfigurationProperties), 9.9 (test helpers). See `docs/audit-decisions.md` for design rationale.
