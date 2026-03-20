package com.prayer.pointfinder.session.usecase

import com.prayer.pointfinder.core.data.repo.OperatorRepository
import com.prayer.pointfinder.core.model.CreateTeamRequest
import com.prayer.pointfinder.core.model.PlayerResponse
import com.prayer.pointfinder.core.model.Team
import com.prayer.pointfinder.core.model.UpdateTeamRequest
import javax.inject.Inject

class TeamManagementUseCase @Inject constructor(
    private val operatorRepository: OperatorRepository,
) {
    suspend fun createTeam(gameId: String, name: String, color: String): Team {
        val team = operatorRepository.createTeam(gameId, CreateTeamRequest(name = name))
        return operatorRepository.updateTeam(gameId, team.id, UpdateTeamRequest(name = name, color = color))
    }

    suspend fun updateTeam(gameId: String, teamId: String, request: UpdateTeamRequest): Team =
        operatorRepository.updateTeam(gameId, teamId, request)

    suspend fun deleteTeam(gameId: String, teamId: String) =
        operatorRepository.deleteTeam(gameId, teamId)

    suspend fun loadTeamPlayers(gameId: String, teamId: String): List<PlayerResponse> =
        operatorRepository.getTeamPlayers(gameId, teamId)

    suspend fun removePlayer(gameId: String, teamId: String, playerId: String) =
        operatorRepository.removePlayer(gameId, teamId, playerId)
}
