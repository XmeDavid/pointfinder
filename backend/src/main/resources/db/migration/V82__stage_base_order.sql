-- OW-40: base order is enforced per stage. A stage's bases form their own
-- route, numbered from 1, gated only among themselves; stages are sequenced
-- by activation, not by route position. Bases without a stage keep the
-- game-level flag as their "default route". Games that enforced order
-- before this carried one route across all their stages; each of those
-- stages now enforces its own route so no ordered game becomes free-order.
ALTER TABLE stages ADD COLUMN enforce_base_order BOOLEAN NOT NULL DEFAULT false;
UPDATE stages s SET enforce_base_order = true
  FROM games g WHERE s.game_id = g.id AND g.enforce_base_order = true;
