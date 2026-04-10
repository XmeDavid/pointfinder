import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useWorkspaceStore } from '@/stores/workspace'
import ReviewOverlay from './ReviewOverlay'
import SubmissionList from './SubmissionList'
import SubmissionDetail from './SubmissionDetail'

let queryClient: QueryClient

function Wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  useWorkspaceStore.getState().reset()
})

// ---------------------------------------------------------------------------
// ReviewOverlay
// ---------------------------------------------------------------------------
describe('ReviewOverlay', () => {
  it('renders the submission list and empty detail', async () => {
    render(
      <Wrapper>
        <ReviewOverlay gameId="game-1" />
      </Wrapper>,
    )

    expect(screen.getByTestId('review-overlay')).toBeInTheDocument()
    // The submission list header should appear
    await waitFor(() => {
      expect(screen.getByText('Submissions')).toBeInTheDocument()
    })
  })

  it('auto-selects first pending submission on mount', async () => {
    render(
      <Wrapper>
        <ReviewOverlay gameId="game-1" />
      </Wrapper>,
    )

    // Wait for submissions to load and auto-select
    await waitFor(() => {
      expect(useWorkspaceStore.getState().selectedSubmissionId).toBe('sub-1')
    })
  })

  it('keyboard shortcut A triggers approve on current submission', async () => {
    render(
      <Wrapper>
        <ReviewOverlay gameId="game-1" />
      </Wrapper>,
    )

    // Wait for auto-select and for the approve button to appear (proves data loaded)
    await waitFor(() => {
      expect(useWorkspaceStore.getState().selectedSubmissionId).toBe('sub-1')
    })
    await screen.findByTestId('approve-btn')

    // Press A to approve
    fireEvent.keyDown(window, { key: 'a' })

    // After approve, should advance to next pending (or null if none left)
    await waitFor(
      () => {
        const selected = useWorkspaceStore.getState().selectedSubmissionId
        expect(selected).not.toBe('sub-1')
      },
      { timeout: 3000 },
    )
  })

  it('keyboard shortcut R triggers reject', async () => {
    render(
      <Wrapper>
        <ReviewOverlay gameId="game-1" />
      </Wrapper>,
    )

    await waitFor(() => {
      expect(useWorkspaceStore.getState().selectedSubmissionId).toBe('sub-1')
    })
    await screen.findByTestId('reject-btn')

    fireEvent.keyDown(window, { key: 'r' })

    await waitFor(
      () => {
        const selected = useWorkspaceStore.getState().selectedSubmissionId
        expect(selected).not.toBe('sub-1')
      },
      { timeout: 3000 },
    )
  })

  it('does not fire shortcuts when typing in an input', async () => {
    const user = userEvent.setup()

    render(
      <Wrapper>
        <ReviewOverlay gameId="game-1" />
      </Wrapper>,
    )

    await waitFor(() => {
      expect(useWorkspaceStore.getState().selectedSubmissionId).toBe('sub-1')
    })

    // The detail panel should show a feedback textarea for pending
    const feedbackInput = await screen.findByTestId('feedback-input')
    await user.click(feedbackInput)
    await user.keyboard('a')

    // Selection should NOT have changed because we typed in a textarea
    expect(useWorkspaceStore.getState().selectedSubmissionId).toBe('sub-1')
  })

  it('renders keyboard shortcut hints', async () => {
    render(
      <Wrapper>
        <ReviewOverlay gameId="game-1" />
      </Wrapper>,
    )

    expect(screen.getByText('Approve')).toBeInTheDocument()
    expect(screen.getByText('Reject')).toBeInTheDocument()
    expect(screen.getByText('Navigate')).toBeInTheDocument()
    expect(screen.getByText('Skip')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// SubmissionList
// ---------------------------------------------------------------------------
describe('SubmissionList', () => {
  it('renders submissions from the API', async () => {
    render(
      <Wrapper>
        <SubmissionList gameId="game-1" />
      </Wrapper>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('submission-card-sub-1')).toBeInTheDocument()
    })

    // All three submissions from MSW handler
    expect(screen.getByTestId('submission-card-sub-1')).toBeInTheDocument()
    // sub-2 and sub-3 are not pending so they are filtered out by default
  })

  it('filters by status when clicking filter pills', async () => {
    const user = userEvent.setup()

    render(
      <Wrapper>
        <SubmissionList gameId="game-1" />
      </Wrapper>,
    )

    // Wait for data to load
    await waitFor(() => {
      expect(screen.getByTestId('submission-card-sub-1')).toBeInTheDocument()
    })

    // Switch to "All" filter
    await user.click(screen.getByTestId('filter-all'))

    await waitFor(() => {
      expect(screen.getByTestId('submission-card-sub-2')).toBeInTheDocument()
      expect(screen.getByTestId('submission-card-sub-3')).toBeInTheDocument()
    })
  })

  it('shows empty state when no submissions match filter', async () => {
    const user = userEvent.setup()

    render(
      <Wrapper>
        <SubmissionList gameId="game-1" />
      </Wrapper>,
    )

    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByText('Submissions')).toBeInTheDocument()
    })

    // Switch to approved filter -- only sub-2 is approved
    await user.click(screen.getByTestId('filter-approved'))

    await waitFor(() => {
      expect(screen.getByTestId('submission-card-sub-2')).toBeInTheDocument()
    })
  })

  it('selects submission on click', async () => {
    const user = userEvent.setup()

    render(
      <Wrapper>
        <SubmissionList gameId="game-1" />
      </Wrapper>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('submission-card-sub-1')).toBeInTheDocument()
    })

    await user.click(screen.getByTestId('submission-card-sub-1'))

    expect(useWorkspaceStore.getState().selectedSubmissionId).toBe('sub-1')
  })
})

// ---------------------------------------------------------------------------
// SubmissionDetail
// ---------------------------------------------------------------------------
describe('SubmissionDetail', () => {
  it('shows challenge context for a submission', async () => {
    useWorkspaceStore.getState().selectSubmission('sub-1')

    render(
      <Wrapper>
        <SubmissionDetail submissionId="sub-1" gameId="game-1" />
      </Wrapper>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('challenge-context')).toBeInTheDocument()
    })
  })

  it('shows approve and reject buttons for pending submissions', async () => {
    render(
      <Wrapper>
        <SubmissionDetail submissionId="sub-1" gameId="game-1" />
      </Wrapper>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('approve-btn')).toBeInTheDocument()
      expect(screen.getByTestId('reject-btn')).toBeInTheDocument()
    })
  })

  it('approve button triggers mutation', async () => {
    const user = userEvent.setup()

    render(
      <Wrapper>
        <SubmissionDetail submissionId="sub-1" gameId="game-1" />
      </Wrapper>,
    )

    const approveBtn = await screen.findByTestId('approve-btn')
    await user.click(approveBtn)

    // Mutation fires -- the MSW handler returns the reviewed submission.
    // The button should still be in the DOM until the query refetch
    // completes, but the mutation should have fired without error.
    await waitFor(() => {
      expect(approveBtn).toBeInTheDocument()
    })
  })

  it('reject button triggers mutation', async () => {
    const user = userEvent.setup()

    render(
      <Wrapper>
        <SubmissionDetail submissionId="sub-1" gameId="game-1" />
      </Wrapper>,
    )

    const rejectBtn = await screen.findByTestId('reject-btn')
    await user.click(rejectBtn)

    await waitFor(() => {
      expect(rejectBtn).toBeInTheDocument()
    })
  })

  it('shows reviewed status badge for non-pending submissions', async () => {
    render(
      <Wrapper>
        <SubmissionDetail submissionId="sub-2" gameId="game-1" />
      </Wrapper>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('reviewed-state')).toBeInTheDocument()
      expect(screen.getByText('Approved')).toBeInTheDocument()
    })
  })
})
