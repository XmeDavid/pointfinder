# PointFinder API Reference

**Base URL**: `/api`
**Auth**: Bearer token in `Authorization` header (`Authorization: Bearer <token>`)
**Format**: JSON request/response unless noted
**Roles**: `ROLE_ADMIN` > `ROLE_OPERATOR` > `ROLE_PLAYER`

---

## Table of Contents

1. [Authentication](#1-authentication)
2. [Game Management](#2-game-management)
3. [Base Management](#3-base-management)
4. [Challenge Management](#4-challenge-management)
5. [Assignment Management](#5-assignment-management)
6. [Team Management](#6-team-management)
7. [Player Endpoints](#7-player-endpoints)
8. [Submission Endpoints](#8-submission-endpoints)
9. [File Upload](#9-file-upload)
10. [Monitoring](#10-monitoring)
11. [Broadcast (Public)](#11-broadcast-public)
12. [WebSocket](#12-websocket)
13. [Team Variables](#13-team-variables)
14. [Operator Notification Settings](#14-operator-notification-settings)
15. [Users & Invites](#15-users--invites)
16. [Notifications](#16-notifications)

---

## 1. Authentication

**Base path**: `/api/auth`
**Auth required**: None (all public unless noted)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/login` | None | Login with email + password; returns JWT pair |
| POST | `/auth/register/:token` | None | Create operator account from invite token |
| GET | `/auth/invite/:token` | None | Validate invite token; returns `{ email }` |
| POST | `/auth/refresh` | None | Exchange refresh token for new JWT pair |
| POST | `/auth/logout` | None | Invalidate refresh token |
| POST | `/auth/forgot-password` | None | Send password reset email (silent on missing user) |
| POST | `/auth/reset-password` | None | Complete password reset with token + new password |
| POST | `/auth/player/join` | None | Join a team via join code; returns player JWT |

### Key Payloads

**POST /auth/login**
```json
{ "email": "string", "password": "string" }
```
Response: `{ "accessToken", "refreshToken", "user": { id, name, email, role } }`

**POST /auth/register/:token**
```json
{ "name": "string", "email": "string", "password": "string" }
```
Response: same as login

**POST /auth/refresh**
```json
{ "refreshToken": "string" }
```
Response: same as login

**POST /auth/player/join**
```json
{ "joinCode": "string", "displayName": "string", "deviceId": "string" }
```
Response: `{ "token", "player": { id, displayName }, "team": { id, name, color }, "game": { id, name, status } }`

**POST /auth/forgot-password**
```json
{ "email": "string" }
```
Header: `X-Forwarded-Host` (for email link generation)

**POST /auth/reset-password**
```json
{ "token": "string", "password": "string" }
```

> Token limits: access tokens expire in 15 min; refresh tokens in 7 days. Password reset tokens expire in 1 hour (max 3 active per user).

---

## 2. Game Management

**Base path**: `/api/games`
**Auth**: `ROLE_ADMIN` or `ROLE_OPERATOR`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/games` | Operator | List all games (admin: all; operator: own games) |
| GET | `/games/:id` | Operator | Get game by ID |
| POST | `/games` | Operator | Create game; creator becomes operator |
| PUT | `/games/:id` | Operator | Update game metadata |
| DELETE | `/games/:id` | Operator | Delete game (cascades all data) |
| PATCH | `/games/:id/status` | Operator | Transition game status |
| GET | `/games/:id/operators` | Operator | List operators for game |
| POST | `/games/:id/operators/:userId` | Operator | Add operator to game |
| DELETE | `/games/:id/operators/:userId` | Operator | Remove operator from game |
| GET | `/games/:id/export` | Operator | Export game definition as JSON |
| POST | `/games/import` | Operator | Import game from export JSON |

### Key Payloads

**POST /games** (CreateGameRequest)
```json
{
  "name": "string",
  "description": "string",
  "startDate": "ISO8601 (optional)",
  "endDate": "ISO8601 (optional)",
  "uniformAssignment": false,
  "tileSource": "osm | osm-classic | voyager | positron | swisstopo | swisstopo-sat"
}
```

**PATCH /games/:id/status** (UpdateGameStatusRequest)
```json
{ "status": "setup | live | ended", "resetProgress": false }
```
> `resetProgress: true` clears all check-ins, submissions, and activity events.

**Game Status Transitions**: `setup` → `live` → `ended`. Any status can revert to `setup` with `resetProgress: true`.

**Export format** (`GET /games/:id/export`):
```json
{
  "exportVersion": "string",
  "exportedAt": "ISO8601",
  "game": { "name", "description", "uniformAssignment" },
  "bases": [{ "tempId", "name", "description", "lat", "lng", "hidden", "requirePresenceToSubmit", "fixedChallengeTempId" }],
  "challenges": [{ "tempId", "title", "description", "content", "completionContent", "answerType", "autoValidate", "correctAnswer", "points", "locationBound" }],
  "assignments": [{ "baseTempId", "challengeTempId", "teamTempId" }],
  "teams": [{ "tempId", "name", "color" }]
}
```

---

## 3. Base Management

**Base path**: `/api/games/:gameId/bases`
**Auth**: `ROLE_ADMIN` or `ROLE_OPERATOR`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/games/:gameId/bases` | Operator | List bases for game |
| POST | `/games/:gameId/bases` | Operator | Create base |
| PUT | `/games/:gameId/bases/:baseId` | Operator | Update base |
| DELETE | `/games/:gameId/bases/:baseId` | Operator | Delete base (cascades assignments, check-ins) |
| PATCH | `/games/:gameId/bases/:baseId/nfc-link` | Operator | Mark base as NFC-linked |

### Key Payloads

**POST /games/:gameId/bases** (CreateBaseRequest)
```json
{
  "name": "string",
  "description": "string (optional)",
  "lat": 0.0,
  "lng": 0.0,
  "fixedChallengeId": "UUID (optional)",
  "requirePresenceToSubmit": false,
  "hidden": false
}
```

> `requirePresenceToSubmit: true` requires players to be physically present (NFC scan) to submit answers.
> `hidden: true` hides the base from players' map view.
> `PATCH /nfc-link` is called by the iOS app after writing an NFC tag to a physical marker.

---

## 4. Challenge Management

**Base path**: `/api/games/:gameId/challenges`
**Auth**: `ROLE_ADMIN` or `ROLE_OPERATOR`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/games/:gameId/challenges` | Operator | List challenges for game |
| POST | `/games/:gameId/challenges` | Operator | Create challenge |
| PUT | `/games/:gameId/challenges/:challengeId` | Operator | Update challenge |
| DELETE | `/games/:gameId/challenges/:challengeId` | Operator | Delete challenge (cascades assignments, submissions) |

### Key Payloads

**POST /games/:gameId/challenges** (CreateChallengeRequest)
```json
{
  "title": "string",
  "description": "string",
  "content": "string (rich text)",
  "completionContent": "string (rich text)",
  "answerType": "text | file | none",
  "autoValidate": false,
  "correctAnswer": ["string (optional, for autoValidate=true)"],
  "points": 10,
  "locationBound": false,
  "fixedBaseId": "UUID (optional)",
  "unlocksBaseId": "UUID (optional)"
}
```

**Answer Types**:
- `text` — Free-form text; optionally auto-validated against `correctAnswer`
- `file` — Photo/video upload; requires manual operator review
- `none` — Check-in only; auto-approves on submission

> `correctAnswer` supports `{{variableName}}` template syntax resolved per-team from team variables.

---

## 5. Assignment Management

**Base path**: `/api/games/:gameId/assignments`
**Auth**: `ROLE_ADMIN` or `ROLE_OPERATOR`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/games/:gameId/assignments` | Operator | List all assignments |
| POST | `/games/:gameId/assignments` | Operator | Create single assignment |
| PUT | `/games/:gameId/assignments` | Operator | Bulk replace all assignments |
| DELETE | `/games/:gameId/assignments/:assignmentId` | Operator | Delete assignment |

### Key Payloads

**POST /games/:gameId/assignments** (CreateAssignmentRequest)
```json
{ "baseId": "UUID", "challengeId": "UUID", "teamId": "UUID (optional)" }
```

**PUT /games/:gameId/assignments** (BulkAssignmentRequest)
```json
{ "assignments": [{ "baseId": "UUID", "challengeId": "UUID", "teamId": "UUID (optional)" }] }
```

> `teamId: null` creates an all-teams assignment. Cannot mix all-teams and team-specific assignments on the same base.

---

## 6. Team Management

**Base path**: `/api/games/:gameId/teams`
**Auth**: `ROLE_ADMIN` or `ROLE_OPERATOR`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/games/:gameId/teams` | Operator | List teams |
| POST | `/games/:gameId/teams` | Operator | Create team (generates join code) |
| PUT | `/games/:gameId/teams/:teamId` | Operator | Update team name/color |
| DELETE | `/games/:gameId/teams/:teamId` | Operator | Delete team (cascades players, submissions) |
| GET | `/games/:gameId/teams/:teamId/players` | Operator | List team members |
| DELETE | `/games/:gameId/teams/:teamId/players/:playerId` | Operator | Remove player from team |

### Key Payloads

**POST /games/:gameId/teams** (CreateTeamRequest)
```json
{ "name": "string", "color": "#3b82f6 (hex, optional)" }
```

Response includes `joinCode` — a unique 20-character alphanumeric code players use to join.

---

## 7. Player Endpoints

**Base path**: `/api/player`
**Auth**: `ROLE_PLAYER` (except `/auth/player/join` which is public)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/player/join` | None | Join team via join code (see Auth section) |
| POST | `/player/games/:gameId/bases/:baseId/check-in` | Player | Check in at NFC base |
| GET | `/player/games/:gameId/progress` | Player | Get team progress across all bases |
| GET | `/player/games/:gameId/bases` | Player | Get available bases for player's team |
| GET | `/player/games/:gameId/data` | Player | Get full game data (assignments, challenges, status) |
| POST | `/player/games/:gameId/submissions` | Player | Submit text answer |
| POST | `/player/games/:gameId/submissions/upload` | Player | Submit answer with file (multipart) |
| POST | `/player/games/:gameId/location` | Player | Update player location |
| PUT | `/player/push-token` | Player | Register device push token |
| DELETE | `/player/me` | Player | Delete own player data |
| GET | `/player/notifications` | Player | Get team notifications |
| GET | `/player/notifications/unseen-count` | Player | Get unseen notification count |
| POST | `/player/notifications/mark-seen` | Player | Mark all notifications as seen |

### Key Payloads

**POST /player/games/:gameId/submissions** (PlayerSubmissionRequest)
```json
{
  "baseId": "UUID",
  "challengeId": "UUID",
  "answer": "string (optional for file/none types)",
  "fileUrl": "string (optional, for completed chunked uploads)",
  "idempotencyKey": "string (optional, for offline dedup)"
}
```

**POST /player/games/:gameId/submissions/upload** (multipart/form-data)
```
file: binary
baseId: UUID
challengeId: UUID
answer: string (optional)
idempotencyKey: string (optional)
```

**POST /player/games/:gameId/location**
```json
{ "lat": 0.0, "lng": 0.0 }
```

**PUT /player/push-token**
```json
{ "pushToken": "string", "platform": "ios | android" }
```

**GET /player/notifications/unseen-count** response:
```json
{ "count": 3 }
```

> Check-ins are idempotent per team-base pair. The device ID in the join request identifies a player — same device rejoining a different team creates a new player record on that team.

---

## 8. Submission Endpoints

### Operator Submission Management

**Base path**: `/api/games/:gameId/submissions`
**Auth**: `ROLE_ADMIN` or `ROLE_OPERATOR`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/games/:gameId/submissions` | Operator | List all submissions for game |
| POST | `/games/:gameId/submissions` | Operator | Create submission (operator-initiated) |
| PATCH | `/games/:gameId/submissions/:submissionId/review` | Operator | Review (approve/reject) a submission |

### Key Payloads

**PATCH /games/:gameId/submissions/:submissionId/review** (ReviewSubmissionRequest)
```json
{
  "status": "approved | rejected",
  "feedback": "string (optional)",
  "points": 10
}
```

**Submission Status Lifecycle**:

| Answer Type | Auto-Validate | Resulting Status |
|-------------|---------------|-----------------|
| `none` | n/a | `approved` (immediate) |
| `text` | `true` | `correct` or `rejected` (auto) |
| `text` | `false` | `pending` (manual review) |
| `file` | n/a | `pending` (manual review) |

> File download: `GET /api/games/:gameId/files/:filename` (operator) or `GET /api/player/files/:gameId/:filename` (player, own team only)

---

## 9. File Upload

**Base path**: `/api/player/games/:gameId/uploads`
**Auth**: `ROLE_PLAYER`

Chunked upload flow for large files (videos, etc.). Use for files that may exceed a single request limit.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/player/games/:gameId/uploads/sessions` | Player | Create upload session |
| PUT | `/player/games/:gameId/uploads/sessions/:sessionId/chunks/:chunkIndex` | Player | Upload a chunk (body: raw bytes) |
| GET | `/player/games/:gameId/uploads/sessions/:sessionId` | Player | Get session status and progress |
| POST | `/player/games/:gameId/uploads/sessions/:sessionId/complete` | Player | Assemble chunks into final file |
| DELETE | `/player/games/:gameId/uploads/sessions/:sessionId` | Player | Cancel and discard upload session |

### Key Payloads

**POST /player/games/:gameId/uploads/sessions** (UploadSessionInitRequest)
```json
{ "fileName": "string", "fileSize": 12345678 }
```

Response (`UploadSessionResponse`):
```json
{
  "sessionId": "UUID",
  "status": "pending | uploading | complete | failed",
  "chunkSize": 8388608,
  "totalChunks": 3,
  "uploadedChunks": 0,
  "fileUrl": "string (present when status=complete)"
}
```

**Upload limits**:
- Max chunk size: 16 MB
- Default chunk size: 8 MB
- Max active sessions per player: 3
- Max total active bytes per game: 2 GB
- Session TTL: 48 hours

**File download**:

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/player/files/:gameId/:filename` | Player | Download file (own team only) |
| GET | `/games/:gameId/files/:filename` | Operator | Download any file in game |

Supported content types: `video/mp4`, `video/quicktime`, `image/jpeg`, `image/png`, `image/webp`, `image/heic`.

---

## 10. Monitoring

**Base path**: `/api/games/:gameId/monitoring`
**Auth**: `ROLE_ADMIN` or `ROLE_OPERATOR`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/games/:gameId/monitoring/dashboard` | Operator | Aggregate game stats |
| GET | `/games/:gameId/monitoring/leaderboard` | Operator | Team rankings by points |
| GET | `/games/:gameId/monitoring/activity` | Operator | Activity event timeline |
| GET | `/games/:gameId/monitoring/locations` | Operator | Real-time team positions |
| GET | `/games/:gameId/monitoring/progress` | Operator | Per-team, per-base submission status |

### Response Shapes

**Dashboard**:
```json
{ "teamsCount": 5, "submissionsCount": 42, "checkedInCount": 30, "pendingReviewCount": 3 }
```

**Leaderboard entry**:
```json
{ "teamId": "UUID", "teamName": "string", "points": 150, "rank": 1 }
```

**Location entry**:
```json
{ "teamId": "UUID", "lat": 47.3, "lng": 8.5, "updatedAt": "ISO8601" }
```

**Progress entry**:
```json
{ "teamId": "UUID", "baseId": "UUID", "submissionStatus": "pending | approved | correct | rejected | null" }
```

---

## 11. Broadcast (Public)

**Base path**: `/api/broadcast`
**Auth**: None — public spectator endpoints

These endpoints expose live game data using a 6-character broadcast code. The code is generated when `broadcastEnabled: true` is set on a game.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/broadcast/:code` | None | Full broadcast data (leaderboard + activity) |
| GET | `/broadcast/:code/leaderboard` | None | Live leaderboard |
| GET | `/broadcast/:code/locations` | None | Live team locations |
| GET | `/broadcast/:code/progress` | None | Live team progress |

> The broadcast code is a 6-character uppercase alphanumeric (excludes `0`, `1`, `I`, `O` to avoid ambiguity). Enabled via `PUT /games/:id` with `{ "broadcastEnabled": true }`.

---

## 12. WebSocket

**Endpoint**: `/ws` (STOMP over SockJS)
**Auth**: Bearer token in STOMP `Authorization` connect header
**Heartbeat**: 10s / 10s
**Reconnect delay**: 5s (web), exponential backoff up to 30s (mobile)

### Operator/Web Client

**Subscribe**: `/topic/games/:gameId`

| Message Type | Payload | Frontend Cache Invalidation |
|-------------|---------|---------------------------|
| `activity` | Activity event | activity, submissions, dashboard-stats, leaderboard, progress |
| `submission_status` | Submission update | submissions, dashboard-stats, leaderboard, progress |
| `notification` | Notification sent | notifications |
| `game_status` | Game status change | game, dashboard-stats, games list |
| `leaderboard` | Points update | leaderboard |
| `location` | Team location update | team-locations |
| `presence` | Operator online list | operator presence store |

### Broadcast (Public) Client

**Subscribe**: `/topic/games/:gameId`
**Auth**: `X-Broadcast-Code` header (no Bearer token required)

Receives the same message types filtered to the broadcast game.

### Mobile Client (iOS/Android)

**Endpoint**: `/ws/mobile?gameId=:gameId`
**Auth**: Bearer token in HTTP upgrade header

| Event Type | Action |
|-----------|--------|
| `game_status` | Update local game state, reload progress |
| `submission_status` | Reload progress |
| `activity` | Reload progress |
| `notification` | Increment unseen notification count |

---

## 13. Team Variables

**Base path**: `/api/games/:gameId`
**Auth**: `ROLE_ADMIN` or `ROLE_OPERATOR`

Team variables allow per-team values to be injected into challenge content and correct answers via `{{variableName}}` template syntax.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/games/:gameId/team-variables` | Operator | Get game-level variable definitions and values |
| PUT | `/games/:gameId/team-variables` | Operator | Save game-level variables |
| GET | `/games/:gameId/challenges/:challengeId/team-variables` | Operator | Get challenge-level variables |
| PUT | `/games/:gameId/challenges/:challengeId/team-variables` | Operator | Save challenge-level variables |
| GET | `/games/:gameId/team-variables/completeness` | Operator | Check if all variables have values for all teams |

### Payload Structure

```json
{
  "variables": [
    {
      "key": "nextCoordinates",
      "teamValues": {
        "<teamId-1>": "47.3769° N, 8.5417° E",
        "<teamId-2>": "47.3800° N, 8.5380° E"
      }
    }
  ]
}
```

**Resolution order** (when rendering challenge content or validating answers):
1. Challenge-level variables
2. Game-level variables
3. Unresolved `{{key}}` left as-is

**Completeness check** response:
```json
{ "complete": true }
```

> All variables must have values for all teams before a game can go live.

---

## 14. Operator Notification Settings

**Base path**: `/api/games/:gameId/operator-notification-settings`
**Auth**: `ROLE_ADMIN` or `ROLE_OPERATOR`

Per-game, per-operator push notification preferences.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/games/:gameId/operator-notification-settings/me` | Operator | Get current user's notification settings for game |
| PUT | `/games/:gameId/operator-notification-settings/me` | Operator | Update notification settings |

### Payload

**PUT** (UpdateOperatorNotificationSettingsRequest)
```json
{
  "notifyPendingSubmissions": true,
  "notifyAllSubmissions": false,
  "notifyCheckIns": false
}
```

| Setting | Description |
|---------|-------------|
| `notifyPendingSubmissions` | Push when a submission requires manual review |
| `notifyAllSubmissions` | Push for every submission (including auto-validated) |
| `notifyCheckIns` | Push when a team checks in at a base |

---

## 15. Users & Invites

### Users

**Base path**: `/api/users`
**Auth**: `ROLE_ADMIN` or `ROLE_OPERATOR`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/users` | Admin only | List all users |
| GET | `/users/me` | Operator | Get current authenticated user |
| PUT | `/users/me/push-token` | Operator | Register operator push token |

**PUT /users/me/push-token**
```json
{ "pushToken": "string", "platform": "ios | android" }
```

### Invites

**Base path**: `/api/invites`
**Auth**: `ROLE_ADMIN` or `ROLE_OPERATOR`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/invites` | Admin | List all pending invites |
| GET | `/invites/game/:gameId` | Operator | List invites for a specific game |
| GET | `/invites/my` | Operator | List invites sent by current user |
| POST | `/invites` | Operator | Send operator invite by email |
| POST | `/invites/:inviteId/accept` | Operator | Accept invite (normally called by register flow) |

**POST /invites** (CreateInviteRequest)
```json
{ "email": "string", "gameId": "UUID (optional)" }
```

> Invites are accepted automatically when the invited user completes registration via `POST /auth/register/:token`.

---

## 16. Notifications

**Base path**: `/api/games/:gameId/notifications`
**Auth**: `ROLE_ADMIN` or `ROLE_OPERATOR`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/games/:gameId/notifications` | Operator | List all notifications sent in game |
| POST | `/games/:gameId/notifications` | Operator | Send push notification to teams |

**POST /games/:gameId/notifications** (CreateNotificationRequest)
```json
{
  "message": "string",
  "targetTeamId": "UUID (optional, null = all teams)"
}
```

> Notifications are delivered via WebSocket to connected players and via APNs/FCM push to offline devices.

---

## Error Responses

All errors follow:
```json
{ "message": "string", "status": 400 }
```

| HTTP Status | Meaning |
|-------------|---------|
| 400 | Bad request / validation failure |
| 401 | Missing or expired token |
| 403 | Insufficient role |
| 404 | Resource not found |
| 409 | Conflict (duplicate, constraint violation) |
| 429 | Rate limited (e.g., password reset) |
| 500 | Internal server error |

---

## Security Notes

- CSRF: Disabled (stateless JWT)
- Session: Stateless (no server-side sessions)
- Access tokens: in-memory only on clients (not persisted to localStorage)
- Refresh tokens: stored in DB; invalidated on logout
- File access: scoped by role — players can only access their team's files
- Broadcast endpoints: intentionally public; no game-identifying info beyond the opaque code
