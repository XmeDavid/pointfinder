import { describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'
import {
  useCreateChallenge,
  useUpdateChallenge,
  useDeleteChallenge,
  useReorderChallenges,
} from './useChallengeMutations'

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

describe('useCreateChallenge', () => {
  it('creates a challenge and invalidates the challenges cache', async () => {
    const qc = createTestClient()
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')

    const { result } = renderHook(() => useCreateChallenge('game-1'), {
      wrapper: createWrapper(qc),
    })

    await act(async () => {
      result.current.mutate({
        title: 'New Challenge',
        description: 'A new challenge',
        content: 'Challenge content',
        completionContent: 'Well done!',
        answerType: 'text',
        autoValidate: false,
        points: 15,
        locationBound: false,
      })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data!.title).toBe('New Challenge')
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['challenges', 'game-1'] })
  })
})

describe('useUpdateChallenge', () => {
  it('updates a challenge and invalidates the challenges cache', async () => {
    const qc = createTestClient()
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')

    const { result } = renderHook(() => useUpdateChallenge('game-1'), {
      wrapper: createWrapper(qc),
    })

    await act(async () => {
      result.current.mutate({
        challengeId: 'challenge-1',
        dto: { title: 'Updated Challenge' },
      })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data!.title).toBe('Updated Challenge')
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['challenges', 'game-1'] })
  })
})

describe('useDeleteChallenge', () => {
  it('deletes a challenge and invalidates the challenges cache', async () => {
    const qc = createTestClient()
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')

    const { result } = renderHook(() => useDeleteChallenge('game-1'), {
      wrapper: createWrapper(qc),
    })

    await act(async () => {
      result.current.mutate('challenge-1')
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['challenges', 'game-1'] })
  })
})

describe('useReorderChallenges', () => {
  it('reorders challenges and invalidates the challenges cache', async () => {
    const qc = createTestClient()
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')

    const { result } = renderHook(() => useReorderChallenges('game-1'), {
      wrapper: createWrapper(qc),
    })

    await act(async () => {
      result.current.mutate(['challenge-3', 'challenge-1', 'challenge-2'])
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['challenges', 'game-1'] })
  })
})
