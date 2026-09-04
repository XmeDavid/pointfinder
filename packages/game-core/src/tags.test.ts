import { describe, expect, it } from 'vitest'
import { buildTagUrl, normalizeBaseId, parseLegacyTagJson, parseTagRead, parseTagUrl } from './tags'

const ID = '11111111-2222-3333-4444-555555555555'

describe('tag URLs', () => {
  it('builds a canonical lowercase URL with the token', () => {
    expect(buildTagUrl(ID.toUpperCase(), 'ab12Cd34')).toBe(`https://pointfinder.pt/tag/${ID}?t=ab12Cd34`)
    expect(buildTagUrl(ID, null)).toBe(`https://pointfinder.pt/tag/${ID}`)
    expect(buildTagUrl(ID, 'x', 'pointfinder.ch')).toBe(`https://pointfinder.ch/tag/${ID}?t=x`)
    expect(() => buildTagUrl('nope', 'x')).toThrow()
  })

  it('parses both hosts, trailing slashes, uppercase ids, and a missing token', () => {
    expect(parseTagUrl(`https://pointfinder.pt/tag/${ID}?t=tok`)).toEqual({ baseId: ID, token: 'tok', format: 'url' })
    expect(parseTagUrl(`https://POINTFINDER.CH/tag/${ID.toUpperCase()}/`)).toEqual({ baseId: ID, token: null, format: 'url' })
    expect(parseTagUrl(`https://pointfinder.pt/tag/${ID}?t=`)).toEqual({ baseId: ID, token: null, format: 'url' })
  })

  it('rejects other hosts, paths, and malformed ids', () => {
    expect(parseTagUrl(`https://example.com/tag/${ID}`)).toBeNull()
    expect(parseTagUrl(`https://pointfinder.pt/dashboard`)).toBeNull()
    expect(parseTagUrl(`https://pointfinder.pt/tag/not-a-uuid`)).toBeNull()
    expect(parseTagUrl('garbage')).toBeNull()
    expect(parseTagUrl(null)).toBeNull()
  })

  it('parses legacy JSON payloads without a token', () => {
    expect(parseLegacyTagJson(`{"baseId":"${ID.toUpperCase()}"}`)).toEqual({ baseId: ID, token: null, format: 'legacy-json' })
    expect(parseLegacyTagJson('{"baseId":"x"}')).toBeNull()
    expect(parseLegacyTagJson('{')).toBeNull()
  })

  it('prefers the URL over the record text on a combined read', () => {
    expect(parseTagRead({ url: `https://pointfinder.pt/tag/${ID}?t=q`, firstRecordText: '{"baseId":"other"}' })?.token).toBe('q')
    expect(parseTagRead({ url: null, firstRecordText: `{"baseId":"${ID}"}` })?.format).toBe('legacy-json')
    expect(parseTagRead({})).toBeNull()
  })

  it('normalises ids', () => {
    expect(normalizeBaseId(` ${ID.toUpperCase()} `)).toBe(ID)
    expect(normalizeBaseId('')).toBeNull()
  })
})
