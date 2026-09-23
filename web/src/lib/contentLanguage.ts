/**
 * OW-33: the language a game's own content is written in, as an ISO 639-1
 * code. It is metadata for players choosing a game, independent of the app's
 * EN/PT/DE interface, and never implies translation. Unknown is honest: older
 * games and organizers who did not say have none.
 */

/** Offered in the organizer picker; the server accepts any ISO 639-1 code, and a stored one outside this list is kept. */
export const CONTENT_LANGUAGE_CODES = [
  'af', 'ar', 'bg', 'bn', 'bs', 'ca', 'cs', 'cy', 'da', 'de', 'el', 'en', 'es', 'et', 'eu', 'fa', 'fi', 'fr',
  'ga', 'gl', 'he', 'hi', 'hr', 'hu', 'id', 'is', 'it', 'ja', 'ko', 'lb', 'lt', 'lv', 'mk', 'ms', 'mt', 'nb',
  'nl', 'pl', 'pt', 'rm', 'ro', 'ru', 'sk', 'sl', 'sq', 'sr', 'sv', 'sw', 'th', 'tl', 'tr', 'uk', 'ur', 'vi', 'zh',
] as const

const CODE = /^[a-z]{2}$/

/** A stored value as a code, or null when unknown or malformed. */
export function normalizeContentLanguage(code: string | null | undefined): string | null {
  const value = code?.trim().toLowerCase() ?? ''
  return CODE.test(value) ? value : null
}

/**
 * The language's name in the reader's interface language ("Portuguese",
 * "Português", "Portugiesisch"), capitalized for use as a label. Falls back to
 * the upper-case code where the platform has no name for it.
 */
export function contentLanguageName(code: string | null | undefined, uiLanguage: string): string | null {
  const normalized = normalizeContentLanguage(code)
  if (!normalized) return null
  let name: string | undefined
  try {
    name = new Intl.DisplayNames([uiLanguage], { type: 'language', fallback: 'none' }).of(normalized)
  } catch {
    name = undefined
  }
  if (!name || name.toLowerCase() === normalized) return normalized.toUpperCase()
  return name.charAt(0).toLocaleUpperCase(uiLanguage) + name.slice(1)
}

/** Picker options sorted by name in the interface language, keeping a stored code outside the list. */
export function contentLanguageOptions(uiLanguage: string, current?: string | null): { code: string; name: string }[] {
  const codes = new Set<string>(CONTENT_LANGUAGE_CODES)
  const stored = normalizeContentLanguage(current)
  if (stored) codes.add(stored)
  const collator = new Intl.Collator(uiLanguage)
  return [...codes]
    .map((code) => ({ code, name: contentLanguageName(code, uiLanguage) ?? code.toUpperCase() }))
    .sort((a, b) => collator.compare(a.name, b.name))
}
