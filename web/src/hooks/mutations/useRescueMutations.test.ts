import { describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'
import {
  useManualCheckIn,
  useMarkCompleted,
  useUnlockOverride,
  useRemoveUnlockOverride,
} from './useRescueMutations'

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

describe('useManualCheckIn', () => {
  it('performs manual check-in and invalidates relevant caches', async () => {
    const qc = createTestClient()
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')

    const { result } = renderHook(() => useManualCheckIn('game-1'), {
      wrapper: createWrapper(qc),
    })

    await act(async () => {
      result.current.mutate({
        teamId: 'team-1',
        baseId: 'base-1',
        body: { reason: 'NFC reader broken' },
      })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['submissions', 'game-1'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['monitoring', 'activity', 'game-1'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['monitoring', 'progress', 'game-1'] })
  })

  it('works without a reason body', async () => {
    const qc = createTestClient()

    const { result } = renderHook(() => useManualCheckIn('game-1'), {
      wrapper: createWrapper(qc),
    })

    await act(async () => {
      result.current.mutate({ teamId: 'team-1', baseId: 'base-1' })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })
})

describe('useMarkCompleted', () => {
  it('marks a challenge completed and invalidates relevant caches', async () => {
    const qc = createTestClient()
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')

    const { result } = renderHook(() => useMarkCompleted('game-1'), {
      wrapper: createWrapper(qc),
    })

    await act(async () => {
      result.current.mutate({
        teamId: 'team-1',
        baseId: 'base-1',
        request: { challengeId: 'challenge-1', reason: 'Team stuck' },
      })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data!.status).toBe('approved')
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['submissions', 'game-1'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['monitoring', 'dashboard', 'game-1'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['monitoring', 'activity', 'game-1'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['monitoring', 'progress', 'game-1'] })
  })
})

describe('useUnlockOverride', () => {
  it('creates an unlock override and invalidates bases + activity caches', async () => {
    const qc = createTestClient()
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')

    const { result } = renderHook(() => useUnlockOverride('game-1'), {
      wrapper: createWrapper(qc),
    })

    await act(async () => {
      result.current.mutate({
        teamId: 'team-1',
        baseId: 'base-1',
        body: { reason: 'Team needs access' },
      })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data!.baseId).toBe('base-1')
    expect(result.current.data!.teamId).toBe('team-1')
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['bases', 'game-1'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['monitoring', 'activity', 'game-1'] })
  })
})

describe('useRemoveUnlockOverride', () => {
  it('removes an unlock override and invalidates bases + activity caches', async () => {
    const qc = createTestClient()
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')

    const { result } = renderHook(() => useRemoveUnlockOverride('game-1'), {
      wrapper: createWrapper(qc),
    })

    await act(async () => {
      result.current.mutate({ teamId: 'team-1', baseId: 'base-1' })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['bases', 'game-1'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['monitoring', 'activity', 'game-1'] })
  })
})
