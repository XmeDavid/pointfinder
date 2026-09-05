import { describe, it, expect } from 'vitest'
import { resolveTemplate, type VariableMap } from './resolveTemplate'

describe('resolveTemplate', () => {
  const vars: VariableMap = new Map([
    ['secret', 'FOX'],
    ['prefix', 'answer'],
  ])

  it('substitutes a single {{key}}', () => {
    expect(resolveTemplate('{{secret}}', vars)).toBe('FOX')
  })

  it('substitutes mixed literal + variable', () => {
    expect(resolveTemplate('{{prefix}}-{{secret}}', vars)).toBe('answer-FOX')
  })

  it('leaves unknown keys as-is', () => {
    expect(resolveTemplate('{{foo}}', vars)).toBe('{{foo}}')
  })

  it('handles empty input', () => {
    expect(resolveTemplate('', vars)).toBe('')
  })

  it('handles null/undefined text safely', () => {
    expect(resolveTemplate(null, vars)).toBe('')
    expect(resolveTemplate(undefined, vars)).toBe('')
  })

  it('matches multi-character keys and numbers', () => {
    const v = new Map([['team_code_42', 'BRAVO']])
    expect(resolveTemplate('code={{team_code_42}}', v)).toBe('code=BRAVO')
  })
})
