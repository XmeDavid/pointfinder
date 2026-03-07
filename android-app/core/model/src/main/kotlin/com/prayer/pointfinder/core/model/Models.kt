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
    val startDate: String? = null,
    val endDate: String? = null,
    val createdBy: String? = null,
    val operatorIds: List<String>? = null,
    val uniformAssignment: Boolean = false,
    val broadcastEnabled: Boolean = false,
    val broadcastCode: String? = null,
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
    val autoValidate: Boolean = false,
    val correctAnswer: List<String>? = null,
    val locationBound: Boolean = false,
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
    val fileUrls: List<String>? = null,
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
    val fileUrls: List<String>? = null,
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
data class PendingMediaItem(
    val localPath: String? = null,
    val sourceUri: String? = null,
    val contentType: String,
    val sizeBytes: Long,
    val fileName: String? = null,
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
    val mediaItems: List<PendingMediaItem>? = null,
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

// === Game CRUD Requests ===

@Serializable
data class CreateGameRequest(
    val name: String,
    val description: String = "",
    val startDate: String? = null,
    val endDate: String? = null,
    val uniformAssignment: Boolean = false,
    val tileSource: String? = null,
)

@Serializable
data class UpdateGameRequest(
    val name: String,
    val description: String = "",
    val startDate: String? = null,
    val endDate: String? = null,
    val uniformAssignment: Boolean = false,
    val broadcastEnabled: Boolean = false,
    val tileSource: String? = null,
)

@Serializable
data class UpdateGameStatusRequest(
    val status: String,
    val resetProgress: Boolean = false,
)

// === Base CRUD Requests ===

@Serializable
data class CreateBaseRequest(
    val name: String,
    val description: String = "",
    val lat: Double,
    val lng: Double,
    val fixedChallengeId: String? = null,
    val requirePresenceToSubmit: Boolean = false,
    val hidden: Boolean = false,
)

@Serializable
data class UpdateBaseRequest(
    val name: String,
    val description: String = "",
    val lat: Double,
    val lng: Double,
    val fixedChallengeId: String? = null,
    val requirePresenceToSubmit: Boolean = false,
    val hidden: Boolean = false,
)

// === Challenge CRUD Requests ===

@Serializable
data class CreateChallengeRequest(
    val title: String,
    val description: String = "",
    val content: String = "",
    val completionContent: String = "",
    val answerType: String = "text",
    val autoValidate: Boolean = false,
    val correctAnswer: List<String> = emptyList(),
    val points: Int = 0,
    val locationBound: Boolean = false,
    val fixedBaseId: String? = null,
    val unlocksBaseId: String? = null,
)

@Serializable
data class UpdateChallengeRequest(
    val title: String,
    val description: String = "",
    val content: String = "",
    val completionContent: String = "",
    val answerType: String = "text",
    val autoValidate: Boolean = false,
    val correctAnswer: List<String> = emptyList(),
    val points: Int = 0,
    val locationBound: Boolean = false,
    val fixedBaseId: String? = null,
    val unlocksBaseId: String? = null,
)

// === Team CRUD Requests ===

@Serializable
data class CreateTeamRequest(val name: String)

@Serializable
data class UpdateTeamRequest(
    val name: String,
    val color: String? = null,
)

// === Team Variables ===

@Serializable
data class TeamVariable(
    val key: String,
    val teamValues: Map<String, String>,
)

@Serializable
data class TeamVariablesRequest(val variables: List<TeamVariable>)

@Serializable
data class TeamVariablesResponse(val variables: List<TeamVariable>)

@Serializable
data class TeamVariablesCompletenessResponse(
    val complete: Boolean,
    val errors: List<String>,
)

// === Notifications ===

@Serializable
data class NotificationResponse(
    val id: String,
    val gameId: String,
    val message: String,
    val targetTeamId: String?,
    val sentAt: String,
    val sentBy: String,
)

@Serializable
data class SendNotificationRequest(
    val message: String,
    val targetTeamId: String? = null,
)

// === Players ===

@Serializable
data class PlayerResponse(
    val id: String,
    val teamId: String,
    val deviceId: String,
    val displayName: String,
)

// === Operators & Invites ===

@Serializable
data class OperatorUserResponse(
    val id: String,
    val email: String,
    val name: String,
    val role: String,
)

@Serializable
data class InviteRequest(
    val email: String,
    val gameId: String? = null,
)

@Serializable
data class InviteResponse(
    val id: String,
    val gameId: String?,
    val gameName: String?,
    val email: String,
    val status: String,
    val invitedBy: String,
    val inviterName: String,
    val createdAt: String,
)

// === Monitoring ===

@Serializable
data class LeaderboardEntry(
    val teamId: String,
    val teamName: String,
    val color: String,
    val points: Int,
    val completedChallenges: Int,
)

@Serializable
data class ActivityEvent(
    val id: String,
    val gameId: String,
    val type: String,
    val teamId: String? = null,
    val baseId: String? = null,
    val challengeId: String? = null,
    val message: String,
    val timestamp: String,
)

// === Export/Import ===

@Serializable
data class GameExportDto(
    val exportVersion: String,
    val exportedAt: String,
    val game: GameExportGame,
    val bases: List<GameExportBase>,
    val challenges: List<GameExportChallenge>,
    val assignments: List<GameExportAssignment>,
    val teams: List<GameExportTeam>,
)

@Serializable
data class GameExportGame(
    val name: String,
    val description: String,
    val uniformAssignment: Boolean,
    val tileSource: String? = null,
)

@Serializable
data class GameExportBase(
    val tempId: String,
    val name: String,
    val description: String,
    val lat: Double,
    val lng: Double,
    val hidden: Boolean,
    val requirePresenceToSubmit: Boolean,
    val fixedChallengeTempId: String?,
)

@Serializable
data class GameExportChallenge(
    val tempId: String,
    val title: String,
    val description: String,
    val content: String,
    val completionContent: String,
    val answerType: String,
    val autoValidate: Boolean,
    val correctAnswer: List<String>,
    val points: Int,
    val locationBound: Boolean,
    val unlocksBaseTempId: String?,
)

@Serializable
data class GameExportAssignment(
    val baseTempId: String,
    val challengeTempId: String,
    val teamTempId: String?,
)

@Serializable
data class GameExportTeam(
    val tempId: String,
    val name: String,
    val color: String,
)

@Serializable
data class ImportGameRequest(
    val gameData: GameExportDto,
    val startDate: String? = null,
    val endDate: String? = null,
)
