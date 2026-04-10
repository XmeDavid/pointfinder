import { describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'
import {
  useSetAssignments,
  useDeleteAssignment,
} from './useAssignmentMutations'

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

describe('useSetAssignments', () => {
  it('bulk sets assignments and invalidates the assignments cache', async () => {
    const qc = createTestClient()
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')

    const { result } = renderHook(() => useSetAssignments('game-1'), {
      wrapper: createWrapper(qc),
    })

    await act(async () => {
      result.current.mutate([
        { gameId: 'game-1', baseId: 'base-1', challengeId: 'challenge-1' },
        { gameId: 'game-1', baseId: 'base-2', challengeId: 'challenge-2' },
      ])
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toHaveLength(2)
    expect(result.current.data![0].baseId).toBe('base-1')
    expect(result.current.data![1].baseId).toBe('base-2')
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['assignments', 'game-1'] })
  })
})

describe('useDeleteAssignment', () => {
  it('deletes an assignment and invalidates the assignments cache', async () => {
    const qc = createTestClient()
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')

    const { result } = renderHook(() => useDeleteAssignment('game-1'), {
      wrapper: createWrapper(qc),
    })

    await act(async () => {
      result.current.mutate('assignment-1')
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['assignments', 'game-1'] })
  })
})
