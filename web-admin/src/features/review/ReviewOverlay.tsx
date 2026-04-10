import { useEffect, useCallback, useMemo, useRef } from 'react'
import { useSubmissions } from '@/hooks/queries/useSubmissions'
import { useChallenges } from '@/hooks/queries/useChallenges'
import { useReviewSubmission } from '@/hooks/mutations/useSubmissionMutations'
import { useWorkspaceStore } from '@/stores/workspace'
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

  return (
    <div
      className="absolute top-14 left-3 right-3 bottom-3 z-20 glass-panel rounded-xl flex overflow-hidden"
      data-testid="review-overlay"
    >
      {/* Left: submission list */}
      <SubmissionList gameId={gameId} />

      {/* Right: detail or empty state */}
      {selectedSubmissionId ? (
        <SubmissionDetail submissionId={selectedSubmissionId} gameId={gameId} />
      ) : (
        <div className="flex-1 flex items-center justify-center text-text-muted text-sm">
          Select a submission to review
        </div>
      )}

      {/* Footer -- keyboard shortcut hints */}
      <div className="absolute bottom-0 left-0 right-0 px-4 py-2 border-t border-border bg-surface/80 text-text-muted text-xs flex gap-6 justify-center">
        <span>
          <kbd className="px-1.5 py-0.5 bg-elevated rounded text-text-secondary text-[10px] font-mono">
            A
          </kbd>{' '}
          Approve
        </span>
        <span>
          <kbd className="px-1.5 py-0.5 bg-elevated rounded text-text-secondary text-[10px] font-mono">
            R
          </kbd>{' '}
          Reject
        </span>
        <span>
          <kbd className="px-1.5 py-0.5 bg-elevated rounded text-text-secondary text-[10px] font-mono">
            &uarr;&darr;
          </kbd>{' '}
          Navigate
        </span>
        <span>
          <kbd className="px-1.5 py-0.5 bg-elevated rounded text-text-secondary text-[10px] font-mono">
            &rarr;
          </kbd>{' '}
          Skip
        </span>
      </div>
    </div>
  )
}
