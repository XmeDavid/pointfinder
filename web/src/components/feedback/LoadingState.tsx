import { LoaderCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface LoadingStateProps {
  label?: string
  className?: string
}

export function LoadingState({
  label = 'Loading',
  className,
}: LoadingStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex h-full flex-col items-center justify-center gap-3 p-8 text-center text-muted-foreground',
        className,
      )}
    >
      <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />
      <span className="text-xs font-medium">{label}</span>
    </div>
  )
}
