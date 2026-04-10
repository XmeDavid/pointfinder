CREATE TABLE stages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    order_index INT NOT NULL DEFAULT 0,
    transition_type VARCHAR(20) NOT NULL DEFAULT 'manual',
    scheduled_at TIMESTAMP WITH TIME ZONE,
    trigger_base_id UUID REFERENCES bases(id) ON DELETE SET NULL,
    is_active BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_stages_game_id ON stages(game_id);
CREATE INDEX idx_stages_game_order ON stages(game_id, order_index);

ALTER TABLE bases ADD COLUMN stage_id UUID REFERENCES stages(id) ON DELETE SET NULL;
CREATE INDEX idx_bases_stage_id ON bases(stage_id);
