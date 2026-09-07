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

  it('keeps the drawer tab label short enough for five tabs on a phone', () => {
    expect(
      (resources.en.translation as { build: { drawer: { nfcTags: string } } }).build.drawer.nfcTags,
    ).toBe('Tags')
  })
})

describe('tutorial chrome vocabulary', () => {
  const contractKeys = [
    'tutorials.common.progress',
    'tutorials.common.next',
    'tutorials.common.gotIt',
    'tutorials.common.later',
    'tutorials.common.close',
    'tutorials.common.resume',
    'tutorials.common.pill',
  ]

  it.each(['en', 'pt', 'de'] as const)('%s carries every tutorial chrome key', (lang) => {
    const paths = new Set(keyPaths(resources[lang].translation as Record<string, unknown>))
    for (const key of contractKeys) expect(paths.has(key)).toBe(true)
  })

  it.each(['en', 'pt', 'de'] as const)('%s interpolates the step counter', (lang) => {
    const bundle = resources[lang].translation as unknown as { tutorials: { common: Record<string, string> } }
    expect(bundle.tutorials.common.progress).toContain('{{n}}')
    expect(bundle.tutorials.common.progress).toContain('{{total}}')
  })
})

describe('operator tutorial vocabulary', () => {
  const contractKeys = [
    'tutorials.menu',
    'tutorials.welcome.title',
    'tutorials.scenarios.firstGame.title',
    'tutorials.scenarios.fixedRoute.title',
    'tutorials.scenarios.exploration.title',
    'tutorials.library.practice.replacing',
    'tutorials.library.practice.gameName.fixedRoute',
    'tutorials.library.practice.gameName.exploration',
    'tutorials.practice.badge',
    'tutorials.practice.keep',
    'tutorials.practice.delete',
    'tutorials.practice.settingsBody',
    'tutorials.fixedRoute.finish.title',
    'tutorials.exploration.finish.title',
    'playerApp.join.practiceFull',
  ]

  it.each(['en', 'pt', 'de'] as const)('%s carries every tutorial contract key', (lang) => {
    const paths = new Set(keyPaths(resources[lang].translation as Record<string, unknown>))
    for (const key of contractKeys) expect(paths.has(key)).toBe(true)
  })

  const firstGameSteps = [
    'create-game', 'name-game', 'orient', 'place-base', 'base-name', 'base-description', 'base-coords',
    'base-method', 'base-radius', 'base-visibility', 'base-link', 'base-save', 'base-qr',
    'base-nfc', 'second-base', 'new-challenge', 'challenge-title', 'challenge-type',
    'challenge-content', 'challenge-description', 'challenge-autovalidate', 'challenge-answer',
    'challenge-points', 'challenge-completion', 'challenge-location-bound', 'challenge-notes',
    'challenge-save', 'more-challenges', 'assign', 'new-team', 'team-code', 'go-live', 'modes',
    'revert', 'revert-choice', 'edit', 'edit-location-bound', 'edit-save', 'go-live-again', 'finish',
  ]

  it.each(['en', 'pt', 'de'] as const)('%s carries a title and body for every first-game step', (lang) => {
    const paths = new Set(keyPaths(resources[lang].translation as Record<string, unknown>))
    for (const step of firstGameSteps) {
      expect(paths.has(`tutorials.firstGame.${step}.title`), `${lang} ${step}.title`).toBe(true)
      expect(paths.has(`tutorials.firstGame.${step}.body`), `${lang} ${step}.body`).toBe(true)
    }
  })

  it.each(['en', 'pt', 'de'] as const)('%s keeps bubble bodies short enough for a 20rem bubble', (lang) => {
    const bundle = resources[lang].translation as unknown as { tutorials: { firstGame: Record<string, { body: string }> } }
    for (const [step, copy] of Object.entries(bundle.tutorials.firstGame)) {
      expect(copy.body.split(/\s+/).length, `${lang} ${step}.body word count`).toBeLessThanOrEqual(50)
    }
  })
})

describe('revert copy', () => {
  it.each(['en', 'pt', 'de'] as const)('%s says progress is archived, never deleted', (lang) => {
    const revert = (resources[lang].translation as { lifecycle: { revert: Record<string, string> } })
      .lifecycle.revert
    expect(revert.eraseHint).toBeTruthy()
    expect(revert.eraseHint.toLowerCase()).not.toMatch(/deleted|eliminad|gelöscht wird alles/)
  })
})
