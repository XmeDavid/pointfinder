import apiClient from "./client";

export interface TeamVariableEntry {
  key: string;
  teamValues: Record<string, string>; // teamId -> value
}

export interface TeamVariablesResponse {
  variables: TeamVariableEntry[];
}

export interface TeamVariablesBulkRequest {
  variables: TeamVariableEntry[];
}

export interface VariableCompletenessResponse {
  complete: boolean;
  errors: string[];
}

export const teamVariablesApi = {
  // Game-level
  getGameVariables: async (gameId: string): Promise<TeamVariablesResponse> => {
    const { data } = await apiClient.get(`/games/${gameId}/team-variables`);
    return data;
  },

  saveGameVariables: async (gameId: string, body: TeamVariablesBulkRequest): Promise<TeamVariablesResponse> => {
    const { data } = await apiClient.put(`/games/${gameId}/team-variables`, body);
    return data;
  },

  // Challenge-level
  getChallengeVariables: async (gameId: string, challengeId: string): Promise<TeamVariablesResponse> => {
    const { data } = await apiClient.get(`/games/${gameId}/challenges/${challengeId}/team-variables`);
    return data;
  },

  saveChallengeVariables: async (
    gameId: string,
    challengeId: string,
    body: TeamVariablesBulkRequest,
  ): Promise<TeamVariablesResponse> => {
    const { data } = await apiClient.put(
      `/games/${gameId}/challenges/${challengeId}/team-variables`,
      body,
    );
    return data;
  },

  // Completeness check for go-live
  checkCompleteness: async (gameId: string): Promise<VariableCompletenessResponse> => {
    const { data } = await apiClient.get(`/games/${gameId}/team-variables/completeness`);
    return data;
  },
};
