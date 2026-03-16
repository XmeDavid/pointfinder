package com.prayer.pointfinder.core.network

import com.prayer.pointfinder.core.model.ActivityEvent
import com.prayer.pointfinder.core.model.Assignment
import com.prayer.pointfinder.core.model.AuthType
import com.prayer.pointfinder.core.model.Base
import com.prayer.pointfinder.core.model.BaseProgress
import com.prayer.pointfinder.core.model.Challenge
import com.prayer.pointfinder.core.model.CheckInResponse
import com.prayer.pointfinder.core.model.CreateBaseRequest
import com.prayer.pointfinder.core.model.CreateChallengeRequest
import com.prayer.pointfinder.core.model.CreateGameRequest
import com.prayer.pointfinder.core.model.CreateTeamRequest
import com.prayer.pointfinder.core.model.Game
import com.prayer.pointfinder.core.model.GameDataResponse
import com.prayer.pointfinder.core.model.GameExportDto
import com.prayer.pointfinder.core.model.ImportGameRequest
import com.prayer.pointfinder.core.model.InviteRequest
import com.prayer.pointfinder.core.model.InviteResponse
import com.prayer.pointfinder.core.model.LeaderboardEntry
import com.prayer.pointfinder.core.model.LocationUpdateRequest
import com.prayer.pointfinder.core.model.NotificationResponse
import com.prayer.pointfinder.core.model.OperatorAuthResponse
import com.prayer.pointfinder.core.model.OperatorLoginRequest
import com.prayer.pointfinder.core.model.OperatorNotificationSettingsResponse
import com.prayer.pointfinder.core.model.OperatorUserResponse
import com.prayer.pointfinder.core.model.PlayerAuthResponse
import com.prayer.pointfinder.core.model.PlayerJoinRequest
import com.prayer.pointfinder.core.model.PlayerNotificationResponse
import com.prayer.pointfinder.core.model.PlayerResponse
import com.prayer.pointfinder.core.model.PlayerSubmissionRequest
import com.prayer.pointfinder.core.model.PushTokenRequest
import com.prayer.pointfinder.core.model.RefreshTokenRequest
import com.prayer.pointfinder.core.model.ReviewSubmissionRequest
import com.prayer.pointfinder.core.model.SendNotificationRequest
import com.prayer.pointfinder.core.model.SubmissionResponse
import com.prayer.pointfinder.core.model.Team
import com.prayer.pointfinder.core.model.TeamBaseProgressResponse
import com.prayer.pointfinder.core.model.TeamLocationResponse
import com.prayer.pointfinder.core.model.TeamVariablesCompletenessResponse
import com.prayer.pointfinder.core.model.TeamVariablesRequest
import com.prayer.pointfinder.core.model.TeamVariablesResponse
import com.prayer.pointfinder.core.model.UnseenCountResponse
import com.prayer.pointfinder.core.model.UpdateBaseRequest
import com.prayer.pointfinder.core.model.UpdateChallengeRequest
import com.prayer.pointfinder.core.model.UpdateGameRequest
import com.prayer.pointfinder.core.model.UpdateGameStatusRequest
import com.prayer.pointfinder.core.model.UpdateOperatorNotificationSettingsRequest
import com.prayer.pointfinder.core.model.UpdateTeamRequest
import com.prayer.pointfinder.core.model.UploadSessionInitRequest
import com.prayer.pointfinder.core.model.UploadSessionResponse
import com.prayer.pointfinder.core.model.UserResponse
import kotlinx.serialization.json.Json
import okhttp3.Interceptor
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.RequestBody
import retrofit2.Response
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.HTTP
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path

interface CompanionApi {
    @POST("api/auth/player/join")
    suspend fun playerJoin(@Body request: PlayerJoinRequest): PlayerAuthResponse

    @POST("api/auth/login")
    suspend fun operatorLogin(@Body request: OperatorLoginRequest): OperatorAuthResponse

    @POST("api/auth/refresh")
    suspend fun refreshToken(@Body request: RefreshTokenRequest): OperatorAuthResponse

    @GET("api/users/me")
    suspend fun getCurrentUser(): UserResponse

    @POST("api/player/games/{gameId}/bases/{baseId}/check-in")
    suspend fun checkIn(
        @Path("gameId") gameId: String,
        @Path("baseId") baseId: String,
        @Body body: EmptyBody = EmptyBody,
    ): CheckInResponse

    @GET("api/player/games/{gameId}/progress")
    suspend fun getProgress(@Path("gameId") gameId: String): List<BaseProgress>

    @GET("api/player/games/{gameId}/bases")
    suspend fun getBases(@Path("gameId") gameId: String): List<Base>

    @GET("api/player/games/{gameId}/data")
    suspend fun getGameData(@Path("gameId") gameId: String): GameDataResponse

    @POST("api/player/games/{gameId}/submissions")
    suspend fun submitAnswer(
        @Path("gameId") gameId: String,
        @Body request: PlayerSubmissionRequest,
    ): SubmissionResponse

    @POST("api/player/games/{gameId}/uploads/sessions")
    suspend fun createUploadSession(
        @Path("gameId") gameId: String,
        @Body request: UploadSessionInitRequest,
    ): UploadSessionResponse

    @PUT("api/player/games/{gameId}/uploads/sessions/{sessionId}/chunks/{chunkIndex}")
    suspend fun uploadSessionChunk(
        @Path("gameId") gameId: String,
        @Path("sessionId") sessionId: String,
        @Path("chunkIndex") chunkIndex: Int,
        @Body chunkBody: RequestBody,
    ): UploadSessionResponse

    @GET("api/player/games/{gameId}/uploads/sessions/{sessionId}")
    suspend fun getUploadSession(
        @Path("gameId") gameId: String,
        @Path("sessionId") sessionId: String,
    ): UploadSessionResponse

    @POST("api/player/games/{gameId}/uploads/sessions/{sessionId}/complete")
    suspend fun completeUploadSession(
        @Path("gameId") gameId: String,
        @Path("sessionId") sessionId: String,
        @Body body: EmptyBody = EmptyBody,
    ): UploadSessionResponse

    @DELETE("api/player/games/{gameId}/uploads/sessions/{sessionId}")
    suspend fun cancelUploadSession(
        @Path("gameId") gameId: String,
        @Path("sessionId") sessionId: String,
    )

    @POST("api/player/games/{gameId}/location")
    suspend fun updateLocation(
        @Path("gameId") gameId: String,
        @Body request: LocationUpdateRequest,
    )

    @PUT("api/player/push-token")
    suspend fun registerPushToken(@Body request: PushTokenRequest)

    @PUT("api/users/me/push-token")
    suspend fun registerUserPushToken(@Body request: PushTokenRequest)

    @DELETE("api/player/me")
    suspend fun deleteMyPlayerData()

    @GET("api/player/notifications")
    suspend fun getPlayerNotifications(): List<PlayerNotificationResponse>

    @GET("api/player/notifications/unseen-count")
    suspend fun getUnseenNotificationCount(): UnseenCountResponse

    @POST("api/player/notifications/mark-seen")
    suspend fun markNotificationsSeen(@Body body: EmptyBody = EmptyBody)

    @GET("api/games")
    suspend fun getGames(): List<Game>

    @GET("api/games/{gameId}/bases")
    suspend fun getGameBases(@Path("gameId") gameId: String): List<Base>

    @PATCH("api/games/{gameId}/bases/{baseId}/nfc-link")
    suspend fun linkBaseNfc(
        @Path("gameId") gameId: String,
        @Path("baseId") baseId: String,
    ): Base

    @GET("api/games/{gameId}/challenges")
    suspend fun getChallenges(@Path("gameId") gameId: String): List<Challenge>

    @GET("api/games/{gameId}/assignments")
    suspend fun getAssignments(@Path("gameId") gameId: String): List<Assignment>

    @GET("api/games/{gameId}/teams")
    suspend fun getTeams(@Path("gameId") gameId: String): List<Team>

    @GET("api/games/{gameId}/monitoring/locations")
    suspend fun getTeamLocations(@Path("gameId") gameId: String): List<TeamLocationResponse>

    @GET("api/games/{gameId}/monitoring/progress")
    suspend fun getTeamProgress(@Path("gameId") gameId: String): List<TeamBaseProgressResponse>

    @GET("api/games/{gameId}/submissions")
    suspend fun getSubmissions(@Path("gameId") gameId: String): List<SubmissionResponse>

    @PATCH("api/games/{gameId}/submissions/{submissionId}/review")
    suspend fun reviewSubmission(
        @Path("gameId") gameId: String,
        @Path("submissionId") submissionId: String,
        @Body request: ReviewSubmissionRequest,
    ): SubmissionResponse

    @GET("api/games/{gameId}/operator-notification-settings/me")
    suspend fun getOperatorNotificationSettings(
        @Path("gameId") gameId: String,
    ): OperatorNotificationSettingsResponse

    @PUT("api/games/{gameId}/operator-notification-settings/me")
    suspend fun updateOperatorNotificationSettings(
        @Path("gameId") gameId: String,
        @Body request: UpdateOperatorNotificationSettingsRequest,
    ): OperatorNotificationSettingsResponse

    // === Game CRUD ===

    @POST("api/games")
    suspend fun createGame(@Body request: CreateGameRequest): Game

    @GET("api/games/{gameId}")
    suspend fun getGame(@Path("gameId") gameId: String): Game

    @PUT("api/games/{gameId}")
    suspend fun updateGame(@Path("gameId") gameId: String, @Body request: UpdateGameRequest): Game

    @HTTP(method = "DELETE", path = "api/games/{gameId}", hasBody = false)
    suspend fun deleteGame(@Path("gameId") gameId: String): Response<Unit>

    @PATCH("api/games/{gameId}/status")
    suspend fun updateGameStatus(@Path("gameId") gameId: String, @Body request: UpdateGameStatusRequest): Game

    // === Base CRUD ===

    @POST("api/games/{gameId}/bases")
    suspend fun createBase(@Path("gameId") gameId: String, @Body request: CreateBaseRequest): Base

    @PUT("api/games/{gameId}/bases/{baseId}")
    suspend fun updateBase(
        @Path("gameId") gameId: String,
        @Path("baseId") baseId: String,
        @Body request: UpdateBaseRequest,
    ): Base

    @HTTP(method = "DELETE", path = "api/games/{gameId}/bases/{baseId}", hasBody = false)
    suspend fun deleteBase(
        @Path("gameId") gameId: String,
        @Path("baseId") baseId: String,
    ): Response<Unit>

    // === Challenge CRUD ===

    @POST("api/games/{gameId}/challenges")
    suspend fun createChallenge(@Path("gameId") gameId: String, @Body request: CreateChallengeRequest): Challenge

    @PUT("api/games/{gameId}/challenges/{challengeId}")
    suspend fun updateChallenge(
        @Path("gameId") gameId: String,
        @Path("challengeId") challengeId: String,
        @Body request: UpdateChallengeRequest,
    ): Challenge

    @HTTP(method = "DELETE", path = "api/games/{gameId}/challenges/{challengeId}", hasBody = false)
    suspend fun deleteChallenge(
        @Path("gameId") gameId: String,
        @Path("challengeId") challengeId: String,
    ): Response<Unit>

    // === Team CRUD ===

    @POST("api/games/{gameId}/teams")
    suspend fun createTeam(@Path("gameId") gameId: String, @Body request: CreateTeamRequest): Team

    @PUT("api/games/{gameId}/teams/{teamId}")
    suspend fun updateTeam(
        @Path("gameId") gameId: String,
        @Path("teamId") teamId: String,
        @Body request: UpdateTeamRequest,
    ): Team

    @HTTP(method = "DELETE", path = "api/games/{gameId}/teams/{teamId}", hasBody = false)
    suspend fun deleteTeam(
        @Path("gameId") gameId: String,
        @Path("teamId") teamId: String,
    ): Response<Unit>

    @GET("api/games/{gameId}/teams/{teamId}/players")
    suspend fun getTeamPlayers(
        @Path("gameId") gameId: String,
        @Path("teamId") teamId: String,
    ): List<PlayerResponse>

    @HTTP(method = "DELETE", path = "api/games/{gameId}/teams/{teamId}/players/{playerId}", hasBody = false)
    suspend fun removePlayer(
        @Path("gameId") gameId: String,
        @Path("teamId") teamId: String,
        @Path("playerId") playerId: String,
    ): Response<Unit>

    // === Notifications ===

    @GET("api/games/{gameId}/notifications")
    suspend fun getNotifications(@Path("gameId") gameId: String): List<NotificationResponse>

    @POST("api/games/{gameId}/notifications")
    suspend fun sendNotification(
        @Path("gameId") gameId: String,
        @Body request: SendNotificationRequest,
    ): NotificationResponse

    // === Game Operators ===

    @GET("api/games/{gameId}/operators")
    suspend fun getGameOperators(@Path("gameId") gameId: String): List<OperatorUserResponse>

    @POST("api/games/{gameId}/operators/{userId}")
    suspend fun addGameOperator(
        @Path("gameId") gameId: String,
        @Path("userId") userId: String,
    ): Response<Unit>

    @HTTP(method = "DELETE", path = "api/games/{gameId}/operators/{userId}", hasBody = false)
    suspend fun removeGameOperator(
        @Path("gameId") gameId: String,
        @Path("userId") userId: String,
    ): Response<Unit>

    // === Invites ===

    @GET("api/invites/game/{gameId}")
    suspend fun getGameInvites(@Path("gameId") gameId: String): List<InviteResponse>

    @POST("api/invites")
    suspend fun createInvite(@Body request: InviteRequest): InviteResponse

    @DELETE("api/invites/{inviteId}")
    suspend fun deleteInvite(@Path("inviteId") inviteId: String): Response<Unit>

    // === Team Variables ===

    @GET("api/games/{gameId}/team-variables")
    suspend fun getGameVariables(@Path("gameId") gameId: String): TeamVariablesResponse

    @PUT("api/games/{gameId}/team-variables")
    suspend fun saveGameVariables(
        @Path("gameId") gameId: String,
        @Body request: TeamVariablesRequest,
    ): TeamVariablesResponse

    @GET("api/games/{gameId}/challenges/{challengeId}/team-variables")
    suspend fun getChallengeVariables(
        @Path("gameId") gameId: String,
        @Path("challengeId") challengeId: String,
    ): TeamVariablesResponse

    @PUT("api/games/{gameId}/challenges/{challengeId}/team-variables")
    suspend fun saveChallengeVariables(
        @Path("gameId") gameId: String,
        @Path("challengeId") challengeId: String,
        @Body request: TeamVariablesRequest,
    ): TeamVariablesResponse

    @GET("api/games/{gameId}/team-variables/completeness")
    suspend fun getVariablesCompleteness(@Path("gameId") gameId: String): TeamVariablesCompletenessResponse

    // === Monitoring ===

    @GET("api/games/{gameId}/monitoring/leaderboard")
    suspend fun getLeaderboard(@Path("gameId") gameId: String): List<LeaderboardEntry>

    @GET("api/games/{gameId}/monitoring/activity")
    suspend fun getActivity(@Path("gameId") gameId: String): List<ActivityEvent>

    // === Export/Import ===

    @GET("api/games/{gameId}/export")
    suspend fun exportGame(@Path("gameId") gameId: String): GameExportDto

    @POST("api/games/import")
    suspend fun importGame(@Body request: ImportGameRequest): Game
}

@kotlinx.serialization.Serializable
object EmptyBody

interface AuthTokenProvider {
    fun currentToken(): String?
    fun authType(): AuthType
}

interface TokenRefresher {
    fun refreshTokenBlocking(): String?
}

class AuthInterceptor(
    private val tokenProvider: AuthTokenProvider,
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): okhttp3.Response {
        val request = chain.request()
        val token = tokenProvider.currentToken()
        if (token.isNullOrBlank()) {
            return chain.proceed(request)
        }
        val newRequest = request.newBuilder()
            .header("Authorization", "Bearer $token")
            .build()
        return chain.proceed(newRequest)
    }
}

class ApiFactory {
    companion object {
        fun buildApi(
            baseUrl: String,
            okHttpClient: OkHttpClient,
            json: Json = Json {
                ignoreUnknownKeys = true
                isLenient = true
                explicitNulls = false
            },
        ): CompanionApi {
            val contentType = "application/json".toMediaType()
            val normalizedBaseUrl = normalizeApiBaseUrl(baseUrl)
            return Retrofit.Builder()
                .baseUrl(normalizedBaseUrl)
                .client(okHttpClient)
                .addConverterFactory(json.asConverterFactory(contentType))
                .build()
                .create(CompanionApi::class.java)
        }

        private fun normalizeApiBaseUrl(rawBaseUrl: String): String {
            val parsed = rawBaseUrl.trim().toHttpUrl()
            val withoutApiSuffix = if (
                parsed.encodedPath.equals("/api", ignoreCase = true) ||
                parsed.encodedPath.equals("/api/", ignoreCase = true)
            ) {
                parsed.newBuilder().encodedPath("/").build()
            } else {
                parsed
            }

            val normalized = withoutApiSuffix.toString()
            return if (normalized.endsWith("/")) normalized else "$normalized/"
        }
    }
}
