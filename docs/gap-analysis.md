# PointFinder Gap Analysis Report

**Date**: 2026-03-14 (updated 2026-03-21)
**Scope**: Cross-platform analysis of backend, web-admin, Android, and iOS
**Method**: Exhaustive codebase audit followed by cross-referencing actual source code

---

## Table of Contents

1. [Business Logic Inconsistencies](#1-business-logic-inconsistencies)
2. [Missing Validation](#2-missing-validation)
3. [Error Handling Gaps](#3-error-handling-gaps)
4. [Feature Parity](#4-feature-parity)
5. [Localization Completeness](#5-localization-completeness)

---

## 1. Business Logic Inconsistencies

### 1.1 Game Lifecycle

#### GAP-BL-1: Android missing go-live readiness checks
- **Platforms**: Android
- **Severity**: Important
- **Description**: Android's SetupHubScreen only shows 5 of 8 go-live validations. Missing: (1) all bases must have assignments, (2) team variables completeness, (3) location-bound base coordinate validation.
- **Impact**: Operator attempts go-live on Android → backend returns 400 → confusing generic error instead of specific pre-flight warnings.
- **Fix**: Add the 3 missing checks to `SetupHubScreen.buildWarnings()`. Fetch `/api/games/{gameId}/team-variables/completeness` for variable check.

#### GAP-BL-2: iOS has no go-live readiness checklist
- **Platforms**: iOS
- **Severity**: Minor
- **Description**: iOS `GameSettingsView` allows go-live without any pre-flight UI validation. Relies entirely on backend 400 response.
- **Impact**: Acceptable since backend enforces all rules, but UX is worse than web-admin and Android.
- **Fix**: Optional — add readiness summary before go-live confirmation dialog.

#### ~~GAP-BL-3: iOS player submissions not pre-blocked when game not live~~ FIXED
- **Status**: Fixed. `SolveView.swift` now checks `appState.currentGame?.status == "live"` in `canSubmit` (line 378) and shows a warning banner when game is not live.

### 1.2 NFC & Submission Flow

#### GAP-BL-4: Android requirePresenceToSubmit not enforced
- **Platforms**: Android
- **Severity**: Important
- **Description**: When a challenge has `requirePresenceToSubmit=true`, players must re-scan the NFC tag before submitting. iOS enforces this with an NFC re-scan gate in SolveView. Android does not enforce it.
- **Impact**: Android players can submit without being physically present at the base when required.
- **Fix**: Add NFC re-scan gate in Android's submission flow when `requirePresenceToSubmit` is true.

#### GAP-BL-5: Android missing legacy NFC text format support
- **Platforms**: Android
- **Severity**: Minor
- **Description**: iOS supports 3 NFC record formats (URI, JSON MIME, NDEF text). Android supports 2 (URI, JSON MIME). Missing: NDEF text record parsing.
- **Impact**: Older NFC tags written in text format won't scan on Android.
- **Fix**: Add text record parsing to Android's `NfcService.parseBaseIdFromTag()`.

#### GAP-BL-6: Android not displaying template variables in challenge content
- **Platforms**: Android
- **Severity**: Minor
- **Description**: Backend resolves `{{variable}}` templates in challenge content, but Android displays raw template strings instead of resolved values.
- **Impact**: Players see `{{teamName}}` instead of their actual team name in challenge descriptions.
- **Fix**: Use the resolved content from the backend response instead of the raw template.

---

## 2. Missing Validation

### Client Missing Validation (confusing error messages)

#### GAP-V-1: Team color hex format not validated
- **Platforms**: Web-admin
- **Severity**: Critical
- **Description**: Backend requires `@Pattern("^#[0-9A-Fa-f]{6}$")` for team color updates. Frontend has no validation — user can type "red" → backend returns cryptic 400.
- **Fix**: Add hex color validation or use a color picker that guarantees valid output.

#### GAP-V-2: Player join code length not validated on mobile
- **Platforms**: Android, iOS
- **Severity**: Critical
- **Description**: Backend requires `@Size(min=6, max=20)` for join codes. Both mobile apps only check non-empty.
- **Fix**: Add length validation (6-20 chars) to join code input on both platforms.

#### GAP-V-3: Player display name max length not validated on mobile
- **Platforms**: Android, iOS
- **Severity**: Critical
- **Description**: Backend requires `@Size(max=100)` for display names. Mobile apps only check non-empty.
- **Fix**: Add maxLength=100 to name input fields.

#### GAP-V-4: Base name not validated as non-blank
- **Platforms**: Web-admin
- **Severity**: Important
- **Description**: Backend requires `@NotBlank` for base names. Frontend has no validation.
- **Fix**: Add required field validation to base creation form.

#### GAP-V-5: Challenge title not validated as non-blank
- **Platforms**: Web-admin
- **Severity**: Important
- **Description**: Backend requires `@NotBlank` for challenge titles. Frontend has no validation.
- **Fix**: Add required field validation to challenge creation form.

#### GAP-V-6: Challenge points not validated as non-negative
- **Platforms**: Web-admin
- **Severity**: Important
- **Description**: Backend requires `@Min(0)` for points. Frontend allows any value.
- **Fix**: Add min=0 validation to points input.

#### GAP-V-7: Team name not validated as non-blank
- **Platforms**: Web-admin
- **Severity**: Important
- **Description**: Backend requires `@NotBlank` for team names. Frontend has no validation.
- **Fix**: Add required field validation to team creation form.

#### GAP-V-8: Operator registration name not validated
- **Platforms**: Web-admin
- **Severity**: Important
- **Description**: Backend requires `@NotBlank` for registration name. Frontend has no validation.
- **Fix**: Add required field validation to registration form.

#### GAP-V-9: Password minimum length not validated
- **Platforms**: Web-admin
- **Severity**: Important
- **Description**: Backend requires `@Size(min=6)` for passwords. Frontend only checks non-empty.
- **Fix**: Add minLength=6 validation to password fields on registration page.

#### ~~GAP-V-10: Coordinate range not validated~~ FIXED
- **Status**: Fixed. Backend now has `@DecimalMin/@DecimalMax` validation on lat (-90 to 90) and lng (-180 to 180) in both `CreateBaseRequest` and `UpdateBaseRequest`.

---

## 3. Error Handling Gaps

#### GAP-E-1: Android silent offline submission failure
- **Platforms**: Android
- **Severity**: Critical
- **Description**: `OfflineSyncWorker` deletes pending submissions from the queue after 5 failed retries without notifying the user. The submission is silently lost.
- **Impact**: Player thinks their submission was sent but it was actually discarded.
- **Fix**: Keep failed submissions in queue with a "failed" status and show error UI. Allow manual retry.

#### GAP-E-2: iOS similar silent sync failure
- **Platforms**: iOS
- **Severity**: Critical
- **Description**: `SyncEngine` dequeues actions after 5 failed retries (`retryCount >= 5: dequeue`). Shows `lastSyncError` briefly but doesn't persist per-action errors.
- **Impact**: Same as Android — player actions can be silently lost after transient failures.
- **Fix**: Keep failed actions with error status. Show persistent error indicator with retry option.

#### GAP-E-3: Web-admin 409 Conflict shows generic error
- **Platforms**: Web-admin
- **Severity**: Important
- **Description**: Backend returns detailed 409 messages for constraint violations (duplicate assignments, duplicate team names). Frontend shows "Unexpected error" instead of the backend's helpful message.
- **Fix**: Parse and display the `message` field from 409 responses.

#### GAP-E-4: Web-admin treats 403 as 401
- **Platforms**: Web-admin
- **Severity**: Important
- **Description**: When user lacks permission (403 Forbidden), the API client attempts token refresh instead of showing "Access denied".
- **Fix**: Distinguish 401 (token expired → refresh) from 403 (insufficient permissions → show error).

#### GAP-E-5: Android error messages not reaching UI
- **Platforms**: Android
- **Severity**: Important
- **Description**: `ApiErrorParser` correctly extracts backend error messages, but the parsed messages are often not propagated to the UI layer. Users see generic "Something went wrong" instead.
- **Fix**: Ensure ViewModel error state includes the parsed API error message.

#### GAP-E-6: Upload session expiration not handled
- **Platforms**: Android, iOS
- **Severity**: Important
- **Description**: Upload sessions have a 48hr TTL. If a device is offline for >48h, resumed uploads fail because the session expired. Clients retry the expired session instead of creating a new one.
- **Fix**: On upload failure, check if session is expired. If so, create a new session and restart the upload.

---

## 4. Feature Parity

### Critical Gaps

<!-- IGNORE FOR NOW #### GAP-F-1: Broadcast mode missing on mobile
- **Platforms**: Android, iOS
- **Severity**: Critical
- **Description**: Public broadcast mode (spectator screens via 6-char code) is only available on web-admin. Backend supports it, mobile clients don't implement it.
- **Endpoints unused**: `GET /broadcast/{code}`, `/broadcast/{code}/leaderboard`, `/broadcast/{code}/locations`, `/broadcast/{code}/progress`
- **Fix**: Add broadcast viewer screens to both mobile apps. -->

#### GAP-F-2: Operator add/remove missing on mobile UI
- **Platforms**: Android, iOS
- **Severity**: Critical
- **Description**: Mobile operator screens show the list of game operators but have no UI to add or remove operators. API endpoints exist in both clients' API layers but aren't wired to UI.
- **Endpoints unused by mobile UI**: `POST /games/{gameId}/operators/{userId}`, `DELETE /games/{gameId}/operators/{userId}`
- **Fix**: Add add/remove buttons to operator management screens on both mobile apps.

<!-- IGNORE FOR NOW #### GAP-F-3: Operator notification settings missing on web-admin
- **Platforms**: Web-admin
- **Severity**: Critical
- **Description**: Web-admin operators cannot configure push notification preferences. Only mobile apps have this feature.
- **Endpoints unused by web**: `GET/PUT /games/{gameId}/operator-notification-settings/me`, `PUT /users/me/push-token`
- **Fix**: Add notification settings page to web-admin game settings. -->

### Important Gaps
<!-- IGNORE FOR NOW #### GAP-F-4: Dashboard monitoring stats missing on mobile
- **Platforms**: Android, iOS
- **Severity**: Important
- **Description**: Mobile operators lack the quick dashboard stats view (team count, submission count, pending reviews).
- **Endpoint unused**: `GET /games/{gameId}/monitoring/dashboard`
- **Fix**: Add dashboard widget to mobile operator home screen. -->

### Minor Gaps

#### ~~GAP-F-5: NFC writing only on iOS~~ FIXED
- **Status**: Fixed. Android now has `NfcService.writeBaseTag()` and the operator flow supports NFC writing via `OperatorViewModel`.

#### GAP-F-6: Team variable completeness check missing on iOS
- **Platforms**: iOS
- **Severity**: Minor
- **Description**: iOS doesn't call `GET /games/{gameId}/team-variables/completeness` before go-live.
- **Fix**: Add completeness check to go-live confirmation flow.

#### GAP-F-7: Android WebSocket real-time is skeleton only
- **Platforms**: Android
- **Severity**: Minor
- **Description**: `MobileRealtimeClient` exists but is not fully implemented. Android uses HTTP polling instead of WebSocket for real-time updates.
- **Fix**: Complete the WebSocket implementation and wire it to the UI.

---

## 5. Localization Completeness

### Critical Gaps

#### GAP-L-1: iOS has no PT/DE localization files
- **Platforms**: iOS
- **Severity**: Critical
- **Description**: iOS codebase contains 91 `NSLocalizedString` calls but has no `pt.lproj/` or `de.lproj/` directories. All PT and DE users see English text.
- **Fix**: Create `Localizable.strings` files for PT and DE with all 91 translations.

#### GAP-L-2: Android German translations 69% incomplete
- **Platforms**: Android
- **Severity**: Critical
- **Description**: Core i18n module has only 113 of 365 German keys translated. Missing: rich text editor labels, challenge/team management, submission review, setup hub, map, notifications, game settings.
- **Fix**: Complete the remaining 252 German translation keys in `core/i18n/src/main/res/values-de/strings.xml`.

#### GAP-L-3: Android app module PT/DE translations 72% incomplete
- **Platforms**: Android
- **Severity**: Critical
- **Description**: App module has only 103 of 366 PT keys and 113 of 366 DE keys translated. Missing: permission disclosure, challenge management, team management, map, notifications, game settings.
- **Fix**: Complete translations in `app/src/main/res/values-pt/strings.xml` and `values-de/strings.xml`.

#### GAP-L-4: Hardcoded strings in Android Kotlin
- **Platforms**: Android
- **Severity**: Critical
- **Description**: `RichTextEditorScreen.kt` has hardcoded "H1" and "H2" text that bypasses localization.
- **Fix**: Replace with string resource references (`R.string.label_heading1`, etc.).

### Important Gaps

#### ~~GAP-L-5: Portuguese accent marks missing in web frontend~~ FIXED
- **Status**: Fixed. All accent marks corrected in `pt.json`: Título, Citação, Código, Variável.

#### ~~GAP-L-6: German umlaut escaping inconsistent in Android~~ FIXED
- **Status**: Fixed. "moechtest" corrected to "möchtest". Strings now use raw UTF-8 characters consistently.

#### GAP-L-7: Cross-platform terminology inconsistency
- **Platforms**: All
- **Severity**: Important
- **Description**: Key terms are inconsistently translated:
  - "Challenge": DE uses English "Challenge" on Android but "Herausforderung" concept isn't used consistently
  - "Team": DE uses English "Team" (acceptable as it's a loanword)
  - "Base" → DE uses "Station" (web) vs "Basis" (Android) inconsistently
- **Fix**: Create a terminology glossary and standardize across all platforms.

### Minor Gaps

#### GAP-L-8: Photo vs Media terminology inconsistency
- **Platforms**: All
- **Severity**: Minor
- **Description**: English strings mix "photo" and "media" inconsistently. Translations follow the same inconsistency.
- **Fix**: Standardize to "media" or "photo" and apply consistently.

---

## Summary

### By Severity

| Severity | Count | Fixed | Remaining | Key Areas |
|----------|-------|-------|-----------|-----------|
| **Critical** | 12 | 0 | 12 | Silent offline failures (2), localization gaps (4), feature parity (3), validation (3) |
| **Important** | 14 | 2 | 12 | Go-live checks, error handling, validation, localization, feature parity |
| **Minor** | 11 | 4 | 7 | NFC format, template vars, terminology |

### By Platform

| Platform | Critical | Important | Minor |
|----------|----------|-----------|-------|
| Backend | 0 | 0 | 1 |
| Web-admin | 2 | 6 | 1 |
| Android | 5 | 5 | 4 |
| iOS | 3 | 1 | 3 |

### Priority Recommendations

**Immediate (before next release):**
1. Fix silent offline submission loss on Android and iOS (GAP-E-1, GAP-E-2)
2. Create iOS PT/DE localization files (GAP-L-1)
3. Complete Android German translations (GAP-L-2, GAP-L-3)
4. Add player join code length validation on mobile (GAP-V-2)

**Short-term (next sprint):**
5. Add requirePresenceToSubmit enforcement on Android (GAP-BL-4)
6. Add operator management UI on mobile (GAP-F-2)
7. Fix web-admin 409/403 error handling (GAP-E-3, GAP-E-4)
8. Add form validation to web-admin (GAP-V-4 through GAP-V-9)
9. Add Android go-live readiness checks (GAP-BL-1)

**Medium-term:**
10. Add broadcast mode to mobile apps (GAP-F-1)
11. Add notification settings to web-admin (GAP-F-3)
12. Complete NFC writing on Android (GAP-F-5)
13. Standardize cross-platform terminology (GAP-L-7)
14. Fix Portuguese accent marks in web frontend (GAP-L-5)
