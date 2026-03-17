-- Composite index for submissions filtered by team + base (review doc item 3.15)
CREATE INDEX IF NOT EXISTS idx_submissions_team_base ON submissions (team_id, base_id);
