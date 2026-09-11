-- PF-03: platform XP. Game points stay the organizer's; XP is the platform's.
-- Every go-live..end run of a game is a cycle; awards and saved results hang
-- off it so resets and replays cannot double-award. See docs/specs/2026-09-10-xp-and-profile.md.

ALTER TABLE games ADD COLUMN xp_featured_multiplier NUMERIC(4,2) NOT NULL DEFAULT 1.00;

-- XP history outlives the game and the team it came from: the ledger is
-- append-only and a deleted game must not silently lower anyone's level.
CREATE TABLE xp_cycles (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id             UUID REFERENCES games(id) ON DELETE SET NULL,
    game_name           VARCHAR(255) NOT NULL,
    number              INTEGER NOT NULL,
    started_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    finalized_at        TIMESTAMPTZ,
    invalidated_at      TIMESTAMPTZ,
    factor              NUMERIC(6,4) NOT NULL,
    featured_multiplier NUMERIC(4,2) NOT NULL DEFAULT 1.00,
    formula_version     INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT uq_xp_cycles_game_number UNIQUE (game_id, number)
);
CREATE INDEX idx_xp_cycles_game ON xp_cycles (game_id) WHERE game_id IS NOT NULL;

CREATE TABLE xp_awards (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cycle_id        UUID NOT NULL REFERENCES xp_cycles(id) ON DELETE CASCADE,
    game_id         UUID REFERENCES games(id) ON DELETE SET NULL,
    team_id         UUID REFERENCES teams(id) ON DELETE SET NULL,
    player_id       UUID REFERENCES players(id) ON DELETE SET NULL,
    user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
    kind            VARCHAR(32) NOT NULL,
    reference_id    UUID NOT NULL,
    base_amount     INTEGER NOT NULL,
    factor          NUMERIC(8,4) NOT NULL,
    amount          INTEGER NOT NULL,
    formula_version INTEGER NOT NULL DEFAULT 1,
    awarded_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- One logical award per participation per cycle: replays and retries are no-ops.
CREATE UNIQUE INDEX uq_xp_awards_once ON xp_awards (cycle_id, kind, reference_id, player_id) WHERE player_id IS NOT NULL;
CREATE INDEX idx_xp_awards_user ON xp_awards (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_xp_awards_player ON xp_awards (player_id) WHERE player_id IS NOT NULL;
CREATE INDEX idx_xp_awards_cycle ON xp_awards (cycle_id);

CREATE TABLE xp_results (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cycle_id        UUID NOT NULL REFERENCES xp_cycles(id) ON DELETE CASCADE,
    team_id         UUID REFERENCES teams(id) ON DELETE SET NULL,
    team_name       VARCHAR(255) NOT NULL,
    placement       INTEGER,
    tied            BOOLEAN NOT NULL DEFAULT FALSE,
    teams           INTEGER NOT NULL,
    players         INTEGER NOT NULL,
    members         INTEGER NOT NULL,
    beaten          INTEGER NOT NULL,
    points          BIGINT NOT NULL,
    completed       BOOLEAN NOT NULL DEFAULT FALSE,
    eligible        BOOLEAN NOT NULL,
    ineligible_reason VARCHAR(64),
    placement_xp    INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT uq_xp_results_cycle_team UNIQUE (cycle_id, team_id)
);
