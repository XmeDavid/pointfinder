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

describe('check-in method vocabulary', () => {
  const contractKeys = [
    'checkIn.method',
    'checkIn.methodNfc',
    'checkIn.methodQr',
    'checkIn.methodLocation',
    'checkIn.radius',
    'checkIn.radiusHint',
    'checkIn.inheritsDefault',
    'checkIn.defaultMethod',
    'checkIn.defaultRadius',
    'checkIn.tagsAndCodes',
    'checkIn.printCode',
    'checkIn.printAll',
    'checkIn.noTagNeeded',
    'checkIn.claimedBadge',
    'checkIn.teammatesInRing',
    'readiness.nfcLinked',
    'readiness.locationCoords',
    'readiness.locationOverlap',
    'readiness.legacyAppsNote',
  ]

  it.each(['en', 'pt', 'de'] as const)('%s carries every contract key', (lang) => {
    const paths = new Set(keyPaths(resources[lang].translation as Record<string, unknown>))
    for (const key of contractKeys) expect(paths.has(key)).toBe(true)
  })

  it('renames the drawer tab to "Tags & codes"', () => {
    expect(
      (resources.en.translation as { build: { drawer: { nfcTags: string } } }).build.drawer.nfcTags,
    ).toBe('Tags & codes')
  })
})
