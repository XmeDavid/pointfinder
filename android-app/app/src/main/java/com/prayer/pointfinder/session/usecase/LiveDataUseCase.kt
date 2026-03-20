package com.prayer.pointfinder.session.usecase

import com.prayer.pointfinder.core.data.repo.OperatorRepository
import com.prayer.pointfinder.core.model.ActivityEvent
import com.prayer.pointfinder.core.model.Assignment
import com.prayer.pointfinder.core.model.Base
import com.prayer.pointfinder.core.model.Challenge
import com.prayer.pointfinder.core.model.LeaderboardEntry
import com.prayer.pointfinder.core.model.SubmissionResponse
import com.prayer.pointfinder.core.model.Team
import com.prayer.pointfinder.core.model.TeamBaseProgressResponse
import com.prayer.pointfinder.core.model.TeamLocationResponse
import com.prayer.pointfinder.core.model.TeamVariable
import javax.inject.Inject

class LiveDataUseCase @Inject constructor(
    private val operatorRepository: OperatorRepository,
) {
    data class RefreshResult(
        val bases: List<Base>,
        val locations: List<TeamLocationResponse>,
        val progress: List<TeamBaseProgressResponse>,
        val submissions: List<SubmissionResponse>,
    )

    data class GameMetaResult(
        val teams: List<Team>,
        val challenges: List<Challenge>,
        val assignments: List<Assignment>,
        val variables: List<TeamVariable>,
        val teamVariablesIncomplete: Boolean,
    )

    suspend fun refreshGameData(gameId: String): RefreshResult {
        val bases = operatorRepository.gameBases(gameId)
        val locations = operatorRepository.teamLocations(gameId)
        val progress = operatorRepository.teamProgress(gameId)
        val submissions = operatorRepository.gameSubmissions(gameId)
        return RefreshResult(
            bases = bases,
            locations = locations,
            progress = progress,
            submissions = submissions,
        )
    }

    suspend fun loadLeaderboard(gameId: String): List<LeaderboardEntry> =
        operatorRepository.getLeaderboard(gameId)

    suspend fun loadActivity(gameId: String): List<ActivityEvent> =
        operatorRepository.getActivity(gameId)

    suspend fun loadGameMeta(gameId: String): GameMetaResult {
        val teams = runCatching { operatorRepository.gameTeams(gameId) }.getOrDefault(emptyList())
        val challenges = runCatching { operatorRepository.gameChallenges(gameId) }.getOrDefault(emptyList())
        val assignments = runCatching { operatorRepository.gameAssignments(gameId) }.getOrDefault(emptyList())
        val variables = runCatching { operatorRepository.getGameVariables(gameId).variables }.getOrDefault(emptyList())
        val teamVariablesIncomplete = if (variables.isNotEmpty()) {
            runCatching { !operatorRepository.getVariablesCompleteness(gameId).complete }.getOrDefault(false)
        } else {
            false
        }
        return GameMetaResult(
            teams = teams,
            challenges = challenges,
            assignments = assignments,
            variables = variables,
            teamVariablesIncomplete = teamVariablesIncomplete,
        )
    }
}
