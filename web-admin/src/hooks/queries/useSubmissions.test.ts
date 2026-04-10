import { describe, it, expect } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'
import { useSubmissions } from './useSubmissions'

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

describe('useSubmissions', () => {
  it('fetches all submissions for a game', async () => {
    const { result } = renderHook(() => useSubmissions('game-1'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toHaveLength(3)
    expect(result.current.data![0].id).toBe('sub-1')
    expect(result.current.data![1].status).toBe('approved')
    expect(result.current.data![2].status).toBe('rejected')
  })

  it('filters submissions by teamId', async () => {
    const { result } = renderHook(
      () => useSubmissions('game-1', { teamId: 'team-1' }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data!.every((s) => s.teamId === 'team-1')).toBe(true)
  })

  it('is disabled when gameId is undefined', () => {
    const { result } = renderHook(() => useSubmissions(undefined), {
      wrapper: createWrapper(),
    })

    expect(result.current.isLoading).toBe(false)
    expect(result.current.fetchStatus).toBe('idle')
    expect(result.current.data).toBeUndefined()
  })

  it('uses the correct query key including filters', () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: qc }, children)

    const filters = { teamId: 'team-1', status: 'pending' }
    renderHook(() => useSubmissions('game-1', filters), { wrapper })

    const queryState = qc.getQueryState(['submissions', 'game-1', filters])
    expect(queryState).toBeDefined()
  })
})
