-- Add display ordering to challenges.
-- Backfill order_index based on created_at so existing challenges keep their
-- current visual order (earliest created = index 0).
ALTER TABLE challenges ADD COLUMN IF NOT EXISTS order_index INTEGER NOT NULL DEFAULT 0;

UPDATE challenges c
SET order_index = subq.rn
FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY game_id ORDER BY created_at ASC) - 1 AS rn
    FROM challenges
) subq
WHERE c.id = subq.id;
