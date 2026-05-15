import type { StatusBadgeTone } from './StatusBadge'

export type LocationSignalStatus = 'active' | 'stale' | 'unknown'

export const locationSignalLabel: Record<LocationSignalStatus, string> = {
  active: 'Active',
  stale: 'Stale',
  unknown: 'No signal',
}

export const locationSignalTone: Record<LocationSignalStatus, StatusBadgeTone> = {
  active: 'success',
  stale: 'warning',
  unknown: 'muted',
}

export const locationSignalDotClass: Record<LocationSignalStatus, string> = {
  active: 'bg-success',
  stale: 'bg-warning',
  unknown: 'bg-muted-foreground',
}
