import { useTranslation } from 'react-i18next'
import { StatusBadge } from './StatusBadge'
import type { StatusBadgeTone } from './StatusBadge'

export type SyncStatus = 'online' | 'offline' | 'sync_pending' | 'sync_failed'

const syncStatusTone: Record<SyncStatus, StatusBadgeTone> = {
  online: 'success',
  offline: 'muted',
  sync_pending: 'warning',
  sync_failed: 'destructive',
}

const syncStatusLabelKey: Record<SyncStatus, string> = {
  online: 'status.sync.online',
  offline: 'status.sync.offline',
  sync_pending: 'status.sync.sync_pending',
  sync_failed: 'status.sync.sync_failed',
}

export interface SyncStatusBadgeProps {
  status: SyncStatus
  className?: string
}

export function SyncStatusBadge({ status, className }: SyncStatusBadgeProps) {
  const { t } = useTranslation()
  const label = t(syncStatusLabelKey[status])
  return (
    <StatusBadge
      tone={syncStatusTone[status]}
      label={label}
      className={className}
      aria-label={t('status.syncAria', { label })}
    />
  )
}
