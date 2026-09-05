import { describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'
import {
  useSaveGameVariables,
  useSaveChallengeVariables,
} from './useVariableMutations'

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

describe('useSaveGameVariables', () => {
  it('saves game variables and invalidates the variables cache', async () => {
    const qc = createTestClient()
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')

    const { result } = renderHook(() => useSaveGameVariables('game-1'), {
      wrapper: createWrapper(qc),
    })

    await act(async () => {
      result.current.mutate({
        variables: [
          { key: 'teamColor', teamValues: { 'team-1': 'green' } },
        ],
      })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data!.variables).toHaveLength(1)
    expect(result.current.data!.variables[0].key).toBe('teamColor')
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['variables', 'game-1'],
    })
  })
})

describe('useSaveChallengeVariables', () => {
  it('saves challenge variables and invalidates the challenge variables cache', async () => {
    const qc = createTestClient()
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')

    const { result } = renderHook(
      () => useSaveChallengeVariables('game-1', 'challenge-1'),
      { wrapper: createWrapper(qc) },
    )

    await act(async () => {
      result.current.mutate({
        variables: [
          { key: 'hint', teamValues: { 'team-1': 'Look left' } },
        ],
      })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data!.variables).toHaveLength(1)
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['variables', 'game-1', 'challenge', 'challenge-1'],
    })
  })
})
