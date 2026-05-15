import { StatusBadge } from './StatusBadge'
import {
  locationSignalLabel,
  locationSignalTone,
  type LocationSignalStatus,
} from './locationSignalStatus'

export interface LocationSignalBadgeProps {
  status: LocationSignalStatus
  className?: string
}

export function LocationSignalBadge({
  status,
  className,
}: LocationSignalBadgeProps) {
  return (
    <StatusBadge
      tone={locationSignalTone[status]}
      label={locationSignalLabel[status]}
      size="sm"
      className={className}
      aria-label={`Location signal: ${locationSignalLabel[status]}`}
    />
  )
}
