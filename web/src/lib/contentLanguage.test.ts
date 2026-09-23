import { describe, expect, it } from 'vitest'
import { contentLanguageName, contentLanguageOptions, normalizeContentLanguage } from './contentLanguage'

describe('content language', () => {
  it('names a language in the reader’s interface language, capitalized', () => {
    expect(contentLanguageName('pt', 'en')).toBe('Portuguese')
    expect(contentLanguageName('en', 'pt')).toBe('Inglês')
    expect(contentLanguageName('pt', 'de')).toBe('Portugiesisch')
  })

  it('keeps unknown honest: nothing for blank or malformed values, the code when the platform has no name', () => {
    expect(contentLanguageName(null, 'en')).toBeNull()
    expect(contentLanguageName('', 'en')).toBeNull()
    expect(contentLanguageName('portuguese', 'en')).toBeNull()
    expect(normalizeContentLanguage(' PT ')).toBe('pt')
    expect(contentLanguageName('qq', 'en')).toBe('QQ')
  })

  it('sorts picker options by name and keeps a stored code outside the list', () => {
    const options = contentLanguageOptions('en', 'yo')
    const names = options.map((o) => o.name)
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'en')))
    expect(options.some((o) => o.code === 'yo')).toBe(true)
    expect(options.find((o) => o.code === 'de')?.name).toBe('German')
  })
})
