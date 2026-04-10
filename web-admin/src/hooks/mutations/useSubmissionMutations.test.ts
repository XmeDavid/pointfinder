import { describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'
import { useReviewSubmission } from './useSubmissionMutations'

function createTestClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
}

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children)
  }
}

describe('useReviewSubmission', () => {
  it('reviews a submission and invalidates submissions + dashboard caches', async () => {
    const qc = createTestClient()
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')

    const { result } = renderHook(() => useReviewSubmission('game-1'), {
      wrapper: createWrapper(qc),
    })

    await act(async () => {
      result.current.mutate({
        submissionId: 'sub-1',
        status: 'approved',
        feedback: 'Good job!',
        points: 10,
      })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data!.status).toBe('approved')
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['submissions', 'game-1'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['monitoring', 'dashboard', 'game-1'] })
  })

  it('rejects a submission', async () => {
    const qc = createTestClient()

    const { result } = renderHook(() => useReviewSubmission('game-1'), {
      wrapper: createWrapper(qc),
    })

    await act(async () => {
      result.current.mutate({
        submissionId: 'sub-2',
        status: 'rejected',
        feedback: 'Try again',
      })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data!.status).toBe('rejected')
    expect(result.current.data!.feedback).toBe('Try again')
  })
})
