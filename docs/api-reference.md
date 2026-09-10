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
17. [Stages](#17-stages)
18. [Workspaces, Quota, and Billing](#18-workspaces-quota-and-billing)

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
| POST | `/auth/request-registration` | None | Request operator registration (sends link if eligible) |
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

**POST /auth/request-registration**
```json
{ "email": "string" }
```
Response: `{ "message": "If eligible, a registration link has been sent." }`

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
| GET | `/games` | Operator | List the personal workspace's games; `?orgId=<uuid>` lists that organization's games (members with `OPERATE_GAMES`) |
| GET | `/games/:id` | Operator | Get game by ID |
| POST | `/games` | Operator | Create game; creator becomes operator. Optional `orgId` makes it org-owned (needs `CREATE_GAMES`) |
| PUT | `/games/:id` | Operator | Update game metadata |
| DELETE | `/games/:id` | Operator | Delete game (cascades all data). An org game additionally needs `DELETE_GAMES` in that org |
| PATCH | `/games/:id/status` | Operator | Transition game status |
| GET | `/games/:id/operators` | Operator | List operators for game |
| POST | `/games/:id/operators/:userId` | Operator | Add operator to game |
| DELETE | `/games/:id/operators/:userId` | Operator | Remove operator from game |
| GET | `/games/:id/export` | Operator | Export game definition as JSON |
| POST | `/games/import` | Operator | Import game from export JSON; optional `orgId` imports into an organization (needs `CREATE_GAMES`) |
| GET | `/games/:id/snapshot` | Player or Operator | Canonical state snapshot (see below) |

### Key Payloads

**POST /games** (CreateGameRequest)
```json
{
  "name": "string",
  "description": "string",
  "startDate": "ISO8601 (optional)",
  "endDate": "ISO8601 (optional)",
  "uniformAssignment": false,
  "tileSource": "osm | osm-classic | voyager | positron | swisstopo | swisstopo-sat",
  "orgId": "uuid (optional)"
}
```
> `orgId` creates the game inside that organization instead of the caller's
> personal workspace. The caller must be a member with `CREATE_GAMES`
> (`403` otherwise). An org game does not count against the creator's personal
> active-game quota; the organization's live-game limit is enforced at go-live
> instead. It is ignored when `tutorialScenario` is set — practice games are
> always personal. `GameImportRequest` accepts the same optional `orgId`.
> The game response carries `orgId` and `orgName` for org-owned games, both
> `null` for personal ones. See `docs/business-logic.md` § "Org-owned games".

**PATCH /games/:id/status** (UpdateGameStatusRequest)
```json
{ "status": "setup | live | ended", "resetProgress": false }
```
> `resetProgress: true` soft-archives all check-ins, submissions, and activity events (V36 audit foundation). Rows stay in the database with `archived = true`; gameplay queries hide them, the Phase 3 audit export reads the full history.

**Game Status Transitions**: `setup` → `live` → `ended`. Any status can revert to `setup` with `resetProgress: true`.

**Export format** (`GET /games/:id/export`):
```json
{
  "exportVersion": "string",
  "exportedAt": "ISO8601",
  "game": { "name", "description", "uniformAssignment" },
  "bases": [{ "tempId", "name", "description", "lat", "lng", "hidden", "fixedChallengeTempId" }],
  "challenges": [{ "tempId", "title", "description", "content", "completionContent", "answerType", "autoValidate", "correctAnswer", "points", "locationBound", "requirePresenceToSubmit" }],
  "assignments": [{ "baseTempId", "challengeTempId", "teamTempId" }],
  "teams": [{ "tempId", "name", "color" }]
}
```

### State Snapshot — `GET /games/:gameId/snapshot`

Canonical state snapshot for a game. Single call that returns everything the caller needs to reconcile its state — the safety net clients reach for after reconnect, foreground, network return, or any missed realtime event. Source spec: `docs/specs/2026-04-08-post-pilot-reliability-and-operator-workflow.md` (P0 Track 2 Slice 1). Product contract: `docs/business-logic.md` §4 "State Snapshot and Version Contract".

**Auth**: Accepts both player JWT (`ROLE_PLAYER`, scoped to a team in this game) and operator JWT (`ROLE_ADMIN` or `ROLE_OPERATOR` with access to this game). This is the only endpoint under `/api/games/**` that is reachable by player JWTs; `SecurityConfig` has an explicit carve-out for `GET /api/games/*/snapshot`.

**Response shape**: depends on the caller's role.

- `401 Unauthorized` — no JWT
- `403 Forbidden` — JWT does not grant access to this game (player from another team/game, operator not on this game's roster)
- `200 OK` — the snapshot

#### Player shape (player JWT) — `PlayerSnapshotResponse`

**Product rule: no scores in the player snapshot.** No `score`, `points`, `leaderboard`, or `rank` keys appear at any nesting depth. Scoring is operator-side only in PointFinder.

```json
{
  "stateVersion": 17,
  "serverTime": "2026-04-08T14:23:05.817Z",
  "game": {
    "id": "d4e5f6a7-b8c9-0123-defa-234567890123",
    "name": "Forest Adventure",
    "description": "A scouting game in the forest",
    "status": "live",
    "unlockTrigger": "CHECK_IN",
    "tileSource": "osm-classic",
    "startDate": "2026-04-08T08:00:00Z",
    "endDate": "2026-04-08T18:00:00Z"
  },
  "team": {
    "id": "c3d4e5f6-a7b8-9012-cdef-123456789012",
    "name": "Eagles",
    "color": "#FF5733",
    "memberCount": 4
  },
  "progress": [
    {
      "baseId": "a7b8c9d0-e1f2-3456-abcd-567890123456",
      "challengeTitle": "Find the tree",
      "lat": 47.3769,
      "lng": 8.5417,
      "nfcLinked": true,
      "status": "completed",
      "checkedInAt": "2026-04-08T09:15:00Z",
      "challengeId": "f6a7b8c9-d0e1-2345-fabc-456789012345",
      "submissionStatus": "approved"
    }
  ],
  "submissions": [
    {
      "id": "e5f6a7b8-c9d0-1234-efab-345678901234",
      "baseId": "a7b8c9d0-e1f2-3456-abcd-567890123456",
      "challengeId": "f6a7b8c9-d0e1-2345-fabc-456789012345",
      "status": "approved",
      "submittedAt": "2026-04-08T09:30:00Z",
      "fileUrl": "/api/player/files/d4e5f6a7-b8c9-0123-defa-234567890123/photo.jpg",
      "fileUrls": ["/api/player/files/d4e5f6a7-b8c9-0123-defa-234567890123/photo.jpg"]
    }
  ],
  "uploadSessions": [
    {
      "sessionId": "11111111-2222-3333-4444-555555555555",
      "gameId": "d4e5f6a7-b8c9-0123-defa-234567890123",
      "mediaItemKey": "local-photo-4711",
      "originalFileName": "IMG_4711.HEIC",
      "contentType": "image/heic",
      "totalSizeBytes": 2473625,
      "chunkSizeBytes": 8388608,
      "totalChunks": 1,
      "uploadedChunks": [0],
      "status": "completed",
      "fileUrl": "/uploads/d4e5f6a7-b8c9-0123-defa-234567890123/photo.heic",
      "expiresAt": "2026-04-09T09:30:00Z",
      "createdAt": "2026-04-08T09:29:50Z",
      "updatedAt": "2026-04-08T09:30:00Z",
      "completedAt": "2026-04-08T09:30:00Z"
    }
  ]
}
```

The `progress` list uses the same shape as `GET /api/player/games/:gameId/progress` (`BaseProgressResponse`). The `uploadSessions` list uses the same shape as `GET /api/player/games/:gameId/uploads/sessions` (`UploadSessionResponse`). Both are capped at 100 entries per snapshot.

#### Operator shape (operator/admin JWT) — `OperatorSnapshotResponse`

```json
{
  "stateVersion": 17,
  "serverTime": "2026-04-08T14:23:05.817Z",
  "game": {
    "id": "d4e5f6a7-b8c9-0123-defa-234567890123",
    "name": "Forest Adventure",
    "description": "A scouting game in the forest",
    "status": "live",
    "unlockTrigger": "CHECK_IN",
    "tileSource": "osm-classic",
    "startDate": "2026-04-08T08:00:00Z",
    "endDate": "2026-04-08T18:00:00Z",
    "uniformAssignment": false,
    "broadcastEnabled": true,
    "broadcastCode": "FOREST2026"
  },
  "teams": [
    {
      "id": "c3d4e5f6-a7b8-9012-cdef-123456789012",
      "name": "Eagles",
      "color": "#FF5733",
      "score": 350,
      "memberCount": 4
    }
  ],
  "leaderboard": [
    {
      "teamId": "c3d4e5f6-a7b8-9012-cdef-123456789012",
      "teamName": "Eagles",
      "color": "#FF5733",
      "points": 350,
      "completedChallenges": 5
    }
  ],
  "pendingReviews": 2,
  "activeUploads": 1,
  "needsAttention": 0
}
```

`leaderboard` uses the existing `LeaderboardEntry` shape. `pendingReviews` is the count of submissions currently in `pending` status. `activeUploads` counts upload sessions in `active` state that have not yet expired. `needsAttention` counts completed-but-unlinked upload sessions older than `app.uploads.needs-attention-threshold-minutes` (default 15) — the same row set the needs-attention detector surfaces.

#### State version

Every snapshot carries a `stateVersion` long. This is the monotonically-increasing counter bumped by `GameEventBroadcaster` on every state-mutating, snapshot-relevant event (`game_status`, `game_config`, `activity`, `submission_status`, `leaderboard`, `notification`). Transient events (`location`, `presence`) deliberately do NOT bump. See `docs/business-logic.md` §4 for the full contract.

Clients should store the version they observe via realtime broadcasts and, on reconnect, compare it to `snapshot.stateVersion` to decide whether to replace cached state wholesale.

#### Future `?lastSeenVersion` optimization (not yet implemented)

A future slice will add `GET /api/games/:gameId/snapshot?lastSeenVersion=N`. When `N >= current state_version`, the endpoint will return `204 No Content` to save bandwidth on defensive polls. Clients can pass `lastSeenVersion` through today; it is currently ignored.

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
| PATCH | `/games/:gameId/bases/reorder` | Operator | Reorder bases by sending the full ordered ID list |

### Key Payloads

**POST /games/:gameId/bases** (CreateBaseRequest)
```json
{
  "name": "string",
  "description": "string (optional)",
  "lat": 0.0,
  "lng": 0.0,
  "fixedChallengeId": "UUID (optional)",
  "hidden": false,
  "tags": ["string (optional, operator-only, max 20 entries, max 40 chars each)"],
  "color": "#3b82f6 (optional, operator-only, 7-char hex)"
}
```

> `hidden: true` hides the base from players' map view.
> `PATCH /nfc-link` is called by the iOS app after writing an NFC tag to a physical marker.

**PATCH /games/:gameId/bases/reorder** (ReorderRequest)
```json
{ "ids": ["uuid-1", "uuid-2", "uuid-3"] }
```

- Sends the **complete ordered list** of base UUIDs for the game. The server sets `order_index = position` for each entry.
- IDs that belong to a different game are silently ignored (idempotent).
- Returns `204 No Content` on success.
- The list endpoint (`GET /games/:gameId/bases`) returns bases sorted by `order_index ASC, created_at ASC`.
- Validated: `ids` must be non-null and contain at most 500 entries.
- After a successful reorder the server broadcasts a `game_config` WebSocket event (`type=bases, action=reordered`) to all operator subscribers so other open tabs update without a page reload.

**Operator-only fields**: `BaseResponse` (returned by all endpoints under `/api/games/:gameId/bases`) carries `tags` (up to 20 free-text strings for setup organization) and `color` (a 7-char hex string for visual grouping). Both fields are NEVER returned on any player-facing endpoint: `GET /api/player/games/:gameId/bases`, `GET /api/player/games/:gameId/data`, and `GET /api/player/games/:gameId/progress` all serialize bases through dedicated player DTOs (`PlayerBaseResponse`, `BaseProgressResponse`, `BroadcastBaseResponse`) that have no `tags` or `color` fields. The `PlayerControllerTest` in the backend asserts the absence via JSON path plus a case-insensitive full-body substring check, so any regression that reintroduces `BaseResponse` on the player path fails the standard `make test-backend-docker` run. See `docs/business-logic.md` § "Tags and Colors on Bases and Challenges" for the full privacy contract and DTO table.

**Validation**:
- `tags`: `@Size(max = 20)` on the list; each entry `@Size(max = 40)`. Empty list collapses to `null`.
- `color`: `@Pattern(regexp = "^#[0-9a-fA-F]{6}$")`. Blank strings collapse to `null`.

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
| PATCH | `/games/:gameId/challenges/reorder` | Operator | Reorder challenges by sending the full ordered ID list |

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
  "requirePresenceToSubmit": false,
  "fixedBaseId": "UUID (optional)",
  "unlocksBaseId": "UUID (optional)",
  "operatorNotes": "string (optional, operator-only, max 5000 chars)",
  "tags": ["string (optional, operator-only, max 20 entries, max 40 chars each)"],
  "color": "#3b82f6 (optional, operator-only, 7-char hex)"
}
```

**Answer Types**:
- `text` — Free-form text; optionally auto-validated against `correctAnswer`
- `file` — Photo/video upload; requires manual operator review
- `none` — Check-in only; auto-approves on submission

> `correctAnswer` supports `{{variableName}}` template syntax resolved per-team from team variables.

**PATCH /games/:gameId/challenges/reorder** (ReorderRequest)
```json
{ "ids": ["uuid-1", "uuid-2", "uuid-3"] }
```

- Sends the **complete ordered list** of challenge UUIDs for the game. The server sets `order_index = position` for each entry.
- IDs that belong to a different game are silently ignored (idempotent).
- Returns `204 No Content` on success.
- The list endpoint (`GET /games/:gameId/challenges`) returns challenges sorted by `order_index ASC, created_at ASC`.
- Validated: `ids` must be non-null and contain at most 500 entries.
- After a successful reorder the server broadcasts a `game_config` WebSocket event (`type=challenges, action=reordered`) to all operator subscribers so other open tabs update without a page reload.

**Operator-only fields**: `ChallengeResponse` (returned by all endpoints under `/api/games/:gameId/challenges`) carries three operator-only fields that are NEVER returned on any player-facing endpoint:

- `operatorNotes` — free-text string with a 5000-character cap (setup reminders, equipment lists, private tips).
- `tags` — list of up to 20 free-text strings (max 40 chars each) for setup organization.
- `color` — 7-char hex string (e.g. `#3b82f6`) for visual grouping; the web admin uses a fixed 12-swatch palette while the server accepts any valid hex.

`GET /api/player/games/:gameId/data` serializes challenges through a dedicated `PlayerChallengeResponse` DTO that has none of these fields, and `POST /api/player/games/:gameId/bases/:baseId/check-in` returns a narrower `CheckInResponse.ChallengeInfo` shape that also omits them. The `PlayerControllerTest` in the backend asserts the absence via JSON path plus a case-insensitive full-body substring check (for both `operatorNotes` and `tags` / `color`), so any regression that reintroduces `ChallengeResponse` on the player path fails the standard `make test-backend-docker` run. See `docs/business-logic.md` § "Operator-Only Challenge Notes" and § "Tags and Colors on Bases and Challenges" for the full privacy contracts and DTO tables.

**Validation**:
- `operatorNotes`: `@Size(max = 5000)`. Blank collapses to `null`.
- `tags`: `@Size(max = 20)` on the list; each entry `@Size(max = 40)`. Empty list collapses to `null`.
- `color`: `@Pattern(regexp = "^#[0-9a-fA-F]{6}$")`. Blank strings collapse to `null`.

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
| POST | `/games/:gameId/teams/:teamId/check-in/:baseId` | Operator | Manual operator check-in (audited rescue) |
| POST | `/games/:gameId/teams/:teamId/bases/:baseId/mark-completed` | Operator | Mark a challenge complete for the team (audited rescue) |
| POST | `/games/:gameId/teams/:teamId/bases/:baseId/unlock-override` | Operator | Force-unlock a hidden base for the team (audited rescue, reversible) |
| DELETE | `/games/:gameId/teams/:teamId/bases/:baseId/unlock-override` | Operator | Soft-delete the active unlock override for the pair |
| GET | `/games/:gameId/teams/:teamId/unlock-overrides` | Operator | List active unlock overrides for the team |

### Key Payloads

**POST /games/:gameId/teams** (CreateTeamRequest)
```json
{ "name": "string", "color": "#3b82f6 (hex, optional)" }
```

Response includes `joinCode` — a unique 20-character alphanumeric code players use to join.

**POST /games/:gameId/teams/:teamId/check-in/:baseId** (OperatorCheckInRequest, optional body)
```json
{ "reason": "string (optional, max 500 chars)" }
```

The operator manual check-in endpoint creates a check-in for the given team at the given base on behalf of an operator. The request body is OPTIONAL — legacy clients that POST without a body still work and the audit row records `operator_reason = NULL`. The endpoint is idempotent on the active `(team_id, base_id)` pair: a second call returns the existing check-in without mutating its audit fields. The synthesized check-in row carries the V36 audit fields (`actor_operator_user_id`, `actor_display_name_snapshot`, `source_surface = 'operator_rescue'`, `operator_reason`) and the corresponding `ActivityEvent` records the same actor metadata. See `docs/business-logic.md` § "Audit Trail Foundation" for the full audit contract.

### Operator Rescue Overrides (P1 Phase 2)

The three endpoints below are the Phase 2 rescue surface on top of the V36 audit foundation. All of them require `ROLE_ADMIN` or `ROLE_OPERATOR` with access to the game. Full behavior and audit contract: `docs/business-logic.md` § "Operator Rescue Actions".

**POST /games/:gameId/teams/:teamId/bases/:baseId/mark-completed** (MarkCompletedRequest)
```json
{
  "challengeId": "UUID (required)",
  "reason": "string (optional, max 500 chars)",
  "pointsOverride": 50
}
```

Synthesizes an APPROVED `Submission` attributed to the operator. Used when a team physically completed a task but the app got stuck. The `pointsOverride` field is optional; when absent the submission is awarded the challenge's configured `points`. Negative values are allowed for symmetry with the normal review path.

Preconditions:
- Team, base, and challenge must all belong to the target game.
- Team must have an ACTIVE check-in at the base. Otherwise the endpoint returns 400 with `MARK_COMPLETED_REQUIRES_CHECKIN` in the message — call the manual check-in endpoint first if needed.

Response: `201 Created` with the `SubmissionResponse` on first call. A re-call for the same `(operator, team, base, challenge)` tuple is idempotent and returns the same submission (via a deterministic `idempotency_key` derived from the tuple).

Example success response:
```json
{
  "id": "b1a4c9e2-0000-0000-0000-000000000001",
  "teamId": "UUID",
  "challengeId": "UUID",
  "baseId": "UUID",
  "answer": "[Operator marked complete]",
  "fileUrl": null,
  "fileUrls": null,
  "status": "approved",
  "submittedAt": "2026-04-08T17:45:00Z",
  "reviewedBy": "operator-UUID",
  "feedback": null,
  "points": 10,
  "completionContent": "Well done!"
}
```

Error cases:
| Status | Meaning |
|---|---|
| 400 | Missing `challengeId` or team has no active check-in at the base (`MARK_COMPLETED_REQUIRES_CHECKIN`). |
| 403 | Caller does not have access to the game. |
| 404 | Team, base, or challenge does not exist. |

**POST /games/:gameId/teams/:teamId/bases/:baseId/unlock-override** (UnlockOverrideRequest, optional body)
```json
{ "reason": "string (optional, max 500 chars)" }
```

Creates (or returns the existing active) base unlock override for the `(team, base)` pair. Once an active override exists, `PlayerService.getProgress` treats the base as visible to that team regardless of the normal `unlockTrigger`. The override is scoped to the specific team — other teams in the same game do NOT see the base.

Idempotency: a duplicate POST for an already-active pair returns the existing row without mutating its audit fields. Re-clicking the "unlock" button is safe.

Response: `201 Created` with the `BaseUnlockOverrideResponse`:
```json
{
  "id": "UUID",
  "gameId": "UUID",
  "teamId": "UUID",
  "baseId": "UUID",
  "createdByOperatorId": "operator-UUID",
  "createdByDisplayName": "Jane Operator",
  "reason": "GPS rain-out; letting them attempt the hidden base",
  "createdAt": "2026-04-08T17:45:00Z"
}
```

Error cases:
| Status | Meaning |
|---|---|
| 403 | Caller does not have access to the game. |
| 404 | Team or base does not exist. |

**DELETE /games/:gameId/teams/:teamId/bases/:baseId/unlock-override** (UnlockOverrideRequest, optional body)
```json
{ "reason": "string (optional, max 500 chars)" }
```

Soft-deletes the active unlock override for the `(team, base)` pair by setting `deleted_at`, `deleted_by_operator_id`, and `deleted_by_display_name_snapshot`. The history row is preserved — a subsequent `POST` for the same pair creates a NEW row. The optional `reason` is narrated on the emitted `operator_override` activity event.

Response: `204 No Content` on success.

Error cases:
| Status | Meaning |
|---|---|
| 403 | Caller does not have access to the game. |
| 404 | Team, base, or active override does not exist. |

**GET /games/:gameId/teams/:teamId/unlock-overrides**

Lists all active unlock overrides for the team in the game. Used by the operator UI to surface "this team has overrides active" and to allow removal.

Response: `200 OK` with an array of `BaseUnlockOverrideResponse` objects (same shape as POST response).

Error cases: `403` (no game access) or `404` (team not found).

All three endpoints emit an `operator_override` activity event via the standard `GameEventBroadcaster` path, which auto-bumps `games.state_version`. Player clients reconcile via the snapshot endpoint on next foreground/reconnect — no push notification is sent.

---

## 7. Player Endpoints

**Base path**: `/api/player`
**Auth**: `ROLE_PLAYER` (except `/auth/player/join` which is public)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/player/join` | None | Join team via join code (see Auth section) |
| POST | `/player/games/:gameId/bases/:baseId/check-in` | Player | Check in at NFC base. **Requires** `nfcToken` in body (Wave B). |
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
  "fileUrl": "string (optional, legacy single-file path)",
  "fileUrls": ["string (optional, multi-file path for chunked uploads)"],
  "idempotencyKey": "UUID (optional, for offline dedup)"
}
```

`fileUrls` is the canonical multi-file path used by current iOS/Android clients and accepts up to 5 file URLs per submission. `fileUrl` is preserved for legacy single-file callers; if both are present, `fileUrls` wins. Each URL must be a backend-issued path returned by a completed chunked upload session — submission creation validates ownership and game scope before persisting.

**Upload session ↔ submission linkage**: When this endpoint succeeds, the backend automatically populates `upload_sessions.submission_id` for every completed upload session belonging to the same `(playerId, gameId)` whose `file_url` appears in the submitted list. This linkage runs in the same transaction as submission creation, is idempotent across retries with the same `idempotencyKey`, and never fails the submission. See `docs/business-logic.md` § "Upload Session ↔ Submission Contract" for the full contract and the needs-attention detector.

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

### Player-facing response shapes

P1 Phase 4 W4 — **player-facing naming contract**: players see challenge titles, not base names. Base names are operator-oriented setup metadata and are NEVER returned on any player endpoint. The backend enforces this structurally (the DTOs do not carry the field at all) and via JSON path assertions in `PlayerControllerTest.getGameDataResponseDoesNotLeakBaseName` and `getGameDataResponseStringDoesNotContainBaseNameKey`. See `docs/business-logic.md` § "Player-Facing Naming Contract" for the rationale and complete DTO table.

**`GET /player/games/:gameId/bases` — `PlayerBaseResponse[]`**

```json
[
  {
    "id": "a7b8c9d0-e1f2-3456-abcd-567890123456",
    "gameId": "d4e5f6a7-b8c9-0123-defa-234567890123",
    "lat": 47.3769,
    "lng": 8.5417,
    "nfcLinked": true,
    "hidden": false,
    "fixedChallengeId": "f6a7b8c9-d0e1-2345-fabc-456789012345"
  }
]
```

No `name`, `description`, `tags`, `color`, or `nfcToken` — those are operator-only fields served by `GET /api/games/:gameId/bases` (the operator endpoint) under the `BaseResponse` shape.

**`GET /player/games/:gameId/progress` — `BaseProgressResponse[]`**

```json
[
  {
    "baseId": "a7b8c9d0-e1f2-3456-abcd-567890123456",
    "challengeTitle": "Find the tree",
    "lat": 47.3769,
    "lng": 8.5417,
    "nfcLinked": true,
    "status": "completed",
    "checkedInAt": "2026-04-08T09:15:00Z",
    "challengeId": "f6a7b8c9-d0e1-2345-fabc-456789012345",
    "submissionStatus": "approved"
  }
]
```

`challengeTitle` is **nullable**: `null` when no challenge is assigned for this `(team, base)` pair (e.g. a revealed hidden base that is purely a check-in-only unlock target, or a base whose assignment was cleared after the team joined). Player UIs fall back to a localized placeholder when the title is null.

**`POST /player/games/:gameId/bases/:baseId/check-in`**

Request body (`CheckInRequest`): `nfcToken` is **required** (Wave B hardening). The client must scan the physical NFC tag to obtain the token, which the server compares against `base.nfc_token`. Missing or blank value → 400 with code `NFC_TOKEN_REQUIRED`; mismatch → 400 "Invalid NFC verification token".

```json
{
  "nfcToken": "ABC12345"
}
```

Response body (`CheckInResponse`):

```json
{
  "checkInId": "11111111-2222-3333-4444-555555555555",
  "baseId": "a7b8c9d0-e1f2-3456-abcd-567890123456",
  "checkedInAt": "2026-04-08T09:15:00Z",
  "challenge": {
    "id": "f6a7b8c9-d0e1-2345-fabc-456789012345",
    "title": "Find the tree",
    "description": "Locate the oldest tree in the grove",
    "content": "<p>Full instructions ...</p>",
    "completionContent": "<p>Well done!</p>",
    "answerType": "text",
    "points": 100,
    "requirePresenceToSubmit": false
  }
}
```

No `baseName` at the top level. The player app renders `challenge.title` as the post-check-in banner and the navigation title. The same shape is also returned by the operator rescue endpoint `POST /api/games/:gameId/teams/:teamId/check-in/:baseId` — operators rescue from screens that already know the target base via `baseId`, so the response does not need to echo a human-readable base label.

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

`points` is an optional integer in the inclusive range `[-100000, 100000]`. **Negative values are allowed** so an operator can apply a penalty during review (e.g., for a partially correct or out-of-bounds submission). This was changed from the previous non-negative-only constraint by commit `3b721c8`.

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
| POST | `/player/games/:gameId/uploads/sessions` | Player | Create or resume upload session |
| GET | `/player/games/:gameId/uploads/sessions` | Player | List active and completed recoverable sessions |
| DELETE | `/player/games/:gameId/uploads/sessions` | Player | Clear abandoned non-completed sessions; optional `mediaItemKey` query |
| PUT | `/player/games/:gameId/uploads/sessions/:sessionId/chunks/:chunkIndex` | Player | Upload a chunk (body: raw bytes) |
| GET | `/player/games/:gameId/uploads/sessions/:sessionId` | Player | Get session status and progress |
| POST | `/player/games/:gameId/uploads/sessions/:sessionId/complete` | Player | Assemble chunks into final file |
| DELETE | `/player/games/:gameId/uploads/sessions/:sessionId` | Player | Cancel and discard upload session |

### Key Payloads

**POST /player/games/:gameId/uploads/sessions** (UploadSessionInitRequest)
```json
{
  "originalFileName": "video.mp4",
  "mediaItemKey": "client-local-media-id-123",
  "contentType": "video/mp4",
  "totalSizeBytes": 12345678,
  "chunkSizeBytes": 8388608
}
```

Response (`UploadSessionResponse`):
```json
{
  "sessionId": "UUID",
  "gameId": "UUID",
  "mediaItemKey": "client-local-media-id-123",
  "originalFileName": "video.mp4",
  "contentType": "video/mp4",
  "totalSizeBytes": 12345678,
  "chunkSizeBytes": 8388608,
  "totalChunks": 3,
  "uploadedChunks": [0, 1],
  "status": "active | completed | cancelled | expired",
  "fileUrl": "string (present when status=completed)",
  "expiresAt": "2026-04-08T12:00:00Z",
  "createdAt": "2026-04-08T10:00:00Z",
  "updatedAt": "2026-04-08T10:15:00Z",
  "completedAt": "2026-04-08T10:20:00Z"
}
```

`mediaItemKey` is optional for legacy clients. When present, it must be stable for one local media item. Repeating session creation with the same key and matching metadata returns the existing active session, or the completed session with `fileUrl` if assembly already succeeded. Reusing the same key with different upload metadata returns a permanent conflict.

**GET /player/games/:gameId/uploads/sessions**

Returns the player's recoverable sessions for the game: non-expired active uploads plus completed uploads whose `fileUrl` can still be used to retry final submission creation.

**DELETE /player/games/:gameId/uploads/sessions?mediaItemKey=client-local-media-id-123**
```json
{ "cancelledSessions": 1, "clearedSessions": 1 }
```

Without `mediaItemKey`, this clears all current player's non-completed upload sessions for the game. Completed uploads are preserved so final submission retries do not lose media.

Upload-specific errors include optional classification fields in the standard error response:
```json
{
  "status": 400,
  "message": "Too many active upload sessions for player",
  "errors": null,
  "timestamp": "2026-04-08T10:00:00Z",
  "traceId": null,
  "code": "UPLOAD_SESSION_LIMIT",
  "retryable": true
}
```

**Upload limits**:
- Max chunk size: 16 MB
- Default chunk size: 8 MB
- Max non-expired active sessions per player: 3
- Max total non-expired active bytes per game: 16 GB
- Session TTL: 48 hours

**File download**:

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/player/files/:gameId/:filename` | Player | Download file (own team only) |
| GET | `/games/:gameId/files/:filename` | Operator | Download any file in game |

Supported content types: `video/mp4`, `video/quicktime`, `image/jpeg`, `image/png`, `image/webp`, `image/heic`.

**Organizer resources visible to a team** (files and rich documents from the resource library):

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/player/games/:gameId/files` | Player | Resources the team may see now: shared with players, plus embeds in bases the team checked in at and challenges it submitted to. Files carry a short-lived presigned `downloadUrl`; documents carry enriched `content`. Operator-only fields are omitted. |
| GET | `/player/games/:gameId/resources/:resourceId/download` | Player | 302 to a presigned URL for a file the team may see under the same rule; 403 otherwise. |

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

### 10.1 Realtime Health Stats (P0 Track 2 Slice 5)

**Endpoint**: `GET /api/games/:gameId/realtime-stats`
**Auth**: `ROLE_ADMIN` or `ROLE_OPERATOR` (operator must have access to the game; 403 if not)
**Purpose**: Returns current realtime connection counts and rolling-hour reconnect rate for the operator dashboard Realtime Health widget. Operators use this to verify that the live event's WebSocket infrastructure is healthy and clients are actually connected.

**Response**:
```json
{
  "stompActiveSessions": 3,
  "mobileActiveSessions": 7,
  "totalActiveSessions": 10,
  "stompConnectsLastHour": 42,
  "mobileConnectsLastHour": 128,
  "stompDisconnectsLastHour": 38,
  "mobileDisconnectsLastHour": 121,
  "estimatedReconnectsLastHour": 95,
  "lastUpdated": "2026-04-08T12:34:56Z"
}
```

**Field definitions**:
- `stompActiveSessions`: Web-admin STOMP sessions subscribed to this game right now
- `mobileActiveSessions`: Mobile (iOS + Android) native WebSocket sessions for this game right now
- `totalActiveSessions`: Sum of `stompActiveSessions` and `mobileActiveSessions`
- `stompConnectsLastHour`: Cumulative STOMP connection attempts in the rolling hour
- `mobileConnectsLastHour`: Cumulative mobile WebSocket connection attempts in the rolling hour
- `stompDisconnectsLastHour`: Cumulative STOMP disconnections in the rolling hour
- `mobileDisconnectsLastHour`: Cumulative mobile WebSocket disconnections in the rolling hour
- `estimatedReconnectsLastHour`: Heuristic reconnect total across both hubs. A connect from the same client identifier within 30 seconds of a prior disconnect counts as a reconnect. See implementation notes below.
- `lastUpdated`: Server wall clock (UTC) when this snapshot was produced

**Example curl**:
```bash
curl -H "Authorization: Bearer $OPERATOR_JWT" \
  https://pointfinder.pt/api/games/550e8400-e29b-41d4-a716-446655440000/realtime-stats
```

**Polling**: Web-admin polls this endpoint every 30 seconds via React Query (`staleTime: 30s`) to feed the Realtime Health widget.

**Error responses**:
- `401 Unauthorized`: No JWT provided or JWT is invalid
- `403 Forbidden`: Operator does not have access to the game
- `404 Not Found`: Game does not exist

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

**Progress entry** (`TeamBaseProgressResponse`):
```json
{ "teamId": "UUID", "baseId": "UUID", "challengeId": "UUID", "status": "not_visited | checked_in | submitted | completed | rejected", "checkedInAt": "ISO8601", "submissionStatus": "pending | approved | correct | rejected | null" }
```

---

## 10a. Activity Audit Export

**Base path**: `/api/games/:gameId`
**Auth**: `ROLE_ADMIN` or `ROLE_OPERATOR` (operator must have access to the game)
**Spec**: `docs/specs/2026-04-08-post-pilot-reliability-and-operator-workflow.md` — P1 Phase 3

Reviewer-facing chronological export of every audited action on a game. Reads the activity-events stream as the canonical spine and enriches each row with its Phase 2 operator-reason field (for mark-completed, unlock-override, and manual check-in rescues). Built on the Phase 1 actor snapshots so the export survives player/operator account removal.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/games/:gameId/audit-export` | Operator | Chronological audit export (JSON or CSV) |

### Query parameters (all optional)

| Parameter | Type | Default | Semantics |
|---|---|---|---|
| `format` | `json` \| `csv` | `json` | Output format. Both emit `Content-Disposition: attachment; filename="audit-{gameId}-{timestamp}.{ext}"`. |
| `from` | ISO-8601 instant | unset | Inclusive lower bound on the event timestamp. |
| `to` | ISO-8601 instant | unset | Exclusive upper bound on the event timestamp. |
| `teamId` | UUID | unset | Only return events whose target team matches. |
| `playerId` | UUID | unset | Only return events whose player actor FK matches. |
| `operatorId` | UUID | unset | Only return events whose operator actor FK matches. |
| `actionType` | string | unset | Single value or comma-separated list. Allowed: `check_in`, `submission`, `approval`, `rejection`, `operator_override`, `team_join`, `team_switch`. |
| `sourceSurface` | string | unset | Exact match on the V36 `source_surface` column. Allowed values: `player_app`, `web_admin`, `operator_rescue`. |
| `includeArchived` | boolean | `false` | When `true`, include rows preserved by a `resetProgress=true` reset. Default hides them so the default export matches the live state. |

Validation errors:

- `400 AUDIT_EXPORT_INVALID_FORMAT` — `format` is not `json` or `csv`.
- `400 AUDIT_EXPORT_INVALID_TIMESTAMP` — `from` or `to` is not a valid ISO-8601 instant.
- `400 AUDIT_EXPORT_INVALID_RANGE` — `to` is not strictly after `from`.
- `400 AUDIT_EXPORT_INVALID_ACTION_TYPE` — `actionType` list contains an unknown action.
- `401 Unauthorized` — no JWT.
- `403 Forbidden` — operator does not have access to the game.
- `404 Not Found` — game does not exist.

### JSON response shape

The JSON form is a single top-level array. Each element has the uniform `AuditEntryDto` envelope:

```json
[
  {
    "id": "11111111-1111-1111-1111-111111111111",
    "timestamp": "2026-03-15T14:30:00Z",
    "type": "check_in",
    "sourceSurface": "player_app",
    "actor": {
      "type": "player",
      "id": "22222222-2222-2222-2222-222222222222",
      "displayName": "Scout Alpha",
      "deviceId": "device-abc-123"
    },
    "target": {
      "team": { "id": "33333333-3333-3333-3333-333333333333", "name": "Red Falcons" },
      "base": { "id": "44444444-4444-4444-4444-444444444444", "name": "Clock Tower" },
      "challenge": null
    },
    "details": {
      "message": "Team Red Falcons checked in at Clock Tower",
      "operatorReason": null
    },
    "archived": false
  },
  {
    "id": "55555555-5555-5555-5555-555555555555",
    "timestamp": "2026-03-15T14:45:10Z",
    "type": "operator_override",
    "sourceSurface": "operator_rescue",
    "actor": {
      "type": "operator",
      "id": "66666666-6666-6666-6666-666666666666",
      "displayName": "Operator Sam",
      "deviceId": null
    },
    "target": {
      "team": { "id": "33333333-3333-3333-3333-333333333333", "name": "Red Falcons" },
      "base": { "id": "44444444-4444-4444-4444-444444444444", "name": "Clock Tower" },
      "challenge": { "id": "77777777-7777-7777-7777-777777777777", "title": "Bell-ringing riddle" }
    },
    "details": {
      "message": "Operator Sam marked Clock Tower completed",
      "operatorReason": "Phone died mid-submission"
    },
    "archived": false
  }
]
```

- `actor.type` is always `player`, `operator`, or `system`. The `system` fallback is used only for pre-V36 legacy rows where no actor FK was ever captured.
- `actor.displayName` is the immutable V36 snapshot when available; for pre-V36 legacy rows the service falls back to the live join on `players.display_name` / `users.name`, and finally to the literal string `"Unknown"`.
- `actor.deviceId` is populated for player actors only; always `null` for operators and `system`.
- `details.operatorReason` is the Phase 2 rescue explanation copied from `submissions.operator_reason` or `check_ins.operator_reason`; `null` for organic player actions.
- `archived` is `true` only when `includeArchived=true` was requested AND the row was preserved by a `resetProgress=true` reset.
- `details.checkInMethod` (`NFC`, `QR`, `LOCATION`) and `details.checkInVerification` (`VERIFIED`, `CLAIMED`, `OPERATOR`) are populated for `check_in` rows only. `details.checkInProof` is a JSON string with the raw geo proof (`lat`, `lng`, `accuracyM`, `distanceM`, `capturedAt`) and, for claims, the `teamPositions` snapshot; `null` for token proofs and rescues.

Response headers:

```
Content-Type: application/json
Content-Disposition: attachment; filename="audit-<gameId>-<isoTimestamp>.json"
```

### CSV response shape

The CSV form uses a stable column order documented below. Parsers should read the header row to tolerate future additions appended to the tail. Row terminator is `\r\n` (RFC-4180). Fields containing comma, double-quote, carriage return, or line feed are double-quoted and embedded quotes are escaped by doubling.

Column order:

```
timestamp,type,source_surface,actor_type,actor_id,actor_display_name,actor_device_id,team_id,team_name,base_id,base_name,challenge_id,challenge_title,message,operator_reason,archived,check_in_method,check_in_verification,check_in_proof
```

Example rows (header + two entries):

```csv
timestamp,type,source_surface,actor_type,actor_id,actor_display_name,actor_device_id,team_id,team_name,base_id,base_name,challenge_id,challenge_title,message,operator_reason,archived,check_in_method,check_in_verification,check_in_proof
2026-03-15T14:30:00Z,check_in,player_app,player,22222222-2222-2222-2222-222222222222,Scout Alpha,device-abc-123,33333333-3333-3333-3333-333333333333,Red Falcons,44444444-4444-4444-4444-444444444444,Clock Tower,,"Team Red Falcons checked in at Clock Tower",,false,NFC,VERIFIED,
2026-03-15T14:45:10Z,operator_override,operator_rescue,operator,66666666-6666-6666-6666-666666666666,Operator Sam,,33333333-3333-3333-3333-333333333333,Red Falcons,44444444-4444-4444-4444-444444444444,Clock Tower,77777777-7777-7777-7777-777777777777,Bell-ringing riddle,"Operator Sam marked Clock Tower completed",Phone died mid-submission,false,,,
```

A player display name like `Scout "Nickname", Jr.` is quoted and escaped as `"Scout ""Nickname"", Jr."`.

Response headers:

```
Content-Type: text/csv; charset=utf-8
Content-Disposition: attachment; filename="audit-<gameId>-<isoTimestamp>.csv"
```

### Example requests

```bash
# Full export (default JSON, hides archived rows)
curl -H "Authorization: Bearer $TOKEN" \
  https://pointfinder.pt/api/games/$GAME_ID/audit-export

# CSV for the last two hours of one team
curl -H "Authorization: Bearer $TOKEN" \
  "https://pointfinder.pt/api/games/$GAME_ID/audit-export?format=csv&from=2026-03-15T12:00:00Z&to=2026-03-15T14:00:00Z&teamId=$TEAM_ID"

# Every operator action for incident review (includes archived rows)
curl -H "Authorization: Bearer $TOKEN" \
  "https://pointfinder.pt/api/games/$GAME_ID/audit-export?operatorId=$OPERATOR_ID&actionType=operator_override,approval,rejection&includeArchived=true"

# "What did this player do before they got moved to the right team?"
curl -H "Authorization: Bearer $TOKEN" \
  "https://pointfinder.pt/api/games/$GAME_ID/audit-export?playerId=$PLAYER_ID&includeArchived=true"
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
**Alternative endpoint**: `/ws-native` (raw STOMP, lower latency; set via `VITE_WS_URL` environment variable at build time)
**Auth**: Bearer token in STOMP `Authorization` connect header
**Heartbeat**: 10s / 10s
**Reconnect delay**: 5s (web), exponential backoff up to 30s (mobile)

**See also**:
- Infrastructure routing and `VITE_WS_URL` configuration: `docs/infrastructure.md` § "Frontend Build (Vite)" and § "WebSocket proxy"
- WebSocket error codes (e.g., `WS_ACCESS_DENIED`): `docs/realtime-and-mobile.md` § "WebSocket Error Codes"
- State snapshot contract and recovery: `docs/realtime-and-mobile.md` § "State Snapshot Contract"

### Operator/Web Client

**Subscribe**: three topic families per game (see audience split below).

| Topic | Payload | Audience | Frontend Cache Invalidation |
|-------|---------|----------|---------------------------|
| `/topic/games/:gameId` | `activity`, `game_status`, `game_config`, `stage_unlock`, `notification`, `location`, `presence` | All principals that can access the game (operator / broadcast / player) | activity, submissions, dashboard-stats, team-locations, etc. |
| `/topic/games/:gameId/operator/submission_status` | Full review payload: `id`, `teamId`, `challengeId`, `baseId`, `status`, `submittedAt`, `reviewedBy`, `feedback`, `points` | Operator/admin/creator only (subscribe-auth rejects players + broadcast viewers) | submissions, dashboard-stats, leaderboard, progress |
| `/topic/games/:gameId/operator/leaderboard` | Leaderboard refresh signal | Operator/admin/creator only | leaderboard |
| `/topic/games/:gameId/team/:teamId/submission_status` | Sanitized review for the owning team: `id`, `teamId`, `challengeId`, `baseId`, `status`, `submittedAt` — never `points`, `feedback`, or `reviewedBy` | Player whose JWT `teamId` matches; operators of the game may also read | progress (player app) |

Wave A audit remediation note: before 2026-04-16, `submission_status` and `leaderboard` broadcast on `/topic/games/:gameId` directly, so any player subscribed to the game topic could harvest other teams' scores and review feedback. The split above enforces the product invariant "players don't see scores or leaderboards" at the transport layer.

### Broadcast (Public) Client

**Subscribe**: `/topic/games/:gameId`
**Auth**: `X-Broadcast-Code` header (no Bearer token required)

Receives only the public channels (`activity`, `location`, `game_status`, `presence`, `notification`, `stage_unlock`). Operator-only and team-scoped sub-topics are rejected at SUBSCRIBE time. Score changes surface to spectators indirectly: every review emits an `activity` approval/rejection event that invalidates the REST leaderboard/progress queries.

**Broadcast-code throttle**: invalid `X-Broadcast-Code` attempts are rate-limited per source IP (via `X-Forwarded-For` / `X-Real-IP`): 5 failures in 60 seconds → 15-minute lockout. Failures are logged at WARN; the attempted code itself is never logged.

### Mobile Client (iOS/Android)

**Endpoint**: `/ws/mobile?gameId=:gameId`
**Auth**: Bearer token in HTTP upgrade header

Mobile uses a single raw WebSocket per game instead of STOMP topics; the server filters payloads on the hub based on the handshake-authenticated principal (player vs operator) and, for team-scoped events, the player's `teamId` claim. Player tokens MUST include the `teamId` claim so the handshake can bind the session to a team.

| Event Type | Audience | Player app action |
|-----------|----------|-------------------|
| `game_status` | All | Update local game state, reload progress |
| `activity` | All | Reload progress (no scoring fields) |
| `submission_status` | Operator: full payload. Player: sanitized projection delivered only to the owning team's players. Other teams' players see nothing. | Reload progress |
| `leaderboard` | Operator only | Not delivered to player apps |
| `notification` | All | Increment unseen notification count |

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
| GET | `/users/me/tutorials` | Operator | List the caller's guided-tutorial progress |
| PUT | `/users/me/tutorials/:scenarioId` | Operator | Upsert progress for one tutorial scenario |

**PUT /users/me/push-token**
```json
{ "pushToken": "string", "platform": "ios | android" }
```

**GET /users/me/tutorials**

Returns one row per tutorial the operator has started, skipped, or completed.
A scenario with no row has never been started. Progress is per account, so it
follows the operator across the browser and the Tauri shell.

```json
[
  {
    "scenarioId": "first-game",
    "status": "in_progress",
    "currentStep": "go-live",
    "gameId": "8b0f1a2c-...",
    "startedAt": "2026-09-06T09:12:00Z",
    "completedAt": null
  }
]
```

**PUT /users/me/tutorials/:scenarioId** (UpdateTutorialProgressRequest)

```json
{ "status": "in_progress", "currentStep": "go-live", "gameId": "8b0f1a2c-..." }
```

| Field | Description |
|-------|-------------|
| `status` | `in_progress`, `completed`, or `skipped`. Required. |
| `currentStep` | The scenario step id the operator is on. Optional; `null` with `in_progress` **restarts** the scenario (resets `startedAt`, clears `completedAt`). |
| `gameId` | The game a `setup-game` scenario is bound to, so Resume returns to it. Optional. Nulled if that game is deleted. |

`scenarioId` must be one of `introduction`, `first-game`, `fixed-route`,
`exploration`, `unlock-chain`, `different-path`, `variable-outcome`; anything
else returns `400 TUTORIAL_SCENARIO_UNKNOWN`. `introduction` is the account's
"How PointFinder works" story (watched after registration or offered at
sign-in): it shares this table so its status follows the account across
devices, never carries a `gameId`, and says nothing about `first-game`. An unrecognised `status` returns
`400 TUTORIAL_STATUS_UNKNOWN`. Returns the stored row. Not audited — this is UI
preference, not domain state.

**POST /users/me/tutorials/:scenarioId/practice-game** (PracticeGameRequest)

```json
{ "name": "Practice: fixed route", "lat": 41.15, "lng": -8.61 }
```

Creates, seeds and binds a **practice game** for a `practice-game` scenario
(`fixed-route`, `exploration`, `unlock-chain`, `different-path`,
`variable-outcome`) and returns `201` with the `GameResponse`. `first-game` and
`introduction` are refused with `400 TUTORIAL_PRACTICE_GAME_NOT_ALLOWED`. A
tutorial never runs on a game the operator made for a real event; it runs on a
practice game, which:

- is marked with `tutorialScenario` and `tutorialExpiresAt` on `GameResponse`;
- is excluded from the personal active-game count and quota;
- takes a **single player** (`400 TUTORIAL_PRACTICE_GAME_PLAYER_LIMIT` on the
  second join), so the operator can see the player side and nothing more;
- is ended by the scheduler 24 hours after creation if still in setup or live;
- can be kept (`POST /games/:id/keep`) or deleted (`DELETE /games/:id`).

Seeding places bases around `lat`/`lng` (the operator's map centre; a fixed
spot when omitted): three QR bases, three (fixed route) or two (exploration)
text challenges assigned one per base, and one team. The scenario's progress
row is set to `in_progress` with a null step and the new `gameId`.

`409 TUTORIAL_PRACTICE_GAME_EXISTS` while the caller owns a practice game that
has not ended. `400 TUTORIAL_PRACTICE_GAME_NOT_ALLOWED` for `first-game`, whose
practice game the operator creates through `POST /games` with
`tutorialScenario: "first-game"`; that flag is honoured only while the caller's
`first-game` row is `in_progress` and is otherwise ignored.

**POST /games/:id/keep** turns a practice game into a normal game: clears both
marker fields under the normal active-game quota, whether or not the game has
ended (`400 QUOTA_ACTIVE_GAMES_EXCEEDED` when enforcement is on and the operator
is at the limit, `400 TUTORIAL_NOT_PRACTICE_GAME` for a normal game). Needs game
access. Reviving an ended personal game through `PATCH /games/:id/status` is
checked against the same quota.

### Invites

**Base path**: `/api/invites`
**Auth**: `ROLE_ADMIN` or `ROLE_OPERATOR`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/invites` | Admin | List all pending invites |
| GET | `/games/:gameId/invites` | Operator | List invites for a specific game |
| GET | `/invites/my` | Operator | List invites sent by current user |
| POST | `/invites` | Operator | Send operator invite by email |
| POST | `/invites/:inviteId/accept` | Operator | Accept invite (normally called by register flow) |
| DELETE | `/invites/:inviteId` | Operator | Delete/revoke a pending invite |

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

## 17. Stages

**Base path**: `/api/games/:gameId/stages`
**Auth**: `ROLE_ADMIN` or `ROLE_OPERATOR` with access to the game.
**Added**: migration `V46__stages.sql`. See `docs/business-logic.md` § 4d for semantics (auto-activation of the first stage, transition types, delete behaviour, broadcasts).

| Method | Path | Description |
|--------|------|-------------|
| GET | `/games/:gameId/stages` | List stages ordered by `orderIndex`. |
| POST | `/games/:gameId/stages` | Create a stage. First stage in a game auto-activates and captures all existing bases. |
| PUT | `/games/:gameId/stages/:stageId` | Update name, description, transition type, schedule, or trigger base. |
| DELETE | `/games/:gameId/stages/:stageId` | Delete stage; detaches bases (sets their `stage_id` to null). |
| PATCH | `/games/:gameId/stages/reorder` | Reorder stages. Body: `{ "ids": ["stageId1", "stageId2", ...] }` in desired order. |

**StageResponse**
```json
{
  "id": "UUID",
  "gameId": "UUID",
  "name": "string",
  "description": "string",
  "orderIndex": 0,
  "transitionType": "manual | scheduled | trigger",
  "scheduledAt": "ISO-8601 or null",
  "triggerBaseId": "UUID or null",
  "isActive": false,
  "baseIds": ["UUID", "..."],
  "createdAt": "ISO-8601",
  "updatedAt": "ISO-8601"
}
```

**CreateStageRequest / UpdateStageRequest**
```json
{
  "name": "string (required)",
  "description": "string (optional)",
  "transitionType": "manual | scheduled | trigger",
  "scheduledAt": "ISO-8601 (required if transitionType='scheduled')",
  "triggerBaseId": "UUID (required if transitionType='trigger')"
}
```

**Broadcasts**: `game_config` on every CRUD; `stage_unlock` additionally fires on activation (including the auto-activation of the first stage). See `docs/realtime-and-mobile.md`.

**Error codes**: `STAGE_NOT_FOUND`, `STAGE_GAME_MISMATCH`, `STAGE_HAS_BASES`, `STAGE_TRIGGER_BASE_NOT_FOUND`, `STAGE_ALREADY_ACTIVE` (see Error Codes appendix below).

---

## 18. Workspaces, Quota, and Billing

Two billing models sit side by side. A **personal** workspace is self-serve:
free or pro, bought on Stripe. An **organization** is sales-led: an admin
creates it, invoices it, and its access runs on a term. See
`docs/business-logic.md` § "Clubs and Invoicing" for the model behind these
endpoints.

### Workspaces

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/workspaces` | Operator | The caller's personal workspace plus every org they belong to |

```json
{
  "personal": { "tier": "free | pro", "status": "active | past_due | grace_period | frozen | cancelled", "activeGames": 2 },
  "organizations": [
    {
      "id": "UUID", "name": "string", "slug": "string",
      "tier": "free | club",
      "status": "active | past_due | grace_period | frozen | cancelled",
      "memberCount": 12, "liveGames": 1, "permissions": 127,
      "termEnd": "ISO-8601 | null"
    }
  ]
}
```

`termEnd` is what a dashboard shows as "paid until". `null` means the org has
no term: a free org, or a club an admin drives by hand.

### Quota

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/quota/personal` | Operator | Limits and usage for the caller's personal workspace |
| GET | `/quota/org/:orgId` | Org member or admin | Limits and usage for one org |

```json
{
  "context": "personal | org",
  "orgId": "UUID | null",
  "tier": "free | pro | club",
  "limits": {
    "maxActiveGames": 1, "maxOperatorsPerGame": 1, "maxBasesPerGame": 25,
    "maxFileSizeBytes": 104857600, "maxMembers": null, "maxLiveGames": null,
    "maxResourceStorageBytes": 0, "maxPlayersPerGame": 50, "locationCheckIn": false
  },
  "usage": {
    "currentActiveGames": 0, "currentMembers": null,
    "currentLiveGames": null, "currentResourceStorageBytes": 0
  },
  "overrides": { "max_members": 40 },
  "status": "active",
  "termEnd": "ISO-8601 | null"
}
```

A `null` limit means unlimited. `overrides` is the raw per-deal JSON, present
only when the workspace has one; `limits` already has it applied.

### Personal billing

**Base path**: `/api/billing` · **Auth**: Operator

| Method | Path | Description |
|--------|------|-------------|
| POST | `/billing/checkout` | Stripe Checkout session for the pro plan |
| POST | `/billing/portal` | Stripe billing portal for the caller's own subscription |
| GET | `/billing/status` | The caller's subscription tier, status, cycle, period end |
| GET | `/billing/invoices` | The caller's Stripe invoices (`limit`, `startingAfter`) |

**POST /billing/checkout**
```json
{ "plan": "pro", "cycle": "monthly | annual" }
```
Returns `{ "url": "string", "sessionId": "string" }`. Prices live in Stripe;
the backend only maps `STRIPE_PRICE_PRO_MONTHLY` and `STRIPE_PRICE_PRO_ANNUAL`.

> There is no org checkout and no org billing portal. `POST /billing/org-checkout`,
> `POST /billing/org-portal`, and the `orgId` parameter on `/billing/checkout`
> and `/billing/invoices` were removed with the club model.

### Organizations

**Base path**: `/api/orgs` · **Auth**: Operator, gated per endpoint by `OrgPermission`

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| POST | `/orgs` | admin role | Create a bare free org (fixtures only; clubs go through `/admin/orgs`) |
| GET | `/orgs/:orgId` | member | Org detail |
| PATCH | `/orgs/:orgId` | MANAGE_PERMS | Rename |
| DELETE | `/orgs/:orgId` | creator or admin | Delete |
| POST | `/orgs/:orgId/transfer-ownership` | creator (or platform admin) | Hand the org to another member |
| POST | `/orgs/:orgId/leave` | member | Remove the caller's own membership (`204`) |
| GET | `/orgs/:orgId/invoices` | MANAGE_BILLING | The club's invoice history |
| GET | `/orgs/:orgId/members` | member | Members |
| DELETE | `/orgs/:orgId/members/:userId` | INVITE_MEMBERS | Remove a member |
| PATCH | `/orgs/:orgId/members/:userId/permissions` | MANAGE_PERMS | Set a member's permission bitmask |
| POST | `/orgs/:orgId/invites` | INVITE_MEMBERS | Invite by email |
| GET | `/orgs/:orgId/invites` | INVITE_MEMBERS | Pending, expired and declined invites, newest first |
| DELETE | `/orgs/:orgId/invites/:inviteId` | INVITE_MEMBERS | Revoke |

**OrgResponse** (returned by create, get, patch, and both transfer routes)
```json
{
  "id": "UUID", "name": "string", "slug": "string", "createdBy": "UUID",
  "subscriptionTier": "free | club",
  "subscriptionStatus": "active | past_due | grace_period | frozen | cancelled",
  "memberCount": 12,
  "quotaOverrides": { "max_members": 40 },
  "termEnd": "ISO-8601 | null",
  "createdAt": "ISO-8601"
}
```

**POST /orgs/:orgId/transfer-ownership**
```json
{ "userId": "UUID" }
```
The target must already be a member; otherwise `400 ORG_TRANSFER_TARGET_NOT_MEMBER`.
The new owner is granted every permission.

Only the club's **current creator** may call this route. `MANAGE_PERMS` used to
be enough, which let a member holding that bit name themselves the owner. A
platform admin uses `/admin/orgs/:orgId/transfer-ownership` instead, which is
where a club whose owner has genuinely gone is rescued. Anyone else gets `403`.

**POST /orgs/:orgId/leave** → `204 No Content`

Removes the caller's own membership. The org's creator is refused with
`400 ORG_CREATOR_CANNOT_LEAVE` — they must transfer ownership first. A caller
who is not a member gets `404`.

### Org invites (the invitee's side)

**Base path**: `/api` · **Auth**: Operator

| Method | Path | Description |
|--------|------|-------------|
| GET | `/org-invites/my` | The caller's pending org invites |
| POST | `/org-invites/:inviteId/accept` | Join the org (`200`, returns `OrgMemberResponse`) |
| POST | `/org-invites/:inviteId/decline` | Refuse the invite (`204`) |

Org invites **expire 14 days after they are created**. A pending invite past
its `expires_at` is refused by accept, by the token lookup and by registration.
The hourly lifecycle sweep is what moves the row to `expired`, so a club's
pending list stops showing an answer that will never come; a refused attempt
only refuses, because the error it raises would roll a status write back with
it. Rows created before expiry existed were backfilled to
`created_at + 14 days`.

**POST /org-invites/:inviteId/decline** → `204 No Content`

Marks a pending invite `declined`. Terminal: a later accept of the same invite
answers `400`, and so does a second decline. Only the addressee may decline,
matched on email case-insensitively — someone else's invite is `403` and an
unknown id is `404`. The row is kept rather than deleted so the org still sees
what it sent.

**GET /orgs/:orgId/invoices** → array of `OrgInvoiceResponse`
```json
[{
  "id": "UUID", "orgId": "UUID", "stripeInvoiceId": "in_...",
  "amountCents": 49900, "currency": "eur", "description": "string",
  "status": "draft | open | paid | void | uncollectible",
  "hostedInvoiceUrl": "string | null", "invoicePdf": "string | null",
  "dueAt": "ISO-8601 | null", "paidAt": "ISO-8601 | null",
  "termMonths": 12, "createdAt": "ISO-8601"
}]
```

### Admin: clubs and invoicing

**Base path**: `/api/admin` · **Auth**: `ROLE_ADMIN`, enforced by SecurityConfig for the whole tree

An authenticated operator asking for anything under `/api/admin/**` gets
`403 Forbidden`, not `401`. A caller with no token at all still gets `401`.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/orgs` | Paged org list (`search`, `page`, `size`) |
| GET | `/admin/orgs/:orgId` | Org detail with members, game count, storage |
| POST | `/admin/orgs` | Create a club |
| PATCH | `/admin/orgs/:orgId` | Change name, tier, status, term, quota overrides, admin note |
| POST | `/admin/orgs/:orgId/transfer-ownership` | Hand the club to an existing member |
| POST | `/admin/orgs/:orgId/invoices` | Issue and send a Stripe invoice |
| GET | `/admin/orgs/:orgId/invoices` | Every invoice issued for the club |
| GET | `/admin/orgs/:orgId/games` | The club's games |
| PATCH | `/admin/users/:userId/subscription` | Override a personal subscription |

**POST /admin/orgs**
```json
{
  "name": "string (2-100)",
  "adminEmail": "string (email)",
  "quotaOverrides": { "max_members": 40 },
  "termEnd": "ISO-8601 (optional)",
  "adminNote": "string (optional)"
}
```
Creates the org at tier `club`, status `active`. Response `201`:
```json
{
  "org": { "...OrgResponse..." },
  "adminEmail": "string",
  "adminUserId": "UUID | null",
  "inviteId": "UUID | null"
}
```
Exactly one of `adminUserId` and `inviteId` is set. An address that already has
an account becomes a member with every permission straight away. An address
that does not gets a registration invite; until they accept, the creating admin
is the org's `createdBy`, and accepting transfers ownership to them.

**PATCH /admin/orgs/:orgId** — every field optional
```json
{
  "name": "string",
  "tier": "free | club",
  "status": "active | past_due | grace_period | frozen | cancelled",
  "quotaOverrides": { "max_live_games": 3 },
  "termEnd": "ISO-8601",
  "gracePeriodEnd": "ISO-8601",
  "adminNote": "string"
}
```
Returns the updated `OrgResponse`. An unknown `tier` or `status` answers
`400 ORG_INVALID_ENUM_VALUE`.

**Absent is not null.** For `termEnd`, `gracePeriodEnd` and `adminNote`,
omitting the key leaves the stored value alone while sending an explicit
`null` **clears** it — the only way an admin screen can take a term back off a
club. The other fields are applied only when non-null.

`quotaOverrides` is validated on both write paths. A key the backend resolves
must hold a number (or, for `location_check_in`, a boolean) or `null` for
unlimited; anything else answers `400 ORG_INVALID_QUOTA_OVERRIDE`. Keys outside
that set pass through untouched, so a per-deal key the product does not read
yet survives a save.

`adminEmail` on **POST /admin/orgs** is matched and stored in lower case, so a
club created for `Coach@Club.pt` attaches the account registered as
`coach@club.pt` instead of minting an invite that address can never accept.

**POST /admin/orgs/:orgId/invoices**
```json
{
  "amountCents": 49900,
  "currency": "eur",
  "description": "PointFinder club, 2026/27 season",
  "dueDays": 30,
  "termMonths": 12
}
```
`amountCents` is the whole deal price, not a monthly rate. Only `amountCents`
and `description` are required; `currency` defaults to `"eur"`, `dueDays` to
30, `termMonths` to 12. Response `201` is an `OrgInvoiceResponse`.

The backend ensures a Stripe Customer for the org (email = the club's billing
contact, name = the org name, `metadata.orgId`), creates an invoice with
`collection_method=send_invoice` and one line item, finalizes it, and sends it.
Requires `STRIPE_SECRET_KEY`; without it, `400 INVOICE_STRIPE_NOT_CONFIGURED`.

Validation: `amountCents` ≥ 1 (the whole deal price, not a monthly rate),
`currency` a three-letter code (default `eur`), `description` 1–500 characters,
`dueDays` ≥ 1 (default 30), `termMonths` ≥ 1 (default 12).

**Error codes**: `ORG_ADMIN_EMAIL_INVALID`, `ORG_INVALID_ENUM_VALUE`,
`ORG_INVALID_QUOTA_OVERRIDE`, `ORG_TRANSFER_TARGET_NOT_MEMBER`,
`INVOICE_STRIPE_NOT_CONFIGURED`,
`INVOICE_NO_BILLING_CONTACT`, `INVOICE_STRIPE_CALL_FAILED`,
`INVOICE_AMOUNT_INVALID` (see the Error Codes appendix below).

### Registration from an invite

`GET /auth/invite/:token` and `POST /auth/register/:token` resolve **both**
operator invites and org invites. For an org token the lookup also names the
organization, and registration joins the caller to it in the same transaction:

```json
{ "email": "string", "orgId": "UUID | null", "orgName": "string | null" }
```

`orgId` and `orgName` are null for an operator invite.

### Frozen workspaces

A frozen personal subscription blocks every `/api/**` call by its owner. A
frozen org blocks requests that act inside it — `/api/orgs/{id}/**`, and
`/api/games/{id}/**` for a game the org owns — while leaving the caller's
personal games alone. Both answer `403` with code `ACCOUNT_FROZEN`.

`/api/auth/**`, `/api/billing/**`, `/api/webhooks/**`, `/api/workspaces` and
`/api/quota/**` stay reachable so the account can see why it is frozen and pay.

Two org-scoped routes are carved out of the org gate for the same reason:
`GET /api/orgs/{id}/invoices` — the bill a frozen club has to reach in order to
pay it — and `POST /api/orgs/{id}/leave`, so freezing a club does not trap the
people inside it. The carve-out is matched on the exact path tail *and* the
method: `POST /api/orgs/{id}/invites` on a frozen club is still `403`.

Players are unaffected: a frozen club never locks players out of a running game.

---

## Error Codes (Machine-Readable)

All error responses include a machine-readable `code` field in addition to the human-readable `message`. Clients and mobile apps use the `code` to localize error messages and implement context-specific recovery paths. Codes are defined in the backend's `ErrorCode` enum (`backend/src/main/java/com/prayer/pointfinder/exception/ErrorCode.java`).

### Rescue Action Error Codes

| Code | HTTP Status | Meaning | Typical cause | Recovery |
|---|---|---|---|---|
| `MARK_COMPLETED_REQUIRES_CHECKIN` | 400 Bad Request | Team is not checked in at the base | Operator clicked "Mark completed" without the team being checked in | Call manual check-in endpoint first, then retry mark-completed |
| `MARK_COMPLETED_ALREADY_COMPLETED` | 400 Bad Request | The (operator, team, base, challenge) tuple already has an approved submission | Operator clicked the rescue button twice or the previous call succeeded but returned 500 to the client | Safe to retry; endpoint is idempotent on the tuple |
| `MANUAL_CHECKIN_ALREADY_CHECKED_IN` | 409 Conflict | Team is already checked in at this base | Operator called manual check-in after the team already checked in naturally | Safe to retry; endpoint returns the existing check-in without error |
| `UNLOCK_OVERRIDE_ALREADY_EXISTS` | 409 Conflict | An active unlock override already exists for this (team, base) pair | Operator clicked "Unlock" twice | Safe to retry; endpoint is idempotent on the pair |
| `UNLOCK_OVERRIDE_NOT_FOUND` | 404 Not Found | No active unlock override exists for this (team, base) pair | Operator tried to remove an override that has already been removed or never existed | Verify the team and base IDs; no action needed if the override is already gone |

### Player Join & Check-in Error Codes

| Code | HTTP Status | Meaning | Typical cause | Recovery |
|---|---|---|---|---|
| `NFC_TOKEN_REQUIRED` | 400 Bad Request | Check-in request omitted the `nfcToken` field | Client did not scan the base's NFC tag, or is running a pre-Wave-B build that sent empty requests | Scan the physical NFC tag; upgrade the mobile client |
| `DEVICE_ALREADY_IN_DIFFERENT_TEAM` | 400 Bad Request | The device already joined this game on a different team and cannot switch via a new join code | Player entered the join code of a different team after already joining team A | Continue with the original team; operators can move the player server-side if intended |
| `RATE_LIMITED` | 429 Too Many Requests | Too many join attempts from this IP (>10/min) or device (>20/min) | Brute-force attempt, or a misbehaving client retrying in a tight loop | Wait 60s before retrying; `retryable` is `true` in the response body |

### Tag Error Codes

| Code | HTTP Status | Meaning | Typical cause | Recovery |
|---|---|---|---|---|
| `TAG_LABEL_DUPLICATE` | 409 Conflict | A tag with this label already exists in the game (case-insensitive) | Operator tried to create a tag named "Water" when "WATER" already exists | Use a different label or delete the existing tag and recreate it |
| `TAG_CAP_EXCEEDED` | 400 Bad Request | The game has already reached the maximum of 50 tags | Operator created 50 tags and tried to add a 51st | Delete some unused tags before creating new ones |
| `TAG_IN_USE` | 409 Conflict | The tag is assigned to at least one base or challenge and cannot be deleted | Operator tried to delete a tag still in use | Remove the tag from all bases and challenges first, then delete |

### Stage Error Codes

| Code | HTTP Status | Meaning | Typical cause | Recovery |
|---|---|---|---|---|
| `STAGE_NOT_FOUND` | 404 Not Found | The stage ID does not exist | Client referenced a deleted or never-created stage | Refresh the stage list (`GET /games/:gameId/stages`) and retry against a known ID |
| `STAGE_GAME_MISMATCH` | 400 Bad Request | The stage exists but belongs to a different game than the URL path's `gameId` | Client crossed games in a single request (e.g. stale tab) | Use the correct `gameId` for the stage, or fetch the stage via its own game |
| `STAGE_HAS_BASES` | 400 Bad Request | Reserved for future policy; current `DELETE /stages/:id` flow auto-detaches bases instead | — | N/A |
| `STAGE_TRIGGER_BASE_NOT_FOUND` | 400 Bad Request | `transitionType='trigger'` was set with a `triggerBaseId` that does not exist | Operator deleted the trigger base between picking it and saving | Pick a valid base from the current list and retry |
| `STAGE_ALREADY_ACTIVE` | — | Reserved; `activateStage` is idempotent and does not throw when re-activating an active stage | — | N/A |

### Variable Error Codes

| Code | HTTP Status | Meaning | Typical cause | Recovery |
|---|---|---|---|---|
| `VARIABLE_REFERENCE_UNDEFINED` | 400 Bad Request | A challenge body (`content`, `completionContent`) or auto-validated `correctAnswer` references `{{key}}` where `key` has no variable value defined for at least one team. Emitted at `setup → live`. | Operator referenced a variable that was never defined, or defined the variable for only some teams. | Define the variable for every team (game scope or challenge scope), or remove the `{{key}}` reference. |

### Tutorial Error Codes

| Code | HTTP | Meaning |
|------|------|---------|
| `TUTORIAL_SCENARIO_UNKNOWN` | 400 | The scenario id is not on the server allowlist. Details carry `scenarioId`. |
| `TUTORIAL_STATUS_UNKNOWN` | 400 | The status is not `in_progress`, `completed`, or `skipped`. Details carry `status`. |
| `TUTORIAL_PRACTICE_GAME_EXISTS` | 409 | The operator already owns a practice game that has not ended; delete or keep it first. |
| `TUTORIAL_PRACTICE_GAME_NOT_ALLOWED` | 400 | Only `practice-game` scenarios use the practice endpoint; `first-game` creates its game through `POST /games`. Details carry `scenarioId`. |
| `TUTORIAL_PRACTICE_GAME_PLAYER_LIMIT` | 400 | A practice game takes a single player. |
| `TUTORIAL_NOT_PRACTICE_GAME` | 400 | Keep was called on a game that is not a practice game. |
| `ASSIGNMENT_TEAM_HAS_BASE` | 409 | The team already has a challenge at this base. |
| `ASSIGNMENT_BASE_ALL_TEAMS` | 409 | The base already carries an "All Teams" assignment. |
| `ASSIGNMENT_BASE_TEAM_SPECIFIC` | 409 | The base already carries team-specific assignments. |
| `ASSIGNMENT_CHALLENGE_TEAM_ELSEWHERE` | 409 | The team already meets this challenge at another base. |
| `ASSIGNMENT_CHALLENGE_ALL_TEAMS_ELSEWHERE` | 409 | The challenge is already an "All Teams" assignment at another base. |
| `ASSIGNMENT_MIXED_MODES` | 409 | A bulk set mixes "All Teams" and team-specific rows on one base. |
| `ASSIGNMENT_DUPLICATE` | 409 | A bulk set names the same base and team (or the same base as "All Teams") twice. |
| `ASSIGNMENT_CHALLENGE_REPEATED` | 409 | A bulk set puts the same challenge at two bases within one column (a team, or "All Teams"). |

### Quota and Organization Error Codes

Every quota code is a `400`. See `docs/business-logic.md` § "Where each limit
is enforced" for the call site behind each one.

| Code | Meaning |
|------|---------|
| `QUOTA_ACTIVE_GAMES_EXCEEDED` | The operator is at their plan's active-game limit. |
| `QUOTA_LIVE_GAMES_EXCEEDED` | The org is at its live-game limit; taking another game live is refused. |
| `QUOTA_BASES_PER_GAME_EXCEEDED` | Creating a base, or importing a game whose bases do not fit. The import is refused before anything is written. |
| `QUOTA_OPERATORS_PER_GAME_EXCEEDED` | Inviting an operator, accepting a game invite, registering through one, or adding an operator directly. |
| `QUOTA_PLAYERS_PER_GAME_EXCEEDED` | The game is at its player limit. |
| `QUOTA_FILE_SIZE_EXCEEDED` | The upload is larger than the plan's per-file cap. Emitted at chunked-session creation, on a direct media submission, and on a resource upload. |
| `QUOTA_ORG_MEMBERS_EXCEEDED` | The org is at its member limit. Always enforced, regardless of `app.quota.enforcement-enabled`. |
| `QUOTA_RESOURCE_STORAGE_EXCEEDED` | The upload would push the workspace past its storage allowance. Always enforced, as above. |
| `QUOTA_LOCATION_CHECK_IN_NOT_ALLOWED` | Location check-in is not part of this plan. |
| `ORG_CREATOR_CANNOT_LEAVE` | The org's creator called `POST /orgs/:orgId/leave`. Transfer ownership first. |
| `ORG_TRANSFER_TARGET_NOT_MEMBER` | Ownership can only move to an existing member. |
| `ORG_INVALID_QUOTA_OVERRIDE` | A club's `quotaOverrides` carried a known key with a value of the wrong type. Numeric limits take a number or `null`; `location_check_in` takes a boolean or `null`. |
| `ORG_ADMIN_EMAIL_INVALID` | `POST /admin/orgs` was given a blank or malformed club-admin email. |
| `ORG_INVALID_ENUM_VALUE` | `PATCH /admin/orgs/:id` was given a `tier` or `status` outside the enum. |
| `INVOICE_STRIPE_NOT_CONFIGURED` | Invoicing needs `STRIPE_SECRET_KEY`; it is unset. |
| `INVOICE_NO_BILLING_CONTACT` | The club has no owner with an email to bill. |
| `INVOICE_STRIPE_CALL_FAILED` | Stripe refused or failed the customer or invoice call; nothing was persisted. |
| `INVOICE_AMOUNT_INVALID` | `amountCents` was below one cent. |

### WebSocket Error Codes

WebSocket errors are transmitted via STOMP ERROR frames and do not use HTTP status codes. The error `code` appears in the STOMP ERROR header.

| Code | Meaning | Recovery |
|---|---|---|
| `WS_ACCESS_DENIED` | The JWT is invalid, expired, or the operator does not have access to the requested game | Client should re-authenticate; prompt user to log in again. Operator clients auto-refresh tokens on 401, but WebSocket errors bypass that path. |

See `docs/realtime-and-mobile.md` § "WebSocket Error Codes" for detailed WebSocket error handling and reconnection strategies.

### Standard HTTP Status Codes (Non-Code-Based)

Validation errors and generic failures that do not emit a specific `ErrorCode`:

| Status | Meaning |
|---|---|
| 400 | Validation failure (missing/invalid field, constraint violation without a specific code) |
| 401 | Missing or expired JWT token |
| 403 | The caller is authenticated but not allowed: no access to the game, the wrong role for the path (an operator asking for `/api/admin/**`), or someone else's org invite |
| 404 | Resource not found (team, base, game, etc. does not exist) |
| 409 | Conflict that does not fit the error code taxonomy (rare; usually a code is emitted instead) |
| 429 | Rate limited (e.g., password reset requests) |
| 500 | Internal server error |

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
