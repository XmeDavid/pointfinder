import { describe, it, expect, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { createMockGame } from '@/test/factories/game'
import { useWorkspaceContext } from '@/stores/workspaceContext'
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
  afterEach(() => {
    useWorkspaceContext.getState().setActive({ type: 'personal' })
  })

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

  it('asks for the active organization workspace and keys the query by it', async () => {
    let requestedOrgId: string | null = null
    server.use(http.get('/api/games', ({ request }) => {
      requestedOrgId = new URL(request.url).searchParams.get('orgId')
      return HttpResponse.json([createMockGame({ id: 'org-game-1', name: 'District rally' })])
    }))
    useWorkspaceContext.getState().setActive({ type: 'org', orgId: 'org-7', orgName: 'Scout District' })

    const { result } = renderHook(() => useGames(), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(requestedOrgId).toBe('org-7')
    expect(result.current.data![0].name).toBe('District rally')
  })

  it('refetches when the workspace changes because the key changes', async () => {
    const seen: (string | null)[] = []
    server.use(http.get('/api/games', ({ request }) => {
      seen.push(new URL(request.url).searchParams.get('orgId'))
      return HttpResponse.json([])
    }))
    const wrapper = createWrapper()

    const { result, rerender } = renderHook(() => useGames(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    useWorkspaceContext.getState().setActive({ type: 'org', orgId: 'org-7', orgName: 'Scout District' })
    rerender()

    await waitFor(() => expect(seen).toEqual([null, 'org-7']))
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
