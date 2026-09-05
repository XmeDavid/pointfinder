import { describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'
import {
  useCreateBase,
  useUpdateBase,
  useDeleteBase,
  useReorderBases,
} from './useBaseMutations'

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

describe('useCreateBase', () => {
  it('creates a base and invalidates the bases cache', async () => {
    const qc = createTestClient()
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')

    const { result } = renderHook(() => useCreateBase('game-1'), {
      wrapper: createWrapper(qc),
    })

    await act(async () => {
      result.current.mutate({
        name: 'New Base',
        description: 'A new base',
        lat: 38.72,
        lng: -9.14,
      })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data!.name).toBe('New Base')
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['bases', 'game-1'] })
  })
})

describe('useUpdateBase', () => {
  it('updates a base and invalidates the bases cache', async () => {
    const qc = createTestClient()
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')

    const { result } = renderHook(() => useUpdateBase('game-1'), {
      wrapper: createWrapper(qc),
    })

    await act(async () => {
      result.current.mutate({
        baseId: 'base-1',
        dto: { name: 'Updated Base' },
      })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data!.name).toBe('Updated Base')
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['bases', 'game-1'] })
  })
})

describe('useDeleteBase', () => {
  it('deletes a base and invalidates the bases cache', async () => {
    const qc = createTestClient()
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')

    const { result } = renderHook(() => useDeleteBase('game-1'), {
      wrapper: createWrapper(qc),
    })

    await act(async () => {
      result.current.mutate('base-1')
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['bases', 'game-1'] })
  })
})

describe('useReorderBases', () => {
  it('reorders bases and invalidates the bases cache', async () => {
    const qc = createTestClient()
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')

    const { result } = renderHook(() => useReorderBases('game-1'), {
      wrapper: createWrapper(qc),
    })

    await act(async () => {
      result.current.mutate(['base-3', 'base-1', 'base-2'])
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['bases', 'game-1'] })
  })
})
