-- Add NFC verification token to bases for check-in validation.
-- Backfill existing bases with random 8-char alphanumeric tokens.

ALTER TABLE bases ADD COLUMN nfc_token VARCHAR(8);

UPDATE bases SET nfc_token = substr(md5(random()::text || id::text), 1, 8);

ALTER TABLE bases ALTER COLUMN nfc_token SET NOT NULL;
