-- An invitee may now refuse an org invite instead of leaving it pending
-- forever. `declined` is a terminal status like `accepted`: the row stays for
-- the audit trail, and neither accept nor decline will touch it again.
--
-- PostgreSQL will not let a transaction USE an enum value it added itself, so
-- this migration only widens the type; nothing here writes the new label.
ALTER TYPE invite_status ADD VALUE IF NOT EXISTS 'declined';
