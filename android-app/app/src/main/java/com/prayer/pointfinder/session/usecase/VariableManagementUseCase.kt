package com.prayer.pointfinder.session.usecase

import com.prayer.pointfinder.core.data.repo.OperatorRepository
import com.prayer.pointfinder.core.model.TeamVariable
import com.prayer.pointfinder.core.model.TeamVariablesRequest
import javax.inject.Inject

class VariableManagementUseCase @Inject constructor(
    private val operatorRepository: OperatorRepository,
) {
    suspend fun createVariable(
        gameId: String,
        variableName: String,
        currentVariables: List<TeamVariable>,
    ): List<TeamVariable> {
        val updated = currentVariables.toMutableList()
        if (updated.none { it.key == variableName }) {
            updated.add(TeamVariable(key = variableName, teamValues = emptyMap()))
        }
        return operatorRepository.saveGameVariables(gameId, TeamVariablesRequest(variables = updated)).variables
    }

    suspend fun deleteVariable(
        gameId: String,
        variableKey: String,
        currentVariables: List<TeamVariable>,
    ): List<TeamVariable> {
        val filtered = currentVariables.filter { it.key != variableKey }
        return operatorRepository.saveGameVariables(gameId, TeamVariablesRequest(variables = filtered)).variables
    }

    suspend fun saveTeamVariableValue(
        gameId: String,
        variableKey: String,
        teamId: String,
        value: String,
        currentVariables: List<TeamVariable>,
    ): List<TeamVariable> {
        val updated = currentVariables.toMutableList()
        val varIndex = updated.indexOfFirst { it.key == variableKey }
        if (varIndex >= 0) {
            val variable = updated[varIndex]
            updated[varIndex] = variable.copy(
                teamValues = variable.teamValues.toMutableMap().apply { put(teamId, value) },
            )
        }
        return operatorRepository.saveGameVariables(gameId, TeamVariablesRequest(variables = updated)).variables
    }

    suspend fun loadChallengeVariables(gameId: String, challengeId: String): List<TeamVariable> =
        operatorRepository.getChallengeVariables(gameId, challengeId).variables

    suspend fun saveChallengeVariables(
        gameId: String,
        challengeId: String,
        variables: List<TeamVariable>,
    ): List<TeamVariable> =
        operatorRepository.saveChallengeVariables(gameId, challengeId, TeamVariablesRequest(variables = variables)).variables

    suspend fun saveGameVariables(
        gameId: String,
        variables: List<TeamVariable>,
    ): List<TeamVariable> =
        operatorRepository.saveGameVariables(gameId, TeamVariablesRequest(variables = variables)).variables
}
