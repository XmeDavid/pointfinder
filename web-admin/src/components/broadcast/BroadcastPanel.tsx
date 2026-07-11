import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface BroadcastPanelProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  title?: ReactNode
  leading?: ReactNode
  children: ReactNode
  contentClassName?: string
}

export function BroadcastPanel({ title, leading, children, className, contentClassName, ...props }: BroadcastPanelProps) {
  return (
    <section className={cn('flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-panel', className)} {...props}>
      {(title || leading) && (
        <header className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
          {leading}
          <h2 className="min-w-0 truncate text-sm font-semibold text-foreground">{title}</h2>
        </header>
      )}
      <div className={cn('min-h-0 flex-1 p-3', contentClassName)}>{children}</div>
    </section>
  )
}
