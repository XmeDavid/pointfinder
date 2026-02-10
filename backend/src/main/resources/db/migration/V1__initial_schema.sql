-- ============================================================
-- Scout Mission Control - Initial Database Schema
-- Consolidated baseline for a fresh database
-- ============================================================

-- Enums
CREATE TYPE user_role AS ENUM ('admin', 'operator');
CREATE TYPE game_status AS ENUM ('setup', 'live', 'ended');
CREATE TYPE answer_type AS ENUM ('text', 'file');
CREATE TYPE submission_status AS ENUM ('pending', 'approved', 'rejected', 'correct', 'incorrect');
CREATE TYPE invite_status AS ENUM ('pending', 'accepted', 'expired');
CREATE TYPE activity_event_type AS ENUM ('check_in', 'submission', 'approval', 'rejection');

-- ============================================================
-- Users
-- ============================================================
CREATE TABLE users (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email          VARCHAR(255) NOT NULL UNIQUE,
    name           VARCHAR(255) NOT NULL,
    password_hash  VARCHAR(255) NOT NULL,
    role           user_role NOT NULL DEFAULT 'operator',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_email ON users (email);

-- ============================================================
-- Games
-- ============================================================
CREATE TABLE games (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                VARCHAR(255) NOT NULL,
    description         TEXT NOT NULL DEFAULT '',
    start_date          TIMESTAMPTZ,
    end_date            TIMESTAMPTZ,
    status              game_status NOT NULL DEFAULT 'setup',
    uniform_assignment  BOOLEAN NOT NULL DEFAULT false,
    created_by          UUID NOT NULL REFERENCES users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_games_status ON games (status);
CREATE INDEX idx_games_created_by ON games (created_by);

-- ============================================================
-- Game Operators (many-to-many: games <-> users)
-- ============================================================
CREATE TABLE game_operators (
    game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (game_id, user_id)
);

CREATE INDEX idx_game_operators_user ON game_operators (user_id);

-- ============================================================
-- Challenges
-- ============================================================
CREATE TABLE challenges (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id             UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    title               VARCHAR(255) NOT NULL,
    description         TEXT NOT NULL DEFAULT '',
    content             TEXT NOT NULL DEFAULT '',
    completion_content  TEXT NOT NULL DEFAULT '',
    answer_type         answer_type NOT NULL DEFAULT 'text',
    auto_validate       BOOLEAN NOT NULL DEFAULT false,
    correct_answer      VARCHAR(1000),
    points              INTEGER NOT NULL DEFAULT 0,
    location_bound      BOOLEAN NOT NULL DEFAULT false,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_challenges_game ON challenges (game_id);

-- ============================================================
-- Bases
-- ============================================================
CREATE TABLE bases (
    id                           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id                      UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    name                         VARCHAR(255) NOT NULL,
    description                  TEXT NOT NULL DEFAULT '',
    lat                          DOUBLE PRECISION NOT NULL,
    lng                          DOUBLE PRECISION NOT NULL,
    nfc_linked                   BOOLEAN NOT NULL DEFAULT false,
    require_presence_to_submit   BOOLEAN NOT NULL DEFAULT false,
    hidden                       BOOLEAN NOT NULL DEFAULT false,
    fixed_challenge_id           UUID REFERENCES challenges(id) ON DELETE SET NULL,
    created_at                   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_bases_game ON bases (game_id);

-- ============================================================
-- Teams
-- ============================================================
CREATE TABLE teams (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id     UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    name        VARCHAR(255) NOT NULL,
    join_code   VARCHAR(20) NOT NULL UNIQUE,
    color       VARCHAR(7) NOT NULL DEFAULT '#3b82f6',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_teams_game ON teams (game_id);
CREATE INDEX idx_teams_join_code ON teams (join_code);

-- ============================================================
-- Players
-- ============================================================
CREATE TABLE players (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id       UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    device_id     VARCHAR(255) NOT NULL,
    display_name  VARCHAR(255) NOT NULL,
    token         VARCHAR(512) UNIQUE,
    push_token    VARCHAR(255),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_players_team ON players (team_id);
CREATE INDEX idx_players_token ON players (token);
CREATE INDEX idx_players_device_id ON players (device_id);
CREATE INDEX idx_players_push_token ON players (push_token);

-- ============================================================
-- Assignments (base <-> challenge mapping, optionally per team)
-- ============================================================
CREATE TABLE assignments (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id       UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    base_id       UUID NOT NULL REFERENCES bases(id) ON DELETE CASCADE,
    challenge_id  UUID NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
    team_id       UUID REFERENCES teams(id) ON DELETE CASCADE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_assignments_game ON assignments (game_id);
CREATE INDEX idx_assignments_base ON assignments (base_id);
CREATE INDEX idx_assignments_challenge ON assignments (challenge_id);

-- Team-specific uniqueness: one assignment per game/base/team.
CREATE UNIQUE INDEX uq_assignments_game_base_team
    ON assignments (game_id, base_id, team_id)
    WHERE team_id IS NOT NULL;

-- "All teams" uniqueness: one assignment per game/base when team is null.
CREATE UNIQUE INDEX uq_assignments_game_base_allteams
    ON assignments (game_id, base_id)
    WHERE team_id IS NULL;

-- ============================================================
-- Submissions
-- ============================================================
CREATE TABLE submissions (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id          UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    challenge_id     UUID NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
    base_id          UUID NOT NULL REFERENCES bases(id) ON DELETE CASCADE,
    answer           TEXT NOT NULL DEFAULT '',
    file_url         TEXT,
    status           submission_status NOT NULL DEFAULT 'pending',
    idempotency_key  UUID UNIQUE,
    submitted_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    reviewed_by      UUID REFERENCES users(id),
    feedback         TEXT
);

CREATE INDEX idx_submissions_team ON submissions (team_id);
CREATE INDEX idx_submissions_challenge ON submissions (challenge_id);
CREATE INDEX idx_submissions_base ON submissions (base_id);
CREATE INDEX idx_submissions_status ON submissions (status);
CREATE INDEX idx_submissions_idempotency ON submissions (idempotency_key);

-- ============================================================
-- Check-ins (tracks when a team checks into a base)
-- ============================================================
CREATE TABLE check_ins (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id        UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    team_id        UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    base_id        UUID NOT NULL REFERENCES bases(id) ON DELETE CASCADE,
    player_id      UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    checked_in_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_check_ins_game ON check_ins (game_id);
CREATE INDEX idx_check_ins_team ON check_ins (team_id);
CREATE INDEX idx_check_ins_base ON check_ins (base_id);
CREATE UNIQUE INDEX idx_check_ins_team_base ON check_ins (team_id, base_id);

-- ============================================================
-- Game Notifications
-- ============================================================
CREATE TABLE game_notifications (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id         UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    message         TEXT NOT NULL,
    target_team_id  UUID REFERENCES teams(id) ON DELETE CASCADE,
    sent_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    sent_by         UUID NOT NULL REFERENCES users(id)
);

CREATE INDEX idx_notifications_game ON game_notifications (game_id);

-- ============================================================
-- Operator Invites
-- ============================================================
CREATE TABLE operator_invites (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id     UUID REFERENCES games(id) ON DELETE CASCADE,
    email       VARCHAR(255) NOT NULL,
    token       VARCHAR(255) NOT NULL UNIQUE,
    status      invite_status NOT NULL DEFAULT 'pending',
    invited_by  UUID NOT NULL REFERENCES users(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_invites_token ON operator_invites (token);
CREATE INDEX idx_invites_email ON operator_invites (email);

-- ============================================================
-- Activity Events
-- ============================================================
CREATE TABLE activity_events (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id       UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    type          activity_event_type NOT NULL,
    team_id       UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    base_id       UUID REFERENCES bases(id) ON DELETE SET NULL,
    challenge_id  UUID REFERENCES challenges(id) ON DELETE SET NULL,
    message       TEXT NOT NULL DEFAULT '',
    timestamp     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_activity_game ON activity_events (game_id);
CREATE INDEX idx_activity_timestamp ON activity_events (game_id, timestamp DESC);

-- ============================================================
-- Team Locations (one per team, upserted)
-- ============================================================
CREATE TABLE team_locations (
    team_id     UUID PRIMARY KEY REFERENCES teams(id) ON DELETE CASCADE,
    lat         DOUBLE PRECISION NOT NULL,
    lng         DOUBLE PRECISION NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- Refresh Tokens
-- ============================================================
CREATE TABLE refresh_tokens (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token       VARCHAR(512) NOT NULL UNIQUE,
    expires_at  TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens (user_id);
CREATE INDEX idx_refresh_tokens_token ON refresh_tokens (token);
