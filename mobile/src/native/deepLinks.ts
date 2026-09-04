import { getCurrent, onOpenUrl } from '@tauri-apps/plugin-deep-link'
import { parseTagUrl, type TagPayload } from '@pointfinder/game-core'
import { isNative } from '../platform'

export type IncomingLink =
  | { kind: 'tag'; tag: TagPayload; url: string }
  | { kind: 'dashboard'; url: string }
  | { kind: 'unknown'; url: string }

export function classifyLink(url: string): IncomingLink {
  const tag = parseTagUrl(url)
  if (tag) return { kind: 'tag', tag, url }
  try {
    if (new URL(url).pathname.startsWith('/dashboard')) return { kind: 'dashboard', url }
  } catch {
    /* not a URL */
  }
  return { kind: 'unknown', url }
}

/**
 * Universal links (iOS) and app links (Android): a tag tapped from the home screen opens
 * the app with its URL. Delivers the link that launched the app plus any that arrive while
 * running. Returns an unsubscribe.
 */
export async function listenForLinks(handler: (link: IncomingLink) => void): Promise<() => void> {
  if (!isNative()) return () => {}
  const seen = new Set<string>()
  const deliver = (urls: string[] | null) => {
    for (const url of urls ?? []) {
      const key = `${url}#${Date.now() >> 12}`
      if (seen.has(key)) continue
      seen.add(key)
      handler(classifyLink(url))
    }
  }
  const unlisten = await onOpenUrl(deliver)
  deliver(await getCurrent().catch(() => null))
  return unlisten
}
