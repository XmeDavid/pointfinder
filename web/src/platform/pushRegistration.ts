import * as push from './push'
import { onForeground } from './lifecycle'

export interface PushIdentity {
  key: string
  register: (registration: push.Registration) => Promise<void>
  unregister: (registration: push.Registration) => Promise<void>
}
export type PushRegistrationState = 'idle' | 'unavailable' | 'denied' | 'registering' | 'registered' | 'error'
let state: PushRegistrationState = 'idle'
const listeners = new Set<(state: PushRegistrationState) => void>()
export const pushRegistrationState = () => state
export function onPushRegistrationState(handler: (state: PushRegistrationState) => void) {
  listeners.add(handler)
  return () => { listeners.delete(handler) }
}
function setState(next: PushRegistrationState) { state = next; for (const listener of listeners) listener(next) }

/** Serializes token rotation/account changes; transient errors retry on resume/online. */
export function startPushRegistration(options: {
  identity: () => PushIdentity | null
  onIdentityChange: (handler: () => void) => () => void
}): () => void {
  let alive = true
  let running = false
  let again = false
  let latestToken: push.Registration | undefined
  let registered = ''
  let bound: { identity: PushIdentity; token: push.Registration } | null = null
  let disabled = false
  const identityChanged = () => { registered = ''; trigger() }
  const trigger = () => { again = true; if (!running) void run() }
  const run = async () => {
    running = true
    while (again && alive) {
      again = false
      const identity = options.identity()
      try {
        if (bound && bound.identity.key !== identity?.key) {
          await bound.identity.unregister(bound.token).catch(() => {})
          await push.unregisterPush().catch(() => {})
          bound = null; latestToken = undefined; registered = ''; disabled = true
        }
        if (!identity) {
          if (!disabled) await push.unregisterPush().catch(() => {})
          disabled = true; registered = ''; setState('idle'); continue
        }
        const permission = await push.pushPermission()
        if (!alive) break
        if (permission !== 'granted') {
          if (bound) { await bound.identity.unregister(bound.token).catch(() => {}); bound = null }
          registered = ''; setState(permission === 'unavailable' ? 'unavailable' : 'denied'); continue
        }
        setState('registering')
        disabled = false
        const token = latestToken ?? await push.registerPush()
        if (!alive || options.identity()?.key !== identity.key) continue
        const key = `${identity.key}:${token.platform}:${token.token}`
        if (registered !== key) {
          await identity.register(token)
          bound = { identity, token }
          if (!alive || options.identity()?.key !== identity.key) continue
          registered = key
        }
        setState('registered')
      } catch (error) {
        if (alive) setState(error && typeof error === 'object' && 'code' in error && error.code === 'unavailable' ? 'unavailable' : 'error')
      }
    }
    running = false
  }
  const offIdentity = options.onIdentityChange(identityChanged)
  const offPermission = push.onPushPermissionChange(trigger)
  const offForeground = onForeground(trigger)
  window.addEventListener('online', trigger)
  let offToken: (() => void) | undefined
  void push.onPushToken((token) => { latestToken = token; trigger() }).then((off) => { if (alive) offToken = off; else off() }).catch(() => {})
  trigger()
  return () => { alive = false; offIdentity(); offPermission(); offForeground(); offToken?.(); window.removeEventListener('online', trigger) }
}
