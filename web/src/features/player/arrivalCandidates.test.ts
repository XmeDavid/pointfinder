import { describe, expect, it } from 'vitest'
import type { Base, BaseProgress } from '@pointfinder/api'
import type { PendingAction } from '@pointfinder/game-core'
import { buildCandidates } from './arrivalCandidates'

type BaseRow = Pick<Base, 'id' | 'lat' | 'lng' | 'hidden' | 'checkInMethod' | 'checkInRadiusM'>

function base(id: string, overrides: Partial<BaseRow> = {}): BaseRow {
  return { id, lat: 40.09, lng: -8.87, hidden: false, checkInMethod: 'LOCATION', checkInRadiusM: 20, ...overrides }
}

function progress(baseId: string, overrides: Partial<BaseProgress> = {}): BaseProgress {
  return { baseId, lat: 40.09, lng: -8.87, nfcLinked: false, checkInMethod: 'LOCATION', status: 'not_visited', checkedInAt: null, ...overrides }
}

describe('buildCandidates', () => {
  it('keeps unvisited location bases, including hidden geofence rows', () => {
    const result = buildCandidates({
      bases: [base('b1'), base('hidden1', { hidden: true, checkInRadiusM: 30 })],
      progress: [progress('b1')],
      pending: [],
      game: undefined,
    })
    expect(result).toEqual([
      { baseId: 'b1', lat: 40.09, lng: -8.87, radiusM: 20, hidden: false },
      { baseId: 'hidden1', lat: 40.09, lng: -8.87, radiusM: 30, hidden: true },
    ])
  })

  it('drops NFC and QR bases', () => {
    const result = buildCandidates({
      bases: [base('b1', { checkInMethod: 'NFC' }), base('b2', { checkInMethod: 'QR' })],
      progress: [progress('b1'), progress('b2')],
      pending: [],
      game: undefined,
    })
    expect(result).toEqual([])
  })

  it('drops bases the team already checked in to', () => {
    const result = buildCandidates({
      bases: [base('b1')],
      progress: [progress('b1', { status: 'checked_in', checkedInAt: '2026-09-05T10:00:00Z' })],
      pending: [],
      game: undefined,
    })
    expect(result).toEqual([])
  })

  it('drops bases with a check-in already queued but keeps ones whose proof failed', () => {
    const queued: PendingAction = { type: 'check_in', id: 'q', gameId: 'g1', baseId: 'b1', proof: { type: 'geo', lat: 40.09, lng: -8.87, accuracy: 8, capturedAt: '2026-09-05T10:00:00Z', claimed: false }, createdAt: '', state: 'pending', attempts: 0, nextAttemptAt: 0 }
    const failed: PendingAction = { ...queued, id: 'f', baseId: 'b2', state: 'failed' }
    const result = buildCandidates({
      bases: [base('b1'), base('b2')],
      progress: [progress('b1'), progress('b2')],
      pending: [queued, failed],
      game: undefined,
    })
    expect(result.map((c) => c.baseId)).toEqual(['b2'])
  })

  it('drops bases blocked by the enforced base order', () => {
    const result = buildCandidates({
      bases: [base('b1'), base('b2')],
      progress: [progress('b1', { sequenceNumber: 1 }), progress('b2', { sequenceNumber: 2 })],
      pending: [],
      game: { enforceBaseOrder: true, nextRequiredBaseNumber: 1 },
    })
    expect(result.map((c) => c.baseId)).toEqual(['b1'])
  })

  it('never proposes a hidden base while the route is enforced and unproven', () => {
    const result = buildCandidates({
      bases: [base('hidden1', { hidden: true })],
      progress: [],
      pending: [],
      game: { enforceBaseOrder: true, nextRequiredBaseNumber: 1 },
    })
    expect(result).toEqual([])
  })

  it('falls back to the game default radius when a row carries none', () => {
    const result = buildCandidates({
      bases: [base('b1', { checkInRadiusM: null })],
      progress: [progress('b1')],
      pending: [],
      game: undefined,
    })
    expect(result[0]?.radiusM).toBe(15)
  })
})
