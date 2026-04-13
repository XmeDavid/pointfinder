CREATE TABLE org_invites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    token VARCHAR(255) NOT NULL UNIQUE,
    status invite_status NOT NULL DEFAULT 'pending',
    default_permissions INTEGER NOT NULL DEFAULT 1,
    invited_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_org_invites_org_id ON org_invites(org_id);
CREATE INDEX idx_org_invites_email ON org_invites(email);
CREATE INDEX idx_org_invites_token ON org_invites(token);
