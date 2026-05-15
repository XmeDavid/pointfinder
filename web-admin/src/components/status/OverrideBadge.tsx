import { StatusBadge } from './StatusBadge'

export interface OverrideBadgeProps {
  label?: string
  className?: string
}

export function OverrideBadge({
  label = 'Override',
  className,
}: OverrideBadgeProps) {
  return (
    <StatusBadge
      tone="override"
      label={label}
      className={className}
      aria-label={`Operator override: ${label}`}
    />
  )
}
