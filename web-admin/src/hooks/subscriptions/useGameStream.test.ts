import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'
import { useGameStream } from './useGameStream'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockConnectWebSocket = vi.fn()
const mockDisconnectWebSocket = vi.fn()

vi.mock('@/lib/api/websocket', () => ({
  connectWebSocket: (...args: unknown[]) => mockConnectWebSocket(...args),
  disconnectWebSocket: (...args: unknown[]) => mockDisconnectWebSocket(...args),
}))

vi.mock('@/lib/api/client', () => ({
  getValidAccessToken: vi.fn().mockResolvedValue('test-token'),
}))

vi.mock('@/hooks/useAuth', () => ({
  useAuthStore: {
    getState: () => ({ clearAccessToken: vi.fn() }),
  },
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let queryClient: QueryClient

function wrapper({ children }: { children: React.ReactNode }) {
  return createElement(QueryClientProvider, { client: queryClient }, children)
}

/** Extract the callback arguments passed to connectWebSocket */
function getConnectArgs() {
  const call = mockConnectWebSocket.mock.calls[0]
  return {
    gameId: call[0] as string,
    onMessage: call[1] as (payload: { type: string; data: unknown }) => void,
    onError: call[2] as (message: string) => void,
    onReconnect: call[3] as () => void,
    tokenProvider: call[4] as () => Promise<string | null>,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useGameStream', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Return a mock client object (connectWebSocket returns the STOMP client)
    mockConnectWebSocket.mockReturnValue({ deactivate: vi.fn() })
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
  })

  // -- Lifecycle -----------------------------------------------------------

  it('connects to WebSocket on mount with the given gameId', () => {
    renderHook(() => useGameStream('game-1'), { wrapper })
    expect(mockConnectWebSocket).toHaveBeenCalledTimes(1)
    expect(mockConnectWebSocket).toHaveBeenCalledWith(
      'game-1',
      expect.any(Function),
      expect.any(Function),
      expect.any(Function),
      expect.any(Function)
    )
  })

  it('does not connect when gameId is undefined', () => {
    renderHook(() => useGameStream(undefined), { wrapper })
    expect(mockConnectWebSocket).not.toHaveBeenCalled()
  })

  it('disconnects on unmount', () => {
    const { unmount } = renderHook(() => useGameStream('game-1'), { wrapper })
    unmount()
    expect(mockDisconnectWebSocket).toHaveBeenCalledTimes(1)
  })

  it('returns null when no error has occurred', () => {
    const { result } = renderHook(() => useGameStream('game-1'), { wrapper })
    expect(result.current).toBeNull()
  })

  // -- Error handling ------------------------------------------------------

  it('reports connection error from onError callback', () => {
    const { result } = renderHook(() => useGameStream('game-1'), { wrapper })
    const { onError } = getConnectArgs()

    act(() => {
      onError('Connection lost')
    })

    expect(result.current).toBe('Connection lost')
  })

  it('clears connection error on reconnect', () => {
    const { result } = renderHook(() => useGameStream('game-1'), { wrapper })
    const { onError, onReconnect } = getConnectArgs()

    act(() => {
      onError('Connection lost')
    })
    expect(result.current).toBe('Connection lost')

    act(() => {
      onReconnect()
    })
    expect(result.current).toBeNull()
  })

  // -- Message routing: cache writes ---------------------------------------

  it('prepends activity data to activity feed cache', () => {
    renderHook(() => useGameStream('game-1'), { wrapper })
    const { onMessage } = getConnectArgs()

    // Seed the cache
    queryClient.setQueryData(['monitoring', 'activity', 'game-1'], [
      { id: 'old' },
    ])

    act(() => {
      onMessage({ type: 'activity', data: { id: 'new' } })
    })

    const cached = queryClient.getQueryData([
      'monitoring',
      'activity',
      'game-1',
    ]) as unknown[]
    expect(cached).toHaveLength(2)
    expect(cached[0]).toEqual({ id: 'new' })
    expect(cached[1]).toEqual({ id: 'old' })
  })

  it('creates activity feed cache if none exists', () => {
    renderHook(() => useGameStream('game-1'), { wrapper })
    const { onMessage } = getConnectArgs()

    act(() => {
      onMessage({ type: 'activity', data: { id: 'first' } })
    })

    const cached = queryClient.getQueryData([
      'monitoring',
      'activity',
      'game-1',
    ]) as unknown[]
    expect(cached).toEqual([{ id: 'first' }])
  })

  it('activity also invalidates submissions and dashboard', () => {
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    renderHook(() => useGameStream('game-1'), { wrapper })
    const { onMessage } = getConnectArgs()

    act(() => {
      onMessage({ type: 'activity', data: { id: 'x' } })
    })

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['submissions', 'game-1'],
    })
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['monitoring', 'dashboard', 'game-1'],
    })
  })

  it('replaces locations cache on location message', () => {
    renderHook(() => useGameStream('game-1'), { wrapper })
    const { onMessage } = getConnectArgs()

    const locations = [{ teamId: 't1', lat: 1, lng: 2 }]
    act(() => {
      onMessage({ type: 'location', data: locations })
    })

    expect(
      queryClient.getQueryData(['monitoring', 'locations', 'game-1'])
    ).toEqual(locations)
  })

  it('replaces leaderboard cache on leaderboard message', () => {
    renderHook(() => useGameStream('game-1'), { wrapper })
    const { onMessage } = getConnectArgs()

    const leaderboard = [{ teamId: 't1', score: 100 }]
    act(() => {
      onMessage({ type: 'leaderboard', data: leaderboard })
    })

    expect(
      queryClient.getQueryData(['monitoring', 'leaderboard', 'game-1'])
    ).toEqual(leaderboard)
  })

  it('stores presence data in cache', () => {
    renderHook(() => useGameStream('game-1'), { wrapper })
    const { onMessage } = getConnectArgs()

    const presence = { operators: ['op1'] }
    act(() => {
      onMessage({ type: 'presence', data: presence })
    })

    expect(
      queryClient.getQueryData(['monitoring', 'presence', 'game-1'])
    ).toEqual(presence)
  })

  // -- Message routing: invalidations -------------------------------------

  it('invalidates submissions on submission_status', () => {
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    renderHook(() => useGameStream('game-1'), { wrapper })
    const { onMessage } = getConnectArgs()

    act(() => {
      onMessage({ type: 'submission_status', data: {} })
    })

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['submissions', 'game-1'],
    })
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['monitoring', 'dashboard', 'game-1'],
    })
  })

  it('invalidates game queries on game_status', () => {
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    renderHook(() => useGameStream('game-1'), { wrapper })
    const { onMessage } = getConnectArgs()

    act(() => {
      onMessage({ type: 'game_status', data: {} })
    })

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['game', 'game-1'],
    })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['games'] })
  })

  it('invalidates entity-specific queries on game_config with entity', () => {
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    renderHook(() => useGameStream('game-1'), { wrapper })
    const { onMessage } = getConnectArgs()

    act(() => {
      onMessage({ type: 'game_config', data: { entity: 'bases' } })
    })

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['bases', 'game-1'],
    })
  })

  it('invalidates game query on game_config without entity', () => {
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    renderHook(() => useGameStream('game-1'), { wrapper })
    const { onMessage } = getConnectArgs()

    act(() => {
      onMessage({ type: 'game_config', data: {} })
    })

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['game', 'game-1'],
    })
  })

  it('invalidates notifications on notification message', () => {
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    renderHook(() => useGameStream('game-1'), { wrapper })
    const { onMessage } = getConnectArgs()

    act(() => {
      onMessage({ type: 'notification', data: {} })
    })

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['notifications', 'game-1'],
    })
  })

  it('defensively invalidates dashboard on unknown message type', () => {
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    renderHook(() => useGameStream('game-1'), { wrapper })
    const { onMessage } = getConnectArgs()

    act(() => {
      onMessage({ type: 'some_future_type', data: {} })
    })

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['monitoring', 'dashboard', 'game-1'],
    })
  })

  // -- Reconnect invalidation ---------------------------------------------

  it('invalidates all snapshot queries on reconnect', () => {
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    renderHook(() => useGameStream('game-1'), { wrapper })
    const { onReconnect } = getConnectArgs()

    act(() => {
      onReconnect()
    })

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['monitoring', 'activity', 'game-1'],
    })
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['monitoring', 'locations', 'game-1'],
    })
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['monitoring', 'leaderboard', 'game-1'],
    })
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['monitoring', 'dashboard', 'game-1'],
    })
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['submissions', 'game-1'],
    })
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['game', 'game-1'],
    })
  })
})
