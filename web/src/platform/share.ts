import { isNative } from './runtime'

export type ShareResult = 'shared' | 'downloaded' | 'cancelled'
export async function shareFile(file: File): Promise<ShareResult> {
  if (isNative()) {
    const [{ nativeMediaStore }, { invoke }] = await Promise.all([import('./tauri/media'), import('@tauri-apps/api/core')])
    const id = crypto.randomUUID()
    await nativeMediaStore.put(id, file)
    try {
      return await invoke<ShareResult>('plugin:pointfinder-device|share_file', { id, name: file.name, contentType: file.type || 'application/octet-stream' })
    } finally { await nativeMediaStore.remove(id).catch(() => {}) }
  }
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return 'shared' }
    catch (error) { if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled'; throw error }
  }
  const url = URL.createObjectURL(file)
  const anchor = document.createElement('a')
  anchor.href = url; anchor.download = file.name
  document.body.append(anchor)
  anchor.click(); anchor.remove()
  // Allow the browser to start reading before releasing the object URL.
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
  return 'downloaded'
}
