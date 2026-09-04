import * as nfc from 'tauri-plugin-pointfinder-nfc-api'
import { parseTagRead, type TagPayload } from '@pointfinder/game-core'
import type { TFunction } from 'i18next'
import { isAndroid, isNative } from '../platform'

export { NfcError } from 'tauri-plugin-pointfinder-nfc-api'

function toPayload(tag: nfc.TagPayload): TagPayload | null {
  const first = tag.records[0]
  const firstRecordText = first ? decodeText(first.payload) : null
  return parseTagRead({ url: tag.url, firstRecordText })
}

function decodeText(base64: string): string | null {
  try {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
    // NDEF text records start with a status byte and a language code.
    const langLen = bytes[0]! & 0x3f
    return new TextDecoder().decode(bytes.slice(1 + langLen))
  } catch {
    return null
  }
}

/** Open the platform NFC sheet and resolve with the parsed tag. Throws NfcError. */
export async function scanTag(t: TFunction, opts: { baseTitle?: string } = {}): Promise<{ raw: nfc.TagPayload; tag: TagPayload | null }> {
  const raw = await nfc.scan({
    message: opts.baseTitle ? `${t('nfc.holdToRead')} · ${opts.baseTitle}` : t('nfc.holdToRead'),
    successMessage: t('nfc.tagRead'),
    cancelLabel: t('common.cancel'),
    timeoutMs: 60_000,
  })
  return { raw, tag: toPayload(raw) }
}

export async function writeTag(t: TFunction, url: string): Promise<nfc.WriteResult> {
  return nfc.write({ url, message: t('nfc.holdToWrite'), successMessage: t('nfc.tagWritten'), cancelLabel: t('common.cancel'), timeoutMs: 60_000 })
}

export function nfcErrorMessage(err: unknown, t: TFunction): string {
  const code = err instanceof nfc.NfcError ? err.code : 'readFailed'
  switch (code) {
    case 'unavailable': return t('nfc.unavailable')
    case 'disabled': return t('nfc.disabled')
    case 'cancelled': return t('nfc.cancelled')
    case 'timeout': return t('nfc.timeout')
    case 'invalid': return t('nfc.invalid')
    case 'notWritable': return t('nfc.notWritable')
    case 'verifyMismatch': return t('nfc.verifyMismatch')
    default: return t('common.unknownError')
  }
}

/**
 * Background tag intake: tags tapped while the app is open (Android reader mode) and the
 * tag that cold-started the app. iOS delivers home-screen taps as universal links instead,
 * handled by the deep-link listener. Returns an unsubscribe.
 */
export async function listenForTags(handler: (tag: TagPayload) => void): Promise<() => void> {
  if (!isNative()) return () => {}
  const listener = await nfc.onTag((raw) => {
    const tag = toPayload(raw)
    if (tag) handler(tag)
  })
  const pending = await nfc.consumePendingTag().catch(() => null)
  if (pending) {
    const tag = toPayload(pending)
    if (tag) handler(tag)
  }
  let listening = false
  if (isAndroid()) {
    await nfc.startListening().then(() => { listening = true }).catch(() => {})
  }
  return () => {
    listener.unregister()
    if (listening) nfc.stopListening().catch(() => {})
  }
}
