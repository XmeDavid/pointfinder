import { describe, expect, it } from 'vitest'
import type { BaseProgress } from '@pointfinder/api'
import { baseRoute, missingPreviousBase } from './baseOrder'
import type { PendingAction } from './queue'

const bases = [1, 2, 3].map((n) => ({ baseId: `b${n}`, sequenceNumber: n, status: 'not_visited', checkedInAt: null })) as BaseProgress[]
const proof = (n: number, extra = {}): PendingAction => ({ id: `q${n}`, type: 'check_in', baseId: `b${n}`, gameId: 'g', proof: { type: 'nfc', token: 'proof' }, state: 'pending', createdAt: '', attempts: 0, nextAttemptAt: 0, ...extra })
const game = { enforceBaseOrder: true, nextRequiredBaseNumber: 1 }

describe('ordered route progression', () => {
  it('uses check-ins, never completed challenges, to advance', () => {
    const completed = bases.map((p) => ({ ...p, status: 'completed' as const }))
    const route = baseRoute(game, completed, [])
    expect(route.nextRequiredBaseNumber).toBe(1)
    expect(missingPreviousBase(route, completed[2])).toBe(1)
  })
  it('advances provisionally through contiguous pending proofs and records dependencies', () => {
    const route = baseRoute(game, bases, [proof(1), proof(2, { prerequisiteCheckInIds: ['q1'] })])
    expect(route).toMatchObject({ nextRequiredBaseNumber: 3, provisionalCheckInIds: ['q1', 'q2'] })
    expect(missingPreviousBase(route, bases[2])).toBeNull()
  })
  it('stops at missing or failed earlier check-ins', () => {
    expect(baseRoute(game, bases, [proof(2)]).nextRequiredBaseNumber).toBe(1)
    expect(baseRoute(game, bases, [proof(1, { state: 'failed' }), proof(2)]).nextRequiredBaseNumber).toBe(1)
  })
  it('does not advance over hidden bases omitted from player progress', () => {
    const route = baseRoute(game, [bases[0]!, bases[2]!], [proof(1)])
    expect(route.nextRequiredBaseNumber).toBe(2)
    expect(missingPreviousBase(route, bases[2])).toBe(2)
  })
  it('permits revisits and unrestricted games', () => {
    expect(missingPreviousBase(baseRoute(game, bases, []), { ...bases[2]!, checkedInAt: 'now' })).toBeNull()
    expect(missingPreviousBase(baseRoute({ enforceBaseOrder: false }, bases, []), bases[2])).toBeNull()
  })
  it('requires fresh authority when a cached ordered game lacks a frontier', () => {
    expect(missingPreviousBase(baseRoute({ enforceBaseOrder: true }, bases, []), bases[0])).toBeUndefined()
  })
})


it('does not invent a next base beyond the final locally confirmed check-in', () => {
  const confirmed = bases.map((p) => ({ ...p, checkedInAt: 'confirmed' }))
  expect(baseRoute({ enforceBaseOrder: true, nextRequiredBaseNumber: 3 }, confirmed, []).nextRequiredBaseNumber).toBeUndefined()
})

it('preserves a canonical hidden frontier beyond all visible base numbers', () => {
  expect(baseRoute({ enforceBaseOrder: true, nextRequiredBaseNumber: 4 }, bases, []).nextRequiredBaseNumber).toBe(4)
})

it('keeps pending dependencies when the locally advanced tail is unknown', () => {
  const route = baseRoute({ enforceBaseOrder: true, nextRequiredBaseNumber: 3 }, bases, [proof(3)])
  expect(route.nextRequiredBaseNumber).toBeUndefined()
  expect(route.provisionalCheckInIds).toEqual(['q3'])
})

describe('routes per stage', () => {
  const explore = 'stage-explore'
  const race = 'stage-race'
  const rows = [
    { baseId: 'e1', stageId: explore, status: 'not_visited', checkedInAt: null },
    { baseId: 'e2', stageId: explore, status: 'not_visited', checkedInAt: null },
    { baseId: 'r1', stageId: race, sequenceNumber: 1, status: 'not_visited', checkedInAt: null },
    { baseId: 'r2', stageId: race, sequenceNumber: 2, status: 'not_visited', checkedInAt: null },
  ] as BaseProgress[]
  const staged = { enforceBaseOrder: true, nextRequiredBaseNumber: 1, routes: [
    { stageId: explore, enforceBaseOrder: false, nextRequiredBaseNumber: null },
    { stageId: race, enforceBaseOrder: true, nextRequiredBaseNumber: 1 },
  ] }

  it('gates only the ordered stage and leaves the free stage alone', () => {
    const route = baseRoute(staged, rows, [])
    expect(missingPreviousBase(route, rows[1])).toBeNull()
    expect(missingPreviousBase(route, rows[3])).toBe(1)
    expect(missingPreviousBase(route, rows[2])).toBeNull()
    expect(route.enabled).toBe(true)
    expect(route.nextRequiredBaseNumber).toBe(1)
  })
  it('advances each route on its own pending proofs', () => {
    const route = baseRoute(staged, rows, [{ ...proof(1), baseId: 'r1' }])
    expect(route.scopes![race]!.nextRequiredBaseNumber).toBe(2)
    expect(route.scopes![race]!.provisionalCheckInIds).toEqual(['q1'])
    expect(missingPreviousBase(route, rows[3])).toBeNull()
  })
  it('treats a base of an unknown route as needing fresh authority', () => {
    const route = baseRoute(staged, rows, [])
    expect(missingPreviousBase(route, { baseId: 'x', stageId: 'stage-new', sequenceNumber: 2 } as BaseProgress)).toBeUndefined()
  })
  it('reads an older server without routes as one default route', () => {
    const route = baseRoute(game, bases, [])
    expect(Object.keys(route.scopes!)).toEqual(['default'])
    expect(missingPreviousBase(route, bases[2])).toBe(1)
  })
})
