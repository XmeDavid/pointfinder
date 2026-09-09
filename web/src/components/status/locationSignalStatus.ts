import type { StatusBadgeTone } from './StatusBadge'

export type LocationSignalStatus = 'active' | 'stale' | 'unknown'

/** Translation keys; render with `t(locationSignalLabelKey[status])`. */
export const locationSignalLabelKey: Record<LocationSignalStatus, string> = {
  active: 'status.locationSignal.active',
  stale: 'status.locationSignal.stale',
  unknown: 'status.locationSignal.unknown',
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
