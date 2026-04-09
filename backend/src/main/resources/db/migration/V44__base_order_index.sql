-- Add display ordering to bases.
-- Backfill order_index based on created_at so existing bases keep their
-- current visual order (earliest created = index 0).
ALTER TABLE bases ADD COLUMN IF NOT EXISTS order_index INTEGER NOT NULL DEFAULT 0;

UPDATE bases b
SET order_index = subq.rn
FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY game_id ORDER BY created_at ASC) - 1 AS rn
    FROM bases
) subq
WHERE b.id = subq.id;
