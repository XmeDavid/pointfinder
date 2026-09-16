-- OW-34: choice challenges. single_choice has exactly one correct option,
-- multiple_choice one or more and is graded all-or-nothing. Options live on
-- the challenge as JSON with stable ids; the answer key (which options are
-- correct) is operator-only and never sent to players. A submission keeps
-- the selected option ids as the audit truth next to the readable answer.
ALTER TYPE answer_type ADD VALUE IF NOT EXISTS 'single_choice';
ALTER TYPE answer_type ADD VALUE IF NOT EXISTS 'multiple_choice';
ALTER TABLE challenges ADD COLUMN choice_options JSONB;
ALTER TABLE submissions ADD COLUMN selected_option_ids JSONB;
