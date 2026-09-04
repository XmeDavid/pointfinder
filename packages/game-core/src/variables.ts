import type { TeamVariable } from '@pointfinder/api'

/**
 * `{{key}}` template variables in challenge text, resolved per team.
 * Semantics match the backend's TemplateVariableService: unknown keys are
 * left in place so an operator can see what is missing.
 */

const VARIABLE_REF_RE = /\{\{([a-zA-Z][a-zA-Z0-9_]*)\}\}/g

/** Referenced keys in first-seen order, deduplicated. */
export function scanReferences(input: string | string[] | null | undefined): string[] {
  if (!input) return []
  const texts = Array.isArray(input) ? input : [input]
  const seen = new Set<string>()
  const ordered: string[] = []
  for (const text of texts) {
    if (!text) continue
    for (const m of text.matchAll(VARIABLE_REF_RE)) {
      const key = m[1]!
      if (!seen.has(key)) {
        seen.add(key)
        ordered.push(key)
      }
    }
  }
  return ordered
}

/** Referenced keys that have no definition. */
export function findUndefinedReferences(input: string | string[] | null | undefined, availableKeys: Set<string>): string[] {
  return scanReferences(input).filter((k) => !availableKeys.has(k))
}

export type VariableMap = Map<string, string>

/** Substitute known keys; leave unknown ones intact. */
export function resolveTemplate(text: string | null | undefined, variables: VariableMap): string {
  if (!text) return ''
  return text.replace(VARIABLE_REF_RE, (match, key: string) => variables.get(key) ?? match)
}

/** The values one team should see. */
export function variablesForTeam(variables: TeamVariable[], teamId: string): VariableMap {
  const map: VariableMap = new Map()
  for (const v of variables) {
    const value = v.teamValues[teamId]
    if (typeof value === 'string') map.set(v.key, value)
  }
  return map
}
