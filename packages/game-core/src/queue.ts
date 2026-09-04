import type { ApiError, CheckInResponse, EntityId, SubmissionResponse } from '@pointfinder/api'

/**
 * Offline action queue for the player.
 *
 * A check-in or a submission made without connectivity is stored here and
 * replayed later, check-ins first, oldest first. Nothing is ever dropped
 * silently: an action the server refuses is marked `failed` with its reason
 * and stays visible until a person decides. The action id doubles as the
 * submission idempotency key, so a replay after a timeout is not a duplicate.
 */

export type PendingActionType = 'check_in' | 'submission'
export type PendingActionState = 'pending' | 'in_flight' | 'failed'

export interface PendingActionBase {
  /** UUID. Also the idempotency key for submissions. */
  id: string
  gameId: EntityId
  baseId: EntityId
  createdAt: string
  attempts: number
  /** Earliest time the next attempt may run, epoch ms. */
  nextAttemptAt: number
  state: PendingActionState
  lastError?: string | null
  lastErrorCode?: string | null
}

export interface PendingCheckIn extends PendingActionBase {
  type: 'check_in'
  nfcToken: string
}

export interface PendingSubmission extends PendingActionBase {
  type: 'submission'
  challengeId: EntityId
  answer: string
  fileUrls?: string[] | null
}

export type PendingAction = PendingCheckIn | PendingSubmission

export interface QueueStore {
  list(): Promise<PendingAction[]>
  upsert(action: PendingAction): Promise<void>
  remove(id: string): Promise<void>
}

export interface QueueExecutor {
  checkIn(action: PendingCheckIn): Promise<CheckInResponse>
  submit(action: PendingSubmission): Promise<SubmissionResponse>
}

export type SyncOutcome =
  | { id: string; result: 'synced'; response?: unknown }
  | { id: string; result: 'retry_later'; inMs: number; error: string }
  | { id: string; result: 'failed'; error: string; code?: string | null }
  | { id: string; result: 'auth_required' }

export interface SyncReport {
  ran: boolean
  outcomes: SyncOutcome[]
  /** True when a 401 stopped the run; the session must be fixed before syncing again. */
  authRequired: boolean
}

export interface OfflineQueueOptions {
  store: QueueStore
  executor: QueueExecutor
  now?: () => number
  /** Backoff cap for retryable failures. */
  maxBackoffMs?: number
  /** Error codes that mean the server already has this action. Treated as synced. */
  alreadyDoneCodes?: readonly string[]
}

const DEFAULT_ALREADY_DONE: readonly string[] = ['MANUAL_CHECKIN_ALREADY_CHECKED_IN']

export class OfflineQueue {
  private syncing: Promise<SyncReport> | null = null
  private readonly listeners = new Set<() => void>()
  private readonly now: () => number

  constructor(private readonly options: OfflineQueueOptions) {
    this.now = options.now ?? (() => Date.now())
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async list(): Promise<PendingAction[]> {
    return sortForSync(await this.options.store.list())
  }

  async pendingCount(): Promise<number> {
    return (await this.options.store.list()).filter((a) => a.state !== 'failed').length
  }

  async failedCount(): Promise<number> {
    return (await this.options.store.list()).filter((a) => a.state === 'failed').length
  }

  async enqueueCheckIn(input: { id: string; gameId: EntityId; baseId: EntityId; nfcToken: string }): Promise<PendingCheckIn> {
    const existing = (await this.options.store.list()).find(
      (a): a is PendingCheckIn => a.type === 'check_in' && a.gameId === input.gameId && a.baseId === input.baseId && a.state !== 'failed',
    )
    if (existing) return existing
    const action: PendingCheckIn = { type: 'check_in', ...input, ...fresh(this.now()) }
    await this.options.store.upsert(action)
    this.emit()
    return action
  }

  async enqueueSubmission(input: {
    id: string
    gameId: EntityId
    baseId: EntityId
    challengeId: EntityId
    answer: string
    fileUrls?: string[] | null
  }): Promise<PendingSubmission> {
    const action: PendingSubmission = { type: 'submission', ...input, ...fresh(this.now()) }
    await this.options.store.upsert(action)
    this.emit()
    return action
  }

  /** Put a failed action back in line, e.g. after the player fixed the cause. */
  async retry(id: string): Promise<void> {
    const a = (await this.options.store.list()).find((x) => x.id === id)
    if (!a) return
    await this.options.store.upsert({ ...a, state: 'pending', attempts: 0, nextAttemptAt: 0, lastError: null, lastErrorCode: null })
    this.emit()
  }

  async discard(id: string): Promise<void> {
    await this.options.store.remove(id)
    this.emit()
  }

  /**
   * Replay everything that is due. Concurrent calls share one run.
   * Stops at the first 401 so a dead session does not burn the backoff of
   * every queued action.
   */
  sync(): Promise<SyncReport> {
    if (this.syncing) return this.syncing
    this.syncing = this.run().finally(() => {
      this.syncing = null
    })
    return this.syncing
  }

  private async run(): Promise<SyncReport> {
    const outcomes: SyncOutcome[] = []
    const actions = sortForSync(await this.options.store.list())
    const now = this.now()
    for (const action of actions) {
      if (action.state === 'failed') continue
      if (action.nextAttemptAt > now) continue
      await this.options.store.upsert({ ...action, state: 'in_flight' })
      let error: unknown = null
      let response: unknown = undefined
      try {
        if (action.type === 'check_in') response = await this.options.executor.checkIn(action)
        else response = await this.options.executor.submit(action)
      } catch (e) {
        error = e
      }
      if (error === null) {
        await this.options.store.remove(action.id)
        outcomes.push({ id: action.id, result: 'synced', response })
        this.emit()
        continue
      }
      const cls = classify(error, this.options.alreadyDoneCodes ?? DEFAULT_ALREADY_DONE)
      if (cls.kind === 'already_done') {
        await this.options.store.remove(action.id)
        outcomes.push({ id: action.id, result: 'synced' })
        this.emit()
        continue
      }
      if (cls.kind === 'auth') {
        await this.options.store.upsert({ ...action, state: 'pending' })
        outcomes.push({ id: action.id, result: 'auth_required' })
        this.emit()
        return { ran: true, outcomes, authRequired: true }
      }
      const attempts = action.attempts + 1
      if (cls.kind === 'retry') {
        const inMs = backoffMs(attempts, this.options.maxBackoffMs)
        await this.options.store.upsert({
          ...action,
          state: 'pending',
          attempts,
          nextAttemptAt: this.now() + inMs,
          lastError: cls.message,
          lastErrorCode: cls.code ?? null,
        })
        outcomes.push({ id: action.id, result: 'retry_later', inMs, error: cls.message })
      } else {
        await this.options.store.upsert({
          ...action,
          state: 'failed',
          attempts,
          lastError: cls.message,
          lastErrorCode: cls.code ?? null,
        })
        outcomes.push({ id: action.id, result: 'failed', error: cls.message, code: cls.code ?? null })
      }
      this.emit()
    }
    return { ran: true, outcomes, authRequired: false }
  }

  private emit() {
    for (const l of this.listeners) l()
  }
}

function fresh(nowMs: number) {
  return { createdAt: new Date(nowMs).toISOString(), attempts: 0, nextAttemptAt: 0, state: 'pending' as const, lastError: null, lastErrorCode: null }
}

/** Check-ins before submissions, then oldest first. A submission depends on its base's check-in. */
export function sortForSync(actions: PendingAction[]): PendingAction[] {
  return [...actions].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'check_in' ? -1 : 1
    return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0
  })
}

/** 2s, 4s, 8s ... capped. */
export function backoffMs(attempts: number, capMs = 60_000): number {
  return Math.min(capMs, 2000 * 2 ** Math.min(Math.max(attempts, 1) - 1, 10))
}

type Classification =
  | { kind: 'retry'; message: string; code?: string }
  | { kind: 'fail'; message: string; code?: string }
  | { kind: 'already_done' }
  | { kind: 'auth' }

function classify(error: unknown, alreadyDone: readonly string[]): Classification {
  const e = error as Partial<ApiError> & { message?: string }
  const code = typeof e?.code === 'string' ? e.code : undefined
  const status = typeof e?.status === 'number' ? e.status : undefined
  const message = typeof e?.message === 'string' && e.message ? e.message : 'Unknown error'
  if (code && alreadyDone.includes(code)) return { kind: 'already_done' }
  if (status === 401 || code === 'UNAUTHENTICATED') return { kind: 'auth' }
  if (e?.retryable === true) return { kind: 'retry', message, code }
  if (status === undefined) return { kind: 'retry', message, code }
  return { kind: 'fail', message, code }
}

/** In-memory store for tests and desktop development. */
export class MemoryQueueStore implements QueueStore {
  private items = new Map<string, PendingAction>()
  async list() {
    return [...this.items.values()]
  }
  async upsert(a: PendingAction) {
    this.items.set(a.id, a)
  }
  async remove(id: string) {
    this.items.delete(id)
  }
}
