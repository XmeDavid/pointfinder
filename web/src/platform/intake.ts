/** One native event bridge per process. Route remounts must not re-consume launch data. */
export function createNativeIntake<T>(initialize: (emit: (value: T) => void) => Promise<void>) {
  const listeners = new Set<{ handler: (value: T) => void; signal?: AbortSignal }>()
  let started: Promise<void> | undefined
  let pending: { value: T } | undefined
  const emit = (value: T) => {
    const active = [...listeners].filter((listener) => !listener.signal?.aborted)
    if (!active.length) { pending = { value }; return }
    pending = undefined
    for (const listener of active) listener.handler(value)
  }
  return async (handler: (value: T) => void, options: { signal?: AbortSignal } = {}): Promise<() => void> => {
    if (options.signal?.aborted) return () => {}
    const listener = { handler, signal: options.signal }
    const off = () => { listeners.delete(listener); options.signal?.removeEventListener('abort', off) }
    listeners.add(listener)
    options.signal?.addEventListener('abort', off, { once: true })
    started ??= initialize(emit).catch((error) => { started = undefined; throw error })
    try {
      await started
      if (pending) emit(pending.value)
      return off
    } catch (error) { off(); throw error }
  }
}
