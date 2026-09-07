import type { Scenario, TourActions, TourState } from '../types'

/**
 * A variable outcome: one challenge, one completion text, a different next
 * stop per team through a team variable. The practice game is a complete
 * game whose first challenge is pinned to the old mill.
 */
const KEY = 'next'
const PLACEHOLDER = `{{${KEY}}}`

function ensureBuild(a: TourActions, s: TourState) {
  if (s.mode !== 'build') a.setMode('build')
}
function pinned(s: TourState) {
  return s.challenges.find((challenge) => challenge.fixedBaseId || s.bases.some((base) => base.fixedChallengeId === challenge.id)) ?? s.challenges[0] ?? null
}
function openPinned(a: TourActions, s: TourState) {
  ensureBuild(a, s)
  a.openDrawer('challenges')
  a.selectChallenge(pinned(s)?.id ?? null)
}
function since(s: TourState, stepId: string): number {
  return s.stepCompletedAt[stepId] ?? s.startedAt
}

export const variableOutcome: Scenario = {
  id: 'variable-outcome',
  entry: 'practice-game',
  title: 'tutorials.scenarios.variableOutcome.title',
  blurb: 'tutorials.scenarios.variableOutcome.blurb',
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
      copy: { title: 'tutorials.variableOutcome.intro.title', body: 'tutorials.variableOutcome.intro.body' },
    },
    {
      id: 'open-challenge',
      route: 'workspace',
      anchor: (s) => `challenge-item-${pinned(s)?.id ?? ''}`,
      prepare: (a, s) => {
        ensureBuild(a, s)
        a.selectChallenge(null)
        a.openDrawer('challenges')
      },
      done: { kind: 'predicate', test: (s) => s.clickedSteps.has('open-challenge') || s.selectedChallengeId === pinned(s)?.id },
      copy: { title: 'tutorials.variableOutcome.open-challenge.title', body: 'tutorials.variableOutcome.open-challenge.body' },
    },
    {
      id: 'variable-key',
      route: 'workspace',
      anchor: 'variable-key-input',
      prepare: openPinned,
      done: { kind: 'predicate', test: (s) => s.field('variable-key-input').value === KEY || s.field(`variable-value-${KEY}-${s.teams[0]?.id ?? ''}`).present },
      copy: { title: 'tutorials.variableOutcome.variable-key.title', body: 'tutorials.variableOutcome.variable-key.body' },
    },
    {
      id: 'variable-add',
      route: 'workspace',
      anchor: 'add-variable-btn',
      prepare: openPinned,
      done: { kind: 'predicate', test: (s) => s.field(`variable-value-${KEY}-${s.teams[0]?.id ?? ''}`).present },
      copy: { title: 'tutorials.variableOutcome.variable-add.title', body: 'tutorials.variableOutcome.variable-add.body' },
    },
    {
      id: 'variable-values',
      route: 'workspace',
      anchor: (s) => `variable-value-${KEY}-${s.teams[0]?.id ?? ''}`,
      prepare: openPinned,
      done: { kind: 'predicate', test: (s) => s.teams.length > 0 && s.teams.every((team) => s.field(`variable-value-${KEY}-${team.id}`).value.length > 0) },
      copy: { title: 'tutorials.variableOutcome.variable-values.title', body: 'tutorials.variableOutcome.variable-values.body' },
    },
    {
      id: 'variable-save',
      route: 'workspace',
      anchor: 'save-variables-btn',
      prepare: openPinned,
      done: { kind: 'predicate', test: (s) => (s.lastSuccess['variables:challenge'] ?? 0) > since(s, 'variable-values') },
      copy: { title: 'tutorials.variableOutcome.variable-save.title', body: 'tutorials.variableOutcome.variable-save.body' },
    },
    {
      id: 'completion',
      route: 'workspace',
      anchor: 'completion-content',
      prepare: openPinned,
      // The placeholder itself, not the bare word: the seeded text may mention it.
      done: { kind: 'predicate', test: (s) => s.field('completion-content').value.includes(PLACEHOLDER) },
      copy: { title: 'tutorials.variableOutcome.completion.title', body: 'tutorials.variableOutcome.completion.body' },
    },
    {
      id: 'challenge-save',
      route: 'workspace',
      anchor: 'save-challenge',
      prepare: openPinned,
      done: { kind: 'predicate', test: (s) => (s.lastSuccess['challenge:update'] ?? 0) > since(s, 'completion') },
      copy: { title: 'tutorials.variableOutcome.challenge-save.title', body: 'tutorials.variableOutcome.challenge-save.body' },
    },
    {
      id: 'finish',
      route: 'workspace',
      anchor: '',
      done: { kind: 'ack' },
      copy: { title: 'tutorials.variableOutcome.finish.title', body: 'tutorials.variableOutcome.finish.body' },
    },
  ],
}
