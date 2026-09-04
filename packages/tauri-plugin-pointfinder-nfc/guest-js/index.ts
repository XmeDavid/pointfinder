import { invoke, addPluginListener, type PluginListener } from '@tauri-apps/api/core'

const PLUGIN = 'pointfinder-nfc'

export interface Availability {
  /** The device has NFC hardware and the OS exposes it to apps. */
  available: boolean
  /** NFC is switched on (Android). Always equals `available` on iOS. */
  enabled: boolean
}

export interface NdefRecord {
  tnf: number
  type: string
  /** Base64-encoded raw payload. */
  payload: string
}

export interface TagPayload {
  /** Hex tag UID when the platform exposes it. */
  id: string | null
  /** First well-known URI record, decoded. */
  url: string | null
  records: NdefRecord[]
}

export interface ScanOptions {
  /** Text on the system sheet while waiting (iOS Core NFC sheet, or the plugin's own sheet on Android). */
  message?: string
  /** Text shown briefly on the sheet once the tag is read. */
  successMessage?: string
  /** Cancel button label on Android. iOS uses the system label. */
  cancelLabel?: string
  /** Reject with `timeout` after this long. Omit to wait until cancelled. */
  timeoutMs?: number
}

export interface WriteOptions {
  url: string
  /** Re-read the tag and compare. Default true. */
  verify?: boolean
  /** Also write an Android Application Record so a tap launches the app. Default true. */
  applicationRecord?: boolean
  message?: string
  successMessage?: string
  cancelLabel?: string
  timeoutMs?: number
}

export interface WriteResult {
  /** True when the tag was re-read and matched. False when verification was skipped or inconclusive. */
  verified: boolean
  id: string | null
}

export type NfcErrorCode =
  | 'unavailable'
  | 'disabled'
  | 'cancelled'
  | 'timeout'
  | 'tagLost'
  | 'invalid'
  | 'notWritable'
  | 'tooLarge'
  | 'verifyMismatch'
  | 'readFailed'
  | 'writeFailed'

export class NfcError extends Error {
  readonly code: NfcErrorCode
  constructor(raw: unknown) {
    const text = typeof raw === 'string' ? raw : raw instanceof Error ? raw.message : String(raw)
    super(text)
    this.name = 'NfcError'
    this.code = (text.split(':')[0].trim() as NfcErrorCode) || 'readFailed'
  }
}

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(`plugin:${PLUGIN}|${command}`, args)
  } catch (e) {
    throw new NfcError(e)
  }
}

export function isAvailable(): Promise<Availability> {
  return call('is_available')
}

/**
 * Android: arm reader mode so any tap emits a `tag` event while the app is
 * in the foreground. iOS: no-op, the OS reads URL tags itself and opens the
 * app through the universal link.
 */
export function startListening(): Promise<void> {
  return call('start_listening')
}

export function stopListening(): Promise<void> {
  return call('stop_listening')
}

/** One-shot read. Opens a system-style sheet on both platforms and resolves with the next tag. */
export function scan(options: ScanOptions = {}): Promise<TagPayload> {
  return call('scan', { options })
}

export function cancelScan(): Promise<void> {
  return call('cancel_scan')
}

/** Write a URL tag and, by default, verify it by reading it back. */
export function write(options: WriteOptions): Promise<WriteResult> {
  return call('write', { options })
}

/**
 * A tag that launched the app, or was tapped before a listener existed.
 * Returns it once, then null. Call on startup after subscribing.
 */
export async function consumePendingTag(): Promise<TagPayload | null> {
  const r = await call<{ tag: TagPayload | null }>('consume_pending_tag')
  return r.tag
}

/** Fires for every tag read while listening (Android) and for tags that launched the app. */
export function onTag(handler: (tag: TagPayload) => void): Promise<PluginListener> {
  return addPluginListener(PLUGIN, 'tag', handler)
}

/** Fires when a tag was detected but carried no readable NDEF data. */
export function onInvalidTag(handler: () => void): Promise<PluginListener> {
  return addPluginListener(PLUGIN, 'invalidTag', handler)
}
