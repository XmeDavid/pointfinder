-- Wave: check-in methods (NFC / QR / location).
-- Spec: docs/specs/2026-09-05-check-in-methods-design.md
--
-- Today every base is proved by tapping its NFC tag. This migration makes the
-- proof method a per-base choice with a game-level default:
--
--   * NFC       — tap the tag written for the base (today's behaviour).
--   * QR        — scan a printed code carrying the same token as the tag.
--   * LOCATION  — the base unlocks when the phone's GPS fix lands inside the
--                 base radius; if GPS never converges the player may claim
--                 presence after dwelling nearby, and the claim is recorded,
--                 marked, and reported to operators.
--
-- Everything here is additive with a default, so existing games keep working
-- unchanged: bases and check-ins backfill to NFC, games default to NFC with a
-- 15 m radius, and historical operator rescues are re-labelled OPERATOR so the
-- audit trail distinguishes them from player-verified rows.

-- ── Base: the per-base method and optional radius override ───────────────
ALTER TABLE bases ADD COLUMN check_in_method VARCHAR(16) NOT NULL DEFAULT 'NFC';
-- NULL means "inherit games.default_check_in_radius_m". Writes are clamped to
-- 5..200 in the service layer; the column stays unconstrained so an operator
-- lowering the game default never invalidates a stored row.
ALTER TABLE bases ADD COLUMN check_in_radius_m INTEGER;

-- ── Game: the default copied onto new bases at creation time ─────────────
ALTER TABLE games ADD COLUMN default_check_in_method VARCHAR(16) NOT NULL DEFAULT 'NFC';
ALTER TABLE games ADD COLUMN default_check_in_radius_m INTEGER NOT NULL DEFAULT 15;

-- ── CheckIn: which method proved this visit, and how strong the proof was ─
ALTER TABLE check_ins ADD COLUMN method VARCHAR(16) NOT NULL DEFAULT 'NFC';
ALTER TABLE check_ins ADD COLUMN verification VARCHAR(16) NOT NULL DEFAULT 'VERIFIED';

-- Historical operator rescues were never player-verified. Re-label them so the
-- command view and the audit export can tell a rescue from a real arrival.
UPDATE check_ins SET verification = 'OPERATOR' WHERE source_surface = 'operator_rescue';

-- Geo proof, stored verbatim so an operator reviewing an incident sees exactly
-- what the phone reported rather than a derived verdict.
ALTER TABLE check_ins ADD COLUMN proof_lat DOUBLE PRECISION;
ALTER TABLE check_ins ADD COLUMN proof_lng DOUBLE PRECISION;
ALTER TABLE check_ins ADD COLUMN proof_accuracy_m DOUBLE PRECISION;
ALTER TABLE check_ins ADD COLUMN proof_distance_m DOUBLE PRECISION;
ALTER TABLE check_ins ADD COLUMN proof_captured_at TIMESTAMPTZ;

-- One entry per player on the team at claim time: playerId, displayName, lat,
-- lng, accuracyM, ageSeconds, distanceM. Only populated for CLAIMED rows.
ALTER TABLE check_ins ADD COLUMN team_positions_snapshot JSONB;

-- ── PlayerLocation: the phone already sends these; stop discarding them ───
ALTER TABLE player_locations ADD COLUMN accuracy_m DOUBLE PRECISION;
ALTER TABLE player_locations ADD COLUMN captured_at TIMESTAMPTZ;

-- ── ActivityEvent: structured payload beside the free-text message ────────
-- Check-in events carry {"method": ..., "verification": ...} and, for claims,
-- {"teammatesInRing": n, "teammatesTotal": n}. The message column stays the
-- human narration; consumers that do not know about metadata are unaffected.
ALTER TABLE activity_events ADD COLUMN metadata JSONB;
