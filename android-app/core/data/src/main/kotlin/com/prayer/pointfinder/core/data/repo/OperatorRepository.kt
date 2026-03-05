package com.prayer.pointfinder.core.data.repo

import com.prayer.pointfinder.core.model.ActivityEvent
import com.prayer.pointfinder.core.model.Assignment
import com.prayer.pointfinder.core.model.AuthType
import com.prayer.pointfinder.core.model.Base
import com.prayer.pointfinder.core.model.Challenge
import com.prayer.pointfinder.core.model.CreateBaseRequest
import com.prayer.pointfinder.core.model.CreateChallengeRequest
import com.prayer.pointfinder.core.model.CreateGameRequest
import com.prayer.pointfinder.core.model.CreateTeamRequest
import com.prayer.pointfinder.core.model.Game
import com.prayer.pointfinder.core.model.GameExportDto
import com.prayer.pointfinder.core.model.ImportGameRequest
import com.prayer.pointfinder.core.model.InviteRequest
import com.prayer.pointfinder.core.model.InviteResponse
import com.prayer.pointfinder.core.model.LeaderboardEntry
import com.prayer.pointfinder.core.model.NotificationResponse
import com.prayer.pointfinder.core.model.OperatorNotificationSettingsResponse
import com.prayer.pointfinder.core.model.OperatorUserResponse
import com.prayer.pointfinder.core.model.PlayerResponse
import com.prayer.pointfinder.core.model.ReviewSubmissionRequest
import com.prayer.pointfinder.core.model.SendNotificationRequest
import com.prayer.pointfinder.core.model.SubmissionResponse
import com.prayer.pointfinder.core.model.SubmissionStatus
import com.prayer.pointfinder.core.model.Team
import com.prayer.pointfinder.core.model.TeamBaseProgressResponse
import com.prayer.pointfinder.core.model.TeamLocationResponse
import com.prayer.pointfinder.core.model.TeamVariablesCompletenessResponse
import com.prayer.pointfinder.core.model.TeamVariablesRequest
import com.prayer.pointfinder.core.model.TeamVariablesResponse
import com.prayer.pointfinder.core.model.UpdateBaseRequest
import com.prayer.pointfinder.core.model.UpdateChallengeRequest
import com.prayer.pointfinder.core.model.UpdateGameRequest
import com.prayer.pointfinder.core.model.UpdateGameStatusRequest
import com.prayer.pointfinder.core.model.UpdateOperatorNotificationSettingsRequest
import com.prayer.pointfinder.core.model.UpdateTeamRequest
import com.prayer.pointfinder.core.network.CompanionApi
import retrofit2.Response
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class OperatorRepository @Inject constructor(
    private val api: CompanionApi,
) {
    suspend fun games(): List<Game> = api.getGames()

    suspend fun gameBases(gameId: String): List<Base> = api.getGameBases(gameId)

    suspend fun gameChallenges(gameId: String): List<Challenge> = api.getChallenges(gameId)

    suspend fun gameAssignments(gameId: String): List<Assignment> = api.getAssignments(gameId)

    suspend fun gameTeams(gameId: String): List<Team> = api.getTeams(gameId)

    suspend fun teamLocations(gameId: String): List<TeamLocationResponse> = api.getTeamLocations(gameId)

    suspend fun teamProgress(gameId: String): List<TeamBaseProgressResponse> = api.getTeamProgress(gameId)

    suspend fun gameSubmissions(gameId: String): List<SubmissionResponse> = api.getSubmissions(gameId)

    suspend fun reviewSubmission(
        gameId: String,
        submissionId: String,
        status: SubmissionStatus,
        feedback: String?,
        points: Int? = null,
    ): SubmissionResponse = api.reviewSubmission(
        gameId = gameId,
        submissionId = submissionId,
        request = ReviewSubmissionRequest(status = status, feedback = feedback, points = points),
    )

    suspend fun getOperatorNotificationSettings(gameId: String): OperatorNotificationSettingsResponse =
        api.getOperatorNotificationSettings(gameId)

    suspend fun updateOperatorNotificationSettings(
        gameId: String,
        request: UpdateOperatorNotificationSettingsRequest,
    ): OperatorNotificationSettingsResponse = api.updateOperatorNotificationSettings(gameId, request)

    suspend fun linkBaseNfc(gameId: String, baseId: String): Base = api.linkBaseNfc(gameId, baseId)

    // === Game CRUD ===

    suspend fun createGame(request: CreateGameRequest): Game = api.createGame(request)

    suspend fun getGame(gameId: String): Game = api.getGame(gameId)

    suspend fun updateGame(gameId: String, request: UpdateGameRequest): Game = api.updateGame(gameId, request)

    suspend fun deleteGame(gameId: String): Response<Unit> = api.deleteGame(gameId)

    suspend fun updateGameStatus(gameId: String, request: UpdateGameStatusRequest): Game =
        api.updateGameStatus(gameId, request)

    // === Base CRUD ===

    suspend fun createBase(gameId: String, request: CreateBaseRequest): Base = api.createBase(gameId, request)

    suspend fun updateBase(gameId: String, baseId: String, request: UpdateBaseRequest): Base =
        api.updateBase(gameId, baseId, request)

    suspend fun deleteBase(gameId: String, baseId: String): Response<Unit> = api.deleteBase(gameId, baseId)

    // === Challenge CRUD ===

    suspend fun createChallenge(gameId: String, request: CreateChallengeRequest): Challenge =
        api.createChallenge(gameId, request)

    suspend fun updateChallenge(gameId: String, challengeId: String, request: UpdateChallengeRequest): Challenge =
        api.updateChallenge(gameId, challengeId, request)

    suspend fun deleteChallenge(gameId: String, challengeId: String): Response<Unit> =
        api.deleteChallenge(gameId, challengeId)

    // === Team CRUD ===

    suspend fun createTeam(gameId: String, request: CreateTeamRequest): Team = api.createTeam(gameId, request)

    suspend fun updateTeam(gameId: String, teamId: String, request: UpdateTeamRequest): Team =
        api.updateTeam(gameId, teamId, request)

    suspend fun deleteTeam(gameId: String, teamId: String): Response<Unit> = api.deleteTeam(gameId, teamId)

    suspend fun getTeamPlayers(gameId: String, teamId: String): List<PlayerResponse> =
        api.getTeamPlayers(gameId, teamId)

    suspend fun removePlayer(gameId: String, teamId: String, playerId: String): Response<Unit> =
        api.removePlayer(gameId, teamId, playerId)

    // === Notifications ===

    suspend fun getNotifications(gameId: String): List<NotificationResponse> = api.getNotifications(gameId)

    suspend fun sendNotification(gameId: String, request: SendNotificationRequest): NotificationResponse =
        api.sendNotification(gameId, request)

    // === Game Operators ===

    suspend fun getGameOperators(gameId: String): List<OperatorUserResponse> = api.getGameOperators(gameId)

    suspend fun addGameOperator(gameId: String, userId: String): Response<Unit> =
        api.addGameOperator(gameId, userId)

    suspend fun removeGameOperator(gameId: String, userId: String): Response<Unit> =
        api.removeGameOperator(gameId, userId)

    // === Invites ===

    suspend fun getGameInvites(gameId: String): List<InviteResponse> = api.getGameInvites(gameId)

    suspend fun createInvite(request: InviteRequest): InviteResponse = api.createInvite(request)

    // === Team Variables ===

    suspend fun getGameVariables(gameId: String): TeamVariablesResponse = api.getGameVariables(gameId)

    suspend fun saveGameVariables(gameId: String, request: TeamVariablesRequest): TeamVariablesResponse =
        api.saveGameVariables(gameId, request)

    suspend fun getChallengeVariables(gameId: String, challengeId: String): TeamVariablesResponse =
        api.getChallengeVariables(gameId, challengeId)

    suspend fun saveChallengeVariables(
        gameId: String,
        challengeId: String,
        request: TeamVariablesRequest,
    ): TeamVariablesResponse = api.saveChallengeVariables(gameId, challengeId, request)

    suspend fun getVariablesCompleteness(gameId: String): TeamVariablesCompletenessResponse =
        api.getVariablesCompleteness(gameId)

    // === Monitoring ===

    suspend fun getLeaderboard(gameId: String): List<LeaderboardEntry> = api.getLeaderboard(gameId)

    suspend fun getActivity(gameId: String): List<ActivityEvent> = api.getActivity(gameId)

    // === Export/Import ===

    suspend fun exportGame(gameId: String): GameExportDto = api.exportGame(gameId)

    suspend fun importGame(request: ImportGameRequest): Game = api.importGame(request)
}
