import { useCallback, useEffect, useRef, useState } from 'react'
import { sameFields, useDraftStore, type SaveStatus } from './draftStore'

export interface EntityDraftOptions<T extends object> {
  /** Scoped draft key; null while the account or entity is unknown. */
  key: string | null
  /** The server's current editable fields; undefined while loading or missing. */
  server: T | undefined
  /** Whether the fields can be sent. Invalid fields stay local, never fail loudly. */
  validate?: (fields: T) => boolean
  /**
   * Performs the save. May resolve with the server's normalized fields so a
   * later refetch is recognised as this save landing rather than a conflict.
   */
  save: (fields: T) => Promise<T | void>
  /** Save valid edits in the background after a pause (default true). */
  autosave?: boolean
  autosaveMs?: number
  /** Turns a thrown error into the message shown next to the status. */
  describeError?: (error: unknown) => string
}

export interface EntityDraft<T extends object> {
  fields: T | undefined
  update: (patch: Partial<T> | ((current: T) => T)) => void
  status: SaveStatus
  isDirty: boolean
  conflict: boolean
  hydrated: boolean
  /** Increments whenever the fields are replaced wholesale (load, discard, adopted refetch); key uncontrolled editors on it. */
  generation: number
  /** Flushes any pending edit. Resolves true when nothing is left unsaved. `force` sends even when nothing changed. */
  saveNow: (options?: { force?: boolean }) => Promise<boolean>
  /** Drops the local draft and shows the server's version. */
  discard: () => void
  /** Conflict choice: keep the local edits and continue on top of the newer server row. */
  keepMine: () => void
}

const IDLE: SaveStatus = { state: 'idle' }
const DEFAULT_AUTOSAVE_MS = 1500

function describeUnknown(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error && typeof (error as { message: unknown }).message === 'string') {
    return (error as { message: string }).message
  }
  return String(error)
}

interface SaveContext<T> {
  key: string
  snapshot: T
  baseline: T
  force?: boolean
  validate?: (fields: T) => boolean
  save: (fields: T) => Promise<T | void>
  describeError: (error: unknown) => string
  /** Receives the normalized row when this save lands and the hook still shows the same entity. */
  onLanded?: (key: string, landed: T, snapshot: T) => void
}

/** One save per key at a time; a second request waits and re-evaluates. */
const inFlight = new Map<string, Promise<boolean>>()
const savingFields = new Map<string, object>()

async function performSave<T extends object>(ctx: SaveContext<T>): Promise<boolean> {
  const store = useDraftStore.getState()
  if (!ctx.force && sameFields(ctx.snapshot, ctx.baseline)) return true
  if (ctx.validate && !ctx.validate(ctx.snapshot)) {
    store.setStatus(ctx.key, { state: 'local' })
    return false
  }
  const previous = inFlight.get(ctx.key)
  if (previous) {
    await previous
    const latest = useDraftStore.getState().records[ctx.key]
    // The first save carried everything the operator had typed by then.
    if (!latest) return true
    return performSave({ ...ctx, snapshot: latest.fields as T, baseline: latest.baseline as T })
  }
  store.setStatus(ctx.key, { state: 'saving' })
  savingFields.set(ctx.key, ctx.snapshot)
  const attempt = (async () => {
    try {
      const normalized = await ctx.save(ctx.snapshot)
      const landed = (normalized as T | undefined) ?? ctx.snapshot
      const state = useDraftStore.getState()
      const record = state.records[ctx.key]
      if (!record || sameFields(record.fields, ctx.snapshot)) {
        state.clear(ctx.key)
        state.setStatus(ctx.key, { state: 'saved', savedAt: Date.now() })
      } else {
        // Typed on while saving: the newer edits continue on top of what landed.
        state.write(ctx.key, record.fields, landed)
        state.setStatus(ctx.key, { state: 'local' })
      }
      ctx.onLanded?.(ctx.key, landed, ctx.snapshot)
      return true
    } catch (error) {
      useDraftStore.getState().setStatus(ctx.key, { state: 'error', error: ctx.describeError(error) })
      return false
    } finally {
      inFlight.delete(ctx.key)
      savingFields.delete(ctx.key)
    }
  })()
  inFlight.set(ctx.key, attempt)
  return attempt
}

/**
 * One entity's editable fields with a persisted draft, background saves and
 * truthful save status. The hook never overwrites unsaved edits with a refetch
 * and never reports a local draft as saved.
 */
export function useEntityDraft<T extends object>(options: EntityDraftOptions<T>): EntityDraft<T> {
  const { key, server, validate, save, autosave = true, autosaveMs = DEFAULT_AUTOSAVE_MS, describeError = describeUnknown } = options
  const hydrated = useDraftStore((s) => (key ? !!s.hydrated[key] : false))
  const status = useDraftStore((s) => (key ? (s.status[key] ?? IDLE) : IDLE))

  const [fields, setFieldsState] = useState<T | undefined>(undefined)
  const [conflict, setConflict] = useState(false)
  const [generation, setGeneration] = useState(0)
  const fieldsRef = useRef<T | undefined>(undefined)
  const baselineRef = useRef<T | undefined>(undefined)
  const serverRef = useRef<T | undefined>(server)
  const keyRef = useRef<string | null>(key)
  const initializedFor = useRef<string | null>(null)
  const conflictRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** What the last successful save returned, so its refetch is not a conflict. */
  const landedRef = useRef<T | undefined>(undefined)
  const optionsRef = useRef({ validate, save, autosave, autosaveMs, describeError })
  const [baseline, setBaselineState] = useState<T | undefined>(undefined)
  useEffect(() => {
    optionsRef.current = { validate, save, autosave, autosaveMs, describeError }
    serverRef.current = server
  })

  const setFields = useCallback((next: T | undefined) => {
    fieldsRef.current = next
    setFieldsState(next)
  }, [])
  /** Wholesale replacement, as opposed to the operator's own keystrokes. */
  const replaceFields = useCallback(
    (next: T | undefined) => {
      setFields(next)
      setGeneration((g) => g + 1)
    },
    [setFields],
  )
  const setBaseline = useCallback((next: T | undefined) => {
    baselineRef.current = next
    setBaselineState(next)
  }, [])
  const setConflictBoth = useCallback((next: boolean) => {
    conflictRef.current = next
    setConflict(next)
  }, [])

  const isDirty = fields !== undefined && baseline !== undefined && !sameFields(fields, baseline)

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const onLanded = useCallback(
    (landedKey: string, landed: T, snapshot: T) => {
      if (keyRef.current !== landedKey) return
      landedRef.current = landed
      const previousBaseline = baselineRef.current
      setBaseline(landed)
      if (sameFields(fieldsRef.current, snapshot)) replaceFields(landed)
      if (sameFields(serverRef.current, previousBaseline) || sameFields(serverRef.current, landed)) setConflictBoth(false)
    },
    [setBaseline, replaceFields, setConflictBoth],
  )

  /** Saves what the hook currently shows for the current key. */
  const runSave = useCallback(async function saveCurrent(force = false): Promise<boolean> {
    const currentKey = keyRef.current
    const snapshot = fieldsRef.current
    const base = baselineRef.current
    if (!currentKey || snapshot === undefined || base === undefined) return Promise.resolve(false)
    if (conflictRef.current) return Promise.resolve(false)
    const { validate: isValid, save: perform, describeError: describe } = optionsRef.current
    const ok = await performSave<T>({ key: currentKey, snapshot, baseline: base, force, validate: isValid, save: perform, describeError: describe, onLanded })
    if (!ok) return false
    // Save-before-navigation also includes edits typed while the request ran.
    if (keyRef.current === currentKey && !conflictRef.current && fieldsRef.current && baselineRef.current && !sameFields(fieldsRef.current, baselineRef.current)) return saveCurrent()
    return true
  }, [onLanded])

  const schedule = useCallback(() => {
    clearTimer()
    const { autosave: enabled, autosaveMs: delay } = optionsRef.current
    if (!enabled || conflictRef.current) return
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      void runSave()
    }, delay)
  }, [clearTimer, runSave])

  /** A pending background save for the entity being left still goes out. */
  const flushPending = useCallback(() => {
    if (!timerRef.current) return
    clearTimer()
    if (optionsRef.current.autosave) void runSave()
  }, [clearTimer, runSave])

  // New key: flush the previous entity, forget it and load the new draft.
  // The draft arrives asynchronously from storage, so this reconciliation is
  // effect-driven by design; the resets below are the key switch itself.
  useEffect(() => {
    flushPending()
    keyRef.current = key
    initializedFor.current = null
    landedRef.current = undefined
    setBaseline(undefined)
    setFields(undefined)
    setConflictBoth(false)
    if (key) void useDraftStore.getState().hydrate(key)
    return () => {
      flushPending()
    }
  }, [key, flushPending, setFields, setConflictBoth, setBaseline])

  // Reconcile the server row with the draft without ever discarding unsaved edits silently.
  useEffect(() => {
    if (!key || !hydrated || server === undefined) return
    const store = useDraftStore.getState()
    const record = store.records[key]
    if (initializedFor.current !== key) {
      initializedFor.current = key
      if (record && !sameFields(record.fields as T, server)) {
        const baselineChanged = !sameFields(server, record.baseline)
        // Reconcile the asynchronously hydrated external store with this editor.
            setBaseline(record.baseline as T)
        replaceFields(record.fields as T)
        setConflictBoth(baselineChanged)
        const existing = store.status[key]
        if (baselineChanged) store.setStatus(key, { state: 'conflict' })
        else {
          if (!existing || (existing.state !== 'error' && existing.state !== 'storage-error')) store.setStatus(key, { state: 'local' })
          schedule()
        }
      } else {
        if (record) store.clear(key)
        setBaseline(server)
        replaceFields(server)
        setConflictBoth(false)
        const existing = store.status[key]
        if (existing && (existing.state === 'local' || existing.state === 'conflict')) store.setStatus(key, { state: 'idle' })
      }
      return
    }
    const current = fieldsRef.current
    const base = baselineRef.current
    if (current === undefined || base === undefined) return
    const dirty = !sameFields(current, base)
    if (!dirty) {
      setBaseline(server)
      replaceFields(server)
      return
    }
    if (sameFields(server, base)) return
    if (sameFields(server, savingFields.get(key))) return
    if (sameFields(server, current)) {
      setBaseline(server)
      setConflictBoth(false)
      store.clear(key)
      const existing = store.status[key]
      if (!existing || existing.state !== 'saved') store.setStatus(key, { state: 'idle' })
      return
    }
    if (landedRef.current !== undefined && sameFields(server, landedRef.current)) {
      // Our save landed while the operator kept typing; continue on top of it.
      setBaseline(server)
      store.write(key, current, server)
      return
    }
    setConflictBoth(true)
    clearTimer()
    store.setStatus(key, { state: 'conflict' })
  }, [key, hydrated, server, replaceFields, setConflictBoth, schedule, clearTimer, setBaseline])

  const update = useCallback(
    (patch: Partial<T> | ((current: T) => T)) => {
      const currentKey = keyRef.current
      const current = fieldsRef.current
      if (!currentKey || current === undefined || baselineRef.current === undefined) return
      const next = typeof patch === 'function' ? (patch as (current: T) => T)(current) : { ...current, ...patch }
      setFields(next)
      const store = useDraftStore.getState()
      if (sameFields(next, baselineRef.current)) {
        clearTimer()
        store.clear(currentKey)
        const existing = store.status[currentKey]
        if (!existing || existing.state === 'local') store.setStatus(currentKey, { state: 'idle' })
        return
      }
      store.write(currentKey, next, baselineRef.current)
      const existing = store.status[currentKey]
      if (!conflictRef.current && (!existing || existing.state !== 'saving')) store.setStatus(currentKey, { state: 'local' })
      schedule()
    },
    [setFields, clearTimer, schedule],
  )

  const saveNow = useCallback(
    (options?: { force?: boolean }) => {
      clearTimer()
      return runSave(!!options?.force)
    },
    [clearTimer, runSave],
  )

  const discard = useCallback(() => {
    const currentKey = keyRef.current
    if (!currentKey) return
    clearTimer()
    const store = useDraftStore.getState()
    store.clear(currentKey)
    const current = serverRef.current
    setBaseline(current)
    replaceFields(current)
    setConflictBoth(false)
    store.setStatus(currentKey, { state: 'idle' })
  }, [clearTimer, replaceFields, setConflictBoth, setBaseline])

  const keepMine = useCallback(() => {
    const currentKey = keyRef.current
    const current = fieldsRef.current
    const latest = serverRef.current
    if (!currentKey || current === undefined || latest === undefined) return
    setBaseline(latest)
    setConflictBoth(false)
    const store = useDraftStore.getState()
    store.write(currentKey, current, latest)
    store.setStatus(currentKey, { state: 'local' })
    schedule()
  }, [setConflictBoth, schedule, setBaseline])

  return { fields, update, status, isDirty, conflict, hydrated, generation, saveNow, discard, keepMine }
}
