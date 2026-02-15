package com.prayer.pointfinder.core.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

typealias EntityId = String

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
        val status: String,
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
    val status: String,
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
    val status: String,
    val checkedInAt: String? = null,
    val challengeId: EntityId? = null,
    val submissionStatus: String? = null,
) {
    fun baseStatus(): BaseStatus {
        return when (status) {
            "checked_in" -> BaseStatus.CHECKED_IN
            "submitted" -> BaseStatus.SUBMITTED
            "completed" -> BaseStatus.COMPLETED
            "rejected" -> BaseStatus.REJECTED
            else -> BaseStatus.NOT_VISITED
        }
    }
}

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
    val idempotencyKey: String? = null,
)

@Serializable
data class SubmissionResponse(
    val id: EntityId,
    val teamId: EntityId,
    val challengeId: EntityId,
    val baseId: EntityId,
    val answer: String,
    val fileUrl: String? = null,
    val status: String,
    val submittedAt: String,
    val reviewedBy: EntityId? = null,
    val feedback: String? = null,
    val completionContent: String? = null,
)

@Serializable
data class ReviewSubmissionRequest(
    val status: String,
    val feedback: String? = null,
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
data class GameDataResponse(
    val gameStatus: String? = null,
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
    val status: String,
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
        val gameStatus: String? = null,
    ) : AuthType()

    data class Operator(
        val accessToken: String,
        val refreshToken: String,
        val userId: EntityId,
        val userName: String,
    ) : AuthType()
}
