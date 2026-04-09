-- Backfill game_tags, base_tags, challenge_tags from legacy bases.tags /
-- bases.color and challenges.tags / challenges.color columns.
--
-- Collapse rule:
--   1. For each (game_id, LOWER(TRIM(tag_label))) pair across both tables:
--      - Canonical label = most-common casing variant (tie-break: shortest, then alphabetical).
--      - Canonical color = most-common color among items carrying this tag
--        (tie-break: alphabetical hex). If all items had NULL color, assign a
--        deterministic palette swatch via SUBSTRING(MD5(lower(label)), 1, 6)
--        prefixed with '#'.
--   2. Insert base_tags and challenge_tags links.
--   3. Orphan color handling: items that have a non-NULL color but no tags get
--      a synthetic tag named '(color)' per distinct hex, linked to those items.

DO $$
DECLARE
    palette TEXT[] := ARRAY[
        '#3b82f6','#ef4444','#22c55e','#f59e0b','#a855f7',
        '#ec4899','#14b8a6','#f97316','#6366f1','#84cc16',
        '#06b6d4','#e11d48','#8b5cf6','#10b981','#f43f5e',
        '#0ea5e9'
    ];
BEGIN

-- ── Step 1: Expand all (game_id, raw_label, color) tuples from both tables ──

CREATE TEMP TABLE _legacy_items ON COMMIT DROP AS
SELECT
    b.game_id,
    TRIM(tag_label) AS raw_label,
    LOWER(TRIM(tag_label)) AS norm_label,
    b.color
FROM bases b,
     jsonb_array_elements_text(b.tags::jsonb) AS tag_label
WHERE b.tags IS NOT NULL
  AND b.tags <> 'null'
  AND b.tags <> '[]'

UNION ALL

SELECT
    c.game_id,
    TRIM(tag_label) AS raw_label,
    LOWER(TRIM(tag_label)) AS norm_label,
    c.color
FROM challenges c,
     jsonb_array_elements_text(c.tags::jsonb) AS tag_label
WHERE c.tags IS NOT NULL
  AND c.tags <> 'null'
  AND c.tags <> '[]';

-- ── Step 2: Vote on canonical label per (game_id, norm_label) ──

CREATE TEMP TABLE _canonical_labels ON COMMIT DROP AS
SELECT DISTINCT ON (game_id, norm_label)
    game_id,
    norm_label,
    raw_label AS canonical_label
FROM (
    SELECT
        game_id,
        norm_label,
        raw_label,
        COUNT(*) AS freq,
        LENGTH(raw_label) AS len
    FROM _legacy_items
    GROUP BY game_id, norm_label, raw_label
) ranked
ORDER BY game_id, norm_label, freq DESC, len ASC, raw_label ASC;

-- ── Step 3: Vote on canonical color per (game_id, norm_label) ──

CREATE TEMP TABLE _canonical_colors ON COMMIT DROP AS
SELECT DISTINCT ON (game_id, norm_label)
    game_id,
    norm_label,
    color AS canonical_color
FROM (
    SELECT
        game_id,
        norm_label,
        color,
        COUNT(*) AS freq
    FROM _legacy_items
    WHERE color IS NOT NULL
    GROUP BY game_id, norm_label, color
) ranked
ORDER BY game_id, norm_label, freq DESC, color ASC;

-- ── Step 4: Insert into game_tags ──
-- If canonical_color is NULL (all items had no color), use a deterministic
-- palette swatch: palette[1 + (abs(hashtext(norm_label)) % 16)].

INSERT INTO game_tags (id, game_id, label, color, created_at, updated_at)
SELECT
    gen_random_uuid(),
    cl.game_id,
    cl.canonical_label,
    COALESCE(
        cc.canonical_color,
        palette[1 + (ABS(HASHTEXT(cl.norm_label)) % 16)]
    ),
    NOW(),
    NOW()
FROM _canonical_labels cl
LEFT JOIN _canonical_colors cc
    ON cc.game_id = cl.game_id AND cc.norm_label = cl.norm_label
ON CONFLICT (game_id, (LOWER(label))) DO NOTHING;

-- ── Step 5: Insert base_tags links ──
-- CROSS JOIN LATERAL (not comma) because the later explicit JOIN on game_tags
-- would otherwise bind tighter than the comma and hide `b` from the ON clause.

INSERT INTO base_tags (base_id, tag_id)
SELECT DISTINCT
    b.id AS base_id,
    gt.id AS tag_id
FROM bases b
CROSS JOIN LATERAL jsonb_array_elements_text(b.tags::jsonb) AS tag_label
JOIN game_tags gt
    ON gt.game_id = b.game_id
    AND LOWER(gt.label) = LOWER(TRIM(tag_label))
WHERE b.tags IS NOT NULL
  AND b.tags <> 'null'
  AND b.tags <> '[]'
ON CONFLICT DO NOTHING;

-- ── Step 6: Insert challenge_tags links ──

INSERT INTO challenge_tags (challenge_id, tag_id)
SELECT DISTINCT
    c.id AS challenge_id,
    gt.id AS tag_id
FROM challenges c
CROSS JOIN LATERAL jsonb_array_elements_text(c.tags::jsonb) AS tag_label
JOIN game_tags gt
    ON gt.game_id = c.game_id
    AND LOWER(gt.label) = LOWER(TRIM(tag_label))
WHERE c.tags IS NOT NULL
  AND c.tags <> 'null'
  AND c.tags <> '[]'
ON CONFLICT DO NOTHING;

-- ── Step 7: Orphan color handling ──
-- Items with a non-NULL color but no tags get a synthetic '(color)' tag.

INSERT INTO game_tags (id, game_id, label, color, created_at, updated_at)
SELECT DISTINCT
    gen_random_uuid(),
    b.game_id,
    '(' || b.color || ')',
    b.color,
    NOW(),
    NOW()
FROM bases b
WHERE b.color IS NOT NULL
  AND (b.tags IS NULL OR b.tags = 'null' OR b.tags = '[]')
ON CONFLICT (game_id, (LOWER(label))) DO NOTHING;

INSERT INTO base_tags (base_id, tag_id)
SELECT DISTINCT
    b.id,
    gt.id
FROM bases b
JOIN game_tags gt
    ON gt.game_id = b.game_id
    AND gt.label = '(' || b.color || ')'
WHERE b.color IS NOT NULL
  AND (b.tags IS NULL OR b.tags = 'null' OR b.tags = '[]')
ON CONFLICT DO NOTHING;

INSERT INTO game_tags (id, game_id, label, color, created_at, updated_at)
SELECT DISTINCT
    gen_random_uuid(),
    c.game_id,
    '(' || c.color || ')',
    c.color,
    NOW(),
    NOW()
FROM challenges c
WHERE c.color IS NOT NULL
  AND (c.tags IS NULL OR c.tags = 'null' OR c.tags = '[]')
ON CONFLICT (game_id, (LOWER(label))) DO NOTHING;

INSERT INTO challenge_tags (challenge_id, tag_id)
SELECT DISTINCT
    c.id,
    gt.id
FROM challenges c
JOIN game_tags gt
    ON gt.game_id = c.game_id
    AND gt.label = '(' || c.color || ')'
WHERE c.color IS NOT NULL
  AND (c.tags IS NULL OR c.tags = 'null' OR c.tags = '[]')
ON CONFLICT DO NOTHING;

END $$;
