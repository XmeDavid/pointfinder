-- OW-06: a signed-in account reports a listed game it finds inappropriate,
-- misleading, unsafe or spam. Platform admins review open reports and either
-- dismiss them or remove the listing (an ordinary, audited unpublish). The
-- reporter is kept for the admin only; publishers never see it.
CREATE TABLE publication_reports (
    id                  UUID PRIMARY KEY,
    game_id             UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    reporter_user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
    reporter_name_snapshot VARCHAR(255) NOT NULL,
    reason              VARCHAR(32) NOT NULL,
    details             VARCHAR(1000),
    status              VARCHAR(16) NOT NULL DEFAULT 'open',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at         TIMESTAMPTZ,
    resolved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT chk_publication_reports_reason
        CHECK (reason IN ('inappropriate', 'misleading', 'unsafe', 'spam', 'other')),
    CONSTRAINT chk_publication_reports_status
        CHECK (status IN ('open', 'dismissed', 'removed'))
);
-- One open report per account and game: repeating a report adds nothing.
CREATE UNIQUE INDEX ux_publication_reports_open_reporter
    ON publication_reports (game_id, reporter_user_id) WHERE status = 'open';
CREATE INDEX idx_publication_reports_open ON publication_reports (created_at) WHERE status = 'open';
