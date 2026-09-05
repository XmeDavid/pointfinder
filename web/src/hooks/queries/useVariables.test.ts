import { describe, it, expect } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'
import {
  useGameVariables,
  useChallengeVariables,
  useVariableCompleteness,
} from './useVariables'

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

describe('useGameVariables', () => {
  it('fetches game-level variables', async () => {
    const { result } = renderHook(() => useGameVariables('game-1'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data!.variables).toHaveLength(2)
    expect(result.current.data!.variables[0].key).toBe('teamColor')
    expect(result.current.data!.variables[1].key).toBe('motto')
  })

  it('is disabled when gameId is undefined', () => {
    const { result } = renderHook(() => useGameVariables(undefined), {
      wrapper: createWrapper(),
    })

    expect(result.current.isLoading).toBe(false)
    expect(result.current.fetchStatus).toBe('idle')
    expect(result.current.data).toBeUndefined()
  })
})

describe('useChallengeVariables', () => {
  it('fetches challenge-level variables', async () => {
    const { result } = renderHook(
      () => useChallengeVariables('game-1', 'challenge-1'),
      { wrapper: createWrapper() },
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data!.variables).toHaveLength(2)
  })

  it('is disabled when gameId is undefined', () => {
    const { result } = renderHook(
      () => useChallengeVariables(undefined, 'challenge-1'),
      { wrapper: createWrapper() },
    )

    expect(result.current.isLoading).toBe(false)
    expect(result.current.fetchStatus).toBe('idle')
  })

  it('is disabled when challengeId is undefined', () => {
    const { result } = renderHook(
      () => useChallengeVariables('game-1', undefined),
      { wrapper: createWrapper() },
    )

    expect(result.current.isLoading).toBe(false)
    expect(result.current.fetchStatus).toBe('idle')
  })
})

describe('useVariableCompleteness', () => {
  it('fetches variable completeness status', async () => {
    const { result } = renderHook(() => useVariableCompleteness('game-1'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data!.complete).toBe(true)
    expect(result.current.data!.errors).toHaveLength(0)
  })

  it('is disabled when gameId is undefined', () => {
    const { result } = renderHook(() => useVariableCompleteness(undefined), {
      wrapper: createWrapper(),
    })

    expect(result.current.isLoading).toBe(false)
    expect(result.current.fetchStatus).toBe('idle')
  })
})
