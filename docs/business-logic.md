# PointFinder Business Logic Reference

**Date**: 2026-03-21
**Source of truth**: Backend (Spring Boot 3.4.13). All other platforms are consumers of backend rules.

---

## Table of Contents

1. [Game Lifecycle](#1-game-lifecycle)
2. [NFC & Check-In Flow](#2-nfc--check-in-flow)
3. [Challenge & Submission Flow](#3-challenge--submission-flow)
4. [State Snapshot and Version Contract](#4-state-snapshot-and-version-contract)
4a. [Audit Trail Foundation](#4a-audit-trail-foundation)
5. [Team Variables](#5-team-variables)
6. [Authentication & Authorization](#6-authentication--authorization)
7. [Push Notifications](#7-push-notifications)
8. [Broadcast Mode](#8-broadcast-mode)

---

## 1. Game Lifecycle

### States

| State | Meaning |
|-------|---------|
| `setup` | Configuration phase. Players cannot check in or submit. |
| `live` | Game is active. Check-ins and submissions are open. |
| `ended` | Game is frozen. Submissions are blocked. |

**Backend enum**: `game_status` with values `setup`, `live`, `ended`.
**Android enum**: `GameStatus` uses `SETUP`, `LIVE`, `ENDED` — matching the backend states via `@SerialName` annotations.

### Transitions

| From | To | Who | Trigger |
|------|----|-----|---------|
| `setup` | `live` | Operator/Admin | `PATCH /api/games/{id}/status` with `{status: "live"}` |
| `live` | `ended` | Operator/Admin | `PATCH /api/games/{id}/status` with `{status: "ended"}` |
| `live` or `ended` | `setup` | Operator/Admin | `PATCH /api/games/{id}/status` with `{status: "setup", resetProgress: true/false}` |

The `resetProgress` flag on the → `setup` transition **soft-archives** all check-ins, submissions, and activity events when `true` (V36 audit foundation). Pre-V36 the rows were hard-deleted; from V36 onward they stay in the database with `archived = true`, the gameplay queries hide them by default, and the Phase 3 audit export reads the full history. See § "Audit Trail Foundation" below.

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

### Operator Setup Workflow: Unified Bases & Challenges View

Most games use a **fixed base + challenge pair** as their primary building block, so the web admin surfaces a unified "Bases & Challenges" view at `/games/:gameId/bases-and-challenges`. It sits at the top of the setup sidebar and is the recommended starting point for new operators.

**The unified view is a presentation-layer aggregate and does NOT change the underlying data model.** Bases, challenges, and assignments remain three separate tables and three separate REST resources — the view simply joins `base.fixedChallengeId` against the challenges list to render:

- **Paired cards**: bases with a `fixedChallengeId` pointing at an existing challenge, rendered as a single card per pair.
- **Unpaired bases**: bases without a fixed challenge, flagged for configuration via the existing `AssignmentsPage`.
- **Orphaned challenges**: challenges not currently fixed to any base; the view offers an inline "link to base" action that calls `PUT /games/:gameId/bases/:baseId` with `fixedChallengeId` set — again, no new endpoint.

Editing a pair opens a single dialog that writes the base and challenge via **two sequential mutations** (`basesApi.update` first, then `challengesApi.update`). If the base update fails, the challenge is NOT touched. If the base succeeds and the challenge fails, the base is left saved and the operator is prompted to retry the challenge half — there is no rollback path because the model is intentionally decoupled on the backend.

The legacy `BasesPage`, `ChallengesPage`, and `AssignmentsPage` remain available for advanced workflows (random assignments, team-specific overrides, unlocks configuration, rich-text content, team variables, etc.) and are linked from the header of the unified view as "Manage bases", "Manage challenges", and "Advanced assignments".

Source spec: `docs/specs/2026-04-08-post-pilot-reliability-and-operator-workflow.md` § "P1: Operator Workflow and Content Model" (Principle 5 — "Build a unified operator view as an aggregate over the existing model first. Do not collapse the underlying base/challenge/assignment model until the product behavior is proven").

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

> **Note**: Check-in does NOT validate that an assignment exists for the team-base pair. A player can check in at any base belonging to the game. Assignment validation occurs later during submission creation.

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
1. Backend reads `challenge.correctAnswer` — stored as a **JSON array of strings** (`List<String>` with JSON converter, migration V11).
2. `TemplateVariableService.resolveTemplates()` replaces `{{key}}` with team-specific values in each answer (see Section 4).
3. The player's submitted answer is compared **case-insensitively** against any resolved answer in the array.
4. Match → status `correct`, points awarded. No match → status `rejected`.

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

**Backend constraint**: If `answerType = "none"` (check-in only), the backend silently forces `requirePresenceToSubmit = false` during challenge create/update. A check-in-only challenge cannot require presence re-verification.

### Operator-Only Challenge Notes

Source spec: `docs/specs/2026-04-08-post-pilot-reliability-and-operator-workflow.md` § "P1: Operator Workflow and Content Model" — "Add plain operator-only challenge notes before richer collaboration features".

Operators can attach free-text notes to any challenge (setup reminders, equipment lists, spoiler tips, radio call-out instructions, etc.) via the `operatorNotes` field on the `challenges` table (migration V38, column `operator_notes TEXT NULL`). The web admin surfaces an "Operator Notes" textarea on both the legacy `ChallengesPage` edit dialog and the unified `BasesAndChallengesView` edit dialog. Length is validated at the DTO layer (`@Size(max = 5000)` on `CreateChallengeRequest`/`UpdateChallengeRequest`); the column itself is unbounded TEXT so the limit can be raised without a schema migration.

**Privacy contract (non-negotiable)**: `operatorNotes` MUST NEVER be returned on a player-facing endpoint. The backend enforces this by splitting challenge DTOs at the type level:

| DTO | Audience | Carries `operatorNotes` |
|-----|----------|-------------------------|
| `ChallengeResponse` | Operator endpoints under `/api/games/{gameId}/challenges` | Yes |
| `PlayerChallengeResponse` | `GET /api/player/games/{gameId}/data` (inside `GameDataResponse`) | No (field does not exist) |
| `CheckInResponse.ChallengeInfo` | `POST /api/player/games/{gameId}/bases/{baseId}/check-in` | No (field does not exist) |
| `PlayerSnapshotResponse` | Player state snapshot | No (only carries `challengeId` UUID) |

Because `PlayerChallengeResponse` is structurally incapable of carrying the field, a future regression that accidentally reuses `ChallengeResponse` on the player path would fail Java compilation. On top of that, `PlayerControllerTest.getGameDataReturnsPlayerChallengeResponseWithoutOperatorNotesField` asserts via a JSON path (`$.challenges[0].operatorNotes` must not exist) and a full-body substring check (no case-insensitive match for `operatornotes`) that the serialized JSON response body never contains the field at any nesting depth. Both assertions are part of the standard `make test-backend-docker` run, so the privacy contract is enforced on every backend build.

The field has no visibility rules beyond operator authentication: any user who can access the `/api/games/{gameId}/challenges` endpoint (i.e., any authenticated operator with access to the game) can read and edit it. This is intentional — notes exist to help operators coordinate, not to encode finer-grained access control.

### Upload Session ↔ Submission Contract

This section describes how chunked media uploads relate to the submission record they belong to. Source spec: `docs/specs/2026-04-08-post-pilot-reliability-and-operator-workflow.md` (P0 Media Reliability).

**Why this exists**

In the field pilot, players sometimes finished uploading a video but their final submission POST never landed (network drop, app kill, dead battery). The completed bytes were on disk and the player still expected to "see their submission go through", but operators had no way to tell the difference between "team has not submitted" and "team submitted but the media never tied to a submission". This contract closes that gap.

**The FK linkage**

`upload_sessions.submission_id` is a nullable FK to `submissions(id)` with `ON DELETE SET NULL` (migration V34).

- When `PlayerService.submitAnswer` persists a new submission, it queries every completed upload session for the same `(playerId, gameId)` whose `file_url` is contained in the new submission's `file_url` / `file_urls` and sets `submission_id = newSubmission.id` for each one. The link runs inside the same `@Transactional` boundary as `createSubmission`, so either both rows commit together or both roll back.
- The link is **idempotent** on retry. When a client retries `submitAnswer` with the same `idempotency_key`, `SubmissionService.createSubmission` returns the existing submission row, so `submission.id` is stable; the linker re-runs against the same candidates and skips every session that already carries the right FK.
- A session whose `submission_id` is null is **not corrupt**. It is one of:
  - active / cancelled / expired (no submission ever expected),
  - completed-but-not-yet-linked (the submission POST has not run yet, or it has not been retried since this upload finished),
  - completed-and-orphaned (the submission POST will probably never come — see needs-attention below).

**Create-or-resume semantics for active uploads (mediaItemKey)**

Players send a stable client-side `mediaItemKey` per local media item when calling `POST /player/games/:gameId/uploads/sessions`. The backend uses that key to:

- Resume an existing active upload instead of creating a duplicate when the same physical media item is re-tried after a network drop, app foreground, or process restart.
- Return the existing completed session (with its `fileUrl`) when assembly already succeeded but the final submission POST is being retried.
- Refuse with a permanent `UPLOAD_MEDIA_ITEM_KEY_CONFLICT` if a different upload is already in flight for the same key with incompatible metadata (size / chunk size / content type).

This means a player can interrupt an upload, kill the app, return hours later, and the chunked upload state is still recoverable without manual operator cleanup. See migration V33 for the partial unique index that enforces "one recoverable session per `(game_id, player_id, media_item_key)`".

**The needs-attention detector**

`GameSchedulerService.detectNeedsAttentionUploads` runs every 15 minutes. It selects completed upload sessions whose `submission_id IS NULL` and whose `completed_at` is older than `app.uploads.needs-attention-threshold-minutes` (default `15`). For each row it:

1. Increments the Micrometer counter `uploads.sessions.needs_attention` with tags `gameId` and `reason=completed_no_submission`.
2. Logs a `WARN` line with `sessionId`, `playerId`, `gameId`, `fileUrl`, `completedAt`, and `ageMinutes`.

> **The detector is ALERT-ONLY.** It never modifies, never deletes, never fails any session, and never touches the submission. Its only job is to make stuck uploads **visible** to operators so they can nudge the team if needed. **A player can always recover their work, days or weeks later** — the underlying chunked upload session and its file URL stay durable until either the player retries the submission (which links it via `PlayerService.submitAnswer`) or an operator manually intervenes.

This is a non-negotiable product principle. No future change to this scheduler may turn it into a garbage collector.

**Wave D placeholder**

A second property `app.uploads.stalled-threshold-minutes` (default `2`) is registered now so that the Wave D stalled-active scheduler has a config knob in place without requiring another deploy. No scheduler currently consumes it.

**Operator visibility (Wave D)**

The operator-facing endpoints, WebSocket broadcast topics, and web-admin UI for needs-attention uploads are scoped to Wave D and not part of this wave. The schema, FK linkage, and detector are landing first so that Wave D has clean data to surface.

---

## 4. State Snapshot and Version Contract

Source spec: `docs/specs/2026-04-08-post-pilot-reliability-and-operator-workflow.md` (P0 Track 2 Slice 1).

### Why this exists

In the field pilot, a player who joined during game `setup` saw the operator go `live` but the player app never learned about it — the client had cached `gameStatus = setup` at join time and had no way to reconcile. Recovery required killing and relaunching the app. That is the symptom this contract fixes.

The product rule: **realtime is invalidation, snapshot is canonical.** Clients should be able to trust server state at any moment by calling a single endpoint that returns the current authoritative view, regardless of what the client's local cache might have missed. Realtime events remain the fast path, but they are no longer the only correctness mechanism.

### The snapshot endpoint

`GET /api/games/{gameId}/snapshot`

A single REST call that returns everything the caller needs to reconcile its state for this game. The response shape depends on the caller's role:

- **Player JWT** → `PlayerSnapshotResponse`. Contains the game lifecycle metadata the player's app needs, the player's team (no score), the per-base progress list, recent team submissions (status only, no points), and the player's in-flight upload sessions.
- **Operator JWT** → `OperatorSnapshotResponse`. Contains the full game config, all teams with scores, the full leaderboard, pending review counts, active uploads count, and needs-attention uploads count.

Authorization:
- `401` if no JWT is present.
- `403` if the JWT does not grant access to this game (player from another team/game, operator without membership, admin is always allowed).

See the full API reference in `docs/api-reference.md` for field-by-field request/response examples.

### NO scores in the player response

Players in PointFinder never see scores anywhere in the player app: no team score on their own team, no leaderboard, no points on submissions (only status: pending / approved / rejected). Scoring is operator-side only. This is a hard product rule.

The player snapshot response MUST NOT include any of the following at any nesting depth:

- `score`
- `points`
- `leaderboard`
- `rank`
- `totalPoints`

The DTO design enforces this structurally — `PlayerSnapshotResponse` does not expose any of those fields — and the integration test `GameSnapshotEndpointTest.playerSnapshotReturnsPlayerShapeWithNoScoreFields` walks the serialized JSON to assert that none of those keys appear. A future change that tries to slip scoring into the player response will break that test.

### The state version mechanism

`games.state_version` is a monotonically-increasing `BIGINT` bumped by `GameEventBroadcaster` via `GameRepository.incrementStateVersion` every time a state-mutating, snapshot-relevant event is broadcast for a game. The bump is a native `UPDATE games SET state_version = state_version + 1 WHERE id = :gameId RETURNING state_version` statement — atomic at the database level, so concurrent broadcasters cannot lose increments.

The new version is included in the WebSocket/mobile broadcast payload alongside the existing `type` and `data` keys, so realtime listeners can compare the version against their last-seen value and decide whether to trigger a snapshot fetch to catch up.

### Which events bump the version

| Event | Bumps `state_version`? | Why |
|---|---|---|
| `game_status` | Yes | The core "game not active" recovery case |
| `game_config` | Yes | Base/challenge/team/assignment edits |
| `activity` | Yes | Check-ins, submissions |
| `submission_status` | Yes | Operator review decisions |
| `leaderboard` | Yes | Score changes |
| `notification` | Yes | Operator-to-player messages |
| `location` | **No** | Very high frequency; would thrash the counter |
| `presence` | **No** | Operator online/offline; not state a snapshot restores |

A failed bump (e.g. transient DB hiccup) must never prevent the broadcast from landing. The broadcaster catches the exception, logs a warning, and dispatches the realtime event anyway — honest realtime beats version-correct silence.

### Client usage pattern

1. Client stores the last `stateVersion` it observed via realtime.
2. On reconnect / app foreground / screen focus / missed event, call `GET /api/games/{gameId}/snapshot`.
3. Compare `response.stateVersion` to the stored value.
   - `snapshot.stateVersion > stored` → replace cached game state wholesale from the snapshot.
   - `snapshot.stateVersion == stored` → cache is fresh; the call was defensive and nothing changed.
4. Update the stored `lastSeenVersion` to `snapshot.stateVersion`.

A fresh DB starts at `state_version = 0` and any client-stored `lastSeenVersion = 0` triggers a full refetch on the first reconnect, which is the desired "bootstrap from server truth" behaviour.

### Why `stateVersion` is NOT Hibernate `@Version`

Hibernate's `@Version` annotation implements JPA optimistic locking: it changes save semantics for every `Game` update site and throws `OptimisticLockingFailureException` on stale writes. That is the wrong shape for this counter — we are not protecting against concurrent writes to the game row, we are notifying clients that something inside the game changed. Plain `Long stateVersion` + a dedicated atomic native UPDATE keeps the semantics at the application level and out of Hibernate's save path.

### Future `?lastSeenVersion` optimization

`GET /api/games/{gameId}/snapshot?lastSeenVersion=N` is reserved for a future slice. When implemented, the endpoint will return `204 No Content` if `N >= current state_version`, saving bandwidth on defensive polls that would otherwise re-download the same state. Clients already storing `lastSeenVersion` in Slice 1 can pass it through Slice 2 without code change.

---

## 4a. Audit Trail Foundation

Source spec: `docs/specs/2026-04-08-post-pilot-reliability-and-operator-workflow.md` (P1 Activity Audit and Export + P1 Operator Rescue and Overrides). Migration: `V36__audit_foundation.sql`.

### Why this exists

The pilot exposed concrete audit gaps the platform could not answer:

- A player joined the wrong team and operators could not reconstruct what they did there. Submissions were team-attributed only.
- Manual operator check-ins looked identical to player check-ins in structured data — only the free-text message said "by operator".
- `ActivityEvent` carried no actor reference at all, just a free-text message.
- `GameService.updateStatus(resetProgress=true)` HARD-DELETED check-ins, submissions, and activity events, wiping any audit trail forever.

V36 is the **substrate** the P1 Operator Rescue (mark-completed, unlock override, audit-aware manual check-in) and Activity Audit Export tracks build on. It is deliberately additive: no new endpoints, no behavior changes for existing endpoints beyond capturing audit metadata.

### Actor capture: which fields live where

| Entity | Player FK | Operator FK | Display name snapshot | Device id snapshot | Source surface | Operator reason | Archived flag |
|---|---|---|---|---|---|---|---|
| `check_ins` | `player_id` (existing) | `actor_operator_user_id` | `actor_display_name_snapshot` | `actor_device_id_snapshot` | `source_surface` | `operator_reason` | `archived` |
| `submissions` | `submitted_by_player_id` | `created_by_operator_id` (Phase 2 mark-completed) and `reviewed_by` (existing) | `submitted_by_display_name_snapshot` + `created_by_display_name_snapshot` | `submitted_by_device_id_snapshot` | `source_surface` | `operator_reason` | `archived` |
| `activity_events` | `actor_player_id` | `actor_operator_user_id` | `actor_display_name_snapshot` | `actor_device_id_snapshot` | `source_surface` | n/a | `archived` |

All FKs are `ON DELETE SET NULL` so the audit row outlives later account removal.

### Immutable snapshot principle

Display names and device ids are **copied at action time** and never updated again. This is the rule that lets the audit answer "who did this?" even after a player is removed, an operator account is reassigned, or a player's display name is rewritten. A live join would lose the answer the moment the joined row changes; a snapshot does not.

### Source surface values

The `source_surface` column is plain `VARCHAR(32)` (not a Postgres enum) so future phases can extend the set without an enum migration. Allowed values today:

| Value | Meaning |
|---|---|
| `player_app` | Action originated from the player app (iOS / Android player flows). |
| `web_admin` | Action originated from the web admin (operator UI: review decisions, future operator submissions). |
| `operator_rescue` | Action originated from a dedicated operator rescue endpoint (manual check-in today; mark-completed and unlock override in Phase 2). |

### Archive contract: `resetProgress` no longer hard-deletes

Before V36, `PATCH /api/games/{gameId}/status` with `{status: "setup", resetProgress: true}` issued raw `DELETE` statements against `submissions`, `check_ins`, `activity_events`, `team_locations`, and `upload_sessions`. After V36 the audit-relevant tables (`submissions`, `check_ins`, `activity_events`) are **soft-archived** instead — the rows stay in place with `archived = true`, the gameplay queries hide them by default, and the Phase 3 audit export reads the full history including archived rows.

Implementation:

- `SubmissionRepository.markArchivedByGameId(UUID)`, `CheckInRepository.markArchivedByGameId(UUID)`, and `ActivityEventRepository.markArchivedByGameId(UUID)` are JPQL `UPDATE ... SET archived = true` statements that replace the previous `deleteByGameId` calls inside `GameService.updateStatus`.
- `team_locations` and `upload_sessions` are still hard-deleted on reset. Team locations are transient per-event positions, not audit data. Upload sessions are media artifacts; the FK from `upload_sessions.submission_id` to the now-archived submission stays discoverable for the needs-attention detector and any operator inspection.
- The unique `(team_id, base_id)` index on `check_ins` is now a partial index `WHERE archived = false`, so an archived check-in does not block a fresh check-in by the same team at the same base after a reset.

### Default-active read filtering

Every game-scoped read query on the three audited repositories filters `archived = false` by default:

- `SubmissionRepository`: `findByGameId`, `findByGameIdWithRelations`, `findByTeamId`, `findRecentByTeamId`, `findByGameIdAndStatus`, `findScoredSubmissionsByGameId`, `countByGameIdAndStatus`, `countByGameIdAndStatusIn`, `countByGameId`, `findByTeamIdAndChallengeIdAndBaseId`, `countByBaseId`, `countByChallengeId`, `existsByGameIdAndFileUrlOrFileUrls`, `existsByTeamIdAndFileUrlOrFileUrls`.
- `CheckInRepository`: `findByTeamId`, `findByGameIdAndTeamId`, `findByTeamIdAndBaseId`, `existsByTeamIdAndBaseId`, `findByGameId`, `findByGameIdWithRelations`.
- `ActivityEventRepository`: `findRecentByGameId`.

The `*IncludingArchived` variants (`findByGameIdIncludingArchived` on all three) are reserved for the Phase 3 audit export and read the full history.

### Reserved enum values

V36 also extends the `activity_event_type` Postgres enum with three new values that are NOT emitted by the V36 phase itself:

| Value | Reserved for |
|---|---|
| `operator_override` | Phase 2 mark-completed and unlock-override operator rescue actions. |
| `team_join` | Phase 3 membership history — player joins a team for the first time. |
| `team_switch` | Phase 3 membership history — player moves from one team to another inside the same game. |

Adding the values now means Phases 2 and 3 do not need a second enum migration.

### Operator manual check-in: optional reason

The V36 wave also adds an OPTIONAL request body to `POST /api/games/{gameId}/teams/{teamId}/check-in/{baseId}`:

```json
{ "reason": "string (optional, max 500 chars)" }
```

Legacy clients that POST without a body still work and the audit row records `operator_reason = NULL`. The operator user identity is recovered from the security context — never from the request body — so the actor cannot be spoofed.

---

## 4b. Operator Rescue Actions

Source spec: `docs/specs/2026-04-08-post-pilot-reliability-and-operator-workflow.md` (P1 Operator Rescue and Overrides). Migration: `V37__base_unlock_overrides.sql`. Wave: P1 Phase 2.

### Why this exists

During a live event, teams can be blocked by device issues, network problems, NFC problems, or app-state bugs. Operators need controlled ways to resolve those cases without corrupting the game. Phase 2 builds three rescue actions on top of the V36 audit substrate. Every rescue captures WHO, WHEN, WHY, and WHAT changed so a later incident review can reconstruct the event honestly.

### Rescue action catalog

| Action | Endpoint | Reversible | Emits activity event | Audit fields set |
|---|---|---|---|---|
| Manual check-in | `POST /api/games/{gameId}/teams/{teamId}/check-in/{baseId}` | No (but idempotent: re-calling returns the existing check-in) | `check_in` (with operator actor) | `check_ins.actor_operator_user_id`, `check_ins.actor_display_name_snapshot`, `check_ins.source_surface = 'operator_rescue'`, `check_ins.operator_reason` |
| Mark completed | `POST /api/games/{gameId}/teams/{teamId}/bases/{baseId}/mark-completed` | No (but idempotent on `(operator, team, base, challenge)`) | `operator_override` | `submissions.created_by_operator_id`, `submissions.created_by_display_name_snapshot`, `submissions.operator_reason`, `submissions.source_surface = 'operator_rescue'` |
| Unlock override | `POST /api/games/{gameId}/teams/{teamId}/bases/{baseId}/unlock-override` | Yes (soft-delete via `DELETE`) | `operator_override` (on both create and remove) | `base_unlock_overrides.created_by_operator_id`, `base_unlock_overrides.created_by_display_name_snapshot`, `base_unlock_overrides.operator_reason`, plus `deleted_*` fields on remove |

Manual check-in is the gameplay anchor: before marking a base complete for a team you must have a check-in at that base, even if the operator had to create it manually. This keeps the progress model honest — `mark-completed` is a rescue on top of a recorded presence, not a pure state edit. The service enforces this with a `400 MARK_COMPLETED_REQUIRES_CHECKIN` error.

### Mark completed

Synthesizes an APPROVED `Submission` on the operator's behalf for the `(team, base, challenge)` triple. Used when a team physically completed a task but the app got stuck (bad NFC read, uploader crash, lost connectivity at review time).

- **Points**: defaults to `challenge.points`. The request body may supply `pointsOverride` (integer, nullable) to award a different value. Negative values are allowed for symmetry with the existing review path.
- **Answer**: stored as the literal `"[Operator marked complete]"` so the activity feed and audit export can distinguish a rescue submission from a player-typed answer at a glance.
- **Reviewed-by**: set to the acting operator so the single-row audit of the submission is self-contained without joining the activity feed.
- **Idempotency**: the `submissions.idempotency_key` is derived deterministically from `(operatorId, teamId, baseId, challengeId)` via `UUID.nameUUIDFromBytes`. Re-clicking the rescue button returns the same row instead of creating a duplicate or awarding extra points. The partial unique index on `submissions.idempotency_key` enforces race safety.
- **Preconditions**: team, base, and challenge must all belong to the target game; the team must have an active (non-archived) check-in at the base; the caller must be an operator with access to the game.

An `operator_override` activity event is emitted with the operator actor snapshot and the source surface `operator_rescue`. The broadcaster fans out `submission_status`, `activity`, and `leaderboard` events via `GameEventBroadcaster`, which auto-bumps `games.state_version`. Player clients pick up the corrected state on next foreground/reconnect via the snapshot endpoint.

### Unlock override

Forces a hidden base to become visible to a specific team, regardless of the game's normal unlock trigger. Used when field reality (bad weather, GPS errors, broken NFC tag, etc.) requires skipping the unlock chain.

- **Storage**: new table `base_unlock_overrides` (V37) with `(game_id, team_id, base_id)` tuple and V36-style actor snapshots. A partial unique index on `(team_id, base_id) WHERE deleted_at IS NULL` enforces at most one ACTIVE override per pair.
- **Visibility**: `PlayerService.getProgress` reads `findActiveByGameIdAndTeamId` once per snapshot and adds the matching base ids to a `Set<UUID>`. A hidden base with `status == not_visited` passes the visibility gate if its id is in that set, regardless of the normal `unlockTrigger` (`CHECK_IN`, `SUBMISSION`, or `COMPLETED`). The override is scoped to the specific `(team, base)` pair, so other teams in the same game do NOT see the base.
- **Reversibility**: the `DELETE` verb soft-deletes the override by populating `deleted_at`, `deleted_by_operator_id`, and `deleted_by_display_name_snapshot` instead of removing the row. The history row stays in place for audit reconstruction. A later `POST` for the same pair creates a NEW row; it does not revive the deleted one.
- **Idempotency on create**: a second `POST` for an already-active pair returns the existing row without mutating its audit fields. Re-clicking the "unlock" button in the operator UI must not rewrite history.
- **Idempotency on remove**: a `DELETE` with no active override returns `404` (same convention as any other not-found case in this codebase).
- **Reason**: optional on both verbs. On `POST` the reason is persisted on `base_unlock_overrides.operator_reason`. On `DELETE` the reason is narrated on the emitted activity event message (the override row itself is not mutated further).

Both create and remove emit an `operator_override` activity event with the operator actor snapshot. Both verbs also broadcast a `game_config` event via `GameEventBroadcaster`, which auto-bumps `state_version`.

### Player notification model: silent state correction

Rescue actions do NOT send push notifications or in-app banners to the affected team today. The contract is:

1. The rescue action writes the authoritative state to the database (new submission, new/removed override row).
2. The broadcast path bumps `games.state_version` and emits the normal `activity`/`submission_status`/`leaderboard`/`game_config` events.
3. Player clients that are online pick up the realtime event and either update locally or re-fetch the snapshot.
4. Player clients that are offline reconcile on next app foreground / reconnect / network return via `GET /api/games/{id}/snapshot`, which reads canonical server state and is the rule for every P0 Track 2 recovery case.

Operators who want an explicit heads-up message to the team can send one out of band — the Notifications feature handles that surface. The rescue endpoints themselves stay quiet so they are safe to call without worrying about a user-facing banner racing the state correction.

### Audit trail summary per rescue action

| Field captured | Manual check-in | Mark completed | Unlock override (create) | Unlock override (remove) |
|---|---|---|---|---|
| Acting operator FK | `check_ins.actor_operator_user_id` | `submissions.created_by_operator_id` (+ `reviewed_by`) | `base_unlock_overrides.created_by_operator_id` | `base_unlock_overrides.deleted_by_operator_id` |
| Operator display name snapshot | `check_ins.actor_display_name_snapshot` | `submissions.created_by_display_name_snapshot` | `base_unlock_overrides.created_by_display_name_snapshot` | `base_unlock_overrides.deleted_by_display_name_snapshot` |
| Source surface | `check_ins.source_surface = 'operator_rescue'` | `submissions.source_surface = 'operator_rescue'` | n/a (`base_unlock_overrides` rows are always operator-created) | n/a |
| Operator reason | `check_ins.operator_reason` | `submissions.operator_reason` | `base_unlock_overrides.operator_reason` | on the activity event message only |
| Activity event actor | `check_ins` → `activity_events.actor_operator_user_id` (+ snapshot) | `activity_events.actor_operator_user_id` (+ snapshot), type `operator_override` | same, type `operator_override` | same, type `operator_override` |

Every rescue action is distinguishable from an organic player action in the activity feed and in structured data. The Phase 3 audit export will surface this metadata as the chronological incident log.

---

## 4c. Activity Audit Export

Source spec: `docs/specs/2026-04-08-post-pilot-reliability-and-operator-workflow.md` (P1 Activity Audit and Export). Wave: P1 Phase 3. Endpoint: `GET /api/games/{gameId}/audit-export` (see `docs/api-reference.md` §10a for the wire contract).

### Why this exists

Phase 1 (V36 actor snapshots) made audit data RECORDABLE. Phase 2 (operator rescue endpoints) made it ACTIONABLE. Phase 3 closes the loop by making it READABLE: operators can export the full chronological log of a game to answer the pilot's unanswerable question — "what did this player do before we moved them to the right team?" — and the exports are useful during an event, at review time, and for incident post-mortems after the fact.

The export is deliberately BACKGROUND-only from a product perspective. PointFinder is still a team-focused game: team progress, team scoring, team completion, team rescue. Player-level metadata exists for auditability and incident review, not to turn the game into individual progress tracking. The audit export is the only surface where an operator intentionally opens the player-attribution view.

### Design: pure ActivityEvent stream

The export reads the `activity_events` table as the chronological ground truth. Phase 1 guarantees every recordable action emits exactly one `ActivityEvent` row with full V36 actor snapshot fields populated, and Phase 2 extended that to include the two rescue endpoints (both emit `operator_override`-type events). That means the activity_events stream alone — one table, ordered by `timestamp ASC` — is the canonical spine. There is no multi-source merge of `check_ins`, `submissions`, and `activity_events`; each action has exactly one audit row attributed to exactly one actor from exactly one source surface.

The only cross-table read is a narrow enrichment step: when an activity event's companion `submission` or `check_in` row carries a Phase 2 `operator_reason` (the free-text justification supplied on a mark-completed, unlock-override, or manual check-in rescue), the service surfaces it in the exported `details.operatorReason` field. The activity event message alone does not preserve that field, so the enrichment is required to make the export self-contained for incident review. The enrichment uses two bulk prefetches keyed by game id (one for submissions, one for check-ins), not per-row lookups, so the whole export is still O(1) SQL round trips.

### Actor model

Every export row carries a uniform `actor` envelope with `type ∈ {player, operator, system}`:

| Actor type | When used | Fields populated |
|---|---|---|
| `player` | Player-initiated events (check-in, submission, future team_join/team_switch) | `id`, `displayName` (V36 snapshot, with live fallback), `deviceId` (V36 snapshot, with live fallback) |
| `operator` | Operator-initiated events (review decisions, manual check-in, mark-completed, unlock-override, future operator-created content) | `id`, `displayName`; `deviceId` is always null |
| `system` | Pre-V36 legacy rows with no recoverable actor FK; reserved for future system-emitted events | `id = null`, `displayName` = `"Unknown"` or the orphaned snapshot if one exists |

The `actor.id` FK is always the V36 actor column (`actor_player_id` or `actor_operator_user_id`). The service does NOT look at `submissions.submitted_by_player_id` or `check_ins.player_id` directly — the activity event is the canonical spine and already carries the matching actor FK from Phase 1.

### Legacy null snapshot handling

Pre-V36 activity events pre-date the actor snapshot columns. For those rows the service walks the following fallback ladder:

1. Immutable V36 snapshot column (`actor_display_name_snapshot`, `actor_device_id_snapshot`) — the preferred source; survives account deletion.
2. Live join on the actor FK (`actorPlayer.displayName` / `actorOperatorUser.name`) — only consulted when the snapshot column is null. Honest about what the system can still know; the audit export is read-only so this is not a write-vs-snapshot contract violation.
3. Literal string `"Unknown"` — last-resort when neither the snapshot nor the live join yields a name. Keeps the CSV column count stable and the JSON schema honest rather than emitting nulls that downstream parsers have to branch on.

### Filters

All filters are optional and applied at the SQL level via the pushdown query `ActivityEventRepository.findForAuditExport`. The query uses `:param IS NULL OR <condition>` wrappers so passing `null` for any filter means "do not apply it" without forcing the caller to build dynamic SQL.

| Filter | Pushdown clause | Use case |
|---|---|---|
| `from` / `to` | `ae.timestamp >= :from AND ae.timestamp < :to` | Restrict to a specific incident window (the two hours around a reported problem). |
| `teamId` | `ae.team.id = :teamId` | "What happened to Team Red?" post-mortem. |
| `playerId` | `ae.actorPlayer.id = :playerId` | The pilot's wrong-team question: "Which actions did this player produce, on which team?" |
| `operatorId` | `ae.actorOperatorUser.id = :operatorId` | "Show me everything Operator Sam did today" — reviewer accountability. |
| `actionType` | `ae.type IN :types` (EnumSet) | "Only show me operator rescues" — filter to `operator_override`, or combine with `approval,rejection` for the full operator-decision view. |
| `sourceSurface` | `ae.sourceSurface = :sourceSurface` | "Which of these came through the rescue endpoint vs the organic player app?" |

### Archive inclusion

The default export hides archived rows (the ones preserved by `GameService.updateStatus(resetProgress=true)` in Phase 1). This matches the live state operators expect. Passing `includeArchived=true` surfaces the archived rows with the `archived: true` flag set on each row. Use this when reviewing an incident that straddled a game reset — the data is still there, but you have to ask for it.

### Format adapters

- **JSON** (default): single top-level array of uniform `AuditEntryDto` envelopes. `Content-Type: application/json`. `Content-Disposition: attachment; filename="audit-{gameId}-{timestamp}.json"`.
- **CSV**: stable column order (`timestamp,type,source_surface,actor_type,actor_id,actor_display_name,actor_device_id,team_id,team_name,base_id,base_name,challenge_id,challenge_title,message,operator_reason,archived`). RFC-4180-style escape — fields containing comma, double-quote, carriage return, or line feed are quoted, embedded quotes are doubled. Row terminator is `\r\n`. `Content-Type: text/csv; charset=utf-8`. `Content-Disposition: attachment; filename="audit-{gameId}-{timestamp}.csv"`.

Both formats return the same rows in the same chronological order (`timestamp ASC`). CSV parsers should read the header row to tolerate future column additions at the tail.

### Use cases

1. **Wrong-team incident review** — filter by `playerId=<player>` + `includeArchived=true` to see every action that player produced, on any team, in any window of the game's lifetime. This is the pilot's original unanswerable question.
2. **Operator accountability** — filter by `operatorId=<user>` to review every operator rescue, review decision, and override the operator made during the event.
3. **Temporal incident window** — filter by `from`/`to` around the reported problem to avoid dumping the entire game log into the reviewer's lap.
4. **Rescue audit** — filter by `actionType=operator_override` or `sourceSurface=operator_rescue` to see only the operator-driven state changes.
5. **Post-event data handoff** — export in CSV for analysis in spreadsheets or data pipelines; the stable column order makes the file scriptable.

### Cross-references

- Phase 1 audit substrate and archive contract: §4a.
- Phase 2 rescue actions and operator_override event emission: §4b.
- V36 migration: `backend/src/main/resources/db/migration/V36__audit_foundation.sql`.
- V37 migration (base_unlock_overrides): `backend/src/main/resources/db/migration/V37__base_unlock_overrides.sql`.
- Service: `backend/src/main/java/com/prayer/pointfinder/service/AuditExportService.java`.
- Repository pushdown query: `ActivityEventRepository.findForAuditExport`.
- API reference: §10a (wire contract, query parameters, example JSON and CSV).

---

## 5. Team Variables

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

## 6. Authentication & Authorization

### Login Brute-Force Protection

The backend tracks failed login attempts per email address in memory (`LoginAttemptService`):
- **Max attempts**: 10 failed logins per email
- **Lockout duration**: 15 minutes after threshold reached
- **Cleanup**: Expired entries purged every 30 minutes

When locked out, `POST /api/auth/login` returns 400 with "Too many login attempts. Please try again later."

### Operator Authentication

| Property | Value |
|----------|-------|
| Login | `POST /api/auth/login` with `{email, password}` |
| Access token | JWT (HS256), TTL **15 minutes** |
| Refresh token | UUID string stored in DB, TTL **7 days** |
| Refresh endpoint | `POST /api/auth/refresh` — old token deleted, new pair issued (one-time use) |
| Absolute session lifetime | **30 days** — refresh tokens older than 30 days are rejected regardless of activity |
| Max concurrent refresh tokens | **5** per user — oldest tokens pruned when limit exceeded |
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

## 7. Push Notifications

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

## 8. Broadcast Mode

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
