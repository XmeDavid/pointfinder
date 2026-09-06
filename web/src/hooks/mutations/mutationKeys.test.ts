import { describe, expect, it } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { createMockBase } from '@/test/factories/base'
import { subscribeMutationLog } from '@/features/tutorials/mutationLog'
import { useUpdateBase } from './useBaseMutations'
import { useUpdateGameStatus } from './useGameMutations'

function wrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children)
  }
}

describe('mutation keys feed the tutorial log', () => {
  it('records base:update and game:status', async () => {
    server.use(
      http.put('/api/games/:gameId/bases/:baseId', () => HttpResponse.json(createMockBase({ id: 'b1' }))),
      http.put('/api/bases/:baseId', () => HttpResponse.json(createMockBase({ id: 'b1' }))),
      http.patch('/api/games/:gameId/status', () => HttpResponse.json({ id: 'game-1', status: 'live' })),
      http.put('/api/games/:gameId/status', () => HttpResponse.json({ id: 'game-1', status: 'live' })),
    )
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    const seen: string[] = []
    const unsubscribe = subscribeMutationLog(queryClient, (key) => seen.push(key))

    const base = renderHook(() => useUpdateBase('game-1'), { wrapper: wrapper(queryClient) })
    base.result.current.mutate({ baseId: 'b1', dto: { name: 'Old mill' } })
    await waitFor(() => expect(seen).toContain('base:update'))

    const status = renderHook(() => useUpdateGameStatus('game-1'), { wrapper: wrapper(queryClient) })
    status.result.current.mutate({ status: 'live' })
    await waitFor(() => expect(seen).toContain('game:status'))

    unsubscribe()
  })
})
