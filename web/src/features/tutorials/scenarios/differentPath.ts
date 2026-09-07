import type { Scenario, TourActions, TourState } from '../types'

/**
 * A different path: three bases, two teams, the same three challenges in the
 * same order, but one team starts at A and the other at C. The whole lesson
 * happens in the assignment grid.
 */
function ensureBuild(a: TourActions, s: TourState) {
  if (s.mode !== 'build') a.setMode('build')
}
function team(s: TourState, name: string) {
  return s.teams.find((candidate) => candidate.name === name) ?? null
}
function base(s: TourState, prefix: string) {
  return s.bases.find((candidate) => candidate.name.startsWith(prefix)) ?? null
}
function challenge(s: TourState, prefix: string) {
  return s.challenges.find((candidate) => candidate.title.startsWith(prefix)) ?? null
}
/** True when `teamName` meets challenge `n` at the base with `basePrefix`. */
function has(s: TourState, teamName: string, basePrefix: string, n: string): boolean {
  const t = team(s, teamName)
  const b = base(s, basePrefix)
  const c = challenge(s, n)
  if (!t || !b || !c) return false
  // An all-teams row counts for every team, as in the grid model.
  return s.assignments.some((row) => (!row.teamId || row.teamId === t.id) && row.baseId === b.id && row.challengeId === c.id)
}
const FALCONS_DONE = (s: TourState) => has(s, 'Falcons', 'Base A', '1') && has(s, 'Falcons', 'Base B', '2') && has(s, 'Falcons', 'Base C', '3')
const LIONS_DONE = (s: TourState) => has(s, 'Lions', 'Base C', '1') && has(s, 'Lions', 'Base B', '2') && has(s, 'Lions', 'Base A', '3')

function openGrid(a: TourActions, s: TourState) {
  ensureBuild(a, s)
  a.selectBase(null)
  a.openDrawer('bases')
}

export const differentPath: Scenario = {
  id: 'different-path',
  entry: 'practice-game',
  title: 'tutorials.scenarios.differentPath.title',
  blurb: 'tutorials.scenarios.differentPath.blurb',
  steps: [
    {
      id: 'intro',
      route: 'workspace',
      anchor: 'map-wrapper',
      prepare: (a, s) => {
        ensureBuild(a, s)
        a.closeDrawer()
      },
      done: { kind: 'ack' },
      copy: { title: 'tutorials.differentPath.intro.title', body: 'tutorials.differentPath.intro.body' },
    },
    {
      id: 'open-grid',
      route: 'workspace',
      anchor: 'assignment-grid-btn',
      prepare: openGrid,
      done: { kind: 'predicate', test: (s) => s.field('assignment-grid').present },
      copy: { title: 'tutorials.differentPath.open-grid.title', body: 'tutorials.differentPath.open-grid.body' },
    },
    {
      id: 'falcons',
      route: 'workspace',
      anchor: (s) => `assignment-cell-${base(s, 'Base A')?.id ?? ''}-${team(s, 'Falcons')?.id ?? ''}`,
      prepare: openGrid,
      done: { kind: 'predicate', test: FALCONS_DONE },
      copy: { title: 'tutorials.differentPath.falcons.title', body: 'tutorials.differentPath.falcons.body' },
    },
    {
      id: 'lions',
      route: 'workspace',
      anchor: (s) => `assignment-cell-${base(s, 'Base C')?.id ?? ''}-${team(s, 'Lions')?.id ?? ''}`,
      prepare: openGrid,
      done: { kind: 'predicate', test: (s) => FALCONS_DONE(s) && LIONS_DONE(s) },
      copy: { title: 'tutorials.differentPath.lions.title', body: 'tutorials.differentPath.lions.body' },
    },
    {
      id: 'briefing',
      route: 'workspace',
      anchor: 'assignment-grid',
      prepare: openGrid,
      done: { kind: 'ack' },
      copy: { title: 'tutorials.differentPath.briefing.title', body: 'tutorials.differentPath.briefing.body' },
    },
    {
      id: 'finish',
      route: 'workspace',
      anchor: '',
      done: { kind: 'ack' },
      copy: { title: 'tutorials.differentPath.finish.title', body: 'tutorials.differentPath.finish.body' },
    },
  ],
}
