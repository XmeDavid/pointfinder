# PointFinder Business Logic Reference

**Date**: 2026-03-14
**Source of truth**: Backend (Spring Boot 3.4.1). All other platforms are consumers of backend rules.

---

## Table of Contents

1. [Game Lifecycle](#1-game-lifecycle)
2. [NFC & Check-In Flow](#2-nfc--check-in-flow)
3. [Challenge & Submission Flow](#3-challenge--submission-flow)
4. [Team Variables](#4-team-variables)
5. [Authentication & Authorization](#5-authentication--authorization)
6. [Push Notifications](#6-push-notifications)
7. [Broadcast Mode](#7-broadcast-mode)

---

## 1. Game Lifecycle

### States

| State | Meaning |
|-------|---------|
| `setup` | Configuration phase. Players cannot check in or submit. |
| `live` | Game is active. Check-ins and submissions are open. |
| `ended` | Game is frozen. Submissions are blocked. |

**Backend enum**: `game_status` with values `setup`, `live`, `ended`.
**Android enum**: `GameStatus` uses `CREATED`, `ACTIVE`, `COMPLETED`, `ARCHIVED` — these map to the three backend states at the API boundary.

### Transitions

| From | To | Who | Trigger |
|------|----|-----|---------|
| `setup` | `live` | Operator/Admin | `PATCH /api/games/{id}/status` with `{status: "live"}` |
| `live` | `ended` | Operator/Admin | `PATCH /api/games/{id}/status` with `{status: "ended"}` |
| `live` or `ended` | `setup` | Operator/Admin | `PATCH /api/games/{id}/status` with `{status: "setup", resetProgress: true/false}` |

The `resetProgress` flag on the → `setup` transition clears all check-ins, submissions, and activity events when `true`.

**Platform coverage**:
- Backend: enforces all transitions in `GameService.updateStatus()`
- Frontend: exposes "Go Live" button on OverviewPage (after readiness check), and status change in SettingsPage
- Android: `PATCH /api/games/{gameId}/status` via OperatorRepository
- iOS: `GameSettingsView` handles status transitions

### Go-Live Readiness Checklist

The backend validates all 8 conditions before allowing `setup → live`. The frontend mirrors these as a pre-flight UI checklist on the OverviewPage.

| # | Condition | Backend check | Frontend display |
|---|-----------|---------------|-----------------|
| 1 | At least 1 base created | Yes | Yes |
| 2 | At least 1 challenge created | Yes | Yes |
| 3 | At least 1 team created | Yes | Yes |
| 4 | All bases have NFC linked (`nfc_linked = true`) | Yes | Yes |
| 5 | All bases have at least one challenge assigned | Yes | Yes |
| 6 | All location-bound challenges are assigned to a base | Yes | Yes |
| 7 | Enough unique challenges for uniform assignment (number of bases ≤ number of challenges, when `uniformAssignment = true`) | Yes | Yes |
| 8 | All team variables have values for every team | Yes | Yes (via `/games/:id/team-variables/completeness`) |

If any condition fails, `PATCH /api/games/{id}/status` returns 400. The frontend checks readiness via the game detail + variables completeness endpoint and disables the "Go Live" button accordingly.

**Platform coverage**: Backend (authoritative), Frontend (UI validation + user-facing checklist). Android and iOS do not show the checklist — they only change status by calling the API and handling the 400 error.

### What Happens When a Game Goes Live

1. Backend validates all 8 readiness conditions (throws 400 if any fail).
2. Location-bound assignment validation: each location-bound challenge must have `lat`/`lng` on its assigned base (added in fix commit `329ced0`).
3. Game `status` is set to `live` in the database.
4. `game_status` WebSocket event is broadcast to all connected operators.
5. Players with the team's join code can now check in and submit.

### What Is Blocked in Each State

| Action | `setup` | `live` | `ended` |
|--------|---------|--------|---------|
| Create/edit bases, challenges, teams | Allowed | Allowed | Allowed |
| Player check-in | Blocked | Allowed | Blocked |
| Player submission | Blocked | Allowed | Blocked |
| Operator submission review | N/A | Allowed | Allowed |
| Game deletion | Allowed | Allowed | Allowed |

**iOS-specific**: `CheckInTabView` and `GameMapView` explicitly block gameplay when `gameStatus == "setup"` or `"ended"`, showing a message rather than enabling NFC scan.

---

## 2. NFC & Check-In Flow

### NFC Tag Format

**Primary format (URI record)**:
```
https://pointfinder.pt/tag/{base-uuid}
https://pointfinder.ch/tag/{base-uuid}
```

The UUID is the base's `id` field (lowercase). Tags are written as NDEF URI records using `NFCNDEFPayload.wellKnownTypeURIPayload()` (iOS) or `NdefRecord` URI type (Android).

**Legacy formats supported** (read-only, for backward compatibility):

| Format | Description |
|--------|-------------|
| JSON MIME record | NDEF record with MIME type `application/json`, body `{"baseId": "<uuid>"}` |
| NDEF Text record | Text record (language prefix byte stripped), parsed as JSON `{"baseId": "<uuid>"}` |

**UUID normalization**: Both platforms lowercase the extracted UUID before using it (`UUID.uuidString.lowercased()` on iOS, trim + lowercase on Android) to match the backend's lowercase UUID comparison.

**Platform coverage**:
- iOS: `NFCReaderService.processRecord()` — tries URI first, then JSON MIME, then text
- Android: `NfcPayloadCodec` — same priority order, same normalization
- Backend: stores base IDs as lowercase UUIDs; no special parsing needed

### NFC Writing (Operator)

Operators write base IDs to physical NFC tags:
- iOS: `NFCWriterService.writeBaseId()` writes `https://pointfinder.pt/tag/{uuid}` as a URI record
- Android: `NfcService.writeBaseTag()` writes the same URI format; uses Reader Mode (avoids Android 14+ background activation limits)

After writing, the operator calls `PATCH /api/games/{gameId}/bases/{baseId}/nfc-link` to mark `nfc_linked = true` on the base. This is required for the go-live readiness check.

### Check-In Rules

1. **Game must be live**: Backend rejects check-in if `game.status != live`.
2. **One check-in per team per base**: Enforced by `UNIQUE INDEX idx_check_ins_team_base ON check_ins (team_id, base_id)`. Duplicate check-ins return a 409 with "Team already checked in at this base." The operation is idempotent on the client side — both iOS and Android treat a duplicate-check-in 409 as a success and continue.
3. **Team must belong to game**: Backend validates team membership in `PlayerService.checkIn()`.
4. **Assignment must exist**: Backend verifies the base has a challenge assigned to the team before completing check-in.

### Assignment Verification at Check-In

Before completing a check-in, the backend looks up the assignment for `(gameId, baseId, teamId)`. It checks:
1. A team-specific assignment for `(game, base, team)`, or
2. A global assignment for `(game, base)` with `team_id IS NULL`.

If no assignment is found, the check-in is rejected.

### Location-Bound Assignments

When a challenge has `location_bound = true` and is assigned to a base:
- The base **must** have non-null `lat` and `lng` coordinates (validated at go-live).
- The player's device location is reported via `POST /api/player/games/{gameId}/location` on a 30-second interval (both iOS and Android).
- The backend enforces proximity before allowing check-in for location-bound challenges.

**Platform coverage**:
- Backend: location validation added in `fix(backend): validate location-bound assignments before go-live` (commit `329ced0`)
- iOS: `LocationService` sends location every 30 seconds, immediately after check-in/submission
- Android: `PlayerLocationService` (FusedLocationProviderClient) sends every 30 seconds

**Note**: Android lists location-bound challenge validation as "Incomplete" in the audit — the full proximity enforcement at check-in time is a backend concern; the Android client sends location but does not pre-validate before attempting check-in.

---

## 3. Challenge & Submission Flow

### Answer Types

| Type | Meaning | Auto-approval |
|------|---------|---------------|
| `text` | Free-form text input | Optional (if `autoValidate = true` and correct answer matches) |
| `file` | Photo or video upload | Never (always requires operator review) |
| `none` | Check-in only, no answer required | Always (status → `approved` immediately) |

### Submission Status Lifecycle

```
[created]
    │
    ├─ answerType = none ──────────────────────────► approved
    │
    ├─ answerType = text, autoValidate = true
    │      ├─ answer matches correctAnswer ────────► correct
    │      └─ answer does not match ───────────────► rejected (auto)
    │
    └─ answerType = text/file, no autoValidate ───► pending
                                                       │
                                              [operator reviews]
                                                       │
                                          ┌────────────┴────────────┐
                                          ▼                         ▼
                                       approved                  rejected
```

**Status values in DB**: `pending`, `approved`, `rejected`, `correct`, `incorrect`

**Points**: Awarded immediately when a submission reaches `approved` or `correct`. The `points` column in `submissions` is set at that moment; the leaderboard aggregates these values.

### Auto-Validation for Text Answers

When `challenge.autoValidate = true` and `challenge.answerType = text`:
1. Backend reads `challenge.correctAnswer` (VARCHAR 1000, may contain comma-separated alternatives and `{{variable}}` templates).
2. `TemplateVariableService.resolveTemplates()` replaces `{{key}}` with team-specific values (see Section 4).
3. The player's submitted answer is compared **case-insensitively** against all resolved answers.
4. Match → status `correct`, points awarded. No match → status `rejected`.

The `correctAnswer` field supports comma-separated values (added in migration V11), allowing multiple acceptable answers. Each is resolved independently.

**Platform coverage**: Backend only (authoritative). No client performs auto-validation.

### Idempotency

Submissions include an optional `idempotency_key` (UUID). If a submission with the same key already exists, the backend returns the existing record instead of creating a duplicate. The unique constraint `submissions_idempotency_key_key` enforces this at the database level (migration V17).

Both iOS (SyncEngine) and Android (PlayerRepository offline queue) generate and persist idempotency keys so that retried offline actions do not create duplicate submissions.

### Operator Review Workflow

Endpoint: `PATCH /api/games/{gameId}/submissions/{submissionId}/review`

Request body:
```json
{
  "status": "approved" | "rejected" | "pending" | "correct",
  "feedback": "optional text",
  "points": 50
}
```

- `reviewed_by` is set to the authenticated operator's user ID.
- `feedback` is stored and surfaced to the player via push notification and in-app display.
- Operators may override `points` at review time.
- After review, a `submission_status` WebSocket event is broadcast, and a `leaderboard` event if points changed.

**Platform coverage**:
- Backend: `SubmissionService.reviewSubmission()`
- Frontend: SubmissionsPage review queue (split-pane Review Layout)
- Android: `OperatorSubmissionsScreen` with feedback entry and point adjustment
- iOS: `OperatorSubmissionsView` with approve/reject actions

### requirePresenceToSubmit (NFC Re-scan Before Submission)

When `challenge.requirePresenceToSubmit = true`, a player must scan the NFC tag **again** (after the initial check-in) before the submission form is submitted.

- iOS: `SolveView` checks this flag; if `requirePresenceToSubmit` is true, NFC scan is triggered before `submitAnswer()` is called.
- Android: Challenge model includes `requirePresenceToSubmit` boolean; logic is partially implemented.
- Backend: The flag is stored on the `challenges` table but the presence enforcement is primarily a client-side UX gate; the backend itself does not block submission on this flag.

---

## 4. Team Variables

### Purpose

Team variables allow operators to personalize challenge content and correct answers on a per-team basis. For example, each team can be given different GPS coordinates to find, or a different code word to enter.

### Scope

| Scope | Table | API |
|-------|-------|-----|
| Game-level | `team_variables` | `GET/PUT /api/games/:gameId/team-variables` |
| Challenge-level | `challenge_team_variables` | `GET/PUT /api/games/:gameId/challenges/:challengeId/team-variables` |

### Structure

Both tables share the same shape:
- `variable_key` — alphanumeric + underscore, must start with letter, unique per (game/challenge, team)
- `variable_value` — the per-team value

The API groups variables as a matrix: a list of keys, each with a map of `{ teamId → value }`.

### Template Syntax

Variables are referenced in challenge `content`, `completionContent`, and `correctAnswer` using double-brace syntax:

```
{{variableName}}
```

### Resolution Order

At submission auto-validation time (`TemplateVariableService.resolveTemplates()`):
1. **Challenge-level** team variables (`challenge_team_variables`) are checked first.
2. **Game-level** team variables (`team_variables`) are checked second.
3. If a key is not found in either table, the `{{key}}` placeholder is left unchanged.

### Completeness Check

Before go-live, all team variables must have values for all teams. This is checked via `GET /api/games/:gameId/team-variables/completeness`. The frontend shows this as readiness condition #8; the backend re-validates at the `setup → live` transition.

**Key validation (frontend)**: Variable keys must start with a letter and contain only alphanumerics and underscores. No duplicate keys allowed per scope.

**Platform coverage**:
- Backend: `TemplateVariableService` (authoritative resolver)
- Frontend: `TeamVariablesEditor` component; completeness shown on OverviewPage
- iOS: `APIClientAuthRegressionTests` covers the team/challenge variable endpoints (routing verified)
- Android: listed as "Incomplete" in audit — endpoint exists but UI not fully built

---

## 5. Authentication & Authorization

### Operator Authentication

| Property | Value |
|----------|-------|
| Login | `POST /api/auth/login` with `{email, password}` |
| Access token | JWT (HS256), TTL **15 minutes** |
| Refresh token | UUID string stored in DB, TTL **7 days** |
| Refresh endpoint | `POST /api/auth/refresh` — old token deleted, new pair issued (one-time use) |
| Logout | `POST /api/auth/logout` — deletes refresh token from DB |
| Storage (web) | Access token: in-memory only (XSS safety); refresh token: localStorage |
| Storage (iOS) | Both tokens in Keychain |
| Storage (Android) | EncryptedSharedPreferences (AES256-GCM) |

**Token refresh deduplication**: The web frontend uses a shared in-flight promise to avoid issuing multiple `/auth/refresh` calls concurrently. Android uses a `Mutex`-locked `OperatorTokenRefresher`.

### Player Authentication

| Property | Value |
|----------|-------|
| Login | `POST /api/auth/player/join` with `{joinCode, displayName, deviceId}` |
| Token | Single JWT (HS256), TTL **7 days** |
| No refresh token | Players get a long-lived token; no refresh flow |
| Device ID | Used to identify the player across sessions; same device in same game = same player record |
| Storage (iOS) | JWT in Keychain |
| Storage (Android) | EncryptedSharedPreferences (AES256-GCM) |

**JWT claims**:
- Operator: `sub=userId`, `email`, `role`, `type=user`
- Player: `sub=playerId`, `teamId`, `gameId`, `type=player`, `role=player`

The `type` claim is used by `JwtAuthenticationFilter` to route to the correct user/player lookup.

### Role Hierarchy

| Role | Scope | Access |
|------|-------|--------|
| `ADMIN` | Global | All games, all users, global operator management |
| `OPERATOR` | Game-scoped | Only games they created or were added to as an operator |
| `PLAYER` | Game-scoped | Only `/api/player/**` endpoints; scoped to their team and game |

**Game-scoped access**: Operators can only access a game if they are its creator or appear in the `game_operators` join table. `GameService.getAllGames()` filters by this for non-admin users.

**Route security** (SecurityConfig):
- `/api/auth/**` — public
- `/api/broadcast/**` — public
- `/ws/**` — public at HTTP level (JWT validated in WebSocket interceptor)
- `/api/player/**` — requires `ROLE_PLAYER`
- `/api/games/**`, `/api/invites/**`, `/api/users/**` — requires `ROLE_ADMIN` or `ROLE_OPERATOR`

### Operator Invitation Flow

1. Operator calls `POST /api/invites` with `{email, gameId?}`.
2. Backend creates an `operator_invites` record (status `pending`) and sends an email with a registration link containing the token.
3. Invitee clicks link → `POST /api/auth/register/{token}` with `{name, email, password}`.
4. Backend creates user account, marks invite `accepted`, adds user to `game.operators` (if game-scoped).

### Password Reset Flow

1. `POST /api/auth/forgot-password` with `{email}` — silent on missing email (no enumeration).
2. Backend rate-limits to **max 3 active reset tokens** per user.
3. Reset token TTL: **1 hour**.
4. `POST /api/auth/reset-password` with `{token, password}` — validates token not used, not expired; updates BCrypt hash.

**Platform coverage**: Backend (authoritative), Frontend (ForgotPasswordPage, ResetPasswordPage). Mobile apps have no password reset UI — operators use the web admin.

### Unrecoverable Auth Failure

If a token refresh fails with 401/403:
- Web: `handleAuthFailure()` force-clears Zustand store and React Query cache, redirects to login.
- iOS: `authFailureHandler` closure triggers app-level logout.
- Android: `TokenAuthenticator` + `OperatorTokenRefresher` on 401 retry; on failure, session is cleared.

---

## 6. Push Notifications

### Operator Notifications (APNs / FCM)

Operators receive push notifications on their mobile device based on per-game preferences stored in `operator_notification_settings`.

| Setting | Default | Trigger |
|---------|---------|---------|
| `notify_pending_submissions` | `true` | A new submission is created with status `pending` |
| `notify_all_submissions` | `false` | Any submission status change (including auto-approved) |
| `notify_check_ins` | `false` | A team checks in at any base |

Delivery is routed by `user.push_platform` (`ios` → APNs, `android` → FCM). Push is feature-flagged via `${APNS_ENABLED}` and `${FCM_ENABLED}`.

**API**: `GET/PUT /api/games/{gameId}/operator-notification-settings/me`

**Platform coverage**:
- Backend: `OperatorPushNotificationService` (authoritative)
- Android: `OperatorSettingsScreen` surfaces these preferences
- iOS: `OperatorLiveView` / settings surface these preferences

### Player Notifications

Players receive in-app notifications (not OS push by default, though push tokens are registered):
- Submission reviewed (approved/rejected with optional feedback)
- Game-wide or team-targeted operator broadcasts (`game_notifications`)

**Endpoints**:
- `GET /api/player/notifications` — list all notifications for the player's team
- `GET /api/player/notifications/unseen-count` — badge count (iOS-specific endpoint)
- `POST /api/player/notifications/mark-seen` — mark all as seen

The `last_notifications_seen_at` column on `players` tracks read state.

**Delivery**: Notifications are delivered via WebSocket `notification` event to connected players. Push fallback uses `player.push_token` + `player.push_platform`.

**Platform coverage**:
- Backend: `NotificationService`, `PlayerController`
- iOS: `MainTabView` badge, `PushNotificationService`, notification list
- Android: `PlayerNotificationListScreen`, `CompanionMessagingService` (FCM)

### Push Token Registration

Both platforms register a device push token after login:
- Players: `PUT /api/player/push-token` with `{pushToken, platform}`
- Operators: `PUT /api/users/me/push-token` with `{pushToken, platform}`

On new FCM token (Android `onNewToken`), the token is re-registered automatically. iOS registers via APNs on first launch.

### Game Status Change Notifications

When the game status changes (`setup → live`, `live → ended`), a `game_status` WebSocket event is broadcast. Connected mobile clients reload game state:
- iOS: `AppState.handleRealtimeEvent()` updates `currentGame` and triggers `progressLoadTask`
- Android: MobileRealtimeClient (skeleton; WebSocket not fully implemented)

---

## 7. Broadcast Mode

### Overview

Broadcast mode exposes a public, unauthenticated spectator screen showing live game data — useful for projecting leaderboards at events.

### Enabling Broadcast

An operator enables broadcast via `PUT /api/games/{id}` with `{broadcastEnabled: true}`. The backend generates a **6-character uppercase alphanumeric** code (excluding `0`, `1`, `I`, `O` to avoid visual ambiguity). The code is stored in `games.broadcast_code` (unique, VARCHAR 6).

### Access

Spectators navigate to `/live/{code}` (web) or `GET /api/broadcast/{code}` (API).

**No authentication required** — these are fully public endpoints.

### Data Exposed

| Endpoint | Data |
|----------|------|
| `GET /api/broadcast/{code}` | Full broadcast snapshot: leaderboard + activity |
| `GET /api/broadcast/{code}/leaderboard` | Team rankings and point totals |
| `GET /api/broadcast/{code}/locations` | Real-time team GPS positions |
| `GET /api/broadcast/{code}/progress` | Per-team per-base submission status |

The broadcast API re-uses the same underlying data as the operator monitoring endpoints, filtered through the broadcast code lookup.

### Real-Time Updates

A separate WebSocket client connects to `/ws` with an `X-Broadcast-Code` header (instead of Bearer auth). It subscribes to `/topic/games/{gameId}` and receives the same event stream as operators, filtered server-side by the broadcast code. The web frontend uses `useBroadcastWebSocket` for this.

**Platform coverage**:
- Backend: `BroadcastController`, `BroadcastService` (authoritative)
- Frontend: `LiveBroadcastPage` at `/live/:code`, `useBroadcastWebSocket` hook
- Android: listed as "Incomplete" in audit — not implemented
- iOS: not implemented

### What Is Not Exposed

- Player identities or device IDs
- Challenge content or answers
- Operator information
- Submission details beyond status

---

## Appendix: Platform Implementation Matrix

| Feature | Backend | Frontend | Android | iOS |
|---------|---------|----------|---------|-----|
| Game lifecycle (states) | Full | Full | Full | Full |
| Go-live readiness checklist | Enforced | Displayed | API only | API only |
| NFC scan (URI format) | N/A | N/A | Full | Full |
| NFC scan (legacy JSON/text) | N/A | N/A | Full | Full |
| NFC write | N/A | N/A | Full | Full |
| Check-in one-per-team enforcement | Enforced (DB unique) | N/A | Handles 409 | Handles 409 |
| Location-bound validation | Enforced at go-live | N/A | Partial | Not implemented |
| Auto-validation (text answers) | Full | Displays result | N/A | N/A |
| Template variable resolution | Full | Editor + preview | Not implemented | Endpoint tested |
| Submission idempotency | DB unique key | N/A | Offline queue | Offline queue |
| requirePresenceToSubmit | Stored on challenges (no server enforcement) | N/A | Partial | Full (client gate) |
| Operator auth (access + refresh) | Full | Full | Full | Full |
| Player auth (join code + JWT) | Full | N/A | Full | Full |
| Password reset | Full | Full | N/A | N/A |
| Operator push notifications | Full (APNs + FCM) | N/A | Full | Full |
| Player notifications | Full | N/A | Full | Full |
| Broadcast mode | Full | Full | Not implemented | Not implemented |
| Offline gameplay queue | N/A | N/A | Full | Full |
| Chunked file upload | Full | N/A | Full | Full |
| WebSocket (operator real-time) | Full | Full | Skeleton | Full |
