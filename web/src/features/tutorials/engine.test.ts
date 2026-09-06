import { describe, expect, it } from 'vitest'
import { advance, effectiveSteps, isStepDone, resolveAnchor, resolveBody, stepIndexOf } from './engine'
import { makeTourState } from './testState'
import type { Scenario, Step, TourState } from './types'

const copy = { title: 'tutorials.common.next', body: 'tutorials.common.gotIt' }

function predicateStep(id: string, test: (s: TourState) => boolean): Step {
  return { id, anchor: `anchor-${id}`, done: { kind: 'predicate', test }, copy }
}

function ackStep(id: string): Step {
  return { id, anchor: `anchor-${id}`, done: { kind: 'ack' }, copy }
}

function clickStep(id: string): Step {
  return { id, anchor: `anchor-${id}`, done: { kind: 'click' }, copy }
}

function scenarioOf(steps: Step[]): Scenario {
  return {
    id: 'first-game',
    entry: 'new-game',
    title: 'tutorials.scenarios.firstGame.title',
    blurb: 'tutorials.scenarios.firstGame.blurb',
    steps,
  }
}

const NONE = new Set<string>()

describe('effectiveSteps', () => {
  it('keeps steps without a guard and drops guarded steps whose guard is false', () => {
    const scenario = scenarioOf([
      predicateStep('always', () => false),
      { ...predicateStep('qr-only', () => false), when: (s) => s.pressedIn('base-checkin-method') === 'base-checkin-method-qr' },
      { ...predicateStep('location-only', () => false), when: (s) => s.pressedIn('base-checkin-method') === 'base-checkin-method-location' },
    ])
    const state = makeTourState({ pressedIn: () => 'base-checkin-method-location' })

    expect(effectiveSteps(scenario, state).map((s) => s.id)).toEqual(['always', 'location-only'])
  })
})

describe('isStepDone', () => {
  it('runs the predicate for predicate steps', () => {
    const step = predicateStep('bases', (s) => s.bases.length >= 1)
    expect(isStepDone(step, makeTourState(), NONE)).toBe(false)
    expect(isStepDone(step, makeTourState({ bases: [{ id: 'b1' }] as never }), NONE)).toBe(true)
  })

  it('reads the clicked set for click steps', () => {
    const step = clickStep('base-qr')
    expect(isStepDone(step, makeTourState(), NONE)).toBe(false)
    expect(isStepDone(step, makeTourState(), new Set(['base-qr']))).toBe(true)
  })

  it('treats both an ack and a "later" as done for ack steps', () => {
    const step = ackStep('orient')
    expect(isStepDone(step, makeTourState(), NONE)).toBe(false)
    expect(isStepDone(step, makeTourState({ ackedSteps: new Set(['orient']) }), NONE)).toBe(true)
    expect(isStepDone(step, makeTourState({ laterSteps: new Set(['orient']) }), NONE)).toBe(true)
  })
})

describe('stepIndexOf', () => {
  it('counts positions in the filtered list and reports filtered-out ids as -1', () => {
    const scenario = scenarioOf([
      predicateStep('a', () => true),
      { ...predicateStep('skipped', () => false), when: () => false },
      ackStep('b'),
    ])
    expect(stepIndexOf(scenario, makeTourState(), 'b')).toBe(1)
    expect(stepIndexOf(scenario, makeTourState(), 'skipped')).toBe(-1)
    expect(stepIndexOf(scenario, makeTourState(), null)).toBe(-1)
  })
})

describe('advance', () => {
  it('starts at the first step when there is no current step', () => {
    const scenario = scenarioOf([predicateStep('a', () => false), predicateStep('b', () => false)])
    expect(advance(scenario, makeTourState(), NONE, null)).toBe('a')
  })

  it('returns the current step while it is still open', () => {
    const scenario = scenarioOf([predicateStep('a', () => true), predicateStep('b', () => false)])
    expect(advance(scenario, makeTourState(), NONE, 'b')).toBe('b')
  })

  it('skips ahead over predicate steps the operator already satisfied', () => {
    const scenario = scenarioOf([
      predicateStep('a', () => true),
      predicateStep('b', (s) => s.bases.length >= 1),
      predicateStep('c', (s) => s.challenges.length >= 1),
      predicateStep('d', (s) => s.teams.length >= 1),
    ])
    const state = makeTourState({ bases: [{ id: 'b' }] as never, challenges: [{ id: 'c' }] as never })

    expect(advance(scenario, state, NONE, 'b')).toBe('d')
  })

  it('never auto-skips an ack step, even when later predicates already pass', () => {
    const scenario = scenarioOf([
      predicateStep('a', () => true),
      ackStep('orient'),
      predicateStep('c', () => true),
    ])
    expect(advance(scenario, makeTourState(), NONE, 'orient')).toBe('orient')
  })

  it('never auto-skips a click step', () => {
    const scenario = scenarioOf([predicateStep('a', () => true), clickStep('base-qr')])
    expect(advance(scenario, makeTourState(), NONE, 'base-qr')).toBe('base-qr')
  })

  it('walks past ack and click steps the operator already dealt with', () => {
    const scenario = scenarioOf([
      predicateStep('a', () => true),
      ackStep('orient'),
      clickStep('base-method'),
      predicateStep('d', () => false),
    ])
    const state = makeTourState({ ackedSteps: new Set(['orient']) })
    expect(advance(scenario, state, new Set(['base-method']), null)).toBe('d')
  })

  it('moves to the next later step when the current step drops out of the effective list', () => {
    const scenario = scenarioOf([
      predicateStep('a', () => true),
      { ...clickStep('base-qr'), when: (s) => s.selectedBaseId === 'qr-base' },
      predicateStep('second-base', (s) => s.bases.length >= 2),
      ackStep('done'),
    ])
    // The operator selected another base, so the QR step's guard turned false.
    const state = makeTourState({ selectedBaseId: 'other' })
    expect(advance(scenario, state, NONE, 'base-qr')).toBe('second-base')
  })

  it('starts strictly after the given step when exclusive', () => {
    const scenario = scenarioOf([
      ackStep('orient'),
      predicateStep('b', () => true),
      ackStep('c'),
    ])
    expect(advance(scenario, makeTourState(), NONE, 'orient')).toBe('orient')
    expect(advance(scenario, makeTourState(), NONE, 'orient', true)).toBe('c')
    // Once acknowledged the inclusive walk moves past it too.
    expect(advance(scenario, makeTourState({ ackedSteps: new Set(['orient']) }), NONE, 'orient')).toBe('c')
  })

  it('returns null when everything is done', () => {
    const scenario = scenarioOf([predicateStep('a', () => true), predicateStep('b', () => true)])
    expect(advance(scenario, makeTourState(), NONE, null)).toBeNull()
    expect(advance(scenario, makeTourState(), NONE, 'b')).toBeNull()
  })

  it('returns null when the dropped-out step was the last one', () => {
    const scenario = scenarioOf([
      predicateStep('a', () => true),
      { ...ackStep('tail'), when: () => false },
    ])
    expect(advance(scenario, makeTourState(), NONE, 'tail')).toBeNull()
  })
})

describe('resolveAnchor and resolveBody', () => {
  it('resolves a function anchor against state', () => {
    const step: Step = {
      id: 'edit',
      anchor: (s) => `challenge-item-${s.challenges[0]?.id ?? 'none'}`,
      done: { kind: 'ack' },
      copy,
    }
    expect(resolveAnchor(step, makeTourState())).toBe('challenge-item-none')
    expect(resolveAnchor(step, makeTourState({ challenges: [{ id: 'c9' }] as never }))).toBe('challenge-item-c9')
  })

  it('returns the first matching branch body and falls back to copy.body', () => {
    const step: Step = {
      id: 'go-live',
      anchor: 'go-live-btn',
      done: { kind: 'ack' },
      copy,
      branchCopy: [
        { when: (s) => s.laterSteps.has('base-nfc'), body: 'tutorials.firstGame.go-live.branch.deferredNfc' },
        { when: () => true, body: 'tutorials.firstGame.go-live.branch.fallback' },
      ],
    }
    expect(resolveBody(step, makeTourState({ laterSteps: new Set(['base-nfc']) }))).toBe(
      'tutorials.firstGame.go-live.branch.deferredNfc',
    )
    expect(resolveBody(step, makeTourState())).toBe('tutorials.firstGame.go-live.branch.fallback')
    expect(resolveBody({ id: 'x', anchor: 'a', done: { kind: 'ack' }, copy }, makeTourState())).toBe(
      'tutorials.common.gotIt',
    )
  })
})
