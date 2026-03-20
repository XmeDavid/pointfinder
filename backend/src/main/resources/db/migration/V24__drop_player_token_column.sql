-- Stop storing raw JWT tokens in the players table.
-- The token was only written during join and never read back by the backend.
-- Authentication uses JWT signature validation + player ID lookup, not stored tokens.

DROP INDEX IF EXISTS idx_players_token;
ALTER TABLE players DROP COLUMN IF EXISTS token;
