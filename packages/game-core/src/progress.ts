import type { BaseProgress, BaseStatus, SubmissionStatus } from '@pointfinder/api'
import { DEFAULT_CHECK_IN_RADIUS_M } from './geofence'
import type { CheckInMethod } from './proof'
import type { PendingAction } from './queue'

/**
 * What the player sees per base, once the server's view and the local
 * queue are combined. A queued check-in shows as checked in; a queued
 * submission shows as submitted; a failed action shows the failure so the
 * player is never left with a silent gap.
 */
export interface BaseView extends BaseProgress {
  /** Server status merged with queued local actions. */
  effectiveStatus: BaseStatus
  /** True when a local action for this base has not reached the server yet. */
  pendingSync: boolean
  /** Set when a local action for this base was refused by the server. */
  syncError?: string | null
  /** How this base is entered. Always answered, so a screen never has to guess. */
  checkInMethod: CheckInMethod
  /** Metres, already resolved: the base's own radius or the game default. */
  checkInRadiusM: number
}

const ORDER: Record<BaseStatus, number> = { not_visited: 0, checked_in: 1, rejected: 2, submitted: 3, completed: 4 }

/** The later stage wins, except that a rejection never hides a completion. */
export function mergeStatus(a: BaseStatus, b: BaseStatus): BaseStatus {
  return ORDER[a] >= ORDER[b] ? a : b
}

export function mergeProgress(progress: BaseProgress[], pending: PendingAction[]): BaseView[] {
  const byBase = new Map<string, PendingAction[]>()
  for (const a of pending) {
    const list = byBase.get(a.baseId) ?? []
    list.push(a)
    byBase.set(a.baseId, list)
  }
  return progress.map((p) => {
    const actions = byBase.get(p.baseId) ?? []
    let status = p.status
    let pendingSync = false
    let syncError: string | null = null
    for (const a of actions) {
      if (a.state === 'failed') {
        syncError = a.lastError ?? 'Sync failed'
        continue
      }
      pendingSync = true
      status = mergeStatus(status, a.type === 'check_in' ? 'checked_in' : 'submitted')
    }
    // A snapshot cached before methods existed has neither field; it was a tag base.
    const stored: { checkInMethod?: CheckInMethod | null; checkInRadiusM?: number | null } = p
    return {
      ...p,
      effectiveStatus: status,
      pendingSync,
      syncError,
      checkInMethod: stored.checkInMethod ?? 'NFC',
      checkInRadiusM: stored.checkInRadiusM ?? DEFAULT_CHECK_IN_RADIUS_M,
    }
  })
}

export interface ProgressSummary {
  total: number
  completed: number
  submitted: number
  checkedIn: number
  notVisited: number
  rejected: number
}

export function summarize(views: Pick<BaseView, 'effectiveStatus'>[]): ProgressSummary {
  const s: ProgressSummary = { total: views.length, completed: 0, submitted: 0, checkedIn: 0, notVisited: 0, rejected: 0 }
  for (const v of views) {
    switch (v.effectiveStatus) {
      case 'completed': s.completed++; break
      case 'submitted': s.submitted++; break
      case 'checked_in': s.checkedIn++; break
      case 'rejected': s.rejected++; break
      default: s.notVisited++
    }
  }
  return s
}

/** Map a submission's review status to the base status the backend would report. */
export function statusFromSubmission(status: SubmissionStatus): BaseStatus {
  switch (status) {
    case 'approved':
    case 'correct':
      return 'completed'
    case 'rejected':
      return 'rejected'
    default:
      return 'submitted'
  }
}
