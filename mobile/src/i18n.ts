import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import { DEFAULT_LANGUAGE, resolveLanguage, resources, type Language } from '@pointfinder/i18n'
import { isNative, kv } from './platform'

const LANG_KEY = 'language'

export async function initI18n(): Promise<Language> {
  let stored: string | null = null
  if (isNative()) stored = await kv.get(LANG_KEY).catch(() => null)
  const lng = stored ? resolveLanguage(stored) : resolveLanguage(navigator.language)
  await i18next.use(initReactI18next).init({
    resources,
    lng,
    fallbackLng: DEFAULT_LANGUAGE,
    interpolation: { escapeValue: false },
    returnNull: false,
  })
  document.documentElement.lang = lng
  return lng
}

export async function setLanguage(lng: Language): Promise<void> {
  await i18next.changeLanguage(lng)
  document.documentElement.lang = lng
  if (isNative()) await kv.set(LANG_KEY, lng).catch(() => {})
}
