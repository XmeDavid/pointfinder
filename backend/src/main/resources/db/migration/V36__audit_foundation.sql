-- Wave: post-pilot reliability — P1 Phase 1 — Audit Foundation.
--
-- This migration is the substrate for the P1 Operator Rescue and Activity
-- Audit tracks. It is deliberately additive: no new endpoints, no behavior
-- changes for existing endpoints beyond capturing audit metadata. The schema
-- changes here unblock the next phases (operator rescue endpoints, mark
-- completed, unlock override, audit export, membership history).
--
-- Source spec: docs/specs/2026-04-08-post-pilot-reliability-and-operator-workflow.md
-- (P1 Operator Rescue and Overrides + P1 Activity Audit and Export).
--
-- Why this matters (from the pilot post-mortem):
--   * A player joined the wrong team and operators could not reconstruct what
--     they did there. Submissions were team-attributed, not player-attributed.
--   * Manual operator check-ins look like player check-ins in structured data.
--     Only "by operator" in free-text message distinguished them.
--   * ActivityEvent had no actor reference at all (only free-text message).
--   * GameService.updateStatus(resetProgress=true) HARD-DELETED check_ins,
--     submissions, activity_events, and upload_sessions — wiping the audit
--     trail forever.
--
-- Design principles:
--   * Snapshots are immutable. Display names are COPIED at action time, not
--     joined live. The audit survives later account/team deletion or rename.
--   * `source_surface` is enum-like text so we can extend it later without a
--     CHECK constraint migration. Allowed values today: 'player_app',
--     'web_admin', 'operator_rescue'. Future phases may add more.
--   * `archived BOOLEAN` replaces hard-delete. Active queries filter
--     `archived = false` by default; the audit export path reads everything.
--   * The unique `(team_id, base_id)` constraint on check_ins becomes a
--     partial index `WHERE archived = false` so a fresh check-in can replace
--     an archived one after a `resetProgress` without colliding with the
--     preserved audit row.

-- ============================================================
-- Activity Event Type enum extensions
-- ============================================================
-- Adding the new values now means Phases 2 and 3 do not need a second enum
-- migration. ALTER TYPE ... ADD VALUE is committed immediately and is
-- non-transactional in older PostgreSQL versions, but Flyway 9+ runs each
-- migration in its own transaction by default and PG 12+ supports the form
-- inside a transaction block. operator_override is for mark-completed and
-- unlock override actions in Phase 2; team_join and team_switch are for
-- membership history in Phase 3.
ALTER TYPE activity_event_type ADD VALUE IF NOT EXISTS 'operator_override';
ALTER TYPE activity_event_type ADD VALUE IF NOT EXISTS 'team_join';
ALTER TYPE activity_event_type ADD VALUE IF NOT EXISTS 'team_switch';

-- ============================================================
-- check_ins: actor + source + archive columns
-- ============================================================
-- For player-initiated check-ins, the existing `player_id` FK plus the new
-- `actor_device_id_snapshot` column gives us a stable audit pointer even if
-- the player row is later deleted. For operator-initiated check-ins,
-- `actor_operator_user_id` records who did the rescue and `operator_reason`
-- captures the optional free-text justification.
ALTER TABLE check_ins
    ADD COLUMN actor_operator_user_id      UUID NULL REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN actor_display_name_snapshot VARCHAR(255) NULL,
    ADD COLUMN actor_device_id_snapshot    VARCHAR(255) NULL,
    ADD COLUMN source_surface              VARCHAR(32) NULL,
    ADD COLUMN operator_reason             TEXT NULL,
    ADD COLUMN archived                    BOOLEAN NOT NULL DEFAULT FALSE;

-- Replace the old strict-uniqueness index with a partial one that only
-- enforces uniqueness on ACTIVE rows. This lets a `resetProgress` archive
-- the old check-in and a fresh check-in replace it without collision.
DROP INDEX IF EXISTS idx_check_ins_team_base;
CREATE UNIQUE INDEX idx_check_ins_team_base_active
    ON check_ins (team_id, base_id)
    WHERE archived = FALSE;

CREATE INDEX idx_check_ins_active
    ON check_ins (game_id)
    WHERE archived = FALSE;

CREATE INDEX idx_check_ins_actor_operator
    ON check_ins (actor_operator_user_id)
    WHERE actor_operator_user_id IS NOT NULL;

-- ============================================================
-- submissions: actor + source + archive columns
-- ============================================================
-- `submitted_by_player_id` records WHICH player on the team produced the
-- submission. The team-level scoring contract is unchanged; this is purely
-- audit metadata. `created_by_operator_id` is RESERVED for Phase 2's
-- mark-completed flow (operator-created synthetic submissions) and is
-- distinct from the existing `reviewed_by` column.
ALTER TABLE submissions
    ADD COLUMN submitted_by_player_id              UUID NULL REFERENCES players(id) ON DELETE SET NULL,
    ADD COLUMN submitted_by_display_name_snapshot  VARCHAR(255) NULL,
    ADD COLUMN submitted_by_device_id_snapshot     VARCHAR(255) NULL,
    ADD COLUMN created_by_operator_id              UUID NULL REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN created_by_display_name_snapshot    VARCHAR(255) NULL,
    ADD COLUMN operator_reason                     TEXT NULL,
    ADD COLUMN source_surface                      VARCHAR(32) NULL,
    ADD COLUMN archived                            BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX idx_submissions_active
    ON submissions (status)
    WHERE archived = FALSE;

CREATE INDEX idx_submissions_submitted_by_player
    ON submissions (submitted_by_player_id)
    WHERE submitted_by_player_id IS NOT NULL;

CREATE INDEX idx_submissions_created_by_operator
    ON submissions (created_by_operator_id)
    WHERE created_by_operator_id IS NOT NULL;

-- ============================================================
-- activity_events: actor + source + archive columns
-- ============================================================
-- Activity events get the richest actor capture because the audit export in
-- Phase 3 streams the activity log as the chronological ground truth. Both
-- player and operator actor FKs are present (mutually exclusive in practice
-- but enforced in code, not schema, to allow for future shared-actor cases).
ALTER TABLE activity_events
    ADD COLUMN actor_player_id              UUID NULL REFERENCES players(id) ON DELETE SET NULL,
    ADD COLUMN actor_operator_user_id       UUID NULL REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN actor_display_name_snapshot  VARCHAR(255) NULL,
    ADD COLUMN actor_device_id_snapshot     VARCHAR(255) NULL,
    ADD COLUMN source_surface               VARCHAR(32) NULL,
    ADD COLUMN archived                     BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX idx_activity_events_actor_player
    ON activity_events (actor_player_id)
    WHERE actor_player_id IS NOT NULL;

CREATE INDEX idx_activity_events_actor_operator
    ON activity_events (actor_operator_user_id)
    WHERE actor_operator_user_id IS NOT NULL;

CREATE INDEX idx_activity_events_active
    ON activity_events (game_id, timestamp DESC)
    WHERE archived = FALSE;
