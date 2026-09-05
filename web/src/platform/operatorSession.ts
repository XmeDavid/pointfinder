import type { User } from '@/types'
import { isNative } from './runtime'

type OperatorSession = { kind: 'operator'; accessToken: string; refreshToken: string; user: User }
const KEY = 'operator-session'
let operations: Promise<unknown> = Promise.resolve()
function serialized<T>(operation: () => Promise<T>): Promise<T> {
  const next = operations.then(operation, operation)
  operations = next.catch(() => {})
  return next
}

async function secureStore() { return import('tauri-plugin-pointfinder-secure-store-api') }
async function readSession(): Promise<OperatorSession | null> {
  if (!isNative()) return null
  const store = await secureStore()
  const raw = await store.get(KEY)
  if (raw) return JSON.parse(raw) as OperatorSession
  // Upgrade the session from the previous Tauri frontend without changing store identity.
  const legacyRaw = await store.get('auth')
  if (!legacyRaw) return null
  const legacy = JSON.parse(legacyRaw)
  if (legacy.kind !== 'operator') return null
  const session: OperatorSession = {
    kind: 'operator', accessToken: legacy.accessToken, refreshToken: legacy.refreshToken,
    user: { id: legacy.userId, email: legacy.email, name: legacy.userName, role: legacy.role, createdAt: '' },
  }
  await store.set(KEY, JSON.stringify(session))
  await store.remove('auth')
  return session
}
export function loadOperatorSession(): Promise<OperatorSession | null> {
  return serialized(readSession)
}
export function saveOperatorSession(data: { accessToken: string; refreshToken?: string; user: User }, isCurrent: () => boolean = () => true): Promise<void> {
  return serialized(async () => {
    if (!isNative() || !isCurrent()) return
    const refreshToken = data.refreshToken ?? (await readSession())?.refreshToken
    if (!refreshToken) throw new Error('Native operator response did not include a refresh token')
    const store = await secureStore()
    if (isCurrent()) await store.set(KEY, JSON.stringify({ kind: 'operator', ...data, refreshToken }))
  })
}
export async function operatorRefreshBody(): Promise<{ refreshToken?: string }> {
  if (!isNative()) return {}
  const session = await loadOperatorSession()
  if (!session) throw new Error('Native operator session is unavailable')
  return { refreshToken: session.refreshToken }
}
export function clearOperatorSession(): Promise<void> {
  return serialized(async () => { if (isNative()) await (await secureStore()).remove(KEY) })
}
/** Read and clear in one operation, before a later login can save another account. */
export function takeOperatorRefreshBody(): Promise<{ refreshToken?: string }> {
  return serialized(async () => {
    if (!isNative()) return {}
    const session = await readSession()
    await (await secureStore()).remove(KEY)
    return session ? { refreshToken: session.refreshToken } : {}
  })
}
