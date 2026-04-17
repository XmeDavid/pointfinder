const VARIABLE_REF_RE = /\{\{([a-zA-Z][a-zA-Z0-9_]*)\}\}/g

/**
 * Scan one or more strings for `{{key}}` references.
 * Returns referenced keys in first-seen order, deduplicated.
 */
export function scanReferences(
  input: string | string[] | null | undefined,
): string[] {
  if (!input) return []
  const texts = Array.isArray(input) ? input : [input]
  const out = new Set<string>()
  const ordered: string[] = []
  for (const text of texts) {
    if (!text) continue
    const re = new RegExp(VARIABLE_REF_RE.source, 'g')
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
      if (!out.has(m[1])) {
        out.add(m[1])
        ordered.push(m[1])
      }
    }
  }
  return ordered
}

/**
 * Returns the subset of referenced keys that are not present in
 * the given available-keys set.
 */
export function findUndefinedReferences(
  input: string | string[] | null | undefined,
  availableKeys: Set<string>,
): string[] {
  return scanReferences(input).filter((k) => !availableKeys.has(k))
}
