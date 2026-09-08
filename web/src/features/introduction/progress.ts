/**
 * The account-level introduction ("How PointFinder works").
 *
 * Three pieces of state, kept deliberately apart:
 *
 * - **Server row** `introduction` in `/users/me/tutorials`: the account's own
 *   status, so a registration on one device is picked up by a sign-in on any
 *   other. It is separate from the `first-game` guided tutorial and never marks
 *   that scenario done.
 * - **Anonymous handoff** (local): what a visitor watched or skipped before
 *   they had an account. Claimed by the next registration or sign-in on this
 *   device before any request goes out, so it can never leak into a second
 *   account on a shared device, even when that first sign-in's read fails.
 * - **Local per-account fallback**: the last status this device wrote for a
 *   user id, plus whether that write is still owed to the server. An owed
 *   decision of the account's own outranks a stale server read; an owed
 *   handoff is settled against the server row on the next sign-in. Only an
 *   unreadable server falls back to it for the routing decision.
 *
 * Every function captures the session it started in and stops writing or
 * redirecting once that session is gone: a sign-out or account switch during
 * an await can never write the old account's progress into the new one.
 */
import { kv } from '@/platform'
import apiClient from '@/lib/api/client'
import { useAuthStore } from '@/lib/auth/store'

export const INTRODUCTION_SCENARIO = 'introduction'
export type IntroductionStatus = 'in_progress' | 'completed' | 'skipped'
export type IntroductionOutcome = Exclude<IntroductionStatus, 'in_progress'>

export interface IntroductionRow {
  scenarioId: string
  status: IntroductionStatus
  currentStep: string | null
  gameId: string | null
  startedAt: string
  completedAt: string | null
}

export interface IntroductionHandoff {
  status: IntroductionOutcome
  at: string
}

export interface IntroductionLocalRecord {
  status: IntroductionStatus
  /** True while the server has not confirmed this status. */
  pending: boolean
  /** True when the status came from the anonymous handoff rather than from this account's own decision. */
  handoff?: boolean
}

export const INTRODUCTION_HANDOFF_KEY = 'introduction.handoff.v1'
export const introductionLocalKey = (userId: string) => `introduction.account.${userId}.v1`

export const DASHBOARD_ROUTE = '/dashboard'
/** The account gate: take a quick tour, or go to the dashboard. */
export const WELCOME_ROUTE = '/welcome'
/** Straight into the organizer story, no gate. */
export const INTRODUCTION_PLAY_ROUTE = '/welcome?play=organizer'

export const isDecided = (status: IntroductionStatus | null | undefined): boolean =>
  status === 'completed' || status === 'skipped'

const isStatus = (value: unknown): value is IntroductionStatus =>
  value === 'in_progress' || value === 'completed' || value === 'skipped'

export const introductionApi = {
  /** The caller's introduction row, or null when the account never touched it. */
  get: async (): Promise<IntroductionRow | null> => {
    const { data } = await apiClient.get<IntroductionRow[]>('/users/me/tutorials')
    return data.find((row) => row.scenarioId === INTRODUCTION_SCENARIO) ?? null
  },
  update: async (status: IntroductionStatus): Promise<IntroductionRow> => {
    const { data } = await apiClient.put<IntroductionRow>(`/users/me/tutorials/${INTRODUCTION_SCENARIO}`, {
      status,
      currentStep: null,
      gameId: null,
    })
    return data
  },
}

/**
 * The operator session a flow started in. Requests carry whatever session is
 * current, so once this one is gone nothing more may be written or decided.
 */
interface Session {
  userId: string
  current: () => boolean
}

function captureSession(userId: string): Session {
  const version = useAuthStore.getState().sessionVersion
  return {
    userId,
    current: () => {
      const state = useAuthStore.getState()
      return state.isAuthenticated && state.user?.id === userId && state.sessionVersion === version
    },
  }
}

async function readJson<T>(key: string, guard: (value: unknown) => value is T): Promise<T | null> {
  try {
    const raw = await kv.get(key)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    return guard(parsed) ? parsed : null
  } catch {
    return null
  }
}

const isHandoff = (value: unknown): value is IntroductionHandoff =>
  !!value && typeof value === 'object' && ((value as { status?: unknown }).status === 'completed' || (value as { status?: unknown }).status === 'skipped')

const isLocalRecord = (value: unknown): value is IntroductionLocalRecord =>
  !!value && typeof value === 'object' && isStatus((value as { status?: unknown }).status) && typeof (value as { pending?: unknown }).pending === 'boolean'

export const readHandoff = (): Promise<IntroductionHandoff | null> => readJson(INTRODUCTION_HANDOFF_KEY, isHandoff)

export async function writeHandoff(status: IntroductionOutcome): Promise<void> {
  const handoff: IntroductionHandoff = { status, at: new Date().toISOString() }
  await kv.set(INTRODUCTION_HANDOFF_KEY, JSON.stringify(handoff)).catch(() => { /* Nonessential preference. */ })
}

export async function clearHandoff(): Promise<void> {
  await kv.remove(INTRODUCTION_HANDOFF_KEY).catch(() => { /* Nonessential preference. */ })
}

export const readLocal = (userId: string): Promise<IntroductionLocalRecord | null> => readJson(introductionLocalKey(userId), isLocalRecord)

async function writeLocal(session: Session, record: IntroductionLocalRecord): Promise<void> {
  if (!session.current()) return
  await kv.set(introductionLocalKey(session.userId), JSON.stringify(record)).catch(() => { /* Nonessential preference. */ })
}

/** An owed decision this account made itself; it outranks whatever the server still says. */
const owedOwnDecision = (local: IntroductionLocalRecord | null): boolean =>
  !!local && local.pending && !local.handoff && isDecided(local.status)

/**
 * Moves the anonymous handoff into this account's local record and clears it,
 * before any request goes out. An owed decision of the account's own is not
 * replaced; the handoff is then simply spent.
 */
async function claimHandoff(session: Session): Promise<void> {
  if (!session.current()) return
  const handoff = await readHandoff()
  if (!handoff || !session.current()) return
  await clearHandoff()
  const local = await readLocal(session.userId)
  if (owedOwnDecision(local)) return
  await writeLocal(session, { status: handoff.status, pending: true, handoff: true })
}

async function write(session: Session, status: IntroductionStatus, fromHandoff: boolean): Promise<boolean> {
  if (!session.current()) return false
  // Remember the decision before the request: closing the tab or losing the
  // session while it is in flight must not lose an unsaved completion.
  await writeLocal(session, { status, pending: true, ...(fromHandoff ? { handoff: true } : {}) })
  if (!session.current()) return false
  try {
    await introductionApi.update(status)
    if (!session.current()) return false
    await writeLocal(session, { status, pending: false })
    return session.current()
  } catch {
    await writeLocal(session, { status, pending: true, handoff: fromHandoff || undefined })
    return false
  }
}

/**
 * Writes the account's own decision to the server. A failed write is remembered
 * locally as owed, so the next sign-in on this device retries it; the caller
 * never has to surface the failure. Nothing is written once the session is gone.
 */
export function recordIntroduction(userId: string, status: IntroductionStatus): Promise<boolean> {
  return write(captureSession(userId), status, false)
}

/** Retries a decision of the account's own that this device still owes. */
async function retryOwnPendingWrite(session: Session): Promise<void> {
  const local = await readLocal(session.userId)
  if (local?.pending && !local.handoff) await write(session, local.status, false)
}

/**
 * Where a sign-in lands, or null when the session changed underneath it. The
 * server row decides; an owed decision of the account's own outranks a stale
 * read; a claimed handoff fills in a missing row once; and only an unreadable
 * server falls back to what this device holds. Nothing here forces the story:
 * an undecided account gets the gate, which offers the dashboard beside the tour.
 */
export async function resolvePostLoginRoute(userId: string): Promise<string | null> {
  const session = captureSession(userId)
  await claimHandoff(session)
  await retryOwnPendingWrite(session)
  if (!session.current()) return null
  const local = await readLocal(userId)
  if (!session.current()) return null

  let row: IntroductionRow | null
  try {
    row = await introductionApi.get()
  } catch {
    if (!session.current()) return null
    // A decision or a watched handoff this device holds is honoured; only an
    // introduction that was merely started is offered again.
    return local?.status === 'in_progress' && !local.handoff ? WELCOME_ROUTE : DASHBOARD_ROUTE
  }
  if (!session.current()) return null

  if (owedOwnDecision(local)) return DASHBOARD_ROUTE
  if (row) {
    // The account already has a say; a claimed handoff is moot.
    await writeLocal(session, { status: row.status, pending: false })
    return session.current() ? (isDecided(row.status) ? DASHBOARD_ROUTE : WELCOME_ROUTE) : null
  }
  if (local?.handoff && isDecided(local.status)) {
    await write(session, local.status, true)
    return session.current() ? DASHBOARD_ROUTE : null
  }
  return WELCOME_ROUTE
}

/**
 * Where a fresh registration lands, or null when the session changed
 * underneath it: the organizer story, unless the visitor already watched or
 * skipped it anonymously on this device. The row is written first so another
 * device sees the introduction as started.
 */
export async function resolvePostRegistrationRoute(userId: string): Promise<string | null> {
  const session = captureSession(userId)
  await claimHandoff(session)
  if (!session.current()) return null
  const local = await readLocal(userId)
  if (local?.handoff && isDecided(local.status)) {
    await write(session, local.status, true)
    return session.current() ? DASHBOARD_ROUTE : null
  }
  await write(session, 'in_progress', false)
  return session.current() ? INTRODUCTION_PLAY_ROUTE : null
}
