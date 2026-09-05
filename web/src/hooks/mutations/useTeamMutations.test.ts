import { describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'
import {
  useCreateTeam,
  useUpdateTeam,
  useDeleteTeam,
  useRemovePlayer,
} from './useTeamMutations'

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

describe('useCreateTeam', () => {
  it('creates a team and invalidates the teams cache', async () => {
    const qc = createTestClient()
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')

    const { result } = renderHook(() => useCreateTeam('game-1'), {
      wrapper: createWrapper(qc),
    })

    await act(async () => {
      result.current.mutate({ name: 'New Team' })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data!.name).toBe('New Team')
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['teams', 'game-1'] })
  })
})

describe('useUpdateTeam', () => {
  it('updates a team and invalidates the teams cache', async () => {
    const qc = createTestClient()
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')

    const { result } = renderHook(() => useUpdateTeam('game-1'), {
      wrapper: createWrapper(qc),
    })

    await act(async () => {
      result.current.mutate({
        teamId: 'team-1',
        dto: { name: 'Updated Team', color: '#3b82f6' },
      })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data!.name).toBe('Updated Team')
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['teams', 'game-1'] })
  })
})

describe('useDeleteTeam', () => {
  it('deletes a team and invalidates the teams cache', async () => {
    const qc = createTestClient()
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')

    const { result } = renderHook(() => useDeleteTeam('game-1'), {
      wrapper: createWrapper(qc),
    })

    await act(async () => {
      result.current.mutate('team-1')
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['teams', 'game-1'] })
  })
})

describe('useRemovePlayer', () => {
  it('removes a player and invalidates the team players cache', async () => {
    const qc = createTestClient()
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')

    const { result } = renderHook(() => useRemovePlayer('game-1', 'team-1'), {
      wrapper: createWrapper(qc),
    })

    await act(async () => {
      result.current.mutate('player-1')
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['teams', 'game-1', 'team-1', 'players'] })
  })
})
