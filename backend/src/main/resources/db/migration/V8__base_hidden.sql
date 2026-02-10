-- ============================================================
-- Add hidden flag to bases
-- Hidden bases are invisible to players on the map until
-- they check in (e.g. via NFC scan). Operators always see all bases.
-- ============================================================

ALTER TABLE bases ADD COLUMN hidden BOOLEAN NOT NULL DEFAULT false;
