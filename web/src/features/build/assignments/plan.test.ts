import { describe, expect, it } from 'vitest'
import { createMockChallenge } from '@/test/factories/challenge'
import { ALL_TEAMS, baseMode, baseOfChallenge, cellChallenge, challengesAt, clearChallenge, mergeToAll, optionsFor, setCell, splitToTeams, type AssignmentRow } from './plan'

const G = 'g'
const TEAMS = ['falcons', 'lions']
const row = (baseId: string, challengeId: string, teamId?: string): AssignmentRow => ({ gameId: G, baseId, challengeId, teamId })
const sorted = (rows: AssignmentRow[]) =>
  [...rows].map((r) => `${r.baseId}:${r.teamId ?? 'all'}=${r.challengeId}`).sort()

describe('assignment plan', () => {
  it('reads a base mode and a cell', () => {
    const rows = [row('A', 'c1'), row('B', 'c2', 'falcons')]
    expect(baseMode(rows, 'A')).toBe('all')
    expect(baseMode(rows, 'B')).toBe('teams')
    expect(baseMode(rows, 'C')).toBe('none')
    expect(cellChallenge(rows, 'A', ALL_TEAMS)).toBe('c1')
    expect(cellChallenge(rows, 'B', 'falcons')).toBe('c2')
    expect(cellChallenge(rows, 'B', 'lions')).toBeNull()
  })

  it('builds the reverse-order route: same bases, opposite challenges per team', () => {
    let rows: AssignmentRow[] = []
    rows = setCell(rows, G, 'A', 'falcons', 'c1', TEAMS)
    rows = setCell(rows, G, 'B', 'falcons', 'c2', TEAMS)
    rows = setCell(rows, G, 'C', 'falcons', 'c3', TEAMS)
    rows = setCell(rows, G, 'A', 'lions', 'c3', TEAMS)
    rows = setCell(rows, G, 'B', 'lions', 'c2', TEAMS)
    rows = setCell(rows, G, 'C', 'lions', 'c1', TEAMS)
    expect(sorted(rows)).toEqual([
      'A:falcons=c1', 'A:lions=c3', 'B:falcons=c2', 'B:lions=c2', 'C:falcons=c3', 'C:lions=c1',
    ])
  })

  it('keeps a challenge at one base per team: moving it drops the old cell', () => {
    let rows = [row('A', 'c1', 'falcons')]
    rows = setCell(rows, G, 'C', 'falcons', 'c1', TEAMS)
    expect(sorted(rows)).toEqual(['C:falcons=c1'])
  })

  it('converts an all-teams base when one team gets its own challenge', () => {
    let rows = [row('A', 'c1'), row('B', 'c2')]
    rows = setCell(rows, G, 'A', 'lions', 'c3', TEAMS)
    expect(sorted(rows)).toEqual(['A:falcons=c1', 'A:lions=c3', 'B:all=c2'])
  })

  it('never drops another team\'s row on its behalf when converting', () => {
    // Data the rules no longer allow to be created; the server, not the planner, reports it.
    let rows = [row('A', 'c1'), row('C', 'c1', 'falcons')]
    rows = setCell(rows, G, 'A', 'lions', 'c3', TEAMS)
    expect(sorted(rows)).toEqual(['A:falcons=c1', 'A:lions=c3', 'C:falcons=c1'])
  })

  it('treats an all-teams row as every team\'s: the challenge is offered in no other column elsewhere', () => {
    const challenges = ['c1', 'c2', 'c3'].map((id) => createMockChallenge({ id, title: id }))
    const rows = [row('A', 'c1'), row('B', 'c2', 'lions')]
    expect(optionsFor(rows, challenges, 'C', 'falcons').map((c) => c.id)).toEqual(['c2', 'c3'])
    expect(optionsFor(rows, challenges, 'C', 'lions').map((c) => c.id)).toEqual(['c3'])
    expect(optionsFor(rows, challenges, 'C', ALL_TEAMS).map((c) => c.id)).toEqual(['c3'])
    expect(challengesAt(rows, 'A')).toEqual(['c1'])
  })

  it('an all-teams pick replaces the per-team rows and the same challenge anywhere else', () => {
    let rows = [row('A', 'c1', 'falcons'), row('A', 'c3', 'lions'), row('B', 'c2'), row('C', 'c2', 'lions')]
    rows = setCell(rows, G, 'A', ALL_TEAMS, 'c2', TEAMS)
    expect(sorted(rows)).toEqual(['A:all=c2'])
  })

  it('clears a cell, or a whole all-teams base', () => {
    expect(sorted(setCell([row('A', 'c1', 'falcons'), row('A', 'c3', 'lions')], G, 'A', 'lions', null, TEAMS))).toEqual(['A:falcons=c1'])
    expect(sorted(setCell([row('A', 'c1')], G, 'A', ALL_TEAMS, null, TEAMS))).toEqual([])
  })

  it('offers only challenges unused in the column, plus the cell\'s own', () => {
    const challenges = ['c1', 'c2', 'c3'].map((id) => createMockChallenge({ id, title: id }))
    const rows = [row('A', 'c1', 'falcons'), row('B', 'c2', 'falcons'), row('D', 'c3')]
    // Falcons meet c1 at A and c2 at B; c3 waits for everyone at D.
    expect(optionsFor(rows, challenges, 'C', 'falcons').map((c) => c.id)).toEqual([])
    expect(optionsFor(rows, challenges, 'B', 'falcons').map((c) => c.id)).toEqual(['c2'])
    expect(optionsFor(rows, challenges, 'C', 'lions').map((c) => c.id)).toEqual(['c1', 'c2'])
    expect(optionsFor(rows, challenges, 'B', ALL_TEAMS).map((c) => c.id)).toEqual(['c2'])
  })

  it('splits and merges a base between the two modes', () => {
    const split = splitToTeams([row('A', 'c1'), row('B', 'c1', 'lions')], G, 'A', TEAMS)
    expect(sorted(split)).toEqual(['A:falcons=c1', 'A:lions=c1', 'B:lions=c1'])
    const merged = mergeToAll([row('A', 'c1', 'falcons'), row('A', 'c3', 'lions')], G, 'A', 'c1')
    expect(sorted(merged)).toEqual(['A:all=c1'])
  })

  it('finds and clears a challenge', () => {
    const rows = [row('A', 'c1'), row('C', 'c2', 'lions')]
    expect(baseOfChallenge(rows, 'c1', ALL_TEAMS)).toBe('A')
    expect(baseOfChallenge(rows, 'c2', 'lions')).toBe('C')
    expect(baseOfChallenge(rows, 'c2', 'falcons')).toBeNull()
    expect(sorted(clearChallenge(rows, 'c2'))).toEqual(['A:all=c1'])
  })
})
