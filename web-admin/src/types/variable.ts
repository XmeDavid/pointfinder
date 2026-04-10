export interface TeamVariable {
  key: string
  teamValues: Record<string, string>
}

export interface TeamVariablesResponse {
  variables: TeamVariable[]
}

export interface VariableCompletenessResponse {
  complete: boolean
  errors: string[]
}
