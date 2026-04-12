CREATE TYPE resource_type AS ENUM ('file', 'document');

CREATE TABLE resource_folders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    game_id UUID REFERENCES games(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES resource_folders(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_resource_folders_org_id ON resource_folders(org_id);
CREATE INDEX idx_resource_folders_game_id ON resource_folders(game_id);
CREATE INDEX idx_resource_folders_parent_id ON resource_folders(parent_id);

CREATE TABLE resources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    game_id UUID REFERENCES games(id) ON DELETE CASCADE,
    folder_id UUID REFERENCES resource_folders(id) ON DELETE SET NULL,
    type resource_type NOT NULL,
    name VARCHAR(255) NOT NULL,
    content_type VARCHAR(255) NOT NULL,
    s3_key VARCHAR(512),
    content TEXT,
    size_bytes BIGINT NOT NULL DEFAULT 0,
    shared_with_players BOOLEAN NOT NULL DEFAULT false,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_resources_org_id ON resources(org_id);
CREATE INDEX idx_resources_game_id ON resources(game_id);
CREATE INDEX idx_resources_folder_id ON resources(folder_id);
CREATE INDEX idx_resources_created_by ON resources(created_by);
