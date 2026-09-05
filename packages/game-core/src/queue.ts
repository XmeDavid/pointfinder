import type { ApiError, CheckInResponse, EntityId, SubmissionResponse } from '@pointfinder/api'
import type { CheckInProof } from './proof'

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
  /** Owner of persisted work. Optional only for migration of pre-consolidation records. */
  playerId?: EntityId
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
  lastErrorDetails?: Record<string, string>
}

export interface PendingCheckIn extends PendingActionBase {
  type: 'check_in'
  /** The whole proof, so a queued arrival replays exactly the fix that was taken. */
  proof: CheckInProof
  /** Pending earlier route check-ins that must sync before this proof. */
  prerequisiteCheckInIds?: string[]
}

export interface PendingSubmission extends PendingActionBase {
  type: 'submission'
  challengeId: EntityId
  answer: string
  fileUrls?: string[] | null
  media?: PendingMedia[]
}

/** The bytes live in app-owned storage; only recoverable metadata goes in the queue. */
export interface PendingMedia {
  id: string
  name: string
  contentType: string
  size: number
  uploadedBytes: number
  sessionId?: string
  fileUrl?: string
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
  | { id: string; result: 'failed'; error: string; code?: string | null; details?: Record<string, string> }
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
  /** Best-effort cleanup after the action has been durably removed. */
  onRemoved?: (action: PendingAction) => Promise<void>
  owner?: () => string | null
}

const DEFAULT_ALREADY_DONE: readonly string[] = ['MANUAL_CHECKIN_ALREADY_CHECKED_IN']

export class OfflineQueue {
  private syncing: Promise<SyncReport> | null = null
  private readonly listeners = new Set<() => void>()
  private readonly now: () => number

  constructor(private readonly options: OfflineQueueOptions) {
    this.now = options.now ?? (() => Date.now())
  }

  /** Every read of the durable store goes through here, so old rows arrive in today's shape. */
  private async stored(): Promise<PendingAction[]> {
    return (await this.options.store.list()).map(normalizeAction)
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async list(): Promise<PendingAction[]> {
    return sortForSync(await this.stored())
  }

  async pendingCount(): Promise<number> {
    return (await this.stored()).filter((a) => a.state !== 'failed').length
  }

  async failedCount(): Promise<number> {
    return (await this.stored()).filter((a) => a.state === 'failed').length
  }

  async enqueueCheckIn(input: { id: string; gameId: EntityId; baseId: EntityId; proof: CheckInProof; prerequisiteCheckInIds?: string[] }): Promise<PendingCheckIn> {
    const owner = this.options.owner?.()
    const actions = await this.stored()
    const existing = actions.find(
      (a): a is PendingCheckIn => a.type === 'check_in' && a.gameId === input.gameId && a.baseId === input.baseId && a.state !== 'failed',
    )
    this.requireSameOwner(owner)
    if (existing) return existing
    const action: PendingCheckIn = { type: 'check_in', ...input, ...fresh(this.now()), ...(owner ? { playerId: owner } : {}) }
    await this.options.store.upsert(action)
    // A fresh tag scan supersedes refused proofs at this base. Preserve their dependent
    // failures: those later scans happened before the prerequisite was accepted.
    for (const previous of actions) {
      if (previous.type !== 'check_in' || previous.gameId !== input.gameId || previous.baseId !== input.baseId || previous.state !== 'failed') continue
      await this.failRouteDependents(previous.id)
      await this.options.store.remove(previous.id)
      await this.options.onRemoved?.(previous).catch(() => {})
    }
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
    media?: PendingMedia[]
  }): Promise<PendingSubmission> {
    const owner = this.options.owner?.()
    const existing = (await this.stored()).find((a) => a.id === input.id)
    this.requireSameOwner(owner)
    if (existing?.type === 'submission') return existing
    const action: PendingSubmission = { type: 'submission', ...input, ...fresh(this.now()), ...(owner ? { playerId: owner } : {}) }
    await this.options.store.upsert(action)
    this.emit()
    return action
  }

  /** Put a failed action back in line, e.g. after the player fixed the cause. */
  async retry(id: string): Promise<void> {
    const a = (await this.stored()).find((x) => x.id === id)
    if (!a || requiresRescan(a)) return
    await this.options.store.upsert({ ...a, state: 'pending', attempts: 0, nextAttemptAt: 0, lastError: null, lastErrorCode: null })
    this.emit()
  }

  async discard(id: string): Promise<void> {
    const action = (await this.stored()).find((a) => a.id === id)
    if (!action) return
    if (this.syncing && action.state === 'in_flight') throw new Error('Cannot discard an action while it is syncing')
    // A discarded prerequisite did not reach the server; its later proofs must be rescanned.
    await this.failRouteDependents(id)
    await this.options.store.remove(id)
    await this.options.onRemoved?.(action).catch(() => {})
    this.emit()
  }

  /** Upload progress is persisted before notifying subscribers. */
  async updateMedia(id: string, media: PendingMedia[]): Promise<void> {
    const action = (await this.stored()).find((a) => a.id === id)
    if (!action || action.type !== 'submission') throw new Error('Submission is no longer available')
    await this.options.store.upsert({ ...action, media })
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
    const actions = sortForSync(await this.stored())
    const now = this.now()
    for (const action of actions) {
      if (action.type === 'check_in' && action.prerequisiteCheckInIds?.length) {
        const remaining = await this.stored()
        const dependencies = remaining.filter((a) => action.prerequisiteCheckInIds?.includes(a.id))
        if (dependencies.some((a) => a.state === 'failed')) {
          await this.failRouteDependents(dependencies.find((a) => a.state === 'failed')!.id)
          continue
        }
        if (dependencies.length) continue
      }
      // A check-in failure must not let its dependent submission run ahead.
      if (action.type === 'submission' && (await this.stored()).some((a) => a.type === 'check_in' && a.gameId === action.gameId && a.baseId === action.baseId)) continue
      if (!(await this.stored()).some((a) => a.id === action.id && a.state !== 'failed')) continue
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
        await this.options.onRemoved?.(action).catch(() => {})
        outcomes.push({ id: action.id, result: 'synced', response })
        this.emit()
        continue
      }
      const cls = classify(error, this.options.alreadyDoneCodes ?? DEFAULT_ALREADY_DONE)
      // Preserve upload checkpoints written by the executor during this attempt.
      const current = (await this.stored()).find((a) => a.id === action.id) ?? action
      if (cls.kind === 'already_done') {
        await this.options.store.remove(action.id)
        await this.options.onRemoved?.(action).catch(() => {})
        outcomes.push({ id: action.id, result: 'synced' })
        this.emit()
        continue
      }
      if (cls.kind === 'auth') {
        await this.options.store.upsert({ ...current, state: 'pending' })
        outcomes.push({ id: action.id, result: 'auth_required' })
        this.emit()
        return { ran: true, outcomes, authRequired: true }
      }
      const attempts = action.attempts + 1
      if (cls.kind === 'retry') {
        const inMs = backoffMs(attempts, this.options.maxBackoffMs)
        await this.options.store.upsert({
          ...current,
          state: 'pending',
          attempts,
          nextAttemptAt: this.now() + inMs,
          lastError: cls.message,
          lastErrorCode: cls.code ?? null,
          lastErrorDetails: cls.details,
        })
        outcomes.push({ id: action.id, result: 'retry_later', inMs, error: cls.message })
      } else {
        await this.options.store.upsert({
          ...current,
          state: 'failed',
          attempts,
          lastError: cls.message,
          lastErrorCode: cls.code ?? null,
          lastErrorDetails: cls.details,
        })
        outcomes.push({ id: action.id, result: 'failed', error: cls.message, code: cls.code ?? null, details: cls.details })
        await this.failRouteDependents(action.id)
      }
      this.emit()
    }
    return { ran: true, outcomes, authRequired: false }
  }

  private async failRouteDependents(id: string): Promise<void> {
    const actions = await this.stored()
    for (const a of actions) {
      if (a.type !== 'check_in' || a.state === 'failed' || !a.prerequisiteCheckInIds?.includes(id)) continue
      await this.options.store.upsert({ ...a, state: 'failed', lastErrorCode: 'PREVIOUS_CHECK_IN_FAILED', lastError: 'A previous check-in could not sync. Scan this tag again after resolving it.' })
      await this.failRouteDependents(a.id)
    }
    this.emit()
  }

  private emit() {
    for (const l of this.listeners) l()
  }

  private requireSameOwner(owner: string | null | undefined) {
    if (this.options.owner && (!owner || owner !== this.options.owner())) {
      throw Object.assign(new Error('Player session changed while queuing an action'), { status: 401, code: 'UNAUTHENTICATED' })
    }
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
  | { kind: 'retry'; message: string; code?: string; details?: Record<string, string> }
  | { kind: 'fail'; message: string; code?: string; details?: Record<string, string> }
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
  return { kind: 'fail', message, code, details: e.fieldErrors }
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

/** A refused route proof may only be replaced by a fresh scan at the base. */
export function requiresRescan(action: PendingAction): boolean {
  return action.type === 'check_in' && ['PREVIOUS_BASE_REQUIRED', 'PREVIOUS_CHECK_IN_FAILED'].includes(action.lastErrorCode ?? '')
}

/**
 * Rows written before proofs were typed carry `nfcToken` and no `proof`.
 * They were all tag taps, so that is what they become. Reading is enough:
 * the row is rewritten in today's shape the next time anything touches it.
 */
export function normalizeAction(action: PendingAction): PendingAction {
  if (action.type !== 'check_in') return action
  const legacy = action as PendingCheckIn & { nfcToken?: unknown }
  if (legacy.proof || typeof legacy.nfcToken !== 'string') return action
  const { nfcToken, ...rest } = legacy
  return { ...rest, proof: { type: 'nfc', token: nfcToken } }
}
