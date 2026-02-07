-- Simplify game states: merge 'draft' and 'setup' into just 'draft'
-- New model: draft -> live -> ended

ALTER TABLE games ALTER COLUMN status TYPE VARCHAR;
UPDATE games SET status = 'draft' WHERE status = 'setup';
DROP TYPE game_status;
CREATE TYPE game_status AS ENUM ('draft', 'live', 'ended');
ALTER TABLE games ALTER COLUMN status TYPE game_status USING status::game_status;
