import { describe, it, expect } from 'vitest'
import { scanReferences, findUndefinedReferences } from './scanReferences'

describe('scanReferences', () => {
  it('finds all {{key}} references in a string', () => {
    expect(scanReferences('Find {{secret}} at {{place}}')).toEqual(['secret', 'place'])
  })

  it('deduplicates repeated keys', () => {
    expect(scanReferences('{{a}} and {{a}}')).toEqual(['a'])
  })

  it('returns [] for null / empty / no matches', () => {
    expect(scanReferences(null)).toEqual([])
    expect(scanReferences('')).toEqual([])
    expect(scanReferences('no variables here')).toEqual([])
  })

  it('scans arrays of strings', () => {
    expect(scanReferences(['{{a}}', '{{b}}-{{a}}'])).toEqual(['a', 'b'])
  })
})

describe('findUndefinedReferences', () => {
  it('returns keys referenced but not in available set', () => {
    const refs = findUndefinedReferences(
      ['Find {{secret}}', '{{typo}}'],
      new Set(['secret', 'prefix']),
    )
    expect(refs).toEqual(['typo'])
  })

  it('returns [] when all references resolve', () => {
    expect(findUndefinedReferences('{{a}}', new Set(['a']))).toEqual([])
  })
})
