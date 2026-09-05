import { describe, expect, it } from 'vitest'
import { mergeProgress, mergeStatus, statusFromSubmission, summarize } from './progress'
import type { PendingAction } from './queue'

const bp = (baseId: string, status: 'not_visited' | 'checked_in' | 'submitted' | 'completed' | 'rejected') => ({
  baseId,
  lat: 0,
  lng: 0,
  nfcLinked: true,
  checkInMethod: 'NFC' as const,
  status,
})

const act = (over: Partial<PendingAction> & { baseId: string; type: PendingAction['type'] }): PendingAction =>
  ({ id: 'x', gameId: 'g', createdAt: '2026-01-01T00:00:00Z', attempts: 0, nextAttemptAt: 0, state: 'pending', proof: { type: 'nfc', token: 't' }, challengeId: 'c', answer: '', ...over }) as unknown as PendingAction

describe('progress merging', () => {
  it('never lets a lower stage overwrite a higher one', () => {
    expect(mergeStatus('completed', 'checked_in')).toBe('completed')
    expect(mergeStatus('not_visited', 'submitted')).toBe('submitted')
    expect(mergeStatus('rejected', 'submitted')).toBe('submitted')
  })

  it('overlays queued actions and surfaces failures', () => {
    const views = mergeProgress(
      [bp('a', 'not_visited'), bp('b', 'checked_in'), bp('c', 'completed'), bp('d', 'not_visited')],
      [
        act({ baseId: 'a', type: 'check_in' }),
        act({ baseId: 'b', type: 'submission' }),
        act({ baseId: 'c', type: 'submission' }),
        act({ baseId: 'd', type: 'check_in', state: 'failed', lastError: 'Tag needs rewriting' }),
      ],
    )
    expect(views.map((v) => [v.baseId, v.effectiveStatus, v.pendingSync, v.syncError])).toEqual([
      ['a', 'checked_in', true, null],
      ['b', 'submitted', true, null],
      ['c', 'completed', true, null],
      ['d', 'not_visited', false, 'Tag needs rewriting'],
    ])
    expect(summarize(views)).toEqual({ total: 4, completed: 1, submitted: 1, checkedIn: 1, notVisited: 1, rejected: 0 })
  })

  it('maps review outcomes to base status', () => {
    expect(statusFromSubmission('approved')).toBe('completed')
    expect(statusFromSubmission('correct')).toBe('completed')
    expect(statusFromSubmission('rejected')).toBe('rejected')
    expect(statusFromSubmission('pending')).toBe('submitted')
  })
})

describe('the check-in method a base screen must render', () => {
  it('carries the base method and its resolved radius onto the view', () => {
    const [view] = mergeProgress([{ ...bp('a', 'not_visited'), checkInMethod: 'LOCATION' as const, checkInRadiusM: 40 }], [])
    expect(view).toMatchObject({ checkInMethod: 'LOCATION', checkInRadiusM: 40 })
  })

  it('falls back to a tag and the default radius for progress cached before methods existed', () => {
    const stale = { baseId: 'a', lat: 0, lng: 0, nfcLinked: true, status: 'not_visited' as const } as Parameters<typeof mergeProgress>[0][number]
    const [view] = mergeProgress([stale], [])
    expect(view).toMatchObject({ checkInMethod: 'NFC', checkInRadiusM: 15 })
  })
})
