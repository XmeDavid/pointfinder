import { describe, expect, it } from 'vitest'
import { ARRIVAL_RETRY_MS, emptyArrivalState, evaluateArrival, type ArrivalCandidate } from './arrival'
import type { Fix } from './location'

const here = { lat: 40.09, lng: -8.87 }
const at = (metresNorth: number, accuracy: number, capturedAt: number): Fix => ({
  lat: here.lat + metresNorth / 111_194.9,
  lng: here.lng,
  accuracy,
  capturedAt,
})

const mill: ArrivalCandidate = { baseId: 'b1', lat: here.lat, lng: here.lng, radiusM: 15, hidden: false }
const chapel: ArrivalCandidate = { baseId: 'b2', lat: here.lat + 0.01, lng: here.lng, radiusM: 15, hidden: false }
const cache: ArrivalCandidate = { baseId: 'hidden', lat: here.lat, lng: here.lng, radiusM: 15, hidden: true }

describe('arrival detection', () => {
  it('fires once for the base the team reached and leaves the far one alone', () => {
    const result = evaluateArrival(at(0, 8, 1_000), [mill, chapel], emptyArrivalState(), 1_000)
    expect(result.fire.map((c) => c.baseId)).toEqual(['b1'])
    expect(result.state.attemptedAt).toEqual({ b1: 1_000 })
  })

  it('backs off for half a minute before trying the same base again', () => {
    const first = evaluateArrival(at(0, 8, 1_000), [mill], emptyArrivalState(), 1_000)
    const soon = evaluateArrival(at(0, 8, 5_000), [mill], first.state, 5_000)
    expect(soon.fire).toEqual([])
    const later = evaluateArrival(at(0, 8, 40_000), [mill], soon.state, 1_000 + ARRIVAL_RETRY_MS)
    expect(later.fire.map((c) => c.baseId)).toEqual(['b1'])
  })

  it('detects a hidden base without treating it differently', () => {
    const result = evaluateArrival(at(0, 8, 1_000), [cache], emptyArrivalState(), 1_000)
    expect(result.fire).toEqual([cache])
  })

  it('never fires on a fix too coarse to vouch for', () => {
    const result = evaluateArrival(at(0, 90, 1_000), [mill], emptyArrivalState(), 1_000)
    expect(result.fire).toEqual([])
  })

  it('offers a claim after a minute inside the wider ring', () => {
    let state = emptyArrivalState()
    let last = evaluateArrival(at(44, 90, 0), [mill], state, 0)
    for (const t of [20_000, 40_000, 60_000]) {
      state = last.state
      last = evaluateArrival(at(44, 90, t), [mill], state, t)
    }
    expect(last.claimable).toEqual(['b1'])
    expect(last.fire).toEqual([])
  })

  it('forgets the dwell buffer as soon as the team leaves the ring', () => {
    const inside = evaluateArrival(at(44, 90, 0), [mill], emptyArrivalState(), 0)
    expect(inside.state.dwell.b1).toHaveLength(1)
    const away = evaluateArrival(at(400, 90, 20_000), [mill], inside.state, 20_000)
    expect(away.state.dwell.b1).toBeUndefined()
    expect(away.claimable).toEqual([])
  })

  it('does nothing when the team has no candidates left', () => {
    const result = evaluateArrival(at(0, 8, 1_000), [], emptyArrivalState(), 1_000)
    expect(result).toMatchObject({ fire: [], claimable: [] })
  })
})
