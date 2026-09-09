-- Org invites now expire.
--
-- Before this, an `org_invites` row stayed `pending` forever: a token mailed
-- to a club administrator two years ago still registered an account and handed
-- over the club. A club invite carries every org permission and, for an owner
-- invite, ownership itself, so an unbounded token is the widest credential
-- this schema mints.
--
-- Fourteen days matches how long a sales-led onboarding actually takes. The
-- column is nullable because accepted, declined and expired rows have no
-- deadline left to keep; only a `pending` row needs one.
ALTER TABLE org_invites ADD COLUMN expires_at TIMESTAMPTZ;

-- Existing pending invites get a deadline measured from when they were sent,
-- so a token already older than the window is expired the first time the
-- sweeper or a lookup looks at it rather than being silently renewed.
UPDATE org_invites
   SET expires_at = created_at + INTERVAL '14 days'
 WHERE status = 'pending'
   AND expires_at IS NULL;

CREATE INDEX idx_org_invites_expires_at
    ON org_invites (expires_at)
 WHERE expires_at IS NOT NULL;
