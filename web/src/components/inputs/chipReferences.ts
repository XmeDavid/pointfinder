/** The `{{partial` being typed at the caret, if the braces are still open there. */
export function findOpenReference(
  value: string,
  caret: number,
): { start: number; query: string } | null {
  const before = value.slice(0, caret)
  const start = before.lastIndexOf('{{')
  if (start === -1) return null
  const query = before.slice(start + 2)
  if (query.includes('}}') || !/^[a-zA-Z0-9_]*$/.test(query)) return null
  return { start, query }
}

/** Replaces the open `{{partial` at the caret with a complete `{{key}}` reference. */
export function completeReference(
  value: string,
  caret: number,
  key: string,
): { value: string; caret: number } {
  const open = findOpenReference(value, caret)
  if (!open) return { value, caret }
  const inserted = `{{${key}}}`
  return {
    value: value.slice(0, open.start) + inserted + value.slice(caret),
    caret: open.start + inserted.length,
  }
}
