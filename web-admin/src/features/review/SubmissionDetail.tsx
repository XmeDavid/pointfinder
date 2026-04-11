import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useSubmissions } from '@/hooks/queries/useSubmissions'
import { useTeams } from '@/hooks/queries/useTeams'
import { useChallenges } from '@/hooks/queries/useChallenges'
import { useBases } from '@/hooks/queries/useBases'
import { useReviewSubmission } from '@/hooks/mutations/useSubmissionMutations'
import { useWorkspaceStore } from '@/stores/workspace'
import { relativeTime } from '@/lib/utils/dates'

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
      <div className="flex-1 flex items-center justify-center text-text-muted text-sm">
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

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-4 pb-20 space-y-4">
        {/* Header section */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span
              className="w-3 h-3 rounded-full shrink-0"
              style={{ backgroundColor: team?.color ?? '#888' }}
            />
            <span className="text-base font-semibold text-text-primary">
              {team?.name ?? 'Unknown'}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-text-muted">
            {base && <span>at {base.name}</span>}
            <span>{relativeTime(submission.submittedAt)}</span>
          </div>
        </div>

        {/* Challenge context */}
        <div className="bg-elevated/50 rounded-lg p-3 space-y-2" data-testid="challenge-context">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-text-primary">
              {challenge?.title ?? 'Unknown Challenge'}
            </span>
          </div>
          {challenge?.description && (
            <p className="text-xs text-text-secondary">
              {challenge.description}
            </p>
          )}
          {challenge?.correctAnswer && challenge.correctAnswer.length > 0 && (
            <div className="mt-1">
              <span className="text-[10px] uppercase tracking-wide text-text-muted">
                Expected answer
              </span>
              <div className="mt-0.5 px-2 py-1 bg-surface rounded border border-border font-mono text-xs text-text-primary">
                {challenge.correctAnswer.join(', ')}
              </div>
            </div>
          )}
          {challenge?.operatorNotes && (
            <div className="mt-1">
              <span className="text-[10px] uppercase tracking-wide text-text-muted">
                Operator notes
              </span>
              <div className="mt-0.5 px-2 py-1 bg-surface/60 rounded border border-border/50 text-xs text-text-muted italic">
                {challenge.operatorNotes}
              </div>
            </div>
          )}
        </div>

        {/* Submission content */}
        <div className="space-y-3">
          {submission.answer && (
            <div>
              <span className="text-[10px] uppercase tracking-wide text-text-muted mb-1 block">
                Text answer
              </span>
              <div className="px-3 py-2 border border-border rounded-lg text-sm text-text-primary bg-surface/30">
                {submission.answer}
              </div>
            </div>
          )}

          {(submission.fileUrl || (submission.fileUrls && submission.fileUrls.length > 0)) && (() => {
            const urls = submission.fileUrls?.length ? submission.fileUrls : submission.fileUrl ? [submission.fileUrl] : []
            return (
              <div className="space-y-2">
                {urls.map((url, idx) => (
                  <div key={idx} className="relative rounded-lg overflow-hidden border border-border">
                    <div className="h-56 relative">
                      <img
                        src={url}
                        alt={t('submissions.altFile', { index: idx + 1 })}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none'
                        }}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-background/60 to-transparent" />
                      <div className="absolute bottom-3 left-3 text-xs text-text-secondary">
                        {urls.length > 1 ? t('submissions.photoSubmissionCount', { current: idx + 1, total: urls.length }) : t('submissions.photoSubmission')}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          })()}
        </div>

        {/* Points section */}
        {isPending && (
          <div>
            <label className="text-[10px] uppercase tracking-wide text-text-muted mb-1 block">
              Points
            </label>
            <input
              type="number"
              value={points}
              onChange={(e) => setPoints(Number(e.target.value))}
              data-testid="points-input"
              className="w-24 px-2 py-1.5 bg-surface border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:border-accent"
            />
          </div>
        )}

        {/* Feedback section */}
        {isPending && (
          <div>
            <label className="text-[10px] uppercase tracking-wide text-text-muted mb-1 block">
              Feedback
            </label>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Optional feedback for the team..."
              rows={2}
              data-testid="feedback-input"
              className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-accent resize-none"
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
                    ? 'bg-accent/20 text-accent'
                    : 'bg-danger/20 text-danger'
                }`}
              >
                {submission.status === 'approved' || submission.status === 'correct'
                  ? 'Approved'
                  : 'Rejected'}
              </span>
              {(submission.status === 'approved' || submission.status === 'correct') &&
                submission.points != null && (
                  <span className="text-text-muted">{submission.points} pts</span>
                )}
            </div>
            {submission.feedback && (
              <div className="px-3 py-2 bg-surface/30 border border-border rounded-lg text-xs text-text-secondary italic">
                {submission.feedback}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Action bar -- only for pending */}
      {isPending && (
        <div className="sticky bottom-0 px-4 py-3 border-t border-border bg-surface/80 backdrop-blur-sm flex items-center gap-3">
          <button
            onClick={handleReject}
            data-testid="reject-btn"
            className="bg-danger hover:bg-danger/90 text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer"
          >
            <span className="flex items-center gap-1.5">
              <span>&#10007; Reject</span>
              <span className="text-[10px] opacity-70">(R)</span>
            </span>
          </button>

          <div className="flex-1 text-center text-xs text-text-muted">
            {points} pts
          </div>

          <button
            onClick={handleApprove}
            data-testid="approve-btn"
            className="bg-accent hover:bg-accent/90 text-accent-foreground px-6 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer"
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
