-- The listing title is the game's name, which games.name allows up to 255
-- characters. The publication row only mirrors it at save time, so the mirror
-- must accept every valid game name; every response derives the title from
-- games.name and is never truncated.
ALTER TABLE game_publications ALTER COLUMN title TYPE VARCHAR(255);
