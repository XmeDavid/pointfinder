-- Finding 10.11: Remove the legacy DEFAULT 'ios' from push_platform column.
-- V2 added push_platform with DEFAULT 'ios'; V30 made it nullable but kept
-- the default. New rows without an explicit pushPlatform value should get NULL,
-- not 'ios', so Android players are not incorrectly sent APNs pushes.
ALTER TABLE players ALTER COLUMN push_platform DROP DEFAULT;
