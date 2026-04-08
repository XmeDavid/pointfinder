-- Drop the legacy per-item tags and color columns from bases and challenges.
-- Backfill was completed in V41. Dropping immediately — production data scale
-- is small and backfill invariants are verified in V40_V41_BackfillTest.
-- No downgrade path after this migration.

DROP INDEX IF EXISTS idx_bases_color;
DROP INDEX IF EXISTS idx_challenges_color;
ALTER TABLE bases DROP COLUMN IF EXISTS tags, DROP COLUMN IF EXISTS color;
ALTER TABLE challenges DROP COLUMN IF EXISTS tags, DROP COLUMN IF EXISTS color;
