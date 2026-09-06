import { beforeEach, describe, expect, it } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { tutorialProgressStore } from '@/test/msw/handlers/tutorials'
import { useUpdateTutorialProgress } from '@/hooks/mutations/useTutorialMutations'
import { useTutorialProgress } from './useTutorialProgress'

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

describe('useTutorialProgress', () => {
  beforeEach(() => {
    tutorialProgressStore.reset()
  })

  it('loads the caller progress under the ["tutorials","me"] key', async () => {
    tutorialProgressStore.seed([
      {
        scenarioId: 'first-game',
        status: 'completed',
        currentStep: 'finish',
        gameId: null,
        startedAt: '2026-09-06T09:00:00.000Z',
        completedAt: '2026-09-06T09:30:00.000Z',
      },
    ])
    const client = makeClient()

    const { result } = renderHook(() => useTutorialProgress(), { wrapper: wrapper(client) })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toHaveLength(1)
    expect(client.getQueryData(['tutorials', 'me'])).toHaveLength(1)
  })

  it('does not fetch when disabled', () => {
    const client = makeClient()

    const { result } = renderHook(() => useTutorialProgress({ enabled: false }), {
      wrapper: wrapper(client),
    })

    expect(result.current.fetchStatus).toBe('idle')
    expect(tutorialProgressStore.puts()).toEqual([])
  })
})

describe('useUpdateTutorialProgress', () => {
  beforeEach(() => {
    tutorialProgressStore.reset()
  })

  it('writes the row and invalidates the progress query', async () => {
    const client = makeClient()
    const list = renderHook(() => useTutorialProgress(), { wrapper: wrapper(client) })
    await waitFor(() => expect(list.result.current.isSuccess).toBe(true))
    expect(list.result.current.data).toEqual([])

    const mutation = renderHook(() => useUpdateTutorialProgress(), { wrapper: wrapper(client) })
    await mutation.result.current.mutateAsync({
      scenarioId: 'first-game',
      status: 'skipped',
      currentStep: null,
    })

    await waitFor(() => expect(list.result.current.data).toHaveLength(1))
    expect(list.result.current.data?.[0].status).toBe('skipped')
  })
})
