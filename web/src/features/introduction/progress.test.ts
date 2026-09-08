import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { tutorialProgressStore } from '@/test/msw/handlers/tutorials'
import { useAuthStore } from '@/lib/auth/store'
import { kv } from '@/platform'
import {
  DASHBOARD_ROUTE,
  INTRODUCTION_HANDOFF_KEY,
  INTRODUCTION_PLAY_ROUTE,
  WELCOME_ROUTE,
  introductionLocalKey,
  readHandoff,
  readLocal,
  recordIntroduction,
  resolvePostLoginRoute,
  resolvePostRegistrationRoute,
  writeHandoff,
} from './progress'

const store = vi.hoisted(() => new Map<string, string>())
vi.mock('@/platform', () => ({
  kv: {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => { store.set(key, value) }),
    remove: vi.fn(async (key: string) => { store.delete(key) }),
  },
}))

const A = { id: 'user-a', email: 'a@example.com', name: 'A', role: 'operator' as const, createdAt: '2026-01-01T00:00:00.000Z' }
const B = { id: 'user-b', email: 'b@example.com', name: 'B', role: 'operator' as const, createdAt: '2026-01-01T00:00:00.000Z' }

/** A token the client will not try to refresh, so requests carry the signed-in account as is. */
const accessToken = `header.${btoa(JSON.stringify({ exp: 4102444800 })).replace(/=+$/, '')}.signature`
function signIn(user: typeof A) {
  useAuthStore.setState({ user, isAuthenticated: true, accessToken, hasHydrated: true, sessionVersion: useAuthStore.getState().sessionVersion + 1 })
}
function signOut() {
  useAuthStore.setState({ user: null, isAuthenticated: false, accessToken: null, sessionVersion: useAuthStore.getState().sessionVersion + 1 })
}
const row = (status: 'in_progress' | 'completed' | 'skipped') =>
  ({ scenarioId: 'introduction' as never, status, currentStep: null, gameId: null, startedAt: '2026-09-08T09:00:00.000Z', completedAt: status === 'completed' ? '2026-09-08T09:01:00.000Z' : null })
const puts = () => tutorialProgressStore.puts().filter((put) => put.scenarioId === 'introduction').map((put) => put.body.status)
const failReads = () => server.use(http.get('/api/users/me/tutorials', () => HttpResponse.error()))
const failWrites = () => server.use(http.put('/api/users/me/tutorials/introduction', () => HttpResponse.error()))
/** A request that only answers when the test says so, to switch accounts underneath it. */
function deferRead(body: () => unknown) {
  let release: () => void = () => {}
  const gate = new Promise<void>((resolve) => { release = resolve })
  server.use(http.get('/api/users/me/tutorials', async () => { await gate; return HttpResponse.json(body()) }))
  return () => release()
}
function deferWrite() {
  let release: () => void = () => {}
  const gate = new Promise<void>((resolve) => { release = resolve })
  let markStarted: () => void = () => {}
  const started = new Promise<void>((resolve) => { markStarted = resolve })
  server.use(http.put('/api/users/me/tutorials/introduction', async ({ request }) => {
    markStarted()
    await gate
    const body = (await request.json()) as { status: 'in_progress' | 'completed' | 'skipped' }
    return HttpResponse.json(row(body.status))
  }))
  return Object.assign(() => release(), { started })
}

beforeEach(() => {
  store.clear()
  tutorialProgressStore.reset()
  signIn(A)
})
afterEach(() => signOut())

describe('sign-in', () => {
  it('sends an account that already watched or skipped straight to the dashboard on a fresh client', async () => {
    tutorialProgressStore.seed([row('completed')])
    expect(await resolvePostLoginRoute(A.id)).toBe(DASHBOARD_ROUTE)
    expect(await readLocal(A.id)).toEqual({ status: 'completed', pending: false })
    expect(puts()).toEqual([])

    tutorialProgressStore.seed([row('skipped')])
    expect(await resolvePostLoginRoute(A.id)).toBe(DASHBOARD_ROUTE)
  })

  it('offers the gate, never the dashboard alone, while nothing was decided', async () => {
    expect(await resolvePostLoginRoute(A.id)).toBe(WELCOME_ROUTE)
    expect(puts()).toEqual([])
    tutorialProgressStore.seed([row('in_progress')])
    expect(await resolvePostLoginRoute(A.id)).toBe(WELCOME_ROUTE)
    expect(await readLocal(A.id)).toEqual({ status: 'in_progress', pending: false })
  })

  it('carries an anonymous preview into the account once, then consumes it', async () => {
    await writeHandoff('completed')
    expect(await resolvePostLoginRoute(A.id)).toBe(DASHBOARD_ROUTE)
    expect(puts()).toEqual(['completed'])
    expect(tutorialProgressStore.rows().map((r) => r.status)).toEqual(['completed'])
    expect(await readHandoff()).toBeNull()
    expect(await readLocal(A.id)).toEqual({ status: 'completed', pending: false })
    // Ordinary sign-ins afterwards do not offer it again.
    expect(await resolvePostLoginRoute(A.id)).toBe(DASHBOARD_ROUTE)
    expect(puts()).toEqual(['completed'])
  })

  it('lets the account row win over a handoff, and still consumes the handoff', async () => {
    tutorialProgressStore.seed([row('completed')])
    await writeHandoff('skipped')
    expect(await resolvePostLoginRoute(A.id)).toBe(DASHBOARD_ROUTE)
    expect(puts()).toEqual([])
    expect(tutorialProgressStore.rows().map((r) => r.status)).toEqual(['completed'])
    expect(await readHandoff()).toBeNull()
    expect(await readLocal(A.id)).toEqual({ status: 'completed', pending: false })
  })

  it('never lets a handoff or a decision leak into another account on the same device', async () => {
    await writeHandoff('completed')
    expect(await resolvePostLoginRoute(A.id)).toBe(DASHBOARD_ROUTE)
    signOut()
    tutorialProgressStore.reset()
    signIn(B)
    expect(await resolvePostLoginRoute(B.id)).toBe(WELCOME_ROUTE)
    expect(await readLocal(B.id)).toBeNull()
    expect(store.has(introductionLocalKey(A.id))).toBe(true)
  })

  it('claims the handoff before reading, so a failed read cannot leave it for the next account', async () => {
    await writeHandoff('skipped')
    failReads()
    expect(await resolvePostLoginRoute(A.id)).toBe(DASHBOARD_ROUTE)
    expect(await readHandoff()).toBeNull()
    expect(await readLocal(A.id)).toEqual({ status: 'skipped', pending: true, handoff: true })
    expect(puts()).toEqual([])

    server.resetHandlers()
    signOut()
    signIn(B)
    expect(await resolvePostLoginRoute(B.id)).toBe(WELCOME_ROUTE)
    expect(await readLocal(B.id)).toBeNull()

    // The next sign-in of the first account settles the claimed handoff against the server.
    signOut()
    signIn(A)
    expect(await resolvePostLoginRoute(A.id)).toBe(DASHBOARD_ROUTE)
    expect(puts()).toEqual(['skipped'])
    expect(await readLocal(A.id)).toEqual({ status: 'skipped', pending: false })
  })

  it('falls back to what this device holds only when the server cannot be read', async () => {
    failReads()
    expect(await resolvePostLoginRoute(A.id)).toBe(DASHBOARD_ROUTE)
    store.set(introductionLocalKey(A.id), JSON.stringify({ status: 'in_progress', pending: false }))
    expect(await resolvePostLoginRoute(A.id)).toBe(WELCOME_ROUTE)
    store.set(introductionLocalKey(A.id), JSON.stringify({ status: 'completed', pending: false }))
    expect(await resolvePostLoginRoute(A.id)).toBe(DASHBOARD_ROUTE)
    expect(puts()).toEqual([])
  })

  it('retries an owed decision on the next sign-in and keeps it owed while the retry fails, whatever the server still says', async () => {
    failWrites()
    expect(await recordIntroduction(A.id, 'completed')).toBe(false)
    expect(await readLocal(A.id)).toEqual({ status: 'completed', pending: true })

    // A stale server row must not overwrite the owed completion.
    tutorialProgressStore.seed([row('in_progress')])
    expect(await resolvePostLoginRoute(A.id)).toBe(DASHBOARD_ROUTE)
    expect(await readLocal(A.id)).toEqual({ status: 'completed', pending: true })

    server.resetHandlers()
    expect(await resolvePostLoginRoute(A.id)).toBe(DASHBOARD_ROUTE)
    expect(puts()).toEqual(['completed'])
    expect(tutorialProgressStore.rows().map((r) => r.status)).toEqual(['completed'])
    expect(await readLocal(A.id)).toEqual({ status: 'completed', pending: false })
  })

  it('keeps an owed decision ahead of a claimed handoff', async () => {
    failWrites()
    await recordIntroduction(A.id, 'completed')
    await writeHandoff('skipped')
    server.resetHandlers()
    expect(await resolvePostLoginRoute(A.id)).toBe(DASHBOARD_ROUTE)
    expect(await readHandoff()).toBeNull()
    expect(puts()).toEqual(['completed'])
  })

  it('stops deciding and writing once the account changed underneath a read', async () => {
    const release = deferRead(() => [])
    const pending = resolvePostLoginRoute(A.id)
    signOut()
    signIn(B)
    release()
    expect(await pending).toBeNull()
    expect(puts()).toEqual([])
    expect(await readLocal(A.id)).toBeNull()
    expect(await readLocal(B.id)).toBeNull()
  })

  it('stops deciding once the account signed out underneath a read that fails', async () => {
    let fail: () => void = () => {}
    const gate = new Promise<void>((resolve) => { fail = resolve })
    server.use(http.get('/api/users/me/tutorials', async () => { await gate; return HttpResponse.error() }))
    const pending = resolvePostLoginRoute(A.id)
    signOut()
    fail()
    expect(await pending).toBeNull()
  })

  it('does not redirect the old account after a local confirmation crosses a session change', async () => {
    tutorialProgressStore.seed([row('completed')])
    vi.mocked(kv.set).mockImplementationOnce(async (key, value) => {
      store.set(key, value)
      signIn(B)
    })
    expect(await resolvePostLoginRoute(A.id)).toBeNull()
    expect(await readLocal(B.id)).toBeNull()
  })
})

describe('recording', () => {
  it('writes the row and remembers it locally as confirmed', async () => {
    expect(await recordIntroduction(A.id, 'skipped')).toBe(true)
    expect(puts()).toEqual(['skipped'])
    expect(await readLocal(A.id)).toEqual({ status: 'skipped', pending: false })
  })

  it('keeps the decision owed if the session ends while its request is in flight', async () => {
    const release = deferWrite()
    const pending = recordIntroduction(A.id, 'completed')
    await release.started
    expect(await readLocal(A.id)).toEqual({ status: 'completed', pending: true })
    signOut()
    release()
    expect(await pending).toBe(false)
    expect(await readLocal(A.id)).toEqual({ status: 'completed', pending: true })
  })

  it('does not even send when the session is already gone', async () => {
    signOut()
    expect(await recordIntroduction(A.id, 'completed')).toBe(false)
    expect(puts()).toEqual([])
    expect(await readLocal(A.id)).toBeNull()
  })
})

describe('registration', () => {
  it('marks the introduction started and plays the organizer story', async () => {
    expect(await resolvePostRegistrationRoute(A.id)).toBe(INTRODUCTION_PLAY_ROUTE)
    expect(puts()).toEqual(['in_progress'])
    expect(await readLocal(A.id)).toEqual({ status: 'in_progress', pending: false })
    // Another device sees it as started, so a sign-in there offers to resume.
    expect(await resolvePostLoginRoute(A.id)).toBe(WELCOME_ROUTE)
  })

  it('still plays the story when the start could not be written, and owes the write', async () => {
    failWrites()
    expect(await resolvePostRegistrationRoute(A.id)).toBe(INTRODUCTION_PLAY_ROUTE)
    expect(await readLocal(A.id)).toEqual({ status: 'in_progress', pending: true })
    server.resetHandlers()
    expect(await resolvePostLoginRoute(A.id)).toBe(WELCOME_ROUTE)
    expect(puts()).toEqual(['in_progress'])
  })

  it('goes to the dashboard when the visitor already watched anonymously, consuming the handoff', async () => {
    await writeHandoff('completed')
    expect(await resolvePostRegistrationRoute(A.id)).toBe(DASHBOARD_ROUTE)
    expect(puts()).toEqual(['completed'])
    expect(await readHandoff()).toBeNull()
    expect(store.has(INTRODUCTION_HANDOFF_KEY)).toBe(false)
    expect(await resolvePostLoginRoute(A.id)).toBe(DASHBOARD_ROUTE)
  })

  it('stops once the account changed underneath the write', async () => {
    const release = deferWrite()
    const pending = resolvePostRegistrationRoute(A.id)
    await release.started
    signOut()
    signIn(B)
    release()
    expect(await pending).toBeNull()
    expect(await readLocal(A.id)).toEqual({ status: 'in_progress', pending: true })
    expect(await readLocal(B.id)).toBeNull()
  })
})
