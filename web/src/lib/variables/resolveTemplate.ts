export type VariableMap = Map<string, string>

const VARIABLE_REF_RE = /\{\{([a-zA-Z][a-zA-Z0-9_]*)\}\}/g

/**
 * Substitute `{{key}}` placeholders with values from the given map.
 * Unknown keys are left intact (matches backend `TemplateVariableService` semantics).
 * Returns empty string for null/undefined input.
 */
export function resolveTemplate(
  text: string | null | undefined,
  variables: VariableMap,
): string {
  if (!text) return ''
  return text.replace(VARIABLE_REF_RE, (match, key: string) => {
    const v = variables.get(key)
    return v === undefined ? match : v
  })
}
