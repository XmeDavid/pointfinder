-- Owner decisions of 2026-09-24.
-- A listing an admin removes is held: its publisher cannot list it again
-- until an admin releases it. Holding and releasing are publication events.
ALTER TABLE game_publications ADD COLUMN moderation_hold_at TIMESTAMPTZ;
ALTER TABLE game_publications ADD COLUMN moderation_hold_by UUID REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE game_publication_events DROP CONSTRAINT chk_game_publication_events_operation;
ALTER TABLE game_publication_events ADD CONSTRAINT chk_game_publication_events_operation
    CHECK (operation IN ('save', 'admission', 'publish', 'unpublish', 'feature', 'unfeature', 'hold', 'release'));

-- An admin can block an abusive account: it is signed out everywhere, cannot
-- sign in, and its listings are removed and held. Unblocking restores sign-in only.
ALTER TABLE users ADD COLUMN blocked_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN blocked_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN blocked_reason VARCHAR(500);
