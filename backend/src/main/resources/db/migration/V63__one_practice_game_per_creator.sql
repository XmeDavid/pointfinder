-- One practice game at a time, enforced by the database as well as the
-- service: two concurrent creations cannot both slip past the existence check.
CREATE UNIQUE INDEX uq_games_one_practice_game_per_creator
  ON games (created_by)
  WHERE tutorial_scenario IS NOT NULL AND status <> 'ended';
