import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TFunction } from 'i18next'

const native = vi.hoisted(() => ({ enabled: false }))
const qr = vi.hoisted(() => ({ checkPermissions: vi.fn(), requestPermissions: vi.fn(), scan: vi.fn(), cancel: vi.fn(async () => {}), openAppSettings: vi.fn(), Format: { QRCode: 'QR_CODE' } }))
const nfc = vi.hoisted(() => ({ writeTag: vi.fn() }))
vi.mock('./runtime', () => ({ isNative: () => native.enabled }))
vi.mock('@tauri-apps/plugin-barcode-scanner', () => qr)
vi.mock('./tauri/nfc', () => nfc)

beforeEach(() => { native.enabled = false; vi.clearAllMocks() })
afterEach(() => vi.restoreAllMocks())

describe('native capability boundaries', () => {
  it('leaves manual input available in browsers without loading a native scanner', async () => {
    const { scanQr, qrAvailable } = await import('./qr')
    expect(qrAvailable()).toBe(false)
    await expect(scanQr()).rejects.toMatchObject({ code: 'unavailable' })
    expect(qr.checkPermissions).not.toHaveBeenCalled()
  })

  it('does not repeatedly prompt for denied camera permission', async () => {
    native.enabled = true
    qr.checkPermissions.mockResolvedValue('denied')
    const { scanQr } = await import('./qr')
    await expect(scanQr()).rejects.toMatchObject({ code: 'denied' })
    expect(qr.requestPermissions).not.toHaveBeenCalled()
    expect(qr.scan).not.toHaveBeenCalled()
  })

  it('cancels native QR scanning when its feature unmounts', async () => {
    native.enabled = true
    qr.checkPermissions.mockResolvedValue('granted')
    let rejectScan!: (reason: unknown) => void
    qr.scan.mockImplementation(() => new Promise((_resolve, reject) => { rejectScan = reject }))
    const { scanQr } = await import('./qr')
    const controller = new AbortController()
    const result = scanQr({ signal: controller.signal })
    await vi.waitFor(() => expect(qr.scan).toHaveBeenCalled())
    controller.abort()
    rejectScan('cancelled')
    expect(await result).toBeNull()
    expect(qr.cancel).toHaveBeenCalledTimes(1)
  })

  it('never reports an unverified NFC write as linked', async () => {
    native.enabled = true
    nfc.writeTag.mockResolvedValue({ verified: false, id: null })
    const { writeTag } = await import('./nfc')
    await expect(writeTag(((key: string) => key) as TFunction, 'https://pointfinder.pt/tag/11111111-2222-3333-4444-555555555555?t=proof')).rejects.toMatchObject({ code: 'verifyMismatch' })
  })

  it('resolves picker cancellation and removes the temporary input', async () => {
    const { pickMedia } = await import('./media')
    vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {})
    const result = pickMedia({ source: 'camera' })
    const input = document.querySelector('input[type=file]')!
    expect(input.getAttribute('capture')).toBe('environment')
    input.dispatchEvent(new Event('cancel'))
    expect(await result).toEqual([])
    expect(document.querySelector('input[type=file]')).toBeNull()
  })

  it('treats share-sheet cancellation as cancellation, without downloading a second copy', async () => {
    const { shareFile } = await import('./share')
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true })
    Object.defineProperty(navigator, 'share', { configurable: true, value: vi.fn().mockRejectedValue(new DOMException('Cancelled', 'AbortError')) })
    expect(await shareFile(new File(['export'], 'game.json'))).toBe('cancelled')
    expect(document.querySelector('a[download]')).toBeNull()
  })
})
