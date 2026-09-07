import type { Scenario, TourActions, TourState } from '../types'

/**
 * Unlock chain: bases that appear as challenges are completed, with a fork
 * and a bonus base back down the trail. The practice game is seeded with the
 * whole chain except its first link, which the operator sets.
 */
const TRAILHEAD = 'Trailhead'
const BRIDGE = 'Old bridge'

function baseNamed(s: TourState, name: string) {
  return s.bases.find((base) => base.name === name) ?? null
}
function challengeAt(s: TourState, baseName: string) {
  const base = baseNamed(s, baseName)
  if (!base) return null
  return s.challenges.find((challenge) => challenge.fixedBaseId === base.id || base.fixedChallengeId === challenge.id) ?? null
}
function ensureBuild(a: TourActions, s: TourState) {
  if (s.mode !== 'build') a.setMode('build')
}
function openTrailheadChallenge(a: TourActions, s: TourState) {
  ensureBuild(a, s)
  a.openDrawer('challenges')
  a.selectChallenge(challengeAt(s, TRAILHEAD)?.id ?? null)
}

export const unlockChain: Scenario = {
  id: 'unlock-chain',
  entry: 'practice-game',
  title: 'tutorials.scenarios.unlockChain.title',
  blurb: 'tutorials.scenarios.unlockChain.blurb',
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
      copy: { title: 'tutorials.unlockChain.intro.title', body: 'tutorials.unlockChain.intro.body' },
    },
    {
      id: 'open-first',
      route: 'workspace',
      anchor: (s) => `challenge-item-${challengeAt(s, TRAILHEAD)?.id ?? ''}`,
      prepare: (a, s) => {
        ensureBuild(a, s)
        a.selectChallenge(null)
        a.openDrawer('challenges')
      },
      done: { kind: 'predicate', test: (s) => s.clickedSteps.has('open-first') || s.selectedChallengeId === challengeAt(s, TRAILHEAD)?.id },
      copy: { title: 'tutorials.unlockChain.open-first.title', body: 'tutorials.unlockChain.open-first.body' },
    },
    {
      id: 'reveal',
      route: 'workspace',
      anchor: (s) => `unlocks-base-${baseNamed(s, BRIDGE)?.id ?? ''}`,
      prepare: openTrailheadChallenge,
      done: {
        kind: 'predicate',
        test: (s) => {
          const bridge = baseNamed(s, BRIDGE)
          return !!bridge && s.field(`unlocks-base-${bridge.id}`).pressed === true
        },
      },
      copy: { title: 'tutorials.unlockChain.reveal.title', body: 'tutorials.unlockChain.reveal.body' },
    },
    {
      id: 'save-reveal',
      route: 'workspace',
      anchor: 'save-challenge',
      prepare: openTrailheadChallenge,
      done: {
        kind: 'predicate',
        test: (s) => {
          const bridge = baseNamed(s, BRIDGE)
          const first = challengeAt(s, TRAILHEAD)
          return !!bridge && !!first && (first.unlocksBaseIds ?? []).includes(bridge.id)
        },
      },
      copy: { title: 'tutorials.unlockChain.save-reveal.title', body: 'tutorials.unlockChain.save-reveal.body' },
    },
    {
      id: 'fork',
      route: 'workspace',
      anchor: (s) => `challenge-item-${challengeAt(s, BRIDGE)?.id ?? ''}`,
      prepare: (a, s) => {
        ensureBuild(a, s)
        a.selectChallenge(null)
        a.openDrawer('challenges')
      },
      done: { kind: 'ack' },
      copy: { title: 'tutorials.unlockChain.fork.title', body: 'tutorials.unlockChain.fork.body' },
    },
    {
      id: 'bonus',
      route: 'workspace',
      anchor: (s) => `challenge-item-${challengeAt(s, 'Ruined tower')?.id ?? ''}`,
      prepare: (a, s) => {
        ensureBuild(a, s)
        a.openDrawer('challenges')
      },
      done: { kind: 'ack' },
      copy: { title: 'tutorials.unlockChain.bonus.title', body: 'tutorials.unlockChain.bonus.body' },
    },
    {
      id: 'finish',
      route: 'workspace',
      anchor: '',
      done: { kind: 'ack' },
      copy: { title: 'tutorials.unlockChain.finish.title', body: 'tutorials.unlockChain.finish.body' },
    },
  ],
}
