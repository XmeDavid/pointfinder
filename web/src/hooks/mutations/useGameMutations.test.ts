import { describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'
import {
  useCreateGame,
  useUpdateGame,
  useDeleteGame,
  useUpdateGameStatus,
  useImportGame,
} from './useGameMutations'

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

describe('useCreateGame', () => {
  it('creates a game and invalidates the games list', async () => {
    const qc = createTestClient()
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')

    const { result } = renderHook(() => useCreateGame(), {
      wrapper: createWrapper(qc),
    })

    await act(async () => {
      result.current.mutate({ name: 'New Game', description: 'Desc' })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data!.name).toBe('New Game')
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['games'] })
  })
})

describe('useUpdateGame', () => {
  it('updates a game and invalidates both game and games queries', async () => {
    const qc = createTestClient()
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')

    const { result } = renderHook(() => useUpdateGame('game-1'), {
      wrapper: createWrapper(qc),
    })

    await act(async () => {
      result.current.mutate({ name: 'Updated Name' })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data!.name).toBe('Updated Name')
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['game', 'game-1'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['games'] })
  })
})

describe('useDeleteGame', () => {
  it('deletes a game and invalidates the games list', async () => {
    const qc = createTestClient()
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')

    const { result } = renderHook(() => useDeleteGame(), {
      wrapper: createWrapper(qc),
    })

    await act(async () => {
      result.current.mutate('game-1')
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['games'] })
  })
})

describe('useUpdateGameStatus', () => {
  it('updates game status and invalidates game + games queries', async () => {
    const qc = createTestClient()
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')

    const { result } = renderHook(() => useUpdateGameStatus('game-1'), {
      wrapper: createWrapper(qc),
    })

    await act(async () => {
      result.current.mutate({ status: 'live' })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data!.status).toBe('live')
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['game', 'game-1'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['games'] })
  })
})

describe('useImportGame', () => {
  it('imports a game and invalidates the games list', async () => {
    const qc = createTestClient()
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')

    const { result } = renderHook(() => useImportGame(), {
      wrapper: createWrapper(qc),
    })

    await act(async () => {
      result.current.mutate({
        gameData: {
          exportVersion: '1.0',
          game: { name: 'Imported Game', description: 'Desc' },
          bases: [],
          challenges: [],
          assignments: [],
        },
      })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data!.name).toBe('Imported Game')
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['games'] })
  })
})
