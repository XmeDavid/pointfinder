import { describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'
import { useCreateTag, useUpdateTag, useDeleteTag } from './useTagMutations'

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

describe('useCreateTag', () => {
  it('creates a tag and invalidates the tags cache', async () => {
    const qc = createTestClient()
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')

    const { result } = renderHook(() => useCreateTag('game-1'), {
      wrapper: createWrapper(qc),
    })

    await act(async () => {
      result.current.mutate({ label: 'Urgent', color: '#ef4444' })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data!.label).toBe('Urgent')
    expect(result.current.data!.color).toBe('#ef4444')
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['tags', 'game-1'] })
  })
})

describe('useUpdateTag', () => {
  it('updates a tag and invalidates the tags cache', async () => {
    const qc = createTestClient()
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')

    const { result } = renderHook(() => useUpdateTag('game-1'), {
      wrapper: createWrapper(qc),
    })

    await act(async () => {
      result.current.mutate({
        tagId: 'tag-1',
        dto: { label: 'Renamed Tag' },
      })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data!.label).toBe('Renamed Tag')
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['tags', 'game-1'] })
  })
})

describe('useDeleteTag', () => {
  it('deletes a tag and invalidates the tags cache', async () => {
    const qc = createTestClient()
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')

    const { result } = renderHook(() => useDeleteTag('game-1'), {
      wrapper: createWrapper(qc),
    })

    await act(async () => {
      result.current.mutate('tag-1')
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['tags', 'game-1'] })
  })
})
