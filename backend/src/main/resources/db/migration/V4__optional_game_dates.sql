-- Make game start_date and end_date optional
ALTER TABLE games ALTER COLUMN start_date DROP NOT NULL;
ALTER TABLE games ALTER COLUMN end_date DROP NOT NULL;
