import { getCurrent, onOpenUrl } from '@tauri-apps/plugin-deep-link'
import { parseTagUrl, type TagPayload } from '@pointfinder/game-core'
import { isNative } from '@/platform'
import { createNativeIntake } from '../intake'

export type IncomingLink =
  | { kind: 'tag'; tag: TagPayload; url: string }
  | { kind: 'dashboard'; url: string }
  | { kind: 'unknown'; url: string }

export function classifyLink(url: string): IncomingLink {
  const tag = parseTagUrl(url)
  if (tag) return { kind: 'tag', tag, url }
  try {
    const parsed = new URL(url)
    if (['https:', 'http:'].includes(parsed.protocol) && ['pointfinder.pt', 'pointfinder.ch'].includes(parsed.hostname) && /^\/dashboard(?:\/|$)/.test(parsed.pathname)) return { kind: 'dashboard', url }
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
const linkIntake = createNativeIntake<IncomingLink>(async (emit) => {
  const seen = new Map<string, number>()
  const deliver = (urls: string[] | null) => {
    for (const url of urls ?? []) {
      const now = Date.now()
      for (const [key, at] of seen) if (now - at > 2000) seen.delete(key)
      if (seen.has(url)) continue
      seen.set(url, now)
      emit(classifyLink(url))
    }
  }
  await onOpenUrl(deliver)
  deliver(await getCurrent().catch(() => null))
})
export async function listenForLinks(handler: (link: IncomingLink) => void, options: { signal?: AbortSignal } = {}): Promise<() => void> {
  return isNative() ? linkIntake(handler, options) : () => {}
}
