-- Wave: post-pilot reliability — P1 Phase 4 W3 — tags and colors for setup organization.
-- Operator-only metadata. Never exposed to players (enforced via DTO type-level
-- guards: PlayerChallengeResponse from W2 already excludes these fields, and
-- this wave introduces PlayerBaseResponse for the same reason — see
-- backend/src/main/java/com/prayer/pointfinder/dto/response/PlayerBaseResponse.java).
--
-- tags: free-text JSON array, max 20 entries enforced at the request DTO layer.
-- color: VARCHAR(7) hex, matching the existing Team.color pattern. Validated
-- server-side via @Pattern regex on the request DTO; client uses a fixed
-- palette of 12 swatches.

ALTER TABLE bases
    ADD COLUMN tags TEXT NULL,
    ADD COLUMN color VARCHAR(7) NULL;

ALTER TABLE challenges
    ADD COLUMN tags TEXT NULL,
    ADD COLUMN color VARCHAR(7) NULL;

CREATE INDEX idx_bases_color ON bases(color) WHERE color IS NOT NULL;
CREATE INDEX idx_challenges_color ON challenges(color) WHERE color IS NOT NULL;
