import { StatusBadge } from './StatusBadge'
import type { StatusBadgeTone } from './StatusBadge'

export type NfcStatus = 'linked' | 'missing'

const nfcStatusTone: Record<NfcStatus, StatusBadgeTone> = {
  linked: 'success',
  missing: 'warning',
}

const nfcStatusLabel: Record<NfcStatus, string> = {
  linked: 'NFC linked',
  missing: 'NFC missing',
}

export interface NfcStatusBadgeProps {
  status: NfcStatus
  className?: string
}

export function NfcStatusBadge({ status, className }: NfcStatusBadgeProps) {
  return (
    <StatusBadge
      tone={nfcStatusTone[status]}
      label={nfcStatusLabel[status]}
      className={className}
      aria-label={`NFC status: ${nfcStatusLabel[status]}`}
    />
  )
}
