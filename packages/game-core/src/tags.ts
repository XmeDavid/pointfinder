/**
 * PointFinder tag payloads.
 *
 * A base tag is an NDEF URL record: `https://pointfinder.pt/tag/<baseId>?t=<token>`.
 * The URL doubles as the universal link that launches the app, and the
 * token proves the phone was physically at the tag. Older tags carried a
 * JSON MIME record `{"baseId": "..."}` and no token; those still parse so
 * the app can tell the operator to rewrite them.
 */

export const TAG_HOSTS = ['pointfinder.pt', 'pointfinder.ch'] as const
export const CANONICAL_TAG_HOST = 'pointfinder.pt'
export const TAG_PATH_PREFIX = '/tag/'

export interface TagPayload {
  baseId: string
  /** Missing on tags written before tokens existed. Check-in will be refused until rewritten. */
  token: string | null
  /** Which encoding the tag used. */
  format: 'url' | 'legacy-json'
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Build the URL to write on a base's tag. Base ids are lowercased so iOS and Android tags match byte for byte. */
export function buildTagUrl(baseId: string, token: string | null | undefined, host: (typeof TAG_HOSTS)[number] = CANONICAL_TAG_HOST): string {
  const id = normalizeBaseId(baseId)
  if (!id) throw new Error(`Not a base id: ${baseId}`)
  const url = `https://${host}${TAG_PATH_PREFIX}${id}`
  return token ? `${url}?t=${encodeURIComponent(token)}` : url
}

/** Parse a tag URL or deep link. Returns null for anything that is not a PointFinder tag link. */
export function parseTagUrl(input: string | URL | null | undefined): TagPayload | null {
  if (!input) return null
  let url: URL
  try {
    url = typeof input === 'string' ? new URL(input) : input
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  if (!(TAG_HOSTS as readonly string[]).includes(url.hostname.toLowerCase())) return null
  if (!url.pathname.startsWith(TAG_PATH_PREFIX)) return null
  const rawId = url.pathname.slice(TAG_PATH_PREFIX.length).replace(/\/+$/, '')
  const baseId = normalizeBaseId(rawId)
  if (!baseId) return null
  const token = url.searchParams.get('t')
  return { baseId, token: token && token.trim() ? token.trim() : null, format: 'url' }
}

/** Parse the legacy JSON MIME payload, given its bytes decoded as UTF-8 text. */
export function parseLegacyTagJson(text: string | null | undefined): TagPayload | null {
  if (!text) return null
  try {
    const obj = JSON.parse(text) as { baseId?: unknown }
    if (typeof obj?.baseId !== 'string') return null
    const baseId = normalizeBaseId(obj.baseId)
    return baseId ? { baseId, token: null, format: 'legacy-json' } : null
  } catch {
    return null
  }
}

/**
 * Parse whatever a tag read produced: the decoded URL if there was one,
 * else the raw payload of the first record as text (legacy tags).
 */
export function parseTagRead(read: { url?: string | null; firstRecordText?: string | null }): TagPayload | null {
  return parseTagUrl(read.url) ?? parseLegacyTagJson(read.firstRecordText)
}

/** Lowercase canonical UUID, or null if the value is not a UUID. */
export function normalizeBaseId(raw: string | null | undefined): string | null {
  const v = raw?.trim().toLowerCase()
  return v && UUID_RE.test(v) ? v : null
}
