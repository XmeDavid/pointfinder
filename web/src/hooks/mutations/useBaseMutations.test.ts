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
  it('appends the created base to the cached list', async () => {
    const qc = createTestClient()
    qc.setQueryData(['bases', 'game-1'], [{ id: 'base-1', gameId: 'game-1', name: 'Existing' }])

    const { result } = renderHook(() => useCreateBase('game-1'), {
      wrapper: createWrapper(qc),
    })
    await act(async () => {
      result.current.mutate({ name: 'New Base', description: '', lat: 38.72, lng: -9.14 })
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const names = (qc.getQueryData(['bases', 'game-1']) as Array<{ name: string }>).map((b) => b.name)
    expect(names).toContain('Existing')
    expect(names).toContain('New Base')
  })

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
  it('writes the saved base into the cached list before the refetch lands', async () => {
    const qc = createTestClient()
    qc.setQueryData(['bases', 'game-1'], [
      { id: 'base-1', gameId: 'game-1', name: 'Old', checkInMethod: 'NFC' },
      { id: 'base-2', gameId: 'game-1', name: 'Other', checkInMethod: 'NFC' },
    ])
    let seenAtSuccess: unknown
    qc.getMutationCache().subscribe((event) => {
      if (event.type === 'updated' && event.mutation.state.status === 'success') {
        seenAtSuccess = qc.getQueryData(['bases', 'game-1'])
      }
    })

    const { result } = renderHook(() => useUpdateBase('game-1'), {
      wrapper: createWrapper(qc),
    })
    await act(async () => {
      result.current.mutate({ baseId: 'base-1', dto: { name: 'Saved', checkInMethod: 'QR' } })
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const list = seenAtSuccess as Array<{ id: string; name: string; checkInMethod: string }>
    expect(list.map((b) => b.id)).toEqual(['base-1', 'base-2'])
    expect(list[0]).toMatchObject({ id: 'base-1', name: 'Saved', checkInMethod: 'QR' })
    expect(list[1].name).toBe('Other')
  })

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
