import en from './locales/en.json'
import pt from './locales/pt.json'
import de from './locales/de.json'

export const SUPPORTED_LANGUAGES = ['en', 'pt', 'de'] as const
export type Language = (typeof SUPPORTED_LANGUAGES)[number]
export const DEFAULT_LANGUAGE: Language = 'en'

/** i18next-shaped resources: one namespace per language. */
export const resources = {
  en: { translation: en },
  pt: { translation: pt },
  de: { translation: de },
} as const

/** Pick a supported language from a device or browser tag like "pt-PT". */
export function resolveLanguage(tag: string | null | undefined): Language {
  const code = tag?.toLowerCase().split(/[-_]/)[0]
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(code ?? '') ? (code as Language) : DEFAULT_LANGUAGE
}

/** Every key path in the English source, dotted. Used by tests to keep languages in sync. */
export function keyPaths(obj: Record<string, unknown>, prefix = ''): string[] {
  const out: string[] = []
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object' && !Array.isArray(v)) out.push(...keyPaths(v as Record<string, unknown>, path))
    else out.push(path)
  }
  return out
}
