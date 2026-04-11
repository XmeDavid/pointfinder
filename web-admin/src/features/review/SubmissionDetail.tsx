import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useSubmissions } from '@/hooks/queries/useSubmissions'
import { useTeams } from '@/hooks/queries/useTeams'
import { useChallenges } from '@/hooks/queries/useChallenges'
import { useBases } from '@/hooks/queries/useBases'
import { useReviewSubmission } from '@/hooks/mutations/useSubmissionMutations'
import { useWorkspaceStore } from '@/stores/workspace'
import { relativeTime } from '@/lib/utils/dates'
import apiClient from '@/lib/api/client'
import { Spinner } from '@/components/feedback/Spinner'

// ---------------------------------------------------------------------------
// AuthMedia — fetches a file through the authenticated API client and renders
// it as an <img> or <video> depending on the file extension.
// ---------------------------------------------------------------------------

function isVideoUrl(url: string): boolean {
  return /\.(mp4|mov)$/i.test(url)
}

function AuthMedia({ url, alt }: { url: string; alt: string }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [error, setError] = useState(false)
  const blobRef = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setBlobUrl(null)
    setError(false)

    // Backend stores URLs like "/api/games/{id}/files/name.jpg" but
    // apiClient already has baseURL="/api", so strip the prefix.
    const apiPath = url.startsWith('/api') ? url.slice(4) : url
    apiClient
      .get(apiPath, { responseType: 'blob' })
      .then(({ data }) => {
        if (cancelled) return
        const objUrl = URL.createObjectURL(data)
        blobRef.current = objUrl
        setBlobUrl(objUrl)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })

    return () => {
      cancelled = true
      if (blobRef.current) {
        URL.revokeObjectURL(blobRef.current)
        blobRef.current = null
      }
    }
  }, [url])

  if (error) {
    return (
      <div className="flex items-center justify-center h-56 bg-muted rounded-lg text-muted-foreground text-sm">
        Failed to load file
      </div>
    )
  }

  if (!blobUrl) {
    return (
      <div className="flex items-center justify-center h-56 bg-muted rounded-lg">
        <Spinner />
      </div>
    )
  }

  if (isVideoUrl(url)) {
    return (
      <video
        src={blobUrl}
        controls
        className="w-full rounded-lg"
        data-testid="submission-video"
      />
    )
  }

  return (
    <img
      src={blobUrl}
      alt={alt}
      className="w-full h-full object-cover"
      data-testid="submission-image"
    />
  )
}

// ---------------------------------------------------------------------------
// SubmissionDetail
// ---------------------------------------------------------------------------

interface SubmissionDetailProps {
  submissionId: string
  gameId: string
}

export default function SubmissionDetail({ submissionId, gameId }: SubmissionDetailProps) {
  const { t } = useTranslation()
  const { data: submissions = [] } = useSubmissions(gameId)
  const { data: teams = [] } = useTeams(gameId)
  const { data: challenges = [] } = useChallenges(gameId)
  const { data: bases = [] } = useBases(gameId)
  const reviewMutation = useReviewSubmission(gameId)
  const selectSubmission = useWorkspaceStore((s) => s.selectSubmission)

  const submission = submissions.find((s) => s.id === submissionId)
  const challenge = submission
    ? challenges.find((c) => c.id === submission.challengeId)
    : undefined
  const team = submission
    ? teams.find((t) => t.id === submission.teamId)
    : undefined
  const base = submission
    ? bases.find((b) => b.id === submission.baseId)
    : undefined

  const [points, setPoints] = useState(
    submission?.points ?? challenge?.points ?? 0,
  )
  const [feedback, setFeedback] = useState(submission?.feedback ?? '')

  // Reset local state when submission changes
  useEffect(() => {
    setPoints(submission?.points ?? challenge?.points ?? 0)
    setFeedback(submission?.feedback ?? '')
  }, [submissionId, submission?.points, challenge?.points, submission?.feedback])

  if (!submission) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        Submission not found.
      </div>
    )
  }

  const isPending = submission.status === 'pending'

  const advanceToNext = () => {
    const pendingSubs = submissions
      .filter((s) => s.status === 'pending' && s.id !== submissionId)
      .sort(
        (a, b) =>
          new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime(),
      )
    selectSubmission(pendingSubs[0]?.id ?? null)
  }

  const handleApprove = () => {
    reviewMutation.mutate(
      { submissionId, status: 'approved', feedback: feedback || undefined, points },
      { onSuccess: advanceToNext },
    )
  }

  const handleReject = () => {
    reviewMutation.mutate(
      { submissionId, status: 'rejected', feedback: feedback || undefined },
      { onSuccess: advanceToNext },
    )
  }

  const fileUrls = submission.fileUrls?.length
    ? submission.fileUrls
    : submission.fileUrl
      ? [submission.fileUrl]
      : []

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-4 pb-20 space-y-4">
        {/* Header section */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span
              className="w-3 h-3 rounded-full shrink-0"
              style={{ backgroundColor: team?.color ?? '#888' }}
            />
            <span className="text-base font-semibold text-foreground">
              {team?.name ?? 'Unknown'}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {base && <span>at {base.name}</span>}
            <span>{relativeTime(submission.submittedAt)}</span>
          </div>
        </div>

        {/* Challenge context */}
        <div className="bg-muted/50 rounded-lg p-3 space-y-2" data-testid="challenge-context">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">
              {challenge?.title ?? 'Unknown Challenge'}
            </span>
          </div>
          {challenge?.description && (
            <p className="text-xs text-muted-foreground">
              {challenge.description}
            </p>
          )}
          {challenge?.correctAnswer && challenge.correctAnswer.length > 0 && (
            <div className="mt-1">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Expected answer
              </span>
              <div className="mt-0.5 px-2 py-1 bg-muted rounded border border-border font-mono text-xs text-foreground">
                {challenge.correctAnswer.join(', ')}
              </div>
            </div>
          )}
          {challenge?.operatorNotes && (
            <div className="mt-1">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Operator notes
              </span>
              <div className="mt-0.5 px-2 py-1 bg-muted/60 rounded border border-border/50 text-xs text-muted-foreground italic">
                {challenge.operatorNotes}
              </div>
            </div>
          )}
        </div>

        {/* Submission content */}
        <div className="space-y-3">
          {submission.answer && (
            <div>
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1 block">
                Text answer
              </span>
              <div className="px-3 py-2 border border-border rounded-lg text-sm text-foreground bg-muted/30">
                {submission.answer}
              </div>
            </div>
          )}

          {fileUrls.length > 0 && (
            <div className="space-y-2">
              {fileUrls.map((url, idx) => (
                <div key={idx} className="relative rounded-lg overflow-hidden border border-border">
                  {isVideoUrl(url) ? (
                    <AuthMedia
                      url={url}
                      alt={t('submissions.altFile', { index: idx + 1 })}
                    />
                  ) : (
                    <div className="h-56 relative">
                      <AuthMedia
                        url={url}
                        alt={t('submissions.altFile', { index: idx + 1 })}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-background/60 to-transparent pointer-events-none" />
                      <div className="absolute bottom-3 left-3 text-xs text-muted-foreground">
                        {fileUrls.length > 1
                          ? t('submissions.photoSubmissionCount', { current: idx + 1, total: fileUrls.length })
                          : t('submissions.photoSubmission')}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Points section */}
        {isPending && (
          <div>
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1 block">
              Points
            </label>
            <input
              type="number"
              value={points}
              onChange={(e) => setPoints(Number(e.target.value))}
              data-testid="points-input"
              className="w-24 px-2 py-1.5 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-ring"
            />
          </div>
        )}

        {/* Feedback section */}
        {isPending && (
          <div>
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1 block">
              Feedback
            </label>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Optional feedback for the team..."
              rows={2}
              data-testid="feedback-input"
              className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-ring resize-none"
            />
          </div>
        )}

        {/* Reviewed state info */}
        {!isPending && (
          <div className="space-y-2" data-testid="reviewed-state">
            <div className="flex items-center gap-2 text-xs">
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                  submission.status === 'approved' || submission.status === 'correct'
                    ? 'bg-success/20 text-success'
                    : 'bg-destructive/20 text-destructive'
                }`}
              >
                {submission.status === 'approved' || submission.status === 'correct'
                  ? 'Approved'
                  : 'Rejected'}
              </span>
              {(submission.status === 'approved' || submission.status === 'correct') &&
                submission.points != null && (
                  <span className="text-muted-foreground">{submission.points} pts</span>
                )}
            </div>
            {submission.feedback && (
              <div className="px-3 py-2 bg-muted/30 border border-border rounded-lg text-xs text-muted-foreground italic">
                {submission.feedback}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Action bar -- only for pending */}
      {isPending && (
        <div className="sticky bottom-0 px-4 py-3 border-t border-border bg-card/80 backdrop-blur-sm flex items-center gap-3">
          <button
            onClick={handleReject}
            data-testid="reject-btn"
            className="bg-destructive hover:bg-destructive/90 text-destructive-foreground px-6 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer"
          >
            <span className="flex items-center gap-1.5">
              <span>&#10007; Reject</span>
              <span className="text-[10px] opacity-70">(R)</span>
            </span>
          </button>

          <div className="flex-1 text-center text-xs text-muted-foreground">
            {points} pts
          </div>

          <button
            onClick={handleApprove}
            data-testid="approve-btn"
            className="bg-success hover:bg-success/90 text-success-foreground px-6 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer"
          >
            <span className="flex items-center gap-1.5">
              <span>&#10003; Approve</span>
              <span className="text-[10px] opacity-70">(A)</span>
            </span>
          </button>
        </div>
      )}
    </div>
  )
}
