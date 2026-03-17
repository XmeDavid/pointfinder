-- Compound indices for common query patterns

-- SubmissionRepository: queries filtering by team + challenge (e.g. duplicate check)
CREATE INDEX idx_submissions_team_challenge ON submissions (team_id, challenge_id);

-- PlayerRepository.findByDeviceIdAndTeamId(): player lookup on join/reconnect
CREATE INDEX idx_players_device_team ON players (device_id, team_id);
