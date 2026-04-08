# Resumable Media Upload Rollout

## Feature Flags

- Backend: `APP_UPLOADS_CHUNK_ENABLED` (default `true`)
- Android: `ENABLE_CHUNKED_MEDIA_UPLOAD` build config flag (default `true`)
- iOS: `feature.chunkedMediaUploadEnabled` (`UserDefaults`, default `true`)

## Server Safeguards

- Per-player active upload session limit: `APP_UPLOADS_MAX_ACTIVE_SESSIONS_PER_PLAYER`
- Per-game active upload byte budget: `APP_UPLOADS_MAX_ACTIVE_BYTES_PER_GAME`
- Session TTL cleanup: `APP_UPLOADS_CHUNK_SESSION_TTL_SECONDS`

## QA Matrix

- `check_in` offline -> reconnect -> sync success
- Text submission offline -> reconnect -> sync success
- Media submission offline (`<=100MB`) -> app-managed copy -> reconnect -> chunk resume -> submission created
- Media submission online (`<=100MB`) -> queued then immediate sync -> submission created
- Media submission with interrupted network -> resumes from uploaded chunks
- Media source missing for `>100MB` source-reference action -> action marked `needs_reselect` and skipped safely
- Chunk API auth/game isolation validation (wrong player/session/game combinations rejected)
- Upload completion idempotency (second complete call returns completed status)

## Rollout Stages

1. Deploy backend with chunk endpoints enabled and legacy endpoint retained server-side only.
2. Release Android/iOS clients using chunked flow as default path.
3. Monitor `uploads.*` metrics in `/actuator/metrics` and backend logs.
4. If critical issues occur, toggle `APP_UPLOADS_CHUNK_ENABLED=false` to pause chunk sessions.
5. Remove legacy single-request upload endpoint after stabilization window.

## Upload Session ↔ Submission FK and Needs-Attention Detector

As of migration `V34__upload_session_submission_link.sql`, every `upload_sessions` row carries an optional `submission_id` FK that points back to the submission that consumed the completed upload (`ON DELETE SET NULL`). `PlayerService.submitAnswer` populates this FK in the same transaction that persists the submission, for every completed session whose `file_url` appears in the submission's file URL list. The link is idempotent on retry — re-submitting with the same `idempotencyKey` does not double-link or error.

`GameSchedulerService.detectNeedsAttentionUploads` runs every 15 minutes and surfaces completed sessions whose `submission_id` is still null after `app.uploads.needs-attention-threshold-minutes` (default `15`). It increments the Micrometer counter `uploads.sessions.needs_attention` (tags: `gameId`, `reason=completed_no_submission`) and logs a `WARN` line with `sessionId`, `playerId`, `gameId`, `fileUrl`, `completedAt`, and `ageMinutes`.

> **The detector is ALERT-ONLY.** It never modifies, deletes, or fails any session or submission. The player can always come back days or weeks later and retry the submission, which will populate the FK normally. See `docs/business-logic.md` § "Upload Session ↔ Submission Contract" and the source spec at `docs/specs/2026-04-08-post-pilot-reliability-and-operator-workflow.md` (P0 Media Reliability) for the full contract and the rationale.

A second property `app.uploads.stalled-threshold-minutes` (default `2`) is registered for the Wave D stalled-active scheduler that will surface mid-upload stalls; no scheduler currently consumes it. Operator-facing endpoints, WebSocket broadcasts, and the web-admin UI for these signals land in Wave D.
