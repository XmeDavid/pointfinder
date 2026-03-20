-- ============================================================
-- Add missing indexes and ON DELETE SET NULL for user FK refs
-- ============================================================

-- Index for querying notifications by game ordered by time
CREATE INDEX IF NOT EXISTS idx_notifications_game_sent_at
    ON game_notifications (game_id, sent_at DESC);

-- ============================================================
-- submissions.reviewed_by: add ON DELETE SET NULL
-- (already nullable, just needs the cascade behaviour)
-- ============================================================
ALTER TABLE submissions
    DROP CONSTRAINT submissions_reviewed_by_fkey;

ALTER TABLE submissions
    ADD CONSTRAINT submissions_reviewed_by_fkey
    FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL;

-- ============================================================
-- game_notifications.sent_by: make nullable + ON DELETE SET NULL
-- ============================================================
ALTER TABLE game_notifications
    ALTER COLUMN sent_by DROP NOT NULL;

ALTER TABLE game_notifications
    DROP CONSTRAINT game_notifications_sent_by_fkey;

ALTER TABLE game_notifications
    ADD CONSTRAINT game_notifications_sent_by_fkey
    FOREIGN KEY (sent_by) REFERENCES users(id) ON DELETE SET NULL;
