-- Wave: post-pilot reliability — P1 Phase 2 — Operator Rescue: Base Unlock Overrides.
--
-- This migration adds the schema substrate for the reversible "unlock base
-- for team" operator rescue action. Phase 1 (V36) already seeded the audit
-- foundation (actor snapshots, source_surface, archived soft-delete). Phase 2
-- builds on it with two concrete rescue endpoints:
--
--   1. POST /api/games/{gameId}/teams/{teamId}/bases/{baseId}/mark-completed
--      — synthesizes an approved Submission attributed to the operator and
--      reuses the audit columns V36 added to `submissions`. No schema change
--      is required here; this migration does not touch `submissions`.
--
--   2. POST/DELETE /api/games/{gameId}/teams/{teamId}/bases/{baseId}/unlock-override
--      — creates/removes a row in the NEW `base_unlock_overrides` table
--      defined below. Visibility for hidden bases in
--      `PlayerService.getProgress` now additionally honors an active
--      override: a base with an active override is visible to the target
--      team regardless of the normal unlock trigger.
--
-- Design principles:
--   * Reversibility via SOFT-DELETE. A DELETE on an active row sets
--     `deleted_at` + `deleted_by_operator_id` but preserves the history
--     instead of erasing the audit trail.
--   * Actor snapshots mirror V36: `created_by_display_name_snapshot` and
--     `deleted_by_display_name_snapshot` are copied at action time so the
--     audit row outlives later account removal. The FKs to `users` are
--     ON DELETE SET NULL for the same reason.
--   * Uniqueness is enforced only on ACTIVE rows via a partial index, so
--     after a soft-delete the same (team, base) pair can be overridden
--     again without collision.
--   * `operator_reason` is free text, optional, max 500 chars at the DTO
--     layer, TEXT at the schema layer to stay forward-compatible.
--
-- Source spec: docs/specs/2026-04-08-post-pilot-reliability-and-operator-workflow.md
-- (P1 Operator Rescue and Overrides).

CREATE TABLE base_unlock_overrides (
    id                                    UUID PRIMARY KEY,
    game_id                               UUID NOT NULL REFERENCES games(id)  ON DELETE CASCADE,
    team_id                               UUID NOT NULL REFERENCES teams(id)  ON DELETE CASCADE,
    base_id                               UUID NOT NULL REFERENCES bases(id)  ON DELETE CASCADE,

    -- Creator audit snapshot (mirrors V36 audit foundation convention).
    -- The FK is ON DELETE SET NULL so the audit row outlives later operator
    -- account removal; the display-name snapshot is immutable and survives
    -- later rename.
    created_by_operator_id                UUID NULL     REFERENCES users(id)  ON DELETE SET NULL,
    created_by_display_name_snapshot      VARCHAR(255) NOT NULL,
    operator_reason                       TEXT NULL,
    created_at                            TIMESTAMPTZ  NOT NULL DEFAULT now(),

    -- Soft-delete audit. deleted_at IS NULL means the override is ACTIVE.
    -- When the operator removes the override, these three fields are
    -- populated and the row stays in the database so the audit trail can
    -- reconstruct the create/remove window.
    deleted_at                            TIMESTAMPTZ  NULL,
    deleted_by_operator_id                UUID NULL     REFERENCES users(id)  ON DELETE SET NULL,
    deleted_by_display_name_snapshot      VARCHAR(255) NULL
);

-- Partial unique index on ACTIVE rows only. After a soft-delete, the same
-- (team_id, base_id) pair can be overridden again without colliding with
-- the preserved history row.
CREATE UNIQUE INDEX uq_base_unlock_overrides_active
    ON base_unlock_overrides (team_id, base_id)
    WHERE deleted_at IS NULL;

-- Active-row lookup by game + team. Used by the visibility check in
-- PlayerService.getProgress (one query per player snapshot) and by the
-- operator listing endpoint.
CREATE INDEX idx_base_unlock_overrides_game_team_active
    ON base_unlock_overrides (game_id, team_id)
    WHERE deleted_at IS NULL;

-- Game-wide active lookup for the optional operator UI listing endpoint.
CREATE INDEX idx_base_unlock_overrides_game_active
    ON base_unlock_overrides (game_id)
    WHERE deleted_at IS NULL;
