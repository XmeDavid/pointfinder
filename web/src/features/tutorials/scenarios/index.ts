import type { Scenario, ScenarioId } from '../types'
import { firstGame } from './firstGame'

/** Library display order. Scenario modules are imported and registered at the bottom of this file. */
export const SCENARIO_ORDER: readonly ScenarioId[] = ['first-game', 'fixed-route', 'exploration'] as const

/**
 * Deliberately partial: a scenario that has not shipped yet simply has no entry,
 * and every consumer already handles "scenario not bundled".
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

// Bundled scenarios. Registering here (not in the scenario files) keeps the
// import graph one-directional and guarantees the app actually loads them.
registerScenario(firstGame)
