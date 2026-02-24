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
