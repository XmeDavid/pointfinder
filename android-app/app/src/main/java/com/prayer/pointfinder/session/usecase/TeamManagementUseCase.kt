package com.prayer.pointfinder.session.usecase

import com.prayer.pointfinder.core.data.repo.OperatorRepository
import com.prayer.pointfinder.core.model.Assignment
import com.prayer.pointfinder.core.model.BaseUnlockOverrideResponse
import com.prayer.pointfinder.core.model.CreateAssignmentRequest
import com.prayer.pointfinder.core.model.CreateTeamRequest
import com.prayer.pointfinder.core.model.MarkCompletedRequest
import com.prayer.pointfinder.core.model.PlayerResponse
import com.prayer.pointfinder.core.model.SubmissionResponse
import com.prayer.pointfinder.core.model.Team
import com.prayer.pointfinder.core.model.UnlockOverrideRequest
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

    suspend fun markCompleted(
        gameId: String,
        teamId: String,
        baseId: String,
        request: MarkCompletedRequest,
    ): SubmissionResponse = operatorRepository.markCompleted(gameId, teamId, baseId, request)

    suspend fun createUnlockOverride(
        gameId: String,
        teamId: String,
        baseId: String,
        request: UnlockOverrideRequest,
    ): BaseUnlockOverrideResponse = operatorRepository.createUnlockOverride(gameId, teamId, baseId, request)

    suspend fun removeUnlockOverride(gameId: String, teamId: String, baseId: String) =
        operatorRepository.removeUnlockOverride(gameId, teamId, baseId)

    suspend fun listUnlockOverrides(gameId: String, teamId: String): List<BaseUnlockOverrideResponse> =
        operatorRepository.listUnlockOverrides(gameId, teamId)

    // ── Assignment CRUD ─────────────────────────────────────────────────

    suspend fun createAssignment(gameId: String, request: CreateAssignmentRequest): Assignment =
        operatorRepository.createAssignment(gameId, request)

    suspend fun deleteAssignment(gameId: String, assignmentId: String) =
        operatorRepository.deleteAssignment(gameId, assignmentId)
}
