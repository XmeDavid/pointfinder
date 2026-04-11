import { useEffect, useCallback, useMemo, useRef } from 'react'
import { ArrowLeft } from 'lucide-react'
import { useSubmissions } from '@/hooks/queries/useSubmissions'
import { useChallenges } from '@/hooks/queries/useChallenges'
import { useReviewSubmission } from '@/hooks/mutations/useSubmissionMutations'
import { useWorkspaceStore } from '@/stores/workspace'
import { useIsMobile } from '@/hooks/ui/useMediaQuery'
import SubmissionList from './SubmissionList'
import SubmissionDetail from './SubmissionDetail'

interface ReviewOverlayProps {
  gameId: string
}

export default function ReviewOverlay({ gameId }: ReviewOverlayProps) {
  const { data: submissions = [] } = useSubmissions(gameId)
  const { data: challenges = [] } = useChallenges(gameId)
  const reviewMutation = useReviewSubmission(gameId)
  const selectedSubmissionId = useWorkspaceStore((s) => s.selectedSubmissionId)
  const selectSubmission = useWorkspaceStore((s) => s.selectSubmission)
  const isMobile = useIsMobile()

  // Pending submissions sorted newest-first (same order as SubmissionList default)
  const pendingSubmissions = useMemo(() => {
    return [...submissions]
      .filter((s) => s.status === 'pending')
      .sort(
        (a, b) =>
          new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime(),
      )
  }, [submissions])

  // Auto-select first pending submission once when data arrives.
  // Uses a ref so that review-driven deselection (advance to null) does not
  // re-trigger auto-select.
  const didAutoSelect = useRef(false)
  useEffect(() => {
    if (!didAutoSelect.current && !selectedSubmissionId && pendingSubmissions.length > 0) {
      didAutoSelect.current = true
      selectSubmission(pendingSubmissions[0].id)
    }
  }, [selectedSubmissionId, pendingSubmissions, selectSubmission])

  const currentSubmission = selectedSubmissionId
    ? submissions.find((s) => s.id === selectedSubmissionId)
    : undefined

  const handleApprove = useCallback(() => {
    if (!currentSubmission || currentSubmission.status !== 'pending') return
    const challenge = challenges.find(
      (c) => c.id === currentSubmission.challengeId,
    )
    const defaultPoints = currentSubmission.points ?? challenge?.points ?? 0
    reviewMutation.mutate(
      {
        submissionId: currentSubmission.id,
        status: 'approved',
        points: defaultPoints,
      },
      {
        onSuccess: () => {
          // Advance to next pending
          const remaining = pendingSubmissions.filter(
            (s) => s.id !== currentSubmission.id,
          )
          selectSubmission(remaining[0]?.id ?? null)
        },
      },
    )
  }, [currentSubmission, challenges, reviewMutation, pendingSubmissions, selectSubmission])

  const handleReject = useCallback(() => {
    if (!currentSubmission || currentSubmission.status !== 'pending') return
    reviewMutation.mutate(
      {
        submissionId: currentSubmission.id,
        status: 'rejected',
      },
      {
        onSuccess: () => {
          const remaining = pendingSubmissions.filter(
            (s) => s.id !== currentSubmission.id,
          )
          selectSubmission(remaining[0]?.id ?? null)
        },
      },
    )
  }, [currentSubmission, reviewMutation, pendingSubmissions, selectSubmission])

  const handleNavigate = useCallback(
    (direction: 'up' | 'down') => {
      if (pendingSubmissions.length === 0) return
      const currentIndex = pendingSubmissions.findIndex(
        (s) => s.id === selectedSubmissionId,
      )
      let nextIndex: number
      if (currentIndex === -1) {
        nextIndex = 0
      } else if (direction === 'up') {
        nextIndex = Math.max(0, currentIndex - 1)
      } else {
        nextIndex = Math.min(
          pendingSubmissions.length - 1,
          currentIndex + 1,
        )
      }
      selectSubmission(pendingSubmissions[nextIndex].id)
    },
    [pendingSubmissions, selectedSubmissionId, selectSubmission],
  )

  const handleSkip = useCallback(() => {
    if (pendingSubmissions.length === 0) return
    const currentIndex = pendingSubmissions.findIndex(
      (s) => s.id === selectedSubmissionId,
    )
    const nextIndex =
      currentIndex >= 0 && currentIndex < pendingSubmissions.length - 1
        ? currentIndex + 1
        : 0
    selectSubmission(pendingSubmissions[nextIndex].id)
  }, [pendingSubmissions, selectedSubmissionId, selectSubmission])

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't fire when user is typing in an input or textarea
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return
      }

      switch (e.key) {
        case 'a':
        case 'A':
          e.preventDefault()
          handleApprove()
          break
        case 'r':
        case 'R':
          e.preventDefault()
          handleReject()
          break
        case 'ArrowUp':
          e.preventDefault()
          handleNavigate('up')
          break
        case 'ArrowDown':
          e.preventDefault()
          handleNavigate('down')
          break
        case 'ArrowRight':
          e.preventDefault()
          handleSkip()
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleApprove, handleReject, handleNavigate, handleSkip])

  // On mobile: show list or detail (not both). Back button returns to list.
  const mobileShowDetail = isMobile && !!selectedSubmissionId

  const handleMobileBack = useCallback(() => {
    selectSubmission(null)
  }, [selectSubmission])

  return (
    <div
      className="absolute left-0 right-0 top-12 bottom-14 md:left-3 md:right-3 md:top-14 md:bottom-3 z-20 bg-card/95 backdrop-blur-xl border border-border rounded-none md:rounded-xl flex flex-col md:flex-row overflow-hidden"
      data-testid="review-overlay"
    >
      {/* Mobile: back button when viewing detail */}
      {mobileShowDetail && (
        <button
          onClick={handleMobileBack}
          className="md:hidden flex items-center gap-1.5 px-3 py-2 border-b border-border text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0"
        >
          <ArrowLeft size={16} />
          Back to submissions
        </button>
      )}

      {/* Left: submission list — hidden on mobile when detail is shown */}
      <div className={mobileShowDetail ? 'hidden' : 'flex flex-col flex-1 md:flex-none'}>
        <SubmissionList gameId={gameId} />
      </div>

      {/* Right: detail or empty state — hidden on mobile when list is shown */}
      <div className={!mobileShowDetail && isMobile ? 'hidden' : 'flex-1 flex flex-col min-w-0'}>
        {selectedSubmissionId ? (
          <SubmissionDetail submissionId={selectedSubmissionId} gameId={gameId} />
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            Select a submission to review
          </div>
        )}
      </div>

      {/* Footer -- keyboard shortcut hints (hidden on mobile) */}
      <div className="hidden md:flex absolute bottom-0 left-0 right-0 px-4 py-2 border-t border-border bg-card/80 text-muted-foreground text-xs gap-6 justify-center">
        <span>
          <kbd className="px-1.5 py-0.5 bg-muted rounded text-muted-foreground text-[10px] font-mono">
            A
          </kbd>{' '}
          Approve
        </span>
        <span>
          <kbd className="px-1.5 py-0.5 bg-muted rounded text-muted-foreground text-[10px] font-mono">
            R
          </kbd>{' '}
          Reject
        </span>
        <span>
          <kbd className="px-1.5 py-0.5 bg-muted rounded text-muted-foreground text-[10px] font-mono">
            &uarr;&darr;
          </kbd>{' '}
          Navigate
        </span>
        <span>
          <kbd className="px-1.5 py-0.5 bg-muted rounded text-muted-foreground text-[10px] font-mono">
            &rarr;
          </kbd>{' '}
          Skip
        </span>
      </div>
    </div>
  )
}
