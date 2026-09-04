import { describe, expect, it } from 'vitest'
import { keyPaths, resolveLanguage, resources } from './index'

describe('locales', () => {
  it('keep every language in sync with English', () => {
    const en = keyPaths(resources.en.translation as Record<string, unknown>).sort()
    for (const lang of ['pt', 'de'] as const) {
      const keys = keyPaths(resources[lang].translation as Record<string, unknown>).sort()
      expect(keys, `${lang} keys`).toEqual(en)
    }
  })

  it('have no empty strings', () => {
    for (const [lang, bundle] of Object.entries(resources)) {
      const walk = (o: Record<string, unknown>, path: string) => {
        for (const [k, v] of Object.entries(o)) {
          if (typeof v === 'string') expect(v.trim(), `${lang}:${path}${k}`).not.toBe('')
          else walk(v as Record<string, unknown>, `${path}${k}.`)
        }
      }
      walk(bundle.translation as Record<string, unknown>, '')
    }
  })

  it('resolves device tags to supported languages', () => {
    expect(resolveLanguage('pt-PT')).toBe('pt')
    expect(resolveLanguage('de_DE')).toBe('de')
    expect(resolveLanguage('fr')).toBe('en')
    expect(resolveLanguage(null)).toBe('en')
  })
})
