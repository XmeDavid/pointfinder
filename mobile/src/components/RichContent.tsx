import { useMemo } from 'react'

/**
 * Operator-authored challenge content comes from the web editor as HTML.
 * Scripts and inline handlers are stripped before rendering; everything else keeps its formatting.
 */
export function RichContent({ html, className }: { html: string; className?: string }) {
  const safe = useMemo(
    () => html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      .replace(/(href|src)\s*=\s*("javascript:[^"]*"|'javascript:[^']*')/gi, ''),
    [html],
  )
  if (!/[<>]/.test(html)) return <p className={className}>{html}</p>
  return <div className={className} dangerouslySetInnerHTML={{ __html: safe }} />
}
