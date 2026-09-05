import { StatusBadge } from './StatusBadge'
import type { StatusBadgeTone } from './StatusBadge'

export type SyncStatus = 'online' | 'offline' | 'sync_pending' | 'sync_failed'

const syncStatusTone: Record<SyncStatus, StatusBadgeTone> = {
  online: 'success',
  offline: 'muted',
  sync_pending: 'warning',
  sync_failed: 'destructive',
}

const syncStatusLabel: Record<SyncStatus, string> = {
  online: 'Online',
  offline: 'Offline',
  sync_pending: 'Sync pending',
  sync_failed: 'Sync failed',
}

export interface SyncStatusBadgeProps {
  status: SyncStatus
  className?: string
}

export function SyncStatusBadge({ status, className }: SyncStatusBadgeProps) {
  return (
    <StatusBadge
      tone={syncStatusTone[status]}
      label={syncStatusLabel[status]}
      className={className}
      aria-label={`Connection status: ${syncStatusLabel[status]}`}
    />
  )
}
