import type { Scenario, ScenarioId } from '../types'

/** Library display order. Each scenario module registers itself as it is imported. */
export const SCENARIO_ORDER: readonly ScenarioId[] = ['first-game', 'fixed-route', 'exploration'] as const

/**
 * Deliberately partial: scenarios are registered by their own module as it is
 * imported, so a phase that has not shipped a scenario yet simply has no entry.
 */
export const SCENARIOS: Partial<Record<ScenarioId, Scenario>> = {}

export function registerScenario(scenario: Scenario): void {
  SCENARIOS[scenario.id] = scenario
}

export function getScenario(id: ScenarioId): Scenario | undefined {
  return SCENARIOS[id]
}

export function scenarioList(): Scenario[] {
  return SCENARIO_ORDER.map((id) => SCENARIOS[id]).filter((scenario): scenario is Scenario => Boolean(scenario))
}
