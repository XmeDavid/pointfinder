-- Every node now writes players.game_id on join (V73 left it nullable for the
-- rolling deploy). Backfill any straggler from its team and make it required so
-- the one-participation-per-account index can be trusted.
UPDATE players p SET game_id = t.game_id FROM teams t WHERE p.team_id = t.id AND p.game_id IS NULL;
ALTER TABLE players ALTER COLUMN game_id SET NOT NULL;
