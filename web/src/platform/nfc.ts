import type { TFunction } from 'i18next'
import type { TagPayload } from '@pointfinder/game-core'
import { isNative } from './runtime'

export async function nfcAvailability(): Promise<{ available: boolean; enabled: boolean }> {
  return isNative() ? (await import('tauri-plugin-pointfinder-nfc-api')).isAvailable() : { available: false, enabled: false }
}
export async function cancelNfc(): Promise<void> {
  if (isNative()) await (await import('tauri-plugin-pointfinder-nfc-api')).cancelScan()
}
export async function writeTag(t: TFunction, url: string): Promise<{ verified: boolean; id: string | null }> {
  if (!isNative()) throw Object.assign(new Error(t('nfc.unavailable')), { code: 'unavailable' })
  const { parseTagUrl } = await import('@pointfinder/game-core')
  if (!parseTagUrl(url)) throw Object.assign(new Error(t('nfc.invalid')), { code: 'invalid' })
  const result = await (await import('./tauri/nfc')).writeTag(t, url)
  if (!result.verified) throw Object.assign(new Error(t('nfc.verifyMismatch')), { code: 'verifyMismatch' })
  return result
}

export async function scanTag(t: TFunction, options?: { baseTitle?: string }) {
  if (!isNative()) throw Object.assign(new Error(t('nfc.unavailable')), { code: 'unavailable' })
  return (await import('./tauri/nfc')).scanTag(t, options)
}
export async function listenForTags(handler: (tag: TagPayload) => void, options: { signal?: AbortSignal } = {}): Promise<() => void> {
  return isNative() ? (await import('./tauri/nfc')).listenForTags(handler, options) : () => {}
}
export function nfcErrorMessage(error: unknown, t: TFunction): string {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'readFailed'
  const known = ['unavailable', 'disabled', 'cancelled', 'timeout', 'invalid', 'notWritable', 'verifyMismatch']
  return known.includes(code) ? t(`nfc.${code}`) : t('common.unknownError')
}
