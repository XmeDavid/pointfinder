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

describe('stage changes that renumber routes (OW-40)', () => {
  it.each([
    ['create', () => useCreateStage('game-1'), { name: 'Linear', transitionType: 'manual' as const }],
    ['update', () => useUpdateStage('game-1'), { stageId: 'stage-1', dto: { name: 'Linear', transitionType: 'manual' as const, enforceBaseOrder: true } }],
    ['delete', () => useDeleteStage('game-1'), 'stage-1'],
  ])('%s refreshes the bases and the game, whose route numbers and lock follow the stages', async (_name, hook, variables) => {
    const qc = createTestClient()
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(hook as () => { mutate: (v: unknown) => void; isSuccess: boolean }, { wrapper: createWrapper(qc) })
    await act(async () => { result.current.mutate(variables) })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['bases', 'game-1'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['game', 'game-1'] })
  })
})
