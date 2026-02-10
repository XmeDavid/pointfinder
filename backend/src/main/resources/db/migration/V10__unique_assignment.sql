-- Clean up conflicting assignment modes:
-- If team-specific assignments exist for a base, remove "all teams" rows.
DELETE FROM assignments a
WHERE a.team_id IS NULL
  AND EXISTS (
      SELECT 1
      FROM assignments s
      WHERE s.game_id = a.game_id
        AND s.base_id = a.base_id
        AND s.team_id IS NOT NULL
  );

-- Deduplicate team-specific assignments; keep the most recent row.
WITH ranked_team_specific AS (
    SELECT id,
           ROW_NUMBER() OVER (
               PARTITION BY game_id, base_id, team_id
               ORDER BY created_at DESC, id DESC
           ) AS rn
    FROM assignments
    WHERE team_id IS NOT NULL
)
DELETE FROM assignments a
USING ranked_team_specific r
WHERE a.id = r.id
  AND r.rn > 1;

-- Deduplicate "all teams" assignments; keep the most recent row.
WITH ranked_all_teams AS (
    SELECT id,
           ROW_NUMBER() OVER (
               PARTITION BY game_id, base_id
               ORDER BY created_at DESC, id DESC
           ) AS rn
    FROM assignments
    WHERE team_id IS NULL
)
DELETE FROM assignments a
USING ranked_all_teams r
WHERE a.id = r.id
  AND r.rn > 1;

-- Team-specific uniqueness: one assignment per game/base/team.
CREATE UNIQUE INDEX uq_assignments_game_base_team
    ON assignments (game_id, base_id, team_id)
    WHERE team_id IS NOT NULL;

-- "All teams" uniqueness: one assignment per game/base when team is null.
CREATE UNIQUE INDEX uq_assignments_game_base_allteams
    ON assignments (game_id, base_id)
    WHERE team_id IS NULL;
