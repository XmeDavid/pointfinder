-- Practice games: the game a tutorial runs on. A tutorial never touches a game
-- the operator made for a real event; it runs on a practice game that is
-- marked with its scenario, excluded from the personal active-game quota,
-- limited to a single player, and ended by the scheduler once it expires.
-- "Keep" clears both columns and turns it into a normal game.
ALTER TABLE games
  ADD COLUMN tutorial_scenario   VARCHAR(64),
  ADD COLUMN tutorial_expires_at TIMESTAMPTZ;

CREATE INDEX idx_games_tutorial_expires_at
  ON games (tutorial_expires_at)
  WHERE tutorial_expires_at IS NOT NULL;
