import { describe, expect, it } from 'vitest'
import { findUndefinedReferences, resolveTemplate, scanReferences, variablesForTeam } from './variables'

describe('template variables', () => {
  it('scans references in order without duplicates', () => {
    expect(scanReferences('Go to {{place}} and say {{word}}, then {{place}}')).toEqual(['place', 'word'])
    expect(scanReferences(['{{a}}', null as never, '{{b}} {{a}}'])).toEqual(['a', 'b'])
    expect(scanReferences('{{1bad}} {{ spaced }}')).toEqual([])
    expect(scanReferences(null)).toEqual([])
  })

  it('finds undefined references', () => {
    expect(findUndefinedReferences('{{a}} {{b}}', new Set(['a']))).toEqual(['b'])
  })

  it('resolves known keys and leaves unknown ones', () => {
    const m = new Map([['place', 'the old oak']])
    expect(resolveTemplate('Go to {{place}}, {{who}}', m)).toBe('Go to the old oak, {{who}}')
    expect(resolveTemplate(null, m)).toBe('')
  })

  it('selects a team\'s values', () => {
    const m = variablesForTeam([{ key: 'place', teamValues: { t1: 'oak', t2: 'well' } }, { key: 'x', teamValues: { t2: 'y' } }], 't1')
    expect([...m.entries()]).toEqual([['place', 'oak']])
  })
})
