ALTER TABLE challenges ADD COLUMN unlocks_base_id UUID REFERENCES bases(id) ON DELETE SET NULL;
ALTER TABLE challenges ADD CONSTRAINT uq_challenges_unlocks_base UNIQUE (unlocks_base_id);
