import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useSubmissions } from '@/hooks/queries/useSubmissions'
import { useTeams } from '@/hooks/queries/useTeams'
import { useChallenges } from '@/hooks/queries/useChallenges'
import { useBases } from '@/hooks/queries/useBases'
import { useGameVariables, useChallengeVariables } from '@/hooks/queries/useVariables'
import { useReviewSubmission } from '@/hooks/mutations/useSubmissionMutations'
import { useWorkspaceStore } from '@/stores/workspace'
import { relativeTime } from '@/lib/utils/dates'
import { resolveTemplate, type VariableMap } from '@/lib/variables/resolveTemplate'
import { scanReferences } from '@/lib/variables/scanReferences'
import apiClient from '@/lib/api/client'
import { Spinner } from '@/components/feedback/Spinner'

// ---------------------------------------------------------------------------
// AuthMedia — fetches a file through the authenticated API client and renders
// it as an <img> or <video> depending on the file extension.
// ---------------------------------------------------------------------------

function isVideoUrl(url: string): boolean {
  return /\.(mp4|mov)$/i.test(url)
}

function AuthMedia({ url, alt, className }: { url: string; alt: string; className?: string }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [error, setError] = useState(false)
  const blobRef = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
        className={className ?? "w-full rounded-lg"}
        data-testid="submission-video"
      />
    )
  }

  return (
    <img
      src={blobUrl}
      alt={alt}
      className={className ?? "w-full h-full object-cover"}
      data-testid="submission-image"
    />
  )
}

// ---------------------------------------------------------------------------
// MediaLightbox — full-screen carousel for images/videos
// ---------------------------------------------------------------------------

function MediaLightbox({
  urls,
  initialIndex,
  onClose,
}: {
  urls: string[]
  initialIndex: number
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [index, setIndex] = useState(initialIndex)

  const goPrev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), [])
  const goNext = useCallback(() => setIndex((i) => Math.min(urls.length - 1, i + 1)), [urls.length])

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      // Capture phase + stopImmediatePropagation prevents ReviewOverlay
      // shortcuts (A/R/arrows) from firing while the lightbox is open.
      e.stopImmediatePropagation()
      e.preventDefault()
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft') goPrev()
      else if (e.key === 'ArrowRight') goNext()
    }
    window.addEventListener('keydown', handleKey, true)
    return () => window.removeEventListener('keydown', handleKey, true)
  }, [onClose, goPrev, goNext])

  const url = urls[index]

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center"
      onClick={onClose}
      data-testid="media-lightbox"
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer z-10"
      >
        <X className="h-5 w-5" />
      </button>

      {/* Counter */}
      {urls.length > 1 && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 text-white/70 text-sm">
          {index + 1} / {urls.length}
        </div>
      )}

      {/* Prev button */}
      {index > 0 && (
        <button
          onClick={(e) => { e.stopPropagation(); goPrev() }}
          className="absolute left-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
      )}

      {/* Next button */}
      {index < urls.length - 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); goNext() }}
          className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      )}

      {/* Media */}
      <div
        className="max-w-[90vw] max-h-[90vh] flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        <AuthMedia
          url={url}
          alt={t('submissions.altFile', { index: index + 1 })}
          className={isVideoUrl(url) ? "max-w-full max-h-[85vh] rounded-lg" : "max-w-full max-h-[85vh] object-contain rounded-lg"}
        />
      </div>
    </div>
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
  const { data: gameVarsData } = useGameVariables(gameId)
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

  // Load challenge-scoped variables too; they override game-scoped keys.
  const { data: challengeVarsData } = useChallengeVariables(
    gameId,
    submission?.challengeId,
  )
  const gameVars = useMemo(
    () => gameVarsData?.variables ?? [],
    [gameVarsData],
  )
  const challengeVars = useMemo(
    () => challengeVarsData?.variables ?? [],
    [challengeVarsData],
  )

  // Variable map for the submitting team: challenge-scoped wins over game-scoped.
  const teamVars = useMemo<VariableMap>(() => {
    const map = new Map<string, string>()
    if (!submission) return map
    for (const v of gameVars) {
      const val = v.teamValues?.[submission.teamId]
      if (val != null) map.set(v.key, val)
    }
    for (const v of challengeVars) {
      const val = v.teamValues?.[submission.teamId]
      if (val != null) map.set(v.key, val)
    }
    return map
  }, [gameVars, challengeVars, submission])

  // Stable reference to the challenge's correctAnswer so downstream
  // memoizations aren't re-run just because React Query returned a
  // new array instance with identical contents.
  const correctAnswer = useMemo(
    () => challenge?.correctAnswer ?? null,
    [challenge?.correctAnswer],
  )

  // Does the challenge's correctAnswer actually contain any `{{key}}`
  // references? If not, the resolved row is pointless noise.
  const hasTemplateRefs = useMemo(
    () => (correctAnswer ? scanReferences(correctAnswer).length > 0 : false),
    [correctAnswer],
  )

  // Per-item resolution with undefined-key signalling so the UX can
  // distinguish "resolved to X" from "key missing for this team".
  const resolvedAnswers = useMemo(() => {
    if (!correctAnswer) return []
    return correctAnswer.map((a) => {
      const refs = scanReferences(a)
      const missing = refs.filter((k) => !teamVars.has(k))
      return {
        raw: a,
        resolved: resolveTemplate(a, teamVars),
        missing,
      }
    })
  }, [correctAnswer, teamVars])

  const anyMissing = resolvedAnswers.some((r) => r.missing.length > 0)

  const [points, setPoints] = useState(
    submission?.points ?? challenge?.points ?? 0,
  )
  const [feedback, setFeedback] = useState(submission?.feedback ?? '')
  const [overriding, setOverriding] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  // Reset local state when submission changes
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPoints(submission?.points ?? challenge?.points ?? 0)
    setFeedback(submission?.feedback ?? '')
    setOverriding(false)
  }, [submissionId, submission?.points, challenge?.points, submission?.feedback])

  if (!submission) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        Submission not found.
      </div>
    )
  }

  const isPending = submission.status === 'pending'
  const showActions = isPending || overriding

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
      {
        onSuccess: () => {
          if (overriding) {
            setOverriding(false)
          } else {
            advanceToNext()
          }
        },
      },
    )
  }

  const handleReject = () => {
    reviewMutation.mutate(
      { submissionId, status: 'rejected', feedback: feedback || undefined },
      {
        onSuccess: () => {
          if (overriding) {
            setOverriding(false)
          } else {
            advanceToNext()
          }
        },
      },
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
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
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
            <div
              className="mt-1 space-y-1"
              data-testid="expected-answer-block"
            >
              <div>
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {hasTemplateRefs ? 'Expected (raw)' : 'Expected answer'}
                </span>
                <div className="mt-0.5 px-2 py-1 bg-muted rounded border border-border font-mono text-xs text-foreground">
                  {challenge.correctAnswer.join(', ')}
                </div>
              </div>
              {hasTemplateRefs && (
                <div>
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Expected (resolved for {team?.name ?? submission.teamId})
                  </span>
                  <div
                    className="mt-0.5 px-2 py-1 bg-muted rounded border border-border font-mono text-xs text-foreground"
                    data-testid="resolved-expected-answer"
                  >
                    {resolvedAnswers
                      .map((r) => r.resolved)
                      .join(', ')}
                  </div>
                  {anyMissing && (
                    <div
                      className="mt-1 text-[10px] text-destructive"
                      data-testid="resolved-expected-answer-warning"
                    >
                      {resolvedAnswers
                        .filter((r) => r.missing.length > 0)
                        .flatMap((r) => r.missing)
                        .filter((k, i, arr) => arr.indexOf(k) === i)
                        .map(
                          (k) =>
                            `⚠ Variable "${k}" not defined for this team`,
                        )
                        .join(' · ')}
                    </div>
                  )}
                </div>
              )}
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
                    <button
                      type="button"
                      onClick={() => setLightboxIndex(idx)}
                      className="block w-full h-56 relative cursor-pointer"
                    >
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
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Image lightbox */}
          {lightboxIndex !== null && (
            <MediaLightbox
              urls={fileUrls.filter((u) => !isVideoUrl(u))}
              initialIndex={lightboxIndex}
              onClose={() => setLightboxIndex(null)}
            />
          )}
        </div>

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
              {!overriding && (
                <button
                  onClick={() => setOverriding(true)}
                  data-testid="override-btn"
                  className="ml-auto px-2 py-0.5 text-[10px] font-medium rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                >
                  Override
                </button>
              )}
            </div>
            {submission.feedback && !overriding && (
              <div className="px-3 py-2 bg-muted/30 border border-border rounded-lg text-xs text-muted-foreground italic">
                {submission.feedback}
              </div>
            )}
          </div>
        )}

        {/* Points section */}
        {showActions && (
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
        {showActions && (
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
      </div>

      {/* Action bar */}
      {showActions && (
        <div className="shrink-0 px-4 py-3 border-t border-border bg-card/80 backdrop-blur-sm flex items-center gap-3">
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
