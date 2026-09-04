import { invoke, addPluginListener, type PluginListener } from '@tauri-apps/api/core'

const PLUGIN = 'pointfinder-push'

export type PermissionStatus = 'granted' | 'denied' | 'prompt'

export interface Registration {
  /** Raw APNs token (hex) on iOS, FCM registration token on Android. */
  token: string
  /** Matches the backend's push platform enum. */
  platform: 'ios' | 'android'
}

export interface PushNotification {
  title: string | null
  body: string | null
  /** The message's custom key-value data, as strings. */
  data: Record<string, string>
  messageId?: string | null
}

export interface NotificationTap {
  title?: string | null
  body?: string | null
  data: Record<string, string>
}

export class PushError extends Error {
  readonly code: string
  constructor(raw: unknown) {
    const text = typeof raw === 'string' ? raw : raw instanceof Error ? raw.message : String(raw)
    super(text)
    this.name = 'PushError'
    this.code = text.split(':')[0].trim()
  }
}

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(`plugin:${PLUGIN}|${command}`, args)
  } catch (e) {
    throw new PushError(e)
  }
}

export async function permissionStatus(): Promise<PermissionStatus> {
  return (await call<{ status: PermissionStatus }>('permission_status')).status
}

/** Shows the system prompt if the user has not decided yet. */
export async function requestPermission(): Promise<PermissionStatus> {
  return (await call<{ status: PermissionStatus }>('request_permission')).status
}

/**
 * Obtain the device token to send to the backend. Rejects with
 * `unavailable` when push is not configured for this build.
 */
export function register(): Promise<Registration> {
  return call('register')
}

/** The notification tap that launched the app, once. */
export async function consumeLaunchTap(): Promise<NotificationTap | null> {
  return (await call<{ tap: NotificationTap | null }>('consume_launch_tap')).tap
}

/** The platform rotated the token. Send the new one to the backend. */
export function onToken(handler: (r: Registration) => void): Promise<PluginListener> {
  return addPluginListener(PLUGIN, 'token', handler)
}

/** A notification arrived while the app was in the foreground. */
export function onNotification(handler: (n: PushNotification) => void): Promise<PluginListener> {
  return addPluginListener(PLUGIN, 'notification', handler)
}

/** The user tapped a notification while the app was running. */
export function onNotificationTap(handler: (t: NotificationTap) => void): Promise<PluginListener> {
  return addPluginListener(PLUGIN, 'notificationTap', handler)
}
