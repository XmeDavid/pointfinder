-- Widen correct_answer to TEXT and migrate existing single values to JSON array format
ALTER TABLE challenges ALTER COLUMN correct_answer TYPE TEXT;

UPDATE challenges
SET correct_answer = '["' || replace(replace(correct_answer, '\', '\\'), '"', '\"') || '"]'
WHERE correct_answer IS NOT NULL;
