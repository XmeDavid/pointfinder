import { describe, it, expect } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'
import { useAssignments } from './useAssignments'

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children)
  }
}

describe('useAssignments', () => {
  it('fetches assignments for a game', async () => {
    const { result } = renderHook(() => useAssignments('game-1'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toHaveLength(2)
    expect(result.current.data![0].baseId).toBe('base-1')
    expect(result.current.data![0].challengeId).toBe('challenge-1')
    expect(result.current.data![1].baseId).toBe('base-2')
    expect(result.current.data![1].challengeId).toBe('challenge-2')
  })

  it('is disabled when gameId is undefined', () => {
    const { result } = renderHook(() => useAssignments(undefined), {
      wrapper: createWrapper(),
    })

    expect(result.current.isLoading).toBe(false)
    expect(result.current.fetchStatus).toBe('idle')
    expect(result.current.data).toBeUndefined()
  })
})
