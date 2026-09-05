import type { TeamVariablesResponse, VariableCompletenessResponse } from '@/lib/api/team-variables'

export function createMockVariablesResponse(
  overrides?: Partial<TeamVariablesResponse>,
): TeamVariablesResponse {
  return {
    variables: [
      { key: 'teamColor', teamValues: { 'team-1': 'red', 'team-2': 'blue' } },
      { key: 'motto', teamValues: { 'team-1': 'Go fast', 'team-2': 'Stay strong' } },
    ],
    ...overrides,
  }
}

export function createMockCompletenessResponse(
  overrides?: Partial<VariableCompletenessResponse>,
): VariableCompletenessResponse {
  return {
    complete: true,
    errors: [],
    ...overrides,
  }
}
