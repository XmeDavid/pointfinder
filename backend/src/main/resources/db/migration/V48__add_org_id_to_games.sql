-- V48__add_org_id_to_games.sql

ALTER TABLE games ADD COLUMN org_id UUID REFERENCES organizations(id) ON DELETE SET NULL;

CREATE INDEX idx_games_org_id ON games(org_id);
