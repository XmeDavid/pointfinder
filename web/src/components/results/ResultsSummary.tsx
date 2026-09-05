import type { ReactNode } from 'react'
import { SurfacePanel } from '@/components/layout/SurfacePanel'
import { cn } from '@/lib/utils'

export function ResultsSummary({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('grid grid-cols-2 gap-3 lg:grid-cols-4', className)}>{children}</div>
}

export function ResultsStat({ label, value, tone = 'default' }: { label: string; value: ReactNode; tone?: 'default' | 'pending' | 'success' }) {
  return (
    <SurfacePanel padding="sm" className={cn(tone === 'pending' && 'border-warning/40', tone === 'success' && 'border-success/40')}>
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn('mt-1 text-2xl font-bold tabular-nums', tone === 'pending' && 'text-warning', tone === 'success' && 'text-success')}>{value}</div>
    </SurfacePanel>
  )
}
