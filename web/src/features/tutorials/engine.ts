import type { Scenario, Step, TourState } from './types'

/** Steps whose `when` guard passes, in scenario order. Positions are always taken in this list. */
export function effectiveSteps(scenario: Scenario, s: TourState): Step[] {
  return scenario.steps.filter((step) => (step.when ? step.when(s) : true))
}

export function isStepDone(step: Step, s: TourState, clicked: ReadonlySet<string>): boolean {
  switch (step.done.kind) {
    case 'predicate':
      return step.done.test(s)
    case 'click':
      return clicked.has(step.id)
    case 'ack':
      return s.ackedSteps.has(step.id) || s.laterSteps.has(step.id)
  }
}

/** Position of `stepId` in the effective list, or -1 when its guard filtered it out. */
export function stepIndexOf(scenario: Scenario, s: TourState, stepId: string | null): number {
  if (!stepId) return -1
  return effectiveSteps(scenario, s).findIndex((step) => step.id === stepId)
}

/**
 * Id of the first open step at (or, with `exclusive`, strictly after)
 * `fromStepId` in the effective list, or null when the scenario is finished.
 * Only `predicate` steps are skipped: an operator who did things out of order
 * is not asked to redo them, but an explanation the operator has not read yet
 * is never jumped over.
 *
 * A `fromStepId` whose guard has since turned false is no longer in the
 * effective list; the walk then starts at the first effective step that comes
 * after it in scenario order.
 */
export function advance(
  scenario: Scenario,
  s: TourState,
  clicked: ReadonlySet<string>,
  fromStepId: string | null,
  exclusive = false,
): string | null {
  const steps = effectiveSteps(scenario, s)
  let index = 0
  if (fromStepId) {
    const effectiveIndex = steps.findIndex((step) => step.id === fromStepId)
    if (effectiveIndex >= 0) {
      index = exclusive ? effectiveIndex + 1 : effectiveIndex
    } else {
      const originalIndex = scenario.steps.findIndex((step) => step.id === fromStepId)
      index = steps.findIndex(
        (step) => scenario.steps.indexOf(step) > originalIndex,
      )
      if (index < 0) index = steps.length
    }
  }
  while (index < steps.length) {
    const step = steps[index]
    if (step.done.kind !== 'predicate') return step.id
    if (!isStepDone(step, s, clicked)) return step.id
    index += 1
  }
  return null
}

export function resolveAnchor(step: Step, s: TourState): string {
  return typeof step.anchor === 'function' ? step.anchor(s) : step.anchor
}

/** First matching branch body wins; otherwise the step's own body key. */
export function resolveBody(step: Step, s: TourState): string {
  return step.branchCopy?.find((branch) => branch.when(s))?.body ?? step.copy.body
}
