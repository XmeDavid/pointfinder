import { isNative } from './runtime'

/** Keep checkout/portal navigation out of the bundled mobile webview. */
export async function openExternal(url: string): Promise<void> {
  const target = new URL(url)
  if (target.protocol !== 'https:' && target.protocol !== 'http:') throw new Error('Unsupported external URL')
  if (isNative()) await (await import('@tauri-apps/plugin-opener')).openUrl(target.href)
  else window.location.href = target.href
}
