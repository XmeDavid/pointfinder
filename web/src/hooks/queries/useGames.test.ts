import { describe, it, expect } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'
import { useGames, useGame } from './useGames'

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

describe('useGames', () => {
  it('fetches the game list', async () => {
    const { result } = renderHook(() => useGames(), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toHaveLength(2)
    expect(result.current.data![0].name).toBe('Test Game 1')
    expect(result.current.data![1].name).toBe('Test Game 2')
  })

  it('returns loading state initially', () => {
    const { result } = renderHook(() => useGames(), { wrapper: createWrapper() })
    expect(result.current.isLoading).toBe(true)
    expect(result.current.data).toBeUndefined()
  })
})

describe('useGame', () => {
  it('fetches a single game by id', async () => {
    const { result } = renderHook(() => useGame('game-42'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data!.id).toBe('game-42')
    expect(result.current.data!.name).toBe('Game game-42')
  })

  it('is disabled when gameId is undefined', () => {
    const { result } = renderHook(() => useGame(undefined), {
      wrapper: createWrapper(),
    })

    // Should not be loading or fetching when disabled
    expect(result.current.isLoading).toBe(false)
    expect(result.current.fetchStatus).toBe('idle')
    expect(result.current.data).toBeUndefined()
  })

  it('returns error for non-existent game', async () => {
    const { result } = renderHook(() => useGame('not-found'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})
