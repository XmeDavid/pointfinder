import { describe, it, expect } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'
import { useNotifications } from './useNotifications'

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

describe('useNotifications', () => {
  it('fetches notifications for a game', async () => {
    const { result } = renderHook(() => useNotifications('game-1'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toHaveLength(2)
    expect(result.current.data![0].message).toBe('Welcome to the game!')
    expect(result.current.data![1].targetTeamId).toBe('team-1')
  })

  it('is disabled when gameId is undefined', () => {
    const { result } = renderHook(() => useNotifications(undefined), {
      wrapper: createWrapper(),
    })

    expect(result.current.isLoading).toBe(false)
    expect(result.current.fetchStatus).toBe('idle')
    expect(result.current.data).toBeUndefined()
  })

  it('uses the correct query key', () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: qc }, children)

    renderHook(() => useNotifications('game-1'), { wrapper })

    const queryState = qc.getQueryState(['notifications', 'game-1'])
    expect(queryState).toBeDefined()
  })
})
