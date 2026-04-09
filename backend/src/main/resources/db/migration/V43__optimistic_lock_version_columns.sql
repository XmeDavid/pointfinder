-- Wave 1a: add optimistic-lock version columns for race-condition fixes.
--
-- game_tags.version  — Hibernate @Version on GameTag entity.
--   Concurrent updateTag calls now throw ObjectOptimisticLockingFailureException
--   (→ HTTP 409 TAG_MODIFIED_CONCURRENTLY) instead of silently last-write-wins.
--   Existing rows get version = 0 so Hibernate sees them as unmodified.
--
-- NOTE: games.version is intentionally NOT added here. The Game entity uses a
-- dedicated stateVersion counter (already present as games.state_version) for
-- client snapshot reconciliation, and the comment in Game.java explicitly
-- documents that JPA @Version is unwanted there because the pessimistic-lock
-- approach (SELECT ... FOR UPDATE via GameRepository.findByIdForUpdate) is used
-- instead for the status-transition race fix. Adding a @Version column would
-- change save semantics at every mutation site across the codebase.

ALTER TABLE game_tags ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 0;
