package com.prayer.pointfinder.core.data.repo

import com.prayer.pointfinder.core.data.local.CachedChallengeEntity
import com.prayer.pointfinder.core.data.local.CompanionDatabase
import com.prayer.pointfinder.core.data.local.PendingActionEntity
import com.prayer.pointfinder.core.data.local.toBaseProgress
import com.prayer.pointfinder.core.data.local.toCached
import com.prayer.pointfinder.core.data.local.toChallengeInfo
import com.prayer.pointfinder.core.model.AuthType
import com.prayer.pointfinder.core.model.BaseProgress
import com.prayer.pointfinder.core.model.CheckInResponse
import com.prayer.pointfinder.core.model.PlayerSubmissionRequest
import com.prayer.pointfinder.core.model.SubmissionResponse
import com.prayer.pointfinder.core.network.ApiFactory
import com.prayer.pointfinder.core.network.CompanionApi
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody

data class CheckInResult(
    val response: CheckInResponse,
    val queued: Boolean,
)

data class SubmitResult(
    val response: SubmissionResponse,
    val queued: Boolean,
)

@Singleton
class PlayerRepository @Inject constructor(
    private val api: CompanionApi,
    private val db: CompanionDatabase,
) {
    suspend fun pendingCount(): Int = db.pendingActionDao().pendingCount()

    suspend fun loadProgress(auth: AuthType.Player, online: Boolean): List<BaseProgress> {
        if (online) {
            runCatching {
                val gameData = api.getGameData(auth.gameId)
                db.progressDao().deleteForGame(auth.gameId)
                db.progressDao().upsertAll(gameData.progress.map { it.toCached(auth.gameId) })
                // Cache challenges so they're available when tapping any base
                cacheGameChallenges(auth, gameData)
                return gameData.progress
            }
        }
        return db.progressDao().progressForGame(auth.gameId).map { it.toBaseProgress() }
    }

    private suspend fun cacheGameChallenges(auth: AuthType.Player, gameData: com.prayer.pointfinder.core.model.GameDataResponse) {
        val challengeMap = gameData.challenges.associateBy { it.id }
        for (assignment in gameData.assignments) {
            if (assignment.teamId == null || assignment.teamId == auth.teamId) {
                val challenge = challengeMap[assignment.challengeId] ?: continue
                db.challengeDao().upsert(
                    CachedChallengeEntity(
                        gameId = auth.gameId,
                        teamId = auth.teamId,
                        baseId = assignment.baseId,
                        id = challenge.id,
                        title = challenge.title,
                        description = challenge.description,
                        content = challenge.content,
                        completionContent = challenge.completionContent,
                        answerType = challenge.answerType,
                        points = challenge.points,
                    ),
                )
            }
        }
    }

    suspend fun checkIn(auth: AuthType.Player, baseId: String, online: Boolean): CheckInResult {
        if (online) {
            runCatching {
                val response = api.checkIn(auth.gameId, baseId)
                response.challenge?.let { challenge ->
                    db.challengeDao().upsert(
                        CachedChallengeEntity(
                            gameId = auth.gameId,
                            teamId = auth.teamId,
                            baseId = baseId,
                            id = challenge.id,
                            title = challenge.title,
                            description = challenge.description,
                            content = challenge.content,
                            completionContent = challenge.completionContent,
                            answerType = challenge.answerType,
                            points = challenge.points,
                        ),
                    )
                }
                db.progressDao().updateStatus(auth.gameId, baseId, "checked_in")
                return CheckInResult(response = response, queued = false)
            }
        }

        val alreadyQueued = db.pendingActionDao().hasPendingCheckIn(auth.gameId, baseId)
        if (!alreadyQueued) {
            db.pendingActionDao().upsert(
                PendingActionEntity(
                    id = UUID.randomUUID().toString(),
                    type = "check_in",
                    gameId = auth.gameId,
                    baseId = baseId,
                    challengeId = null,
                    answer = null,
                    createdAtEpochMs = System.currentTimeMillis(),
                    retryCount = 0,
                ),
            )
        }

        db.progressDao().updateStatus(auth.gameId, baseId, "checked_in")
        val challenge = db.challengeDao().challengeForBase(auth.gameId, auth.teamId, baseId)?.toChallengeInfo()
        val baseName = db.progressDao().progressForGame(auth.gameId)
            .firstOrNull { it.baseId == baseId }
            ?.baseName
            ?: "Base"
        val localResponse = CheckInResponse(
            checkInId = UUID.randomUUID().toString(),
            baseId = baseId,
            baseName = baseName,
            checkedInAt = java.time.Instant.now().toString(),
            challenge = challenge,
        )
        return CheckInResult(response = localResponse, queued = true)
    }

    suspend fun submitText(
        auth: AuthType.Player,
        baseId: String,
        challengeId: String,
        answer: String,
        online: Boolean,
    ): SubmitResult {
        if (online) {
            runCatching {
                val response = api.submitAnswer(
                    gameId = auth.gameId,
                    request = PlayerSubmissionRequest(
                        baseId = baseId,
                        challengeId = challengeId,
                        answer = answer,
                        idempotencyKey = UUID.randomUUID().toString(),
                    ),
                )
                db.progressDao().updateStatus(auth.gameId, baseId, "submitted")
                db.progressDao().updateSubmissionStatus(auth.gameId, baseId, "pending")
                return SubmitResult(response = response, queued = false)
            }
        }

        val idempotencyKey = UUID.randomUUID().toString()
        db.pendingActionDao().upsert(
            PendingActionEntity(
                id = idempotencyKey,
                type = "submission",
                gameId = auth.gameId,
                baseId = baseId,
                challengeId = challengeId,
                answer = answer,
                createdAtEpochMs = System.currentTimeMillis(),
                retryCount = 0,
            ),
        )
        db.progressDao().updateStatus(auth.gameId, baseId, "submitted")
        db.progressDao().updateSubmissionStatus(auth.gameId, baseId, "pending")

        val localResponse = SubmissionResponse(
            id = idempotencyKey,
            teamId = auth.teamId,
            challengeId = challengeId,
            baseId = baseId,
            answer = answer,
            fileUrl = null,
            status = "pending",
            submittedAt = java.time.Instant.now().toString(),
            reviewedBy = null,
            feedback = null,
            completionContent = null,
        )
        return SubmitResult(response = localResponse, queued = true)
    }

    suspend fun submitPhoto(
        auth: AuthType.Player,
        baseId: String,
        challengeId: String,
        answer: String,
        imageBytes: ByteArray,
    ): SubmissionResponse {
        val imageBody = imageBytes.toRequestBody("image/jpeg".toMediaType())
        val filePart = MultipartBody.Part.createFormData("file", "photo.jpg", imageBody)
        return api.submitPhoto(
            gameId = auth.gameId,
            file = filePart,
            baseId = ApiFactory.textPart(baseId),
            challengeId = ApiFactory.textPart(challengeId),
            answer = ApiFactory.textPart(answer),
            idempotencyKey = ApiFactory.textPart(UUID.randomUUID().toString()),
        )
    }

    suspend fun cachedChallenge(auth: AuthType.Player, baseId: String): CheckInResponse.ChallengeInfo? {
        return db.challengeDao().challengeForBase(auth.gameId, auth.teamId, baseId)?.toChallengeInfo()
    }

    suspend fun pendingActions(): List<PendingActionEntity> = db.pendingActionDao().pendingActions()
    suspend fun markSynced(actionId: String) = db.pendingActionDao().deleteById(actionId)
    suspend fun incrementRetry(actionId: String) = db.pendingActionDao().incrementRetryCount(actionId)
    suspend fun clearAll() {
        db.pendingActionDao().clearAll()
        db.progressDao().clearAll()
        db.challengeDao().clearAll()
    }
}
