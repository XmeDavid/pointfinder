import { describe, expect, it } from 'vitest'
import { parseJoinCode } from './joinCode'

describe('parseJoinCode', () => {
  it('accepts bare codes in any case and spacing', () => {
    expect(parseJoinCode('abc 123')).toBe('ABC123')
    expect(parseJoinCode('FALC-ONS1')).toBe('FALCONS1')
  })
  it('reads codes out of join links', () => {
    expect(parseJoinCode('https://pointfinder.pt/join?code=ABC123')).toBe('ABC123')
    expect(parseJoinCode('https://pointfinder.ch/join/ABC123')).toBe('ABC123')
  })
  it('rejects unrelated content', () => {
    expect(parseJoinCode('https://example.com/tag/1234')).toBeNull()
    expect(parseJoinCode('hi!')).toBeNull()
    expect(parseJoinCode('')).toBeNull()
  })
})
