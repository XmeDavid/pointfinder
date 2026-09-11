-- PF-07/PF-08: publication and Explore. A game may carry one deliberate public
-- summary, written separately from the game's own description. Publishing
-- lists it in Explore for signed-in accounts and never changes the game's
-- status; unpublishing keeps the summary as a draft. Coordinates are the
-- publisher's approximate public location, never derived from bases. Public
-- admission is an explicitly designated team of the game; when that team is
-- deleted the listing falls back to "join code required".
-- See docs/specs/2026-09-10-game-discovery.md.

CREATE TABLE game_publications (
    game_id           UUID PRIMARY KEY REFERENCES games(id) ON DELETE CASCADE,
    title             VARCHAR(120) NOT NULL,
    summary           TEXT NOT NULL,
    place             VARCHAR(120) NOT NULL,
    lat               DOUBLE PRECISION,
    lng               DOUBLE PRECISION,
    category          VARCHAR(32) NOT NULL DEFAULT 'other',
    admission_team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
    published_at      TIMESTAMPTZ,
    published_by      UUID REFERENCES users(id) ON DELETE SET NULL,
    featured          BOOLEAN NOT NULL DEFAULT FALSE,
    featured_at       TIMESTAMPTZ,
    featured_by       UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_game_publications_coords CHECK ((lat IS NULL) = (lng IS NULL)),
    CONSTRAINT chk_game_publications_category CHECK (category IN ('coast', 'forest', 'city', 'other'))
);
CREATE INDEX idx_game_publications_listed ON game_publications (published_at) WHERE published_at IS NOT NULL;
