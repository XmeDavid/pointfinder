-- Wave: post-pilot reliability — unify tags + colors. Replaces V39 per-item
-- tags/color columns with a game-scoped tag vocabulary. Operator-only.
-- Players must never see tag metadata (enforced at the DTO layer — see
-- PlayerBaseResponse/PlayerChallengeResponse).

CREATE TABLE game_tags (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id     UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    label       VARCHAR(40) NOT NULL,
    color       VARCHAR(7)  NOT NULL,  -- 7-char hex, enforced at DTO layer
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Case-insensitive uniqueness within a game. Matches frontend TagInput
-- case-insensitive dedupe at components/TagInput.tsx:63-66.
CREATE UNIQUE INDEX ux_game_tags_game_lower_label
    ON game_tags (game_id, LOWER(label));

CREATE INDEX ix_game_tags_game_id
    ON game_tags (game_id);

-- Join tables: cascade on both sides so deleting a tag detaches cleanly
-- and deleting a base/challenge drops its links.
CREATE TABLE base_tags (
    base_id UUID NOT NULL REFERENCES bases(id) ON DELETE CASCADE,
    tag_id  UUID NOT NULL REFERENCES game_tags(id) ON DELETE CASCADE,
    PRIMARY KEY (base_id, tag_id)
);
CREATE INDEX ix_base_tags_tag_id ON base_tags (tag_id);

CREATE TABLE challenge_tags (
    challenge_id UUID NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
    tag_id       UUID NOT NULL REFERENCES game_tags(id) ON DELETE CASCADE,
    PRIMARY KEY (challenge_id, tag_id)
);
CREATE INDEX ix_challenge_tags_tag_id ON challenge_tags (tag_id);
