import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

export type StatusBadgeTone =
  | 'info'
  | 'success'
  | 'warning'
  | 'destructive'
  | 'muted'
  | 'override'

const toneStyles: Record<StatusBadgeTone, string> = {
  info: 'border-info/30 bg-info/10 text-info',
  success: 'border-success/30 bg-success/10 text-success',
  warning: 'border-warning/30 bg-warning/10 text-warning',
  destructive: 'border-destructive/30 bg-destructive/10 text-destructive',
  muted: 'border-border bg-muted text-muted-foreground',
  override: 'border-override/30 bg-override/10 text-override',
}

const statusBadgeVariants = cva(
  'inline-flex max-w-full shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium leading-5',
  {
    variants: {
      tone: toneStyles,
      size: {
        sm: 'px-1.5 py-0 text-[11px] leading-4',
        md: 'px-2 py-0.5 text-xs leading-5',
      },
    },
    defaultVariants: {
      tone: 'muted',
      size: 'md',
    },
  },
)

export interface StatusBadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof statusBadgeVariants> {
  label: React.ReactNode
  pulse?: boolean
}

export function StatusBadge({
  label,
  tone = 'muted',
  size,
  pulse = false,
  className,
  ...props
}: StatusBadgeProps) {
  return (
    <span
      className={cn(statusBadgeVariants({ tone, size }), className)}
      {...props}
    >
      {pulse && (
        <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-70" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-current" />
        </span>
      )}
      <span className="truncate">{label}</span>
    </span>
  )
}
