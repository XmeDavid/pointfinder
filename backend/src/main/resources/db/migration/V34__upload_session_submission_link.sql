-- Wave: post-pilot reliability — upload session <-> submission FK linkage and needs-attention surface.
--
-- Adds a nullable FK from upload_sessions to submissions so that operators (and the
-- needs-attention detector) can distinguish a completed chunked upload that was
-- successfully attached to a submission from one whose final submission POST never
-- arrived (or arrived but drifted from the completed file_url).
--
-- The FK is nullable by design:
--   * Active/expired/cancelled sessions have no submission.
--   * Completed sessions acquired before this migration are backfilled best-effort below.
--   * The needs-attention detector is ALERT-ONLY and never deletes data, so a
--     lingering NULL submission_id always means "visible to operators", never "lost".
--
-- ON DELETE SET NULL keeps the upload session durable even if the linked submission
-- is later removed through a game reset: the operator can still see the upload record
-- and decide what to do with the bytes.

ALTER TABLE upload_sessions
    ADD COLUMN submission_id UUID NULL REFERENCES submissions(id) ON DELETE SET NULL;

-- Targeted lookup by submission_id for operator detail pages and future audit joins.
CREATE INDEX idx_upload_sessions_submission_id
    ON upload_sessions (submission_id)
    WHERE submission_id IS NOT NULL;

-- Covering index for the needs-attention scheduler: completed uploads that have
-- NOT been linked to a submission, ordered so the oldest ones surface first.
CREATE INDEX idx_upload_sessions_needs_attention
    ON upload_sessions (completed_at)
    WHERE status = 'completed'::upload_session_status
      AND submission_id IS NULL;

-- Best-effort backfill for historical data.
--
-- submissions.file_urls is a TEXT column holding a JSON array (see V16 and
-- StringListJsonConverter). We cast it to jsonb and use the ? operator to check
-- membership. submissions.file_url is the legacy single-file column and may still
-- hold a value for historical rows. We match on either.
--
-- submissions does not carry game_id directly; we reach the game through
-- submissions.team_id -> teams.game_id. The resulting UPDATE is idempotent and
-- safe to run on a populated table: it only touches rows whose submission_id is
-- still NULL and leaves everything else alone.
--
-- Any upload session that cannot be confidently tied to a submission stays NULL
-- and will surface via the needs-attention detector so an operator can review it.
-- That is intentional.
UPDATE upload_sessions u
SET submission_id = s.id
FROM submissions s
JOIN teams t ON t.id = s.team_id
WHERE u.status = 'completed'::upload_session_status
  AND u.submission_id IS NULL
  AND u.game_id = t.game_id
  AND u.file_url IS NOT NULL
  AND (
        s.file_url = u.file_url
        OR (
            s.file_urls IS NOT NULL
            AND s.file_urls <> ''
            AND s.file_urls::jsonb ? u.file_url
        )
  );
