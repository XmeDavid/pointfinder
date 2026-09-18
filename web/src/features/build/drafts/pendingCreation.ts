import { kv } from '@/platform'

/**
 * A challenge creation started from a base whose outcome is not yet certain.
 *
 * "Create empty challenge" is two requests: create the challenge, then link it
 * to the base. Either can be interrupted (offline, a killed WebView, a failed
 * link). The record below is written before the first request and carries the
 * idempotency key the server uses to return the same challenge on a retry, so
 * a repeat never leaves a second empty challenge behind. It is scoped by
 * account, game and base and removed once the challenge is linked and open.
 */
export interface PendingChallengeCreation {
  idempotencyKey: string
  /** Set once the create request has succeeded, even if linking has not. */
  challengeId: string | null
  startedAt: number
}

const PREFIX = 'pf.pending-challenge:'
/** In-memory copy for this session; storage must succeed before a create request may start. */
const memory = new Map<string, PendingChallengeCreation>()

export function pendingCreationKey(accountId: string | null | undefined, gameId: string, baseId: string): string {
  return `${PREFIX}${accountId || 'anonymous'}:${gameId}:${baseId}`
}

export async function loadPendingCreation(key: string): Promise<PendingChallengeCreation | null> {
  const cached = memory.get(key)
  if (cached) return cached
  const raw = await kv.get(key)
  if (!raw) return null
  const parsed = JSON.parse(raw) as PendingChallengeCreation
  if (!parsed || typeof parsed.idempotencyKey !== 'string') throw new Error('Invalid saved challenge operation')
  const record = { idempotencyKey: parsed.idempotencyKey, challengeId: parsed.challengeId ?? null, startedAt: parsed.startedAt ?? 0 }
  memory.set(key, record)
  return record
}

export async function savePendingCreation(key: string, record: PendingChallengeCreation): Promise<void> {
  await kv.set(key, JSON.stringify(record))
  memory.set(key, record)
}

export async function clearPendingCreation(key: string): Promise<void> {
  await kv.remove(key)
  memory.delete(key)
}

/** Test helper. */
export function resetPendingCreations(): void {
  memory.clear()
}

export function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  bytes[6] = (bytes[6] & 15) | 64
  bytes[8] = (bytes[8] & 63) | 128
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** Called only when the operator begins a new creation attempt. */
export function newPendingCreation(): PendingChallengeCreation {
  return { idempotencyKey: newIdempotencyKey(), challengeId: null, startedAt: Date.now() }
}
