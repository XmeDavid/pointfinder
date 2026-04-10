import { describe, it, expect } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'
import {
  useDashboardStats,
  useLeaderboard,
  useActivityFeed,
  useProgress,
  useResultsExport,
} from './useMonitoring'

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

describe('useDashboardStats', () => {
  it('fetches dashboard stats for a game', async () => {
    const { result } = renderHook(() => useDashboardStats('game-1'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data!.totalTeams).toBe(4)
    expect(result.current.data!.totalBases).toBe(6)
    expect(result.current.data!.totalChallenges).toBe(12)
    expect(result.current.data!.pendingSubmissions).toBe(3)
  })

  it('is disabled when gameId is undefined', () => {
    const { result } = renderHook(() => useDashboardStats(undefined), {
      wrapper: createWrapper(),
    })

    expect(result.current.isLoading).toBe(false)
    expect(result.current.fetchStatus).toBe('idle')
  })

  it('uses the correct query key', () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: qc }, children)

    renderHook(() => useDashboardStats('game-1'), { wrapper })

    const queryState = qc.getQueryState(['monitoring', 'dashboard', 'game-1'])
    expect(queryState).toBeDefined()
  })
})

describe('useLeaderboard', () => {
  it('fetches leaderboard for a game', async () => {
    const { result } = renderHook(() => useLeaderboard('game-1'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toHaveLength(2)
    expect(result.current.data![0].teamName).toBe('Team Alpha')
    expect(result.current.data![0].points).toBe(50)
    expect(result.current.data![1].teamName).toBe('Team Beta')
  })

  it('is disabled when gameId is undefined', () => {
    const { result } = renderHook(() => useLeaderboard(undefined), {
      wrapper: createWrapper(),
    })

    expect(result.current.isLoading).toBe(false)
    expect(result.current.fetchStatus).toBe('idle')
  })
})

describe('useActivityFeed', () => {
  it('fetches activity events for a game', async () => {
    const { result } = renderHook(() => useActivityFeed('game-1'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toHaveLength(2)
    expect(result.current.data![0].type).toBe('check_in')
    expect(result.current.data![1].type).toBe('submission')
  })

  it('is disabled when gameId is undefined', () => {
    const { result } = renderHook(() => useActivityFeed(undefined), {
      wrapper: createWrapper(),
    })

    expect(result.current.isLoading).toBe(false)
    expect(result.current.fetchStatus).toBe('idle')
  })
})

describe('useProgress', () => {
  it('fetches team progress for a game', async () => {
    const { result } = renderHook(() => useProgress('game-1'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toHaveLength(2)
    expect(result.current.data![0].status).toBe('completed')
    expect(result.current.data![1].status).toBe('checked_in')
  })

  it('is disabled when gameId is undefined', () => {
    const { result } = renderHook(() => useProgress(undefined), {
      wrapper: createWrapper(),
    })

    expect(result.current.isLoading).toBe(false)
    expect(result.current.fetchStatus).toBe('idle')
  })
})

describe('useResultsExport', () => {
  it('fetches results export data for a game', async () => {
    const { result } = renderHook(() => useResultsExport('game-1'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data!.gameName).toBe('Test Game')
    expect(result.current.data!.challenges).toHaveLength(2)
    expect(result.current.data!.teams).toHaveLength(1)
    expect(result.current.data!.teams[0].totalPoints).toBe(30)
  })

  it('is disabled when gameId is undefined', () => {
    const { result } = renderHook(() => useResultsExport(undefined), {
      wrapper: createWrapper(),
    })

    expect(result.current.isLoading).toBe(false)
    expect(result.current.fetchStatus).toBe('idle')
  })
})
