-- Sales-led club deals, step 2 of 2.
--
-- A club does not hold a subscription: sales agrees a term, an admin issues a
-- Stripe invoice, and payment extends `organizations.term_end`. When the term
-- passes, SubscriptionLifecycleService moves the org to grace_period (term_end
-- + 7 days) and the existing sweeper freezes it. Personal plans keep their
-- self-serve Stripe subscriptions and are untouched by this migration.

-- ── Tier collapse: base/high → club ──────────────────────────────────
UPDATE organizations SET subscription_tier = 'club'
 WHERE subscription_tier IN ('base', 'high');

-- ── Term ─────────────────────────────────────────────────────────────
-- NULL means "no term": a free org, or a club an admin drives by hand.
-- Only a non-null term_end in the past can start a grace period.
ALTER TABLE organizations ADD COLUMN term_end TIMESTAMPTZ;

CREATE INDEX idx_organizations_term_end
    ON organizations (term_end)
    WHERE term_end IS NOT NULL;

-- ── Ownership transfer on invite acceptance ──────────────────────────
-- When an admin creates a club for an email that has no account yet, the
-- creating admin owns the org until the invitee registers. This flag marks
-- the invite whose acceptance transfers ownership to the invitee.
ALTER TABLE org_invites
    ADD COLUMN transfer_ownership BOOLEAN NOT NULL DEFAULT FALSE;

-- ── Club invoices ────────────────────────────────────────────────────
-- Mirrors the Stripe invoice so the org can list its billing history without
-- a Stripe round trip, and so `invoice.paid` can find the term it extends.
CREATE TABLE org_invoices (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id             UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    stripe_invoice_id  VARCHAR(255) NOT NULL UNIQUE,
    amount_cents       BIGINT NOT NULL,
    currency           VARCHAR(8) NOT NULL DEFAULT 'eur',
    description        TEXT,
    status             VARCHAR(32) NOT NULL,
    hosted_invoice_url TEXT,
    invoice_pdf        TEXT,
    due_at             TIMESTAMPTZ,
    paid_at            TIMESTAMPTZ,
    term_months        INTEGER NOT NULL DEFAULT 12,
    created_by         UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_org_invoices_org_id ON org_invoices (org_id, created_at DESC);

-- ── Webhook idempotency ──────────────────────────────────────────────
-- Stripe redelivers events. The handler records the event id in the same
-- transaction as its effect, so a redelivery finds the row and skips.
CREATE TABLE stripe_events (
    id           VARCHAR(255) PRIMARY KEY,
    type         VARCHAR(128) NOT NULL,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
