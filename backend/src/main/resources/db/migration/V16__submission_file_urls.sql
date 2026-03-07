-- Add file_urls column (JSON array) to support multiple media files per submission.
-- Existing single file_url values are migrated into the new column.
ALTER TABLE submissions ADD COLUMN file_urls TEXT;

UPDATE submissions SET file_urls = json_build_array(file_url) WHERE file_url IS NOT NULL;
