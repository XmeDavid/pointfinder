import { describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'
import {
  useCreateStage,
  useUpdateStage,
  useDeleteStage,
  useReorderStages,
} from './useStageMutations'

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

describe('useCreateStage', () => {
  it('creates a stage and invalidates the stages cache', async () => {
    const qc = createTestClient()
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')

    const { result } = renderHook(() => useCreateStage('game-1'), {
      wrapper: createWrapper(qc),
    })

    await act(async () => {
      result.current.mutate({
        name: 'New Stage',
        transitionType: 'manual',
      })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data!.name).toBe('New Stage')
    expect(result.current.data!.transitionType).toBe('manual')
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['stages', 'game-1'] })
  })
})

describe('useUpdateStage', () => {
  it('updates a stage and invalidates the stages cache', async () => {
    const qc = createTestClient()
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')

    const { result } = renderHook(() => useUpdateStage('game-1'), {
      wrapper: createWrapper(qc),
    })

    await act(async () => {
      result.current.mutate({
        stageId: 'stage-1',
        dto: { name: 'Updated Stage' },
      })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data!.name).toBe('Updated Stage')
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['stages', 'game-1'] })
  })
})

describe('useDeleteStage', () => {
  it('deletes a stage and invalidates the stages cache', async () => {
    const qc = createTestClient()
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')

    const { result } = renderHook(() => useDeleteStage('game-1'), {
      wrapper: createWrapper(qc),
    })

    await act(async () => {
      result.current.mutate('stage-1')
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['stages', 'game-1'] })
  })
})

describe('useReorderStages', () => {
  it('reorders stages and invalidates the stages cache', async () => {
    const qc = createTestClient()
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')

    const { result } = renderHook(() => useReorderStages('game-1'), {
      wrapper: createWrapper(qc),
    })

    await act(async () => {
      result.current.mutate(['stage-2', 'stage-1'])
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['stages', 'game-1'] })
  })
})
