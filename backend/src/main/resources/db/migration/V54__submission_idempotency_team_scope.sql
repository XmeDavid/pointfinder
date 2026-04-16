-- Wave A (security audit remediation): scope submission idempotency key to the
-- owning team instead of being globally unique. A globally unique
-- idempotency_key let any player replay another team's submission by crafting
-- the same idempotencyKey UUID in a POST /submissions body — backend would
-- return the existing row and expose the other team's answer + points.
--
-- Fix: drop the global UNIQUE CONSTRAINT + index, add a composite UNIQUE index
-- on (team_id, idempotency_key). NULL idempotency keys remain allowed (not
-- every submission carries one), and two rows with NULL idempotency_key never
-- collide because Postgres treats NULLs as distinct in unique indexes.
--
-- Backfill: not required. We are only tightening, not relaxing, uniqueness,
-- and team_id has been NOT NULL since V1. Any existing (team_id, key) pair is
-- already unique because the old global uniqueness was stricter.

ALTER TABLE submissions DROP CONSTRAINT IF EXISTS uk_submissions_idempotency_key;

-- V1 also created a non-unique btree lookup index; the new composite index
-- covers (team_id, idempotency_key) scans which is the only access pattern
-- today, so the old single-column index is redundant.
DROP INDEX IF EXISTS idx_submissions_idempotency;

CREATE UNIQUE INDEX uq_submissions_team_idempotency
    ON submissions (team_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;
