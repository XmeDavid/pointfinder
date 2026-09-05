import { describe, expect, it } from 'vitest'
import type { BaseProgress, GameDataResponse } from '@pointfinder/api'
import type { PendingAction } from '@pointfinder/game-core'
import { buildLogbook, challengeForBase, newlyUnlocked } from '@/features/player/logbook'

const p = (baseId: string, status: BaseProgress['status'], title: string | null = 'T'): BaseProgress => ({
  baseId, challengeTitle: title, lat: 0, lng: 0, nfcLinked: true, checkInMethod: 'NFC', status,
})

describe('buildLogbook', () => {
  it('lists open bases first, then hidden unlock targets as locked', () => {
    const lb = buildLogbook([p('a', 'completed'), p('b', 'not_visited')], [{ id: 'a', hidden: false }, { id: 'b', hidden: false }, { id: 'h', hidden: true }], [])
    expect(lb.entries.map((e) => `${e.kind}:${e.baseId}`)).toEqual(['open:a', 'open:b', 'locked:h'])
    expect(lb.summary.completed).toBe(1)
    expect(lb.nextUp.map((e) => e.baseId)).toEqual(['b'])
  })

  it('does not lock a hidden base the team already unlocked', () => {
    const lb = buildLogbook([p('h', 'checked_in')], [{ id: 'h', hidden: true }], [])
    expect(lb.entries).toHaveLength(1)
    expect(lb.entries[0]!.kind).toBe('open')
  })

  it('reflects a queued check-in', () => {
    const pending: PendingAction = { type: 'check_in', id: 'q', gameId: 'g', baseId: 'b', proof: { type: 'nfc', token: 't' }, createdAt: '', attempts: 0, nextAttemptAt: 0, state: 'pending' }
    const lb = buildLogbook([p('b', 'not_visited')], [], [pending])
    const e = lb.entries[0]!
    expect(e.kind === 'open' && e.view.effectiveStatus).toBe('checked_in')
    expect(e.kind === 'open' && e.view.pendingSync).toBe(true)
  })
})

describe('newlyUnlocked', () => {
  it('reports bases that turned from locked to open', () => {
    const before = buildLogbook([p('a', 'completed')], [{ id: 'h', hidden: true }], [])
    const after = buildLogbook([p('a', 'completed'), p('h', 'not_visited')], [{ id: 'h', hidden: true }], [])
    expect(newlyUnlocked(before, after)).toEqual(['h'])
    expect(newlyUnlocked(null, after)).toEqual([])
  })
})

describe('challengeForBase', () => {
  const data = {
    bases: [{ id: 'b1', name: '', description: '', lat: 0, lng: 0, nfcLinked: true, fixedChallengeId: 'cf' }],
    challenges: [
      { id: 'ct', title: 'team', description: '', content: '', answerType: 'text', points: 0 },
      { id: 'cg', title: 'global', description: '', content: '', answerType: 'text', points: 0 },
      { id: 'cf', title: 'fixed', description: '', content: '', answerType: 'text', points: 0 },
    ],
    assignments: [
      { id: '1', baseId: 'b1', challengeId: 'cg', teamId: null },
      { id: '2', baseId: 'b1', challengeId: 'ct', teamId: 'team' },
    ],
    progress: [],
  } as unknown as GameDataResponse

  it('prefers the team assignment, then the global one, then the fixed challenge', () => {
    expect(challengeForBase(data, 'b1', 'team')?.id).toBe('ct')
    expect(challengeForBase(data, 'b1', 'other')?.id).toBe('cg')
    expect(challengeForBase({ ...data, assignments: [] }, 'b1', 'team')?.id).toBe('cf')
  })
})
