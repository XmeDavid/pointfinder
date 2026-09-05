import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface EmptyStateProps extends HTMLAttributes<HTMLDivElement> {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  density?: 'compact' | 'default';
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  density = 'default',
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex h-full flex-col items-center justify-center text-center',
        density === 'compact' ? 'gap-2 p-4' : 'gap-3 p-8',
        className,
      )}
      {...props}
    >
      {icon && <div className="text-muted-foreground">{icon}</div>}
      <h3 className="text-sm font-medium text-foreground">{title}</h3>
      {description && (
        <p className="max-w-[240px] text-xs text-muted-foreground">
          {description}
        </p>
      )}
      {action}
    </div>
  );
}
