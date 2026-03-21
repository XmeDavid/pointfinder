package com.prayer.pointfinder.core.data.repo

import com.prayer.pointfinder.core.model.ActivityEvent
import com.prayer.pointfinder.core.model.Assignment
import com.prayer.pointfinder.core.model.Base
import com.prayer.pointfinder.core.model.CheckInResponse
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
import com.prayer.pointfinder.core.model.OperatorError
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
import java.io.IOException
import java.util.concurrent.ConcurrentHashMap
import javax.inject.Inject
import javax.inject.Singleton

private data class CacheEntry<T>(val value: T, val timestamp: Long)

private const val CACHE_TTL_MS = 30_000L

@Singleton
class OperatorRepository @Inject constructor(
    private val api: CompanionApi,
) {
    // === Cache storage (gameId -> CacheEntry) ===

    private val basesCache = ConcurrentHashMap<String, CacheEntry<List<Base>>>()
    private val challengesCache = ConcurrentHashMap<String, CacheEntry<List<Challenge>>>()
    private val teamsCache = ConcurrentHashMap<String, CacheEntry<List<Team>>>()
    private val assignmentsCache = ConcurrentHashMap<String, CacheEntry<List<Assignment>>>()

    private fun <T> CacheEntry<T>?.isValid(): Boolean {
        if (this == null) return false
        return System.currentTimeMillis() - timestamp < CACHE_TTL_MS
    }

    // === Error mapping ===

    private suspend fun <T> apiCall(block: suspend () -> T): T {
        return try {
            block()
        } catch (e: OperatorError) {
            throw e
        } catch (e: retrofit2.HttpException) {
            val body = try { e.response()?.errorBody()?.string() } catch (_: Exception) { null }
            val msg = body ?: e.message ?: "HTTP ${e.code()}"
            throw when (e.code()) {
                400 -> OperatorError.BadRequest(msg)
                401, 403 -> OperatorError.Unauthorized(msg)
                404 -> OperatorError.NotFound(msg)
                409 -> OperatorError.Conflict(msg)
                in 500..599 -> OperatorError.ServerError(msg)
                else -> OperatorError.ServerError(msg)
            }
        } catch (e: IOException) {
            throw OperatorError.NetworkError(e)
        }
    }

    private fun checkSuccess(code: Int, body: String?) {
        if (code !in 200..299) {
            val msg = body ?: "HTTP $code"
            throw when (code) {
                400 -> OperatorError.BadRequest(msg)
                401, 403 -> OperatorError.Unauthorized(msg)
                404 -> OperatorError.NotFound(msg)
                409 -> OperatorError.Conflict(msg)
                in 500..599 -> OperatorError.ServerError(msg)
                else -> OperatorError.ServerError(msg)
            }
        }
    }

    // === Read queries ===

    suspend fun games(): List<Game> = apiCall { api.getGames() }

    suspend fun gameBases(gameId: String): List<Base> {
        basesCache[gameId]?.takeIf { it.isValid() }?.let { return it.value }
        return apiCall { api.getGameBases(gameId) }.also { result ->
            basesCache[gameId] = CacheEntry(result, System.currentTimeMillis())
        }
    }

    suspend fun gameChallenges(gameId: String): List<Challenge> {
        challengesCache[gameId]?.takeIf { it.isValid() }?.let { return it.value }
        return apiCall { api.getChallenges(gameId) }.also { result ->
            challengesCache[gameId] = CacheEntry(result, System.currentTimeMillis())
        }
    }

    suspend fun gameAssignments(gameId: String): List<Assignment> {
        assignmentsCache[gameId]?.takeIf { it.isValid() }?.let { return it.value }
        return apiCall { api.getAssignments(gameId) }.also { result ->
            assignmentsCache[gameId] = CacheEntry(result, System.currentTimeMillis())
        }
    }

    suspend fun gameTeams(gameId: String): List<Team> {
        teamsCache[gameId]?.takeIf { it.isValid() }?.let { return it.value }
        return apiCall { api.getTeams(gameId) }.also { result ->
            teamsCache[gameId] = CacheEntry(result, System.currentTimeMillis())
        }
    }

    suspend fun teamLocations(gameId: String): List<TeamLocationResponse> =
        apiCall { api.getTeamLocations(gameId) }

    suspend fun teamProgress(gameId: String): List<TeamBaseProgressResponse> =
        apiCall { api.getTeamProgress(gameId) }

    suspend fun gameSubmissions(gameId: String): List<SubmissionResponse> =
        apiCall { api.getSubmissions(gameId) }

    suspend fun reviewSubmission(
        gameId: String,
        submissionId: String,
        status: SubmissionStatus,
        feedback: String?,
        points: Int? = null,
    ): SubmissionResponse = apiCall {
        api.reviewSubmission(
            gameId = gameId,
            submissionId = submissionId,
            request = ReviewSubmissionRequest(status = status, feedback = feedback, points = points),
        )
    }

    suspend fun getOperatorNotificationSettings(gameId: String): OperatorNotificationSettingsResponse =
        apiCall { api.getOperatorNotificationSettings(gameId) }

    suspend fun updateOperatorNotificationSettings(
        gameId: String,
        request: UpdateOperatorNotificationSettingsRequest,
    ): OperatorNotificationSettingsResponse =
        apiCall { api.updateOperatorNotificationSettings(gameId, request) }

    suspend fun linkBaseNfc(gameId: String, baseId: String): Base =
        apiCall { api.linkBaseNfc(gameId, baseId) }

    suspend fun manualCheckIn(gameId: String, teamId: String, baseId: String): CheckInResponse =
        apiCall { api.manualCheckIn(gameId, teamId, baseId) }

    // === Game CRUD ===

    suspend fun createGame(request: CreateGameRequest): Game =
        apiCall { api.createGame(request) }

    suspend fun getGame(gameId: String): Game =
        apiCall { api.getGame(gameId) }

    suspend fun updateGame(gameId: String, request: UpdateGameRequest): Game =
        apiCall { api.updateGame(gameId, request) }

    suspend fun deleteGame(gameId: String) {
        apiCall {
            val response = api.deleteGame(gameId)
            val errorBody = if (!response.isSuccessful) {
                try { response.errorBody()?.string() } catch (_: Exception) { null }
            } else null
            checkSuccess(response.code(), errorBody)
        }
    }

    suspend fun updateGameStatus(gameId: String, request: UpdateGameStatusRequest): Game =
        apiCall { api.updateGameStatus(gameId, request) }

    // === Base CRUD ===

    suspend fun createBase(gameId: String, request: CreateBaseRequest): Base =
        apiCall { api.createBase(gameId, request) }.also { basesCache.remove(gameId) }

    suspend fun updateBase(gameId: String, baseId: String, request: UpdateBaseRequest): Base =
        apiCall { api.updateBase(gameId, baseId, request) }.also { basesCache.remove(gameId) }

    suspend fun deleteBase(gameId: String, baseId: String) {
        apiCall {
            val response = api.deleteBase(gameId, baseId)
            val errorBody = if (!response.isSuccessful) {
                try { response.errorBody()?.string() } catch (_: Exception) { null }
            } else null
            checkSuccess(response.code(), errorBody)
        }
        basesCache.remove(gameId)
        assignmentsCache.remove(gameId)
    }

    // === Challenge CRUD ===

    suspend fun createChallenge(gameId: String, request: CreateChallengeRequest): Challenge =
        apiCall { api.createChallenge(gameId, request) }.also { challengesCache.remove(gameId) }

    suspend fun updateChallenge(gameId: String, challengeId: String, request: UpdateChallengeRequest): Challenge =
        apiCall { api.updateChallenge(gameId, challengeId, request) }.also { challengesCache.remove(gameId) }

    suspend fun deleteChallenge(gameId: String, challengeId: String) {
        apiCall {
            val response = api.deleteChallenge(gameId, challengeId)
            val errorBody = if (!response.isSuccessful) {
                try { response.errorBody()?.string() } catch (_: Exception) { null }
            } else null
            checkSuccess(response.code(), errorBody)
        }
        challengesCache.remove(gameId)
        assignmentsCache.remove(gameId)
    }

    // === Team CRUD ===

    suspend fun createTeam(gameId: String, request: CreateTeamRequest): Team =
        apiCall { api.createTeam(gameId, request) }.also { teamsCache.remove(gameId) }

    suspend fun updateTeam(gameId: String, teamId: String, request: UpdateTeamRequest): Team =
        apiCall { api.updateTeam(gameId, teamId, request) }.also { teamsCache.remove(gameId) }

    suspend fun deleteTeam(gameId: String, teamId: String) {
        apiCall {
            val response = api.deleteTeam(gameId, teamId)
            val errorBody = if (!response.isSuccessful) {
                try { response.errorBody()?.string() } catch (_: Exception) { null }
            } else null
            checkSuccess(response.code(), errorBody)
        }
        teamsCache.remove(gameId)
    }

    suspend fun getTeamPlayers(gameId: String, teamId: String): List<PlayerResponse> =
        apiCall { api.getTeamPlayers(gameId, teamId) }

    suspend fun removePlayer(gameId: String, teamId: String, playerId: String) {
        apiCall {
            val response = api.removePlayer(gameId, teamId, playerId)
            val errorBody = if (!response.isSuccessful) {
                try { response.errorBody()?.string() } catch (_: Exception) { null }
            } else null
            checkSuccess(response.code(), errorBody)
        }
    }

    // === Notifications ===

    suspend fun getNotifications(gameId: String): List<NotificationResponse> =
        apiCall { api.getNotifications(gameId) }

    suspend fun sendNotification(gameId: String, request: SendNotificationRequest): NotificationResponse =
        apiCall { api.sendNotification(gameId, request) }

    // === Game Operators ===

    suspend fun getGameOperators(gameId: String): List<OperatorUserResponse> =
        apiCall { api.getGameOperators(gameId) }

    suspend fun addGameOperator(gameId: String, userId: String) {
        apiCall {
            val response = api.addGameOperator(gameId, userId)
            val errorBody = if (!response.isSuccessful) {
                try { response.errorBody()?.string() } catch (_: Exception) { null }
            } else null
            checkSuccess(response.code(), errorBody)
        }
    }

    suspend fun removeGameOperator(gameId: String, userId: String) {
        apiCall {
            val response = api.removeGameOperator(gameId, userId)
            val errorBody = if (!response.isSuccessful) {
                try { response.errorBody()?.string() } catch (_: Exception) { null }
            } else null
            checkSuccess(response.code(), errorBody)
        }
    }

    // === Invites ===

    suspend fun getGameInvites(gameId: String): List<InviteResponse> =
        apiCall { api.getGameInvites(gameId) }

    suspend fun createInvite(request: InviteRequest): InviteResponse =
        apiCall { api.createInvite(request) }

    suspend fun deleteInvite(inviteId: String) {
        apiCall {
            val response = api.deleteInvite(inviteId)
            val errorBody = if (!response.isSuccessful) {
                try { response.errorBody()?.string() } catch (_: Exception) { null }
            } else null
            checkSuccess(response.code(), errorBody)
        }
    }

    // === Team Variables ===

    suspend fun getGameVariables(gameId: String): TeamVariablesResponse =
        apiCall { api.getGameVariables(gameId) }

    suspend fun saveGameVariables(gameId: String, request: TeamVariablesRequest): TeamVariablesResponse =
        apiCall { api.saveGameVariables(gameId, request) }

    suspend fun getChallengeVariables(gameId: String, challengeId: String): TeamVariablesResponse =
        apiCall { api.getChallengeVariables(gameId, challengeId) }

    suspend fun saveChallengeVariables(
        gameId: String,
        challengeId: String,
        request: TeamVariablesRequest,
    ): TeamVariablesResponse = apiCall { api.saveChallengeVariables(gameId, challengeId, request) }

    suspend fun getVariablesCompleteness(gameId: String): TeamVariablesCompletenessResponse =
        apiCall { api.getVariablesCompleteness(gameId) }

    // === Monitoring (not cached — changes too frequently) ===

    suspend fun getLeaderboard(gameId: String): List<LeaderboardEntry> =
        apiCall { api.getLeaderboard(gameId) }

    suspend fun getActivity(gameId: String): List<ActivityEvent> =
        apiCall { api.getActivity(gameId) }

    fun clearCache() {
        basesCache.clear()
        challengesCache.clear()
        teamsCache.clear()
        assignmentsCache.clear()
    }

    // === Export/Import ===

    suspend fun exportGame(gameId: String): GameExportDto =
        apiCall { api.exportGame(gameId) }

    suspend fun importGame(request: ImportGameRequest): Game =
        apiCall { api.importGame(request) }
}
