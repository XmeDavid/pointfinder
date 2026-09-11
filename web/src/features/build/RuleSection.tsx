import { useEffect, useRef, type ReactNode } from 'react'
/** Reveal a decision when needed; saved rules remain expanded in the normal editor. */
export function RuleSection({
  title,
  configured = false,
  children,
}: {
  title: string
  configured?: boolean
  children: ReactNode
}) {
  const ref = useRef<HTMLDetailsElement>(null)
  useEffect(() => {
    if (configured && ref.current) ref.current.open = true
  }, [configured])
  return (
    <details ref={ref} className="mt-3">
      <summary className="min-h-8 cursor-pointer text-xs font-medium text-muted-foreground py-1.5 hover:text-foreground">
        {title}
      </summary>
      <div className="pt-1 pb-2">{children}</div>
    </details>
  )
}
