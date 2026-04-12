CREATE TABLE resource_embeds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource_id UUID NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
    base_id UUID REFERENCES bases(id) ON DELETE CASCADE,
    challenge_id UUID REFERENCES challenges(id) ON DELETE CASCADE,
    UNIQUE(resource_id, base_id),
    UNIQUE(resource_id, challenge_id)
);

CREATE INDEX idx_resource_embeds_resource_id ON resource_embeds(resource_id);
CREATE INDEX idx_resource_embeds_base_id ON resource_embeds(base_id);
CREATE INDEX idx_resource_embeds_challenge_id ON resource_embeds(challenge_id);
