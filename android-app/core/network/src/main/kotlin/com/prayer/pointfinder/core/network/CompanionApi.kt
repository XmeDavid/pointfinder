package com.prayer.pointfinder.core.network

import com.prayer.pointfinder.core.model.Assignment
import com.prayer.pointfinder.core.model.AuthType
import com.prayer.pointfinder.core.model.Base
import com.prayer.pointfinder.core.model.BaseProgress
import com.prayer.pointfinder.core.model.CheckInResponse
import com.prayer.pointfinder.core.model.Challenge
import com.prayer.pointfinder.core.model.Game
import com.prayer.pointfinder.core.model.GameDataResponse
import com.prayer.pointfinder.core.model.LocationUpdateRequest
import com.prayer.pointfinder.core.model.OperatorAuthResponse
import com.prayer.pointfinder.core.model.OperatorLoginRequest
import com.prayer.pointfinder.core.model.PlayerAuthResponse
import com.prayer.pointfinder.core.model.PlayerJoinRequest
import com.prayer.pointfinder.core.model.ReviewSubmissionRequest
import com.prayer.pointfinder.core.model.PlayerSubmissionRequest
import com.prayer.pointfinder.core.model.PushTokenRequest
import com.prayer.pointfinder.core.model.RefreshTokenRequest
import com.prayer.pointfinder.core.model.SubmissionResponse
import com.prayer.pointfinder.core.model.Team
import com.prayer.pointfinder.core.model.TeamBaseProgressResponse
import com.prayer.pointfinder.core.model.TeamLocationResponse
import com.prayer.pointfinder.core.model.OperatorNotificationSettingsResponse
import com.prayer.pointfinder.core.model.PlayerNotificationResponse
import com.prayer.pointfinder.core.model.UnseenCountResponse
import com.prayer.pointfinder.core.model.UpdateOperatorNotificationSettingsRequest
import com.prayer.pointfinder.core.model.UserResponse
import kotlinx.serialization.json.Json
import okhttp3.Interceptor
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.RequestBody.Companion.toRequestBody
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.Multipart
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Part
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

    @Multipart
    @POST("api/player/games/{gameId}/submissions/upload")
    suspend fun submitPhoto(
        @Path("gameId") gameId: String,
        @Part file: MultipartBody.Part,
        @Part("baseId") baseId: okhttp3.RequestBody,
        @Part("challengeId") challengeId: okhttp3.RequestBody,
        @Part("answer") answer: okhttp3.RequestBody,
        @Part("idempotencyKey") idempotencyKey: okhttp3.RequestBody?,
    ): SubmissionResponse

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

        fun textPart(value: String): okhttp3.RequestBody = value.toRequestBody("text/plain".toMediaType())

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
