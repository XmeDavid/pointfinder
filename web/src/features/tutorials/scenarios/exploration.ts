import type { Scenario, TourActions, TourState } from '../types'

/**
 * Hide one base and teach the clue that leads a team to it. Hidden bases have
 * no pin and no list row for players until they check in there (the player
 * progress endpoint drops them), so the clue text on another challenge is the
 * whole game mechanic.
 */
function ensureBuild(a: TourActions, s: TourState): void {
  if (s.mode !== 'build') a.setMode('build')
}

function clueChallengeId(s: TourState): string | null {
  const selected = s.bases.find((b) => b.id === s.selectedBaseId)
  if (selected?.fixedChallengeId) return selected.fixedChallengeId
  const assigned = selected ? s.assignments.find((a) => a.baseId === selected.id)?.challengeId : undefined
  return assigned ?? s.challenges[0]?.id ?? null
}

export const exploration: Scenario = {
  id: 'exploration',
  entry: 'setup-game',
  title: 'tutorials.scenarios.exploration.title',
  blurb: 'tutorials.scenarios.exploration.blurb',
  steps: [
    {
      id: 'place-first',
      route: 'workspace',
      anchor: 'map-wrapper',
      when: (s) => s.bases.length === 0,
      prepare: ensureBuild,
      done: { kind: 'predicate', test: (s) => s.bases.length > 0 },
      copy: {
        title: 'tutorials.exploration.place-first.title',
        body: 'tutorials.exploration.place-first.body',
      },
    },
    {
      id: 'pick-base',
      route: 'workspace',
      anchor: (s) => `base-item-${s.bases[0]?.id ?? ''}`,
      when: (s) => s.bases.length > 0,
      prepare: (a, s) => {
        ensureBuild(a, s)
        a.openDrawer('bases')
      },
      done: { kind: 'predicate', test: (s) => s.selectedBaseId !== null },
      copy: {
        title: 'tutorials.exploration.pick-base.title',
        body: 'tutorials.exploration.pick-base.body',
      },
    },
    {
      id: 'hide',
      route: 'workspace',
      anchor: 'visibility-hidden',
      prepare: (a, s) => {
        if (!s.drawerOpen) a.openDrawer('bases')
      },
      // Visibility is a draft in BaseDetail's local state; aria-pressed is the only reading.
      done: { kind: 'predicate', test: (s) => s.field('visibility-hidden').pressed === true },
      copy: {
        title: 'tutorials.exploration.hide.title',
        body: 'tutorials.exploration.hide.body',
      },
    },
    {
      id: 'hide-save',
      route: 'workspace',
      anchor: 'save-base-btn',
      prepare: (a, s) => {
        if (!s.drawerOpen) a.openDrawer('bases')
      },
      done: {
        kind: 'predicate',
        test: (s) => s.bases.find((b) => b.id === s.selectedBaseId)?.hidden === true,
      },
      copy: {
        title: 'tutorials.exploration.hide-save.title',
        body: 'tutorials.exploration.hide-save.body',
      },
    },
    {
      id: 'clue',
      route: 'workspace',
      anchor: 'completion-content',
      when: (s) => s.challenges.length > 0,
      prepare: (a, s) => {
        a.openDrawer('challenges')
        const id = clueChallengeId(s)
        if (id) a.selectChallenge(id)
      },
      done: { kind: 'ack' },
      copy: {
        title: 'tutorials.exploration.clue.title',
        body: 'tutorials.exploration.clue.body',
      },
    },
    {
      id: 'readiness',
      route: 'workspace',
      anchor: 'readiness-indicator',
      prepare: (a) => {
        a.closeDrawer()
        a.setSettingsPanelOpen(false)
        a.setReadinessExpanded(true)
      },
      done: { kind: 'ack' },
      copy: {
        title: 'tutorials.exploration.readiness.title',
        body: 'tutorials.exploration.readiness.body',
      },
    },
  ],
}
