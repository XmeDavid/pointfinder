import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'

const memory = vi.hoisted(() => new Map<string, string>())
vi.mock('@/platform', () => ({
  isNative: () => false,
  kv: {
    get: async (key: string) => memory.get(key) ?? null,
    set: async (key: string, value: string) => {
      memory.set(key, value)
    },
    remove: async (key: string) => {
      memory.delete(key)
    },
  },
}))

import { useEntityDraft } from './useEntityDraft'
import { draftKey, flushDraftWrites, useDraftStore } from './draftStore'

type Fields = { name: string; lat: string }
const key = draftKey('user-1', 'game-1', 'base', 'base-1')
const server: Fields = { name: 'Alpha', lat: '38.7' }

function setup(overrides: Partial<Parameters<typeof useEntityDraft<Fields>>[0]> = {}, initialServer: Fields | undefined = server) {
  const save = vi.fn(async (fields: Fields) => fields)
  const hook = renderHook(
    ({ current, autosave }: { current: Fields | undefined; autosave: boolean }) =>
      useEntityDraft<Fields>({ key, server: current, save, autosaveMs: 50, autosave, validate: (f) => f.name.trim().length > 0, ...overrides }),
    { initialProps: { current: initialServer, autosave: true } },
  )
  return { ...hook, save }
}

describe('useEntityDraft', () => {
  beforeEach(() => {
    memory.clear()
    useDraftStore.getState().resetAll()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows the server row when no draft exists', async () => {
    const { result } = setup()
    await waitFor(() => expect(result.current.fields).toEqual(server))
    expect(result.current.isDirty).toBe(false)
    expect(result.current.status.state).toBe('idle')
  })

  it('persists an edit promptly as a local draft, then saves it in the background', async () => {
    const { result, save } = setup()
    await waitFor(() => expect(result.current.fields).toEqual(server))
    act(() => result.current.update({ name: 'Bravo' }))
    expect(result.current.status.state).toBe('local')
    expect(result.current.isDirty).toBe(true)
    expect(useDraftStore.getState().records[key]?.fields).toEqual({ name: 'Bravo', lat: '38.7' })
    await flushDraftWrites()
    expect(JSON.parse(memory.get(`pf.${key}`)!).fields.name).toBe('Bravo')
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(result.current.status.state).toBe('saved'))
    expect(result.current.isDirty).toBe(false)
    expect(useDraftStore.getState().records[key]).toBeNull()
  })

  it('restores a persisted draft on mount instead of the server row', async () => {
    memory.set(`pf.${key}`, JSON.stringify({ fields: { name: 'Typed offline', lat: '38.7' }, baseline: server, updatedAt: 1 }))
    const { result } = setup({ autosave: false })
    await waitFor(() => expect(result.current.fields?.name).toBe('Typed offline'))
    expect(result.current.status.state).toBe('local')
    expect(result.current.isDirty).toBe(true)
    expect(result.current.conflict).toBe(false)
  })

  it('never overwrites unsaved edits when a refetch changes the row; it flags a conflict', async () => {
    const { result, rerender } = setup({ autosave: false })
    await waitFor(() => expect(result.current.fields).toEqual(server))
    act(() => result.current.update({ name: 'Mine' }))
    rerender({ current: { name: 'Theirs', lat: '38.7' }, autosave: false })
    expect(result.current.fields?.name).toBe('Mine')
    expect(result.current.conflict).toBe(true)
    expect(result.current.status.state).toBe('conflict')
    act(() => result.current.keepMine())
    expect(result.current.conflict).toBe(false)
    expect(result.current.fields?.name).toBe('Mine')
    expect(result.current.status.state).toBe('local')
  })

  it('discards the draft and adopts the latest server row', async () => {
    const { result, rerender } = setup({ autosave: false })
    await waitFor(() => expect(result.current.fields).toEqual(server))
    act(() => result.current.update({ name: 'Mine' }))
    rerender({ current: { name: 'Theirs', lat: '38.7' }, autosave: false })
    act(() => result.current.discard())
    expect(result.current.fields?.name).toBe('Theirs')
    expect(result.current.isDirty).toBe(false)
    expect(useDraftStore.getState().records[key]).toBeNull()
  })

  it('adopts a refetch when nothing is dirty', async () => {
    const { result, rerender } = setup()
    await waitFor(() => expect(result.current.fields).toEqual(server))
    rerender({ current: { name: 'Renamed elsewhere', lat: '38.7' }, autosave: true })
    expect(result.current.fields?.name).toBe('Renamed elsewhere')
    expect(result.current.conflict).toBe(false)
  })

  it('keeps the draft and reports an error when the save fails, then retries on demand', async () => {
    const failing = vi.fn(async () => {
      throw new Error('Server refused the base')
    })
    const { result } = setup({ save: failing })
    await waitFor(() => expect(result.current.fields).toEqual(server))
    act(() => result.current.update({ name: 'Bravo' }))
    await waitFor(() => expect(result.current.status.state).toBe('error'))
    expect(result.current.status.error).toBe('Server refused the base')
    expect(result.current.fields?.name).toBe('Bravo')
    expect(useDraftStore.getState().records[key]?.fields).toEqual({ name: 'Bravo', lat: '38.7' })
    failing.mockImplementation(async () => undefined)
    let ok = false
    await act(async () => {
      ok = await result.current.saveNow()
    })
    expect(ok).toBe(true)
    expect(result.current.status.state).toBe('saved')
  })

  it('keeps invalid content local and saveNow reports it', async () => {
    const { result, save } = setup()
    await waitFor(() => expect(result.current.fields).toEqual(server))
    act(() => result.current.update({ name: '   ' }))
    let ok = true
    await act(async () => {
      ok = await result.current.saveNow()
    })
    expect(ok).toBe(false)
    expect(save).not.toHaveBeenCalled()
    expect(result.current.status.state).toBe('local')
  })

  it('treats the refetch of its own save as landed, even when the operator kept typing', async () => {
    const { result, rerender } = setup({ save: async () => ({ name: 'Bravo', lat: '38.7' }) })
    await waitFor(() => expect(result.current.fields).toEqual(server))
    act(() => result.current.update({ name: 'Bravo' }))
    await waitFor(() => expect(result.current.status.state).toBe('saved'))
    act(() => result.current.update({ name: 'Bravo Charlie' }))
    rerender({ current: { name: 'Bravo', lat: '38.7' }, autosave: true })
    expect(result.current.conflict).toBe(false)
    expect(result.current.fields?.name).toBe('Bravo Charlie')
  })

  it('saveNow returns true when nothing is dirty', async () => {
    const { result, save } = setup()
    await waitFor(() => expect(result.current.fields).toEqual(server))
    let ok = false
    await act(async () => {
      ok = await result.current.saveNow()
    })
    expect(ok).toBe(true)
    expect(save).not.toHaveBeenCalled()
  })

  it('waits for edits typed during a save and accepts its in-flight refetch', async () => {
    let finish!: (fields: Fields) => void
    const save = vi.fn<(fields: Fields) => Promise<Fields>>()
      .mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
      .mockImplementation(async fields => fields)
    const { result, rerender } = setup({ save, autosave: false })
    await waitFor(() => expect(result.current.fields).toEqual(server))
    act(() => result.current.update({ name: 'First' }))
    let saving!: Promise<boolean>
    act(() => { saving = result.current.saveNow() })
    act(() => result.current.update({ name: 'Latest' }))
    rerender({ current: { ...server, name: 'First' }, autosave: false })
    expect(result.current.conflict).toBe(false)
    await act(async () => { finish({ ...server, name: 'First' }); await saving })
    expect(save).toHaveBeenCalledTimes(2)
    expect(save).toHaveBeenLastCalledWith({ ...server, name: 'Latest' })
    expect(result.current.fields?.name).toBe('Latest')
    expect(result.current.isDirty).toBe(false)
  })

  it('adopts normalized values without leaving a false dirty draft', async () => {
    const { result } = setup({ save: async fields => ({ ...fields, name: fields.name.trim() }), autosave: false })
    await waitFor(() => expect(result.current.fields).toEqual(server))
    act(() => result.current.update({ name: ' Bravo ' }))
    await act(async () => { await result.current.saveNow() })
    expect(result.current.fields?.name).toBe('Bravo')
    expect(result.current.isDirty).toBe(false)
  })

  it('flushes the old entity using its own callback when switching entities', async () => {
    const oldSave = vi.fn(async (fields: Fields) => fields)
    const nextSave = vi.fn(async (fields: Fields) => fields)
    const { result, rerender } = renderHook(
      ({ entityKey, save }) => useEntityDraft({ key: entityKey, server, save, autosaveMs: 10_000 }),
      { initialProps: { entityKey: key, save: oldSave } },
    )
    await waitFor(() => expect(result.current.fields).toEqual(server))
    act(() => result.current.update({ name: 'Belongs to the old entity' }))
    rerender({ entityKey: draftKey('user-1', 'game-2', 'base', 'base-2'), save: nextSave })
    await waitFor(() => expect(oldSave).toHaveBeenCalledWith({ ...server, name: 'Belongs to the old entity' }))
    expect(nextSave).not.toHaveBeenCalled()
    await waitFor(() => expect(result.current.fields).toEqual(server))
  })
})
