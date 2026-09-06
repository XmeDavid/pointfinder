-- Wave: operator tutorials.
-- Spec: docs/specs/2026-09-06-operator-tutorials-design.md
--
-- Where an operator is inside a guided tutorial, per account rather than per
-- device, so a reload, a second browser, or the Tauri shell all pick up the
-- same run. One row per (operator, scenario); no row means "not started".
--
--   * status       — IN_PROGRESS | COMPLETED | SKIPPED. Stored as the Java
--                    enum name; the API speaks lowercase.
--   * current_step — the scenario step id the operator is on. NULL together
--                    with IN_PROGRESS means "restart this scenario from the
--                    top", which is how the library's Restart button is
--                    expressed without a DELETE endpoint.
--   * game_id      — the game a setup-game scenario was bound to, so Resume
--                    can return to it. A soft pointer: the client falls back
--                    to the game picker when the game is gone or has left
--                    setup, and the FK nulls the column if the game is
--                    deleted.
--
-- This is UI preference, not domain state: it is never audited and never
-- affects a game, a team, or a score.

CREATE TABLE user_tutorial_progress (
  user_id      UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scenario_id  VARCHAR(64) NOT NULL,
  status       VARCHAR(16) NOT NULL,
  current_step VARCHAR(64),
  game_id      UUID        REFERENCES games(id) ON DELETE SET NULL,
  started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, scenario_id)
);
