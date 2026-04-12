-- V47__organizations_and_subscriptions.sql

-- Enums
CREATE TYPE org_tier AS ENUM ('free', 'base', 'high');
CREATE TYPE individual_tier AS ENUM ('free', 'pro');
CREATE TYPE billing_cycle AS ENUM ('monthly', 'annual', 'lifetime');
CREATE TYPE subscription_status AS ENUM ('active', 'past_due', 'grace_period', 'frozen', 'cancelled');

-- Organizations
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL UNIQUE,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    stripe_customer_id VARCHAR(255),
    subscription_tier org_tier NOT NULL DEFAULT 'free',
    subscription_status subscription_status NOT NULL DEFAULT 'active',
    stripe_subscription_id VARCHAR(255),
    grace_period_end TIMESTAMPTZ,
    quota_overrides JSONB,
    admin_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_organizations_slug ON organizations(slug);
CREATE INDEX idx_organizations_created_by ON organizations(created_by);
CREATE INDEX idx_organizations_stripe_customer_id ON organizations(stripe_customer_id);

-- Org Membership
CREATE TABLE org_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    permissions INTEGER NOT NULL DEFAULT 1,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(org_id, user_id)
);

CREATE INDEX idx_org_memberships_user_id ON org_memberships(user_id);
CREATE INDEX idx_org_memberships_org_id ON org_memberships(org_id);

-- User Subscription (individual billing)
CREATE TABLE user_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    tier individual_tier NOT NULL DEFAULT 'free',
    stripe_customer_id VARCHAR(255),
    stripe_subscription_id VARCHAR(255),
    status subscription_status NOT NULL DEFAULT 'active',
    grace_period_end TIMESTAMPTZ,
    quota_overrides JSONB,
    billing_cycle billing_cycle,
    current_period_end TIMESTAMPTZ,
    admin_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_subscriptions_user_id ON user_subscriptions(user_id);
CREATE INDEX idx_user_subscriptions_stripe_customer_id ON user_subscriptions(stripe_customer_id);
