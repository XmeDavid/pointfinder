import { isNative } from './runtime'

let scanning = false
export const qrAvailable = () => isNative()

export async function openScannerSettings(): Promise<void> {
  if (isNative()) await (await import('@tauri-apps/plugin-barcode-scanner')).openAppSettings()
}

/** Raw text only: the join/tag feature validates its own accepted payloads. */
export async function scanQr(options: { signal?: AbortSignal; windowed?: boolean } = {}): Promise<string | null> {
  if (options.signal?.aborted) return null
  if (!isNative()) throw Object.assign(new Error('Camera scanning is unavailable'), { code: 'unavailable' })
  if (scanning) throw Object.assign(new Error('A scanner is already open'), { code: 'busy' })
  scanning = true
  let cancel: (() => void) | undefined
  try {
    const scanner = await import('@tauri-apps/plugin-barcode-scanner')
    let permission = await scanner.checkPermissions()
    if (options.signal?.aborted) return null
    if (permission !== 'granted' && permission !== 'denied') permission = await scanner.requestPermissions()
    if (options.signal?.aborted) return null
    if (permission !== 'granted') throw Object.assign(new Error('Camera permission was denied'), { code: 'denied' })
    cancel = () => { void scanner.cancel().catch(() => {}) }
    options.signal?.addEventListener('abort', cancel, { once: true })
    const result = await scanner.scan({
      formats: [scanner.Format.QRCode],
      cameraDirection: 'back',
      windowed: options.windowed ?? false,
    })
    return options.signal?.aborted ? null : result.content
  } catch (error) {
    if (options.signal?.aborted || /cancel/i.test(String(error))) return null
    if (error && typeof error === 'object' && 'code' in error) throw error
    throw Object.assign(new Error('QR scanning failed', { cause: error }), { code: 'failed' })
  } finally {
    if (cancel) options.signal?.removeEventListener('abort', cancel)
    scanning = false
  }
}
