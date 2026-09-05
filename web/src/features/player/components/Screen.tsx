import type { ReactNode } from 'react'
import { cn } from '@/components'

/** Full-height phone screen with safe-area padding. `bottomBar` is pinned above the home indicator. */
export function Screen({ children, bottomBar, className }: { children: ReactNode; bottomBar?: ReactNode; className?: string }) {
  return (
    <main className={cn('min-h-dvh flex flex-col bg-background text-foreground', className)}>
      <div className="safe-page mx-auto w-full max-w-2xl flex-1 flex flex-col gap-4">{children}</div>
      {bottomBar && (
        <div className="safe-gutter sticky bottom-0 bg-background/95 backdrop-blur border-t border-border pt-3 pb-[calc(var(--safe-bottom)+12px)]">{bottomBar}</div>
      )}
    </main>
  )
}
