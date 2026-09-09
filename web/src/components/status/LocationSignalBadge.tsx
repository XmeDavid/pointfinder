import { useTranslation } from 'react-i18next'
import { StatusBadge } from './StatusBadge'
import {
  locationSignalLabelKey,
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
  const { t } = useTranslation()
  const label = t(locationSignalLabelKey[status])
  return (
    <StatusBadge
      tone={locationSignalTone[status]}
      label={label}
      size="sm"
      className={className}
      aria-label={t('status.locationSignalAria', { label })}
    />
  )
}
