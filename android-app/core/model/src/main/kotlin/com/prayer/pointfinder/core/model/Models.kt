package com.prayer.pointfinder.core.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

typealias EntityId = String

enum class ThemeMode { SYSTEM, LIGHT, DARK }

@Serializable
data class PlayerJoinRequest(
    val joinCode: String,
    val displayName: String,
    val deviceId: String,
)

@Serializable
data class PlayerAuthResponse(
    val token: String,
    val player: PlayerInfo,
    val team: TeamInfo,
    val game: GameInfo,
) {
    @Serializable
    data class PlayerInfo(
        val id: EntityId,
        val displayName: String,
        val deviceId: String,
    )

    @Serializable
    data class TeamInfo(
        val id: EntityId,
        val name: String,
        val color: String,
    )

    @Serializable
    data class GameInfo(
        val id: EntityId,
        val name: String,
        val description: String,
        val status: GameStatus,
        val tileSource: String? = null,
    )
}

@Serializable
data class OperatorLoginRequest(
    val email: String,
    val password: String,
)

@Serializable
data class RefreshTokenRequest(
    val refreshToken: String,
)

@Serializable
data class OperatorAuthResponse(
    val accessToken: String,
    val refreshToken: String,
    val user: UserResponse,
)

@Serializable
data class UserResponse(
    val id: EntityId,
    val name: String,
    val email: String,
    val role: String,
)

@Serializable
data class PushTokenRequest(
    val pushToken: String,
    val platform: String? = null,
)

@Serializable
data class LocationUpdateRequest(
    val lat: Double,
    val lng: Double,
)

@Serializable
data class Game(
    val id: EntityId,
    val name: String,
    val description: String,
    val status: GameStatus,
    val tileSource: String = "osm",
)

@Serializable
data class Base(
    val id: EntityId,
    val gameId: EntityId? = null,
    val name: String,
    val description: String,
    val lat: Double,
    val lng: Double,
    val nfcLinked: Boolean,
    val requirePresenceToSubmit: Boolean,
    val hidden: Boolean = false,
    val fixedChallengeId: EntityId? = null,
)

@Serializable
data class Challenge(
    val id: EntityId,
    val gameId: EntityId? = null,
    val title: String,
    val description: String,
    val content: String,
    val completionContent: String? = null,
    val answerType: String,
    val points: Int,
    val unlocksBaseId: EntityId? = null,
)

@Serializable
data class Assignment(
    val id: EntityId,
    val gameId: EntityId? = null,
    val baseId: EntityId,
    val challengeId: EntityId,
    val teamId: EntityId? = null,
)

@Serializable
data class Team(
    val id: EntityId,
    val gameId: EntityId? = null,
    val name: String,
    val joinCode: String? = null,
    val color: String,
)

@Serializable
enum class GameStatus {
    @SerialName("setup")
    SETUP,

    @SerialName("live")
    LIVE,

    @SerialName("ended")
    ENDED,
}

@Serializable
enum class SubmissionStatus {
    @SerialName("pending")
    PENDING,

    @SerialName("approved")
    APPROVED,

    @SerialName("rejected")
    REJECTED,

    @SerialName("correct")
    CORRECT,
}

@Serializable
enum class BaseStatus {
    @SerialName("not_visited")
    NOT_VISITED,

    @SerialName("checked_in")
    CHECKED_IN,

    @SerialName("submitted")
    SUBMITTED,

    @SerialName("completed")
    COMPLETED,

    @SerialName("rejected")
    REJECTED,
}

@Serializable
data class BaseProgress(
    val baseId: EntityId,
    val baseName: String,
    val lat: Double,
    val lng: Double,
    val nfcLinked: Boolean,
    val requirePresenceToSubmit: Boolean,
    val status: BaseStatus,
    val checkedInAt: String? = null,
    val challengeId: EntityId? = null,
    val submissionStatus: String? = null,
)

@Serializable
data class CheckInResponse(
    val checkInId: EntityId,
    val baseId: EntityId,
    val baseName: String,
    val checkedInAt: String,
    val challenge: ChallengeInfo? = null,
) {
    @Serializable
    data class ChallengeInfo(
        val id: EntityId,
        val title: String,
        val description: String,
        val content: String,
        val completionContent: String? = null,
        val answerType: String,
        val points: Int,
    )
}

@Serializable
data class PlayerSubmissionRequest(
    val baseId: EntityId,
    val challengeId: EntityId,
    val answer: String,
    val fileUrl: String? = null,
    val idempotencyKey: String? = null,
)

@Serializable
data class UploadSessionInitRequest(
    val originalFileName: String? = null,
    val contentType: String,
    val totalSizeBytes: Long,
    val chunkSizeBytes: Int? = null,
)

@Serializable
data class UploadSessionResponse(
    val sessionId: EntityId,
    val gameId: EntityId,
    val contentType: String,
    val totalSizeBytes: Long,
    val chunkSizeBytes: Int,
    val totalChunks: Int,
    val uploadedChunks: List<Int> = emptyList(),
    val status: String,
    val fileUrl: String? = null,
    val expiresAt: String,
)

@Serializable
data class SubmissionResponse(
    val id: EntityId,
    val teamId: EntityId,
    val challengeId: EntityId,
    val baseId: EntityId,
    val answer: String,
    val fileUrl: String? = null,
    val status: SubmissionStatus,
    val submittedAt: String,
    val reviewedBy: EntityId? = null,
    val feedback: String? = null,
    val points: Int? = null,
    val completionContent: String? = null,
)

@Serializable
data class ReviewSubmissionRequest(
    val status: SubmissionStatus,
    val feedback: String? = null,
    val points: Int? = null,
)

@Serializable
data class OperatorNotificationSettingsResponse(
    val gameId: EntityId,
    val userId: EntityId,
    val notifyPendingSubmissions: Boolean,
    val notifyAllSubmissions: Boolean,
    val notifyCheckIns: Boolean,
)

@Serializable
data class UpdateOperatorNotificationSettingsRequest(
    val notifyPendingSubmissions: Boolean,
    val notifyAllSubmissions: Boolean,
    val notifyCheckIns: Boolean,
)

@Serializable
data class PlayerNotificationResponse(
    val id: EntityId,
    val gameId: EntityId,
    val message: String,
    val targetTeamId: EntityId? = null,
    val sentAt: String,
    val sentBy: EntityId,
)

@Serializable
data class UnseenCountResponse(
    val count: Long,
)

@Serializable
data class GameDataResponse(
    val gameStatus: GameStatus? = null,
    val bases: List<Base>,
    val challenges: List<Challenge>,
    val assignments: List<Assignment>,
    val progress: List<BaseProgress>,
)

@Serializable
data class TeamLocationResponse(
    val teamId: EntityId,
    val playerId: EntityId? = null,
    val displayName: String? = null,
    val lat: Double,
    val lng: Double,
    val updatedAt: String,
)

@Serializable
data class TeamBaseProgressResponse(
    val baseId: EntityId,
    val teamId: EntityId,
    val status: BaseStatus,
    val checkedInAt: String? = null,
    val challengeId: EntityId? = null,
    val submissionStatus: String? = null,
)

@Serializable
data class PendingAction(
    val id: String,
    val type: PendingActionType,
    val gameId: EntityId,
    val baseId: EntityId,
    val challengeId: EntityId? = null,
    val answer: String? = null,
    val createdAtEpochMs: Long,
    val retryCount: Int = 0,
)

@Serializable
enum class PendingActionType {
    @SerialName("check_in")
    CHECK_IN,

    @SerialName("submission")
    SUBMISSION,

    @SerialName("media_submission")
    MEDIA_SUBMISSION,
}

sealed class AuthType {
    data object None : AuthType()

    data class Player(
        val token: String,
        val playerId: EntityId,
        val teamId: EntityId,
        val gameId: EntityId,
        val displayName: String,
        val gameName: String? = null,
        val teamName: String? = null,
        val teamColor: String? = null,
        val gameStatus: GameStatus? = null,
        val tileSource: String? = null,
    ) : AuthType()

    data class Operator(
        val accessToken: String,
        val refreshToken: String,
        val userId: EntityId,
        val userName: String,
    ) : AuthType()
}
