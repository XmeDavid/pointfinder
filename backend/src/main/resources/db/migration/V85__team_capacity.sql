-- OW-05 first slice: an optional limit on how many players a team takes.
-- NULL keeps today's behavior (no limit). It only refuses new participations;
-- nobody already on a team is removed, and retired guest rows do not count.
ALTER TABLE teams ADD COLUMN max_players INTEGER;
ALTER TABLE teams ADD CONSTRAINT chk_teams_max_players
    CHECK (max_players IS NULL OR (max_players >= 1 AND max_players <= 500));
