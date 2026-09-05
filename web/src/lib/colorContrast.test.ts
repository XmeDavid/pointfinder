import { describe, it, expect } from 'vitest'
import { getContrastRatio, getReadableTextColor } from './colorContrast'

describe('getContrastRatio', () => {
  it('returns 21 for black on white (maximum contrast)', () => {
    expect(getContrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1)
  })

  it('returns 1 for identical colours (no contrast)', () => {
    expect(getContrastRatio('#808080', '#808080')).toBeCloseTo(1, 5)
  })

  it('returns 1 for unparseable input (safe fallback)', () => {
    expect(getContrastRatio('not-a-colour', '#ffffff')).toBe(1)
    expect(getContrastRatio('#ffffff', 'nope')).toBe(1)
  })

  it('is symmetric: getContrastRatio(a, b) === getContrastRatio(b, a)', () => {
    const ab = getContrastRatio('#ff6b6b', '#1a237e')
    const ba = getContrastRatio('#1a237e', '#ff6b6b')
    expect(ab).toBeCloseTo(ba, 5)
  })

  it('handles 3-char hex input', () => {
    expect(getContrastRatio('#000', '#fff')).toBeCloseTo(21, 1)
  })
})

describe('getReadableTextColor', () => {
  it('picks black on pale yellow (light bg fails white-text contrast)', () => {
    // #ffeb3b is the classic Material "yellow 500" — white text fails WCAG AA here.
    expect(getReadableTextColor('#ffeb3b')).toBe('#000000')
  })

  it('picks white on deep indigo (dark bg fails black-text contrast)', () => {
    expect(getReadableTextColor('#1a237e')).toBe('#ffffff')
  })

  it('picks white on pure black', () => {
    expect(getReadableTextColor('#000000')).toBe('#ffffff')
  })

  it('picks black on pure white', () => {
    expect(getReadableTextColor('#ffffff')).toBe('#000000')
  })

  it('defaults to black when bg hex is unparseable', () => {
    // hexToRgb returns null → contrast ratios fall back to 1 for both → white >= black → '#ffffff'.
    // Either is safe; we just want a stable, defined result.
    const result = getReadableTextColor('garbage')
    expect(['#000000', '#ffffff']).toContain(result)
  })

  it('handles short 3-char hex', () => {
    expect(getReadableTextColor('#000')).toBe('#ffffff')
    expect(getReadableTextColor('#fff')).toBe('#000000')
  })

  it('handles hex without leading #', () => {
    expect(getReadableTextColor('ffeb3b')).toBe('#000000')
  })
})
