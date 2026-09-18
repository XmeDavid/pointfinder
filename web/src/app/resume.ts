import { kv } from '@/platform'
import { isNative } from '@/platform/runtime'

/**
 * OW-38: where the app was when it went away.
 *
 * On a phone the WebView or the whole process can be killed while the app is
 * in the background. The next launch loads `/`, which would land on Home even
 * though the operator was editing a base or a player was on the map. This
 * module records the last authorized screen, together with who was signed in,
 * so the cold start can return there. It never restores into a screen the
 * current session does not own, an explicit sign-out clears it, and a deep
 * link delivered at launch still navigates afterwards and therefore wins.
 *
 * Storage goes through the platform key-value boundary (SQLite on phones).
 * Nothing here touches the offline queue, drafts or session secrets.
 */
export interface ResumeIdentity {
  /** Operator store user id, when an operator session is live. */
  userId: string | null
  /** Player session id, when a game is joined. */
  playerId: string | null
  /** Whether an account session (player-entry sign-in) is live. */
  accountId: string | null
}

export interface ResumeRecord {
  path: string
  userId: string | null
  playerId: string | null
  accountId?: string | null
  at: number
}

const KEY = 'resume.location'
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

let preloaded: ResumeRecord | null = null
let consumed = false
let writes: Promise<void> = Promise.resolve()
let enabledOverride: boolean | null = null

function enabled(): boolean {
  return enabledOverride ?? isNative()
}

/** Test seam: force resume on/off regardless of the runtime. */
export function __setResumeEnabledForTests(value: boolean | null): void {
  enabledOverride = value
  if (value === null) {
    preloaded = null
    consumed = false
  }
}

const OPERATOR_PREFIXES = ['/game/', '/org/', '/tutorials', '/admin']
const ACCOUNT_PREFIXES = ['/dashboard', '/profile']
const PLAYER_PREFIXES = ['/map', '/list', '/base/', '/settings', '/inbox', '/documents', '/account']

type Owner = 'operator' | 'account' | 'player' | null

function ownerOf(path: string): Owner {
  const pathname = path.split('?')[0]
  const matches = (prefixes: string[]) => prefixes.some((p) => pathname === p.replace(/\/$/, '') || pathname.startsWith(p.endsWith('/') ? p : p + '/'))
  if (matches(OPERATOR_PREFIXES)) return 'operator'
  if (matches(ACCOUNT_PREFIXES)) return 'account'
  if (matches(PLAYER_PREFIXES)) return 'player'
  return null
}

/** Only screens behind a session are worth returning to; entry, auth, tag and billing paths are not. */
export function isResumablePath(path: string): boolean {
  return ownerOf(path) !== null
}

/** Reads the record written by the previous run. Call once before the router renders. */
export async function preloadResumeTarget(): Promise<void> {
  preloaded = null
  consumed = false
  if (!enabled()) return
  await writes
  try {
    const raw = await kv.get(KEY)
    if (!raw) return
    const parsed = JSON.parse(raw) as ResumeRecord
    if (parsed && typeof parsed.path === 'string' && typeof parsed.at === 'number') preloaded = parsed
  } catch {
    preloaded = null
  }
}

/** Test seam: what a previous run would have left behind. */
export function __setPreloadedForTests(record: ResumeRecord | null): void {
  preloaded = record
  consumed = false
}

function identityOwns(record: ResumeRecord, identity: ResumeIdentity): boolean {
  switch (ownerOf(record.path)) {
    case 'operator':
      return !!record.userId && identity.userId === record.userId
    case 'player':
      return !!record.playerId && identity.playerId === record.playerId
    case 'account':
      return (!!record.userId && identity.userId === record.userId) || (!!record.playerId && identity.playerId === record.playerId) || (!!record.accountId && identity.accountId === record.accountId)
    default:
      return false
  }
}

/**
 * The screen to return to on a cold start at `/`, or null. Does not consume:
 * call `consumeResumeTarget` once the navigation has been issued.
 */
export function resumeTarget(identity: ResumeIdentity): string | null {
  if (!enabled() || consumed || !preloaded) return null
  if (Date.now() - preloaded.at > MAX_AGE_MS) return null
  if (!isResumablePath(preloaded.path)) return null
  if (!identityOwns(preloaded, identity)) return null
  return preloaded.path
}

export function consumeResumeTarget(): void {
  consumed = true
}

/** Remembers the current screen for the next launch. Cheap to call on every navigation. */
export function recordResumeLocation(path: string, identity: ResumeIdentity): void {
  if (!enabled()) return
  if (!isResumablePath(path)) return
  const owner = ownerOf(path)
  if (owner === 'operator' && !identity.userId) return
  if (owner === 'player' && !identity.playerId) return
  if (owner === 'account' && !identity.userId && !identity.playerId && !identity.accountId) return
  // Entry proofs are consumed by tag intake, never replayed by screen recovery.
  const url = new URL(path, 'https://pointfinder.invalid')
  url.searchParams.delete('token')
  const record: ResumeRecord = { path: url.pathname + url.search, userId: identity.userId, playerId: identity.playerId, accountId: identity.accountId, at: Date.now() }
  writes = writes.then(() => kv.set(KEY, JSON.stringify(record))).catch(() => {})
}

/** Explicit sign-out, auth expiry or leaving a game: the next launch opens Home. */
export function clearResumeLocation(): void {
  preloaded = null
  consumed = true
  if (!enabled()) return
  writes = writes.then(() => kv.remove(KEY)).catch(() => {})
}

/** Await persisted navigation before a test simulates a new process. */
export async function __flushResumeWriteForTests(): Promise<void> {
  await writes
}
