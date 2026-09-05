import { describe, it, expect } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'
import { useTeams, useTeamPlayers } from './useTeams'

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

describe('useTeams', () => {
  it('fetches teams for a game', async () => {
    const { result } = renderHook(() => useTeams('game-1'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toHaveLength(2)
    expect(result.current.data![0].name).toBe('Team Alpha')
    expect(result.current.data![1].name).toBe('Team Beta')
  })

  it('is disabled when gameId is undefined', () => {
    const { result } = renderHook(() => useTeams(undefined), {
      wrapper: createWrapper(),
    })

    expect(result.current.isLoading).toBe(false)
    expect(result.current.fetchStatus).toBe('idle')
    expect(result.current.data).toBeUndefined()
  })
})

describe('useTeamPlayers', () => {
  it('fetches players for a team', async () => {
    const { result } = renderHook(() => useTeamPlayers('game-1', 'team-1'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toHaveLength(2)
    expect(result.current.data![0].displayName).toBe('Alice')
    expect(result.current.data![1].displayName).toBe('Bob')
  })

  it('is disabled when gameId is undefined', () => {
    const { result } = renderHook(() => useTeamPlayers(undefined, 'team-1'), {
      wrapper: createWrapper(),
    })

    expect(result.current.isLoading).toBe(false)
    expect(result.current.fetchStatus).toBe('idle')
    expect(result.current.data).toBeUndefined()
  })

  it('is disabled when teamId is undefined', () => {
    const { result } = renderHook(() => useTeamPlayers('game-1', undefined), {
      wrapper: createWrapper(),
    })

    expect(result.current.isLoading).toBe(false)
    expect(result.current.fetchStatus).toBe('idle')
    expect(result.current.data).toBeUndefined()
  })
})
