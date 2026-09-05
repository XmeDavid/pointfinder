import { describe, it, expect } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'
import { useChallenges } from './useChallenges'

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

describe('useChallenges', () => {
  it('fetches challenges for a game', async () => {
    const { result } = renderHook(() => useChallenges('game-1'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toHaveLength(3)
    expect(result.current.data![0].title).toBe('Challenge Alpha')
    expect(result.current.data![1].title).toBe('Challenge Beta')
    expect(result.current.data![2].title).toBe('Challenge Gamma')
  })

  it('is disabled when gameId is undefined', () => {
    const { result } = renderHook(() => useChallenges(undefined), {
      wrapper: createWrapper(),
    })

    expect(result.current.isLoading).toBe(false)
    expect(result.current.fetchStatus).toBe('idle')
    expect(result.current.data).toBeUndefined()
  })
})
