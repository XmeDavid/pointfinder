import { isNative } from './runtime'
import type { Registration, PushNotification, NotificationTap } from 'tauri-plugin-pointfinder-push-api'
import { createNativeIntake } from './intake'

export type { Registration, PushNotification, NotificationTap }
export type PushPermission = 'granted' | 'denied' | 'prompt' | 'unavailable'
type Unsubscribe = () => void
const permissionListeners = new Set<() => void>()

export async function pushPermission(): Promise<PushPermission> {
  if (!isNative()) return 'unavailable'
  try { return await (await import('tauri-plugin-pointfinder-push-api')).permissionStatus() }
  catch { return 'unavailable' }
}

/** Called by the settings/onboarding feature in response to a user gesture. */
export async function requestPushPermission(): Promise<PushPermission> {
  if (!isNative()) return 'unavailable'
  const result = await (await import('tauri-plugin-pointfinder-push-api')).requestPermission()
  for (const handler of permissionListeners) handler()
  return result
}

export function onPushPermissionChange(handler: () => void): Unsubscribe {
  permissionListeners.add(handler)
  return () => { permissionListeners.delete(handler) }
}

export async function registerPush(): Promise<Registration> {
  if (!isNative()) throw Object.assign(new Error('Push notifications are unavailable'), { code: 'unavailable' })
  return (await import('tauri-plugin-pointfinder-push-api')).register()
}

export async function unregisterPush(): Promise<void> {
  if (isNative()) await (await import('tauri-plugin-pointfinder-push-api')).unregister()
}

export async function onPushToken(handler: (token: Registration) => void): Promise<Unsubscribe> {
  if (!isNative()) return () => {}
  const listener = await (await import('tauri-plugin-pointfinder-push-api')).onToken(handler)
  return () => { void listener.unregister() }
}

export async function onPushNotification(handler: (notification: PushNotification) => void): Promise<Unsubscribe> {
  if (!isNative()) return () => {}
  const listener = await (await import('tauri-plugin-pointfinder-push-api')).onNotification(handler)
  return () => { void listener.unregister() }
}

/** Attach before consuming launch data; deduplicate the live/cold-start overlap. */
const tapIntake = createNativeIntake<NotificationTap>(async (emit) => {
  const plugin = await import('tauri-plugin-pointfinder-push-api')
  let lastKey = ''
  let lastAt = 0
  const deliver = (tap: NotificationTap) => {
    const key = JSON.stringify(tap.data)
    const now = Date.now()
    if (key === lastKey && now - lastAt < 2000) return
    lastKey = key; lastAt = now
    emit(tap)
  }
  const listener = await plugin.onNotificationTap(deliver)
  try {
    const pending = await plugin.consumeLaunchTap()
    if (pending) deliver(pending)
  } catch (error) {
    await listener.unregister()
    throw error
  }
})
export async function onPushTap(handler: (tap: NotificationTap) => void, options: { signal?: AbortSignal } = {}): Promise<Unsubscribe> {
  return isNative() ? tapIntake(handler, options) : () => {}
}
