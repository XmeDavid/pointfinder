-- ============================================================
-- Add require_presence_to_submit to bases
-- Controls whether players must be at the base to submit answers
-- ============================================================

ALTER TABLE bases ADD COLUMN require_presence_to_submit BOOLEAN NOT NULL DEFAULT false;
