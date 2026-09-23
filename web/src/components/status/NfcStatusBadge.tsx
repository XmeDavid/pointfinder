import { useTranslation } from 'react-i18next'
import { StatusBadge } from './StatusBadge'
import type { StatusBadgeTone } from './StatusBadge'

export type NfcStatus = 'linked' | 'missing'

const nfcStatusTone: Record<NfcStatus, StatusBadgeTone> = {
  linked: 'success',
  missing: 'warning',
}

export interface NfcStatusBadgeProps {
  status: NfcStatus
  className?: string
}

export function NfcStatusBadge({ status, className }: NfcStatusBadgeProps) {
  const { t } = useTranslation()
  const label = t(`status.nfc.${status}`)
  return (
    <StatusBadge
      tone={nfcStatusTone[status]}
      label={label}
      className={className}
      aria-label={t('status.nfcAria', { label })}
    />
  )
}
