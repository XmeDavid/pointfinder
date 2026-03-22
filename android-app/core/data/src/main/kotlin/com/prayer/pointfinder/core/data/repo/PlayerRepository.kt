package com.prayer.pointfinder.core.data.repo

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import com.prayer.pointfinder.core.data.local.CachedChallengeEntity
import com.prayer.pointfinder.core.data.local.CompanionDatabase
import com.prayer.pointfinder.core.data.local.PendingActionEntity
import com.prayer.pointfinder.core.data.local.toBaseProgress
import com.prayer.pointfinder.core.data.local.toCached
import com.prayer.pointfinder.core.data.local.toChallengeInfo
import com.prayer.pointfinder.core.model.AuthType
import com.prayer.pointfinder.core.model.BaseProgress
import com.prayer.pointfinder.core.model.CheckInResponse
import com.prayer.pointfinder.core.model.GameDataResponse
import com.prayer.pointfinder.core.model.GameStatus
import com.prayer.pointfinder.core.model.PendingMediaItem
import com.prayer.pointfinder.core.model.PlayerSubmissionRequest
import com.prayer.pointfinder.core.model.SubmissionResponse
import com.prayer.pointfinder.core.model.SubmissionStatus
import com.prayer.pointfinder.core.model.UploadSessionInitRequest
import com.prayer.pointfinder.core.model.UploadSessionResponse
import com.prayer.pointfinder.core.network.CompanionApi
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.File
import kotlinx.coroutines.flow.Flow
import java.io.IOException
import java.io.InputStream
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.sync.Mutex
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import retrofit2.HttpException

data class CheckInResult(
    val response: CheckInResponse,
    val queued: Boolean,
)

data class ProgressResult(
    val progress: List<BaseProgress>,
    val gameStatus: GameStatus?,
)

data class SubmitResult(
    val response: SubmissionResponse,
    val queued: Boolean,
)

sealed interface MediaSyncOutcome {
    data object Synced : MediaSyncOutcome
    data object Retry : MediaSyncOutcome
    data object NeedsReselect : MediaSyncOutcome
    data object PermanentFailure : MediaSyncOutcome
}

internal fun completedUploadFileUrl(session: UploadSessionResponse): String? {
    if (session.status != "completed") return null
    val fileUrl = session.fileUrl ?: return null
    return fileUrl.takeIf { it.isNotBlank() }
}

@Singleton
class PlayerRepository @Inject constructor(
    private val api: CompanionApi,
    private val db: CompanionDatabase,
    @ApplicationContext private val context: Context,
) {
    private val syncMutex = Mutex()

    suspend fun pendingCount(): Int = db.pendingActionDao().pendingCount()

    fun pendingCountFlow(): Flow<Int> = db.pendingActionDao().pendingCountFlow()

    suspend fun loadProgress(auth: AuthType.Player, online: Boolean): ProgressResult {
        if (online) {
            try {
                val gameData = api.getGameData(auth.gameId)
                db.progressDao().deleteForGame(auth.gameId)
                db.progressDao().upsertAll(gameData.progress.map { it.toCached(auth.gameId) })
                cacheGameChallenges(auth, gameData)
                return ProgressResult(
                    progress = gameData.progress,
                    gameStatus = gameData.gameStatus ?: auth.gameStatus,
                )
            } catch (e: HttpException) {
                // Rethrow auth errors (401/403)
                if (e.code() == 401 || e.code() == 403) {
                    throw e
                }
                // For other HTTP errors, fall back to cache
            } catch (_: IOException) {
                // Fall back to cache for network errors
            }
        }
        return ProgressResult(
            progress = db.progressDao().progressForGame(auth.gameId).map { it.toBaseProgress() },
            gameStatus = auth.gameStatus,
        )
    }

    private suspend fun cacheGameChallenges(auth: AuthType.Player, gameData: GameDataResponse) {
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
                        requirePresenceToSubmit = challenge.requirePresenceToSubmit,
                    ),
                )
            }
        }
    }

    suspend fun checkIn(auth: AuthType.Player, baseId: String, online: Boolean): CheckInResult {
        if (online) {
            try {
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
                            requirePresenceToSubmit = challenge.requirePresenceToSubmit,
                        ),
                    )
                }
                db.progressDao().updateStatus(auth.gameId, baseId, "checked_in")
                val enrichedResponse = if (response.challenge == null) {
                    val cached = db.challengeDao().challengeForBase(auth.gameId, auth.teamId, baseId)
                    response.copy(challenge = cached?.toChallengeInfo())
                } else {
                    response
                }
                return CheckInResult(response = enrichedResponse, queued = false)
            } catch (_: IOException) {
                // Fall back to queue
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
        return CheckInResult(
            response = CheckInResponse(
                checkInId = UUID.randomUUID().toString(),
                baseId = baseId,
                baseName = baseName,
                checkedInAt = java.time.Instant.now().toString(),
                challenge = challenge,
            ),
            queued = true,
        )
    }

    suspend fun submitText(
        auth: AuthType.Player,
        baseId: String,
        challengeId: String,
        answer: String,
        online: Boolean,
    ): SubmitResult {
        // Game-live guard removed: auth.gameStatus can be stale (set at join time,
        // never updated). The backend enforces game-live status on submissions.
        if (online) {
            try {
                val response = api.submitAnswer(
                    gameId = auth.gameId,
                    request = PlayerSubmissionRequest(
                        baseId = baseId,
                        challengeId = challengeId,
                        answer = answer,
                        fileUrl = null,
                        idempotencyKey = UUID.randomUUID().toString(),
                    ),
                )
                db.progressDao().updateStatus(auth.gameId, baseId, "submitted")
                db.progressDao().updateSubmissionStatus(auth.gameId, baseId, "pending")
                return SubmitResult(response = response, queued = false)
            } catch (_: IOException) {
                // Fall through to queue
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
        return SubmitResult(
            response = SubmissionResponse(
                id = idempotencyKey,
                teamId = auth.teamId,
                challengeId = challengeId,
                baseId = baseId,
                answer = answer,
                fileUrl = null,
                status = SubmissionStatus.PENDING,
                submittedAt = java.time.Instant.now().toString(),
                reviewedBy = null,
                feedback = null,
                completionContent = null,
            ),
            queued = true,
        )
    }

    suspend fun submitMedia(
        auth: AuthType.Player,
        baseId: String,
        challengeId: String,
        answer: String,
        mediaContentType: String,
        mediaSizeBytes: Long,
        mediaLocalPath: String?,
        mediaSourceUri: String?,
        mediaFileName: String?,
    ): SubmitResult {
        // Game-live guard removed: auth.gameStatus can be stale (set at join time,
        // never updated). The backend enforces game-live status on submissions.
        val idempotencyKey = UUID.randomUUID().toString()
        db.pendingActionDao().upsert(
            PendingActionEntity(
                id = idempotencyKey,
                type = ACTION_TYPE_MEDIA_SUBMISSION,
                gameId = auth.gameId,
                baseId = baseId,
                challengeId = challengeId,
                answer = answer,
                createdAtEpochMs = System.currentTimeMillis(),
                retryCount = 0,
                mediaContentType = mediaContentType,
                mediaLocalPath = mediaLocalPath,
                mediaSourceUri = mediaSourceUri,
                mediaSizeBytes = mediaSizeBytes,
                mediaFileName = mediaFileName,
                uploadSessionId = null,
                uploadChunkIndex = 0,
                uploadTotalChunks = null,
                requiresReselect = false,
                lastError = null,
            ),
        )
        db.progressDao().updateStatus(auth.gameId, baseId, "submitted")
        db.progressDao().updateSubmissionStatus(auth.gameId, baseId, "pending")
        return SubmitResult(
            response = SubmissionResponse(
                id = idempotencyKey,
                teamId = auth.teamId,
                challengeId = challengeId,
                baseId = baseId,
                answer = answer,
                fileUrl = null,
                status = SubmissionStatus.PENDING,
                submittedAt = java.time.Instant.now().toString(),
                reviewedBy = null,
                feedback = null,
                completionContent = null,
            ),
            queued = true,
        )
    }

    suspend fun submitMultiMedia(
        auth: AuthType.Player,
        baseId: String,
        challengeId: String,
        answer: String,
        mediaItems: List<PendingMediaItem>,
    ): SubmitResult {
        // Game-live guard removed: auth.gameStatus can be stale (set at join time,
        // never updated). The backend enforces game-live status on submissions.
        val idempotencyKey = UUID.randomUUID().toString()
        val mediaItemsJson = kotlinx.serialization.json.Json.encodeToString(
            kotlinx.serialization.builtins.ListSerializer(PendingMediaItem.serializer()),
            mediaItems,
        )
        db.pendingActionDao().upsert(
            PendingActionEntity(
                id = idempotencyKey,
                type = ACTION_TYPE_MEDIA_SUBMISSION,
                gameId = auth.gameId,
                baseId = baseId,
                challengeId = challengeId,
                answer = answer,
                createdAtEpochMs = System.currentTimeMillis(),
                retryCount = 0,
                mediaContentType = mediaItems.firstOrNull()?.contentType,
                mediaLocalPath = mediaItems.firstOrNull()?.localPath,
                mediaSourceUri = mediaItems.firstOrNull()?.sourceUri,
                mediaSizeBytes = mediaItems.firstOrNull()?.sizeBytes,
                mediaFileName = mediaItems.firstOrNull()?.fileName,
                uploadSessionId = null,
                uploadChunkIndex = 0,
                uploadTotalChunks = null,
                requiresReselect = false,
                lastError = null,
                mediaItemsJson = mediaItemsJson,
            ),
        )
        db.progressDao().updateStatus(auth.gameId, baseId, "submitted")
        db.progressDao().updateSubmissionStatus(auth.gameId, baseId, "pending")
        return SubmitResult(
            response = SubmissionResponse(
                id = idempotencyKey,
                teamId = auth.teamId,
                challengeId = challengeId,
                baseId = baseId,
                answer = answer,
                fileUrl = null,
                status = SubmissionStatus.PENDING,
                submittedAt = java.time.Instant.now().toString(),
                reviewedBy = null,
                feedback = null,
                completionContent = null,
            ),
            queued = true,
        )
    }

    suspend fun syncMediaSubmission(auth: AuthType.Player, action: PendingActionEntity): MediaSyncOutcome {
        if (action.requiresReselect) return MediaSyncOutcome.NeedsReselect
        val challengeId = action.challengeId ?: return MediaSyncOutcome.PermanentFailure

        // Check if this is a multi-media submission
        val multiMediaItems = action.mediaItemsJson?.let { json ->
            runCatching {
                kotlinx.serialization.json.Json.decodeFromString(
                    kotlinx.serialization.builtins.ListSerializer(PendingMediaItem.serializer()),
                    json,
                )
            }.getOrNull()
        }

        if (multiMediaItems != null && multiMediaItems.isNotEmpty()) {
            return syncMultiMediaSubmission(auth, action, challengeId, multiMediaItems)
        }

        // Single media item (legacy path)
        val contentType = action.mediaContentType ?: return MediaSyncOutcome.PermanentFailure
        val source = resolveMediaSource(action) ?: run {
            markNeedsReselect(action.id, "Media source missing. Please reselect the file.")
            return MediaSyncOutcome.NeedsReselect
        }

        return try {
            var session = ensureUploadSession(auth, action, contentType, source.sizeBytes)
            val completedFileUrl = completedUploadFileUrl(session)
            if (completedFileUrl != null) {
                submitMediaAnswer(auth, action, challengeId, completedFileUrl)
                return MediaSyncOutcome.Synced
            }

            val uploadedSet = session.uploadedChunks.toMutableSet()
            source.open().use { input ->
                for (chunkIndex in 0 until session.totalChunks) {
                    val expectedSize = expectedChunkSize(
                        totalSizeBytes = source.sizeBytes,
                        chunkSizeBytes = session.chunkSizeBytes,
                        totalChunks = session.totalChunks,
                        chunkIndex = chunkIndex,
                    )
                    val chunkBytes = readExactChunk(input, expectedSize)
                    if (chunkBytes == null || chunkBytes.size != expectedSize) {
                        return MediaSyncOutcome.PermanentFailure
                    }
                    if (uploadedSet.contains(chunkIndex)) continue

                    session = api.uploadSessionChunk(
                        gameId = auth.gameId,
                        sessionId = session.sessionId,
                        chunkIndex = chunkIndex,
                        chunkBody = chunkBytes.toRequestBody("application/octet-stream".toMediaType()),
                    )
                    uploadedSet.add(chunkIndex)
                    db.pendingActionDao().updateUploadProgress(
                        id = action.id,
                        uploadSessionId = session.sessionId,
                        uploadChunkIndex = chunkIndex + 1,
                        uploadTotalChunks = session.totalChunks,
                        lastError = null,
                    )
                }
            }

            val completed = api.completeUploadSession(auth.gameId, session.sessionId)
            val fileUrl = completed.fileUrl ?: return MediaSyncOutcome.PermanentFailure
            submitMediaAnswer(auth, action, challengeId, fileUrl)
            MediaSyncOutcome.Synced
        } catch (_: SecurityException) {
            markNeedsReselect(action.id, "Media permission lost. Please reselect the file.")
            MediaSyncOutcome.NeedsReselect
        } catch (_: IOException) {
            MediaSyncOutcome.Retry
        } catch (_: HttpException) {
            MediaSyncOutcome.PermanentFailure
        } catch (_: Exception) {
            MediaSyncOutcome.Retry
        }
    }

    private suspend fun syncMultiMediaSubmission(
        auth: AuthType.Player,
        action: PendingActionEntity,
        challengeId: String,
        mediaItems: List<PendingMediaItem>,
    ): MediaSyncOutcome {
        val fileUrls = mutableListOf<String>()
        try {
            for (item in mediaItems) {
                val source = resolveMediaItemSource(item) ?: run {
                    markNeedsReselect(action.id, "Media source missing. Please reselect files.")
                    return MediaSyncOutcome.NeedsReselect
                }

                val session = api.createUploadSession(
                    gameId = auth.gameId,
                    request = UploadSessionInitRequest(
                        originalFileName = item.fileName,
                        contentType = item.contentType,
                        totalSizeBytes = source.sizeBytes,
                        chunkSizeBytes = DEFAULT_CHUNK_SIZE_BYTES,
                    ),
                )

                val uploadedSet = session.uploadedChunks.toMutableSet()
                var currentSession = session
                source.open().use { input ->
                    for (chunkIndex in 0 until currentSession.totalChunks) {
                        val expectedSize = expectedChunkSize(
                            totalSizeBytes = source.sizeBytes,
                            chunkSizeBytes = currentSession.chunkSizeBytes,
                            totalChunks = currentSession.totalChunks,
                            chunkIndex = chunkIndex,
                        )
                        val chunkBytes = readExactChunk(input, expectedSize)
                            ?: return MediaSyncOutcome.PermanentFailure
                        if (chunkBytes.size != expectedSize) return MediaSyncOutcome.PermanentFailure
                        if (uploadedSet.contains(chunkIndex)) continue

                        currentSession = api.uploadSessionChunk(
                            gameId = auth.gameId,
                            sessionId = currentSession.sessionId,
                            chunkIndex = chunkIndex,
                            chunkBody = chunkBytes.toRequestBody("application/octet-stream".toMediaType()),
                        )
                        uploadedSet.add(chunkIndex)
                    }
                }

                val completed = api.completeUploadSession(auth.gameId, currentSession.sessionId)
                val fileUrl = completed.fileUrl ?: return MediaSyncOutcome.PermanentFailure
                fileUrls.add(fileUrl)
            }

            // All files uploaded, submit with fileUrls
            api.submitAnswer(
                gameId = auth.gameId,
                request = PlayerSubmissionRequest(
                    baseId = action.baseId,
                    challengeId = challengeId,
                    answer = action.answer.orEmpty(),
                    fileUrl = fileUrls.firstOrNull(),
                    fileUrls = fileUrls,
                    idempotencyKey = action.id,
                ),
            )
            db.progressDao().updateStatus(auth.gameId, action.baseId, "submitted")
            db.progressDao().updateSubmissionStatus(auth.gameId, action.baseId, "pending")
            return MediaSyncOutcome.Synced
        } catch (_: SecurityException) {
            markNeedsReselect(action.id, "Media permission lost. Please reselect files.")
            return MediaSyncOutcome.NeedsReselect
        } catch (_: IOException) {
            return MediaSyncOutcome.Retry
        } catch (_: HttpException) {
            return MediaSyncOutcome.PermanentFailure
        } catch (_: Exception) {
            return MediaSyncOutcome.Retry
        }
    }

    private fun resolveMediaItemSource(item: PendingMediaItem): MediaSource? {
        val localPath = item.localPath
        if (!localPath.isNullOrBlank()) {
            val file = File(localPath)
            if (!file.exists() || !file.isFile) return null
            return MediaSource(
                sizeBytes = item.sizeBytes.takeIf { it > 0 } ?: file.length(),
                open = { file.inputStream() },
            )
        }
        val sourceUriString = item.sourceUri ?: return null
        val uri = Uri.parse(sourceUriString)
        val size = item.sizeBytes.takeIf { it > 0 } ?: resolveUriSize(uri) ?: return null
        return MediaSource(
            sizeBytes = size,
            open = {
                context.contentResolver.openInputStream(uri)
                    ?: throw IOException("Could not open media URI")
            },
        )
    }

    private suspend fun ensureUploadSession(
        auth: AuthType.Player,
        action: PendingActionEntity,
        contentType: String,
        totalSizeBytes: Long,
    ): UploadSessionResponse {
        val existingId = action.uploadSessionId
        val existing = if (!existingId.isNullOrBlank()) {
            runCatching { api.getUploadSession(auth.gameId, existingId) }.getOrNull()
        } else {
            null
        }
        if (existing != null) {
            db.pendingActionDao().updateUploadProgress(
                id = action.id,
                uploadSessionId = existing.sessionId,
                uploadChunkIndex = action.uploadChunkIndex ?: 0,
                uploadTotalChunks = existing.totalChunks,
                lastError = null,
            )
            return existing
        }

        val created = api.createUploadSession(
            gameId = auth.gameId,
            request = UploadSessionInitRequest(
                originalFileName = action.mediaFileName,
                contentType = contentType,
                totalSizeBytes = totalSizeBytes,
                chunkSizeBytes = DEFAULT_CHUNK_SIZE_BYTES,
            ),
        )
        db.pendingActionDao().updateUploadProgress(
            id = action.id,
            uploadSessionId = created.sessionId,
            uploadChunkIndex = 0,
            uploadTotalChunks = created.totalChunks,
            lastError = null,
        )
        return created
    }

    private suspend fun submitMediaAnswer(
        auth: AuthType.Player,
        action: PendingActionEntity,
        challengeId: String,
        fileUrl: String,
    ) {
        api.submitAnswer(
            gameId = auth.gameId,
            request = PlayerSubmissionRequest(
                baseId = action.baseId,
                challengeId = challengeId,
                answer = action.answer.orEmpty(),
                fileUrl = fileUrl,
                idempotencyKey = action.id,
            ),
        )
        db.progressDao().updateStatus(auth.gameId, action.baseId, "submitted")
        db.progressDao().updateSubmissionStatus(auth.gameId, action.baseId, "pending")
    }

    private fun expectedChunkSize(
        totalSizeBytes: Long,
        chunkSizeBytes: Int,
        totalChunks: Int,
        chunkIndex: Int,
    ): Int {
        if (chunkIndex < totalChunks - 1) return chunkSizeBytes
        val consumed = chunkSizeBytes.toLong() * (totalChunks - 1L)
        return (totalSizeBytes - consumed).toInt()
    }

    private fun readExactChunk(input: InputStream, expectedSize: Int): ByteArray? {
        val buffer = ByteArray(expectedSize)
        var offset = 0
        while (offset < expectedSize) {
            val read = input.read(buffer, offset, expectedSize - offset)
            if (read == -1) return if (offset == 0) null else buffer.copyOf(offset)
            offset += read
        }
        return buffer
    }

    private fun resolveMediaSource(action: PendingActionEntity): MediaSource? {
        val localPath = action.mediaLocalPath
        if (!localPath.isNullOrBlank()) {
            val file = File(localPath)
            if (!file.exists() || !file.isFile) return null
            return MediaSource(
                sizeBytes = action.mediaSizeBytes ?: file.length(),
                open = { file.inputStream() },
            )
        }

        val sourceUriString = action.mediaSourceUri ?: return null
        val uri = Uri.parse(sourceUriString)
        val size = action.mediaSizeBytes ?: resolveUriSize(uri) ?: return null
        return MediaSource(
            sizeBytes = size,
            open = {
                context.contentResolver.openInputStream(uri)
                    ?: throw IOException("Could not open media URI")
            },
        )
    }

    private fun resolveUriSize(uri: Uri): Long? {
        context.contentResolver.query(uri, arrayOf(OpenableColumns.SIZE), null, null, null)?.use { cursor ->
            val sizeIdx = cursor.getColumnIndex(OpenableColumns.SIZE)
            if (sizeIdx >= 0 && cursor.moveToFirst()) {
                return cursor.getLong(sizeIdx)
            }
        }
        return null
    }

    suspend fun trySyncPendingActions(auth: AuthType.Player) {
        if (!syncMutex.tryLock()) return
        try {
            val pending = prioritizedPendingActions(pendingActions())
            for (action in pending) {
                if (action.type == ACTION_TYPE_MEDIA_SUBMISSION) {
                    if (action.requiresReselect) continue
                    when (syncMediaSubmission(auth, action)) {
                        MediaSyncOutcome.Synced -> markSynced(action.id)
                        MediaSyncOutcome.PermanentFailure -> markPermanentlyFailed(
                            action.id, "Submission permanently failed"
                        )
                        MediaSyncOutcome.NeedsReselect -> continue
                        MediaSyncOutcome.Retry -> {
                            if (action.retryCount >= MAX_RETRIES) {
                                markPermanentlyFailed(
                                    action.id, "Submission failed after $MAX_RETRIES retries"
                                )
                            } else {
                                incrementRetry(action.id)
                                return
                            }
                        }
                    }
                } else {
                    val synced = runCatching {
                        when (action.type) {
                            "check_in" -> api.checkIn(action.gameId, action.baseId)
                            "submission" -> api.submitAnswer(
                                gameId = action.gameId,
                                request = PlayerSubmissionRequest(
                                    baseId = action.baseId,
                                    challengeId = action.challengeId ?: return@runCatching false,
                                    answer = action.answer.orEmpty(),
                                    fileUrl = null,
                                    idempotencyKey = action.id,
                                ),
                            )
                            else -> return@runCatching true
                        }
                        true
                    }.getOrElse { false }

                    if (synced) {
                        markSynced(action.id)
                    } else {
                        if (action.retryCount >= MAX_RETRIES) {
                            markPermanentlyFailed(
                                action.id, "Submission failed after $MAX_RETRIES retries"
                            )
                        } else {
                            incrementRetry(action.id)
                            return
                        }
                    }
                }
            }
        } finally {
            syncMutex.unlock()
        }
    }

    suspend fun cachedChallenge(auth: AuthType.Player, baseId: String): CheckInResponse.ChallengeInfo? {
        return db.challengeDao().challengeForBase(auth.gameId, auth.teamId, baseId)?.toChallengeInfo()
    }

    suspend fun pendingActions(): List<PendingActionEntity> =
        db.pendingActionDao().pendingActions().filter { !it.permanentlyFailed }

    suspend fun failedActions(): List<PendingActionEntity> = db.pendingActionDao().getFailedActions()

    suspend fun hasPermanentlyFailedActions(auth: AuthType.Player): Boolean {
        return db.pendingActionDao().getPermanentlyFailedCount(auth.gameId) > 0
    }

    suspend fun markPermanentlyFailed(actionId: String, reason: String) {
        db.pendingActionDao().markPermanentlyFailed(actionId, reason)
    }

    suspend fun markSynced(actionId: String) {
        val action = db.pendingActionDao().findById(actionId)
        // Clean up single legacy media path
        action?.mediaLocalPath?.let { localPath ->
            runCatching { File(localPath).delete() }
        }
        // Clean up multi-media local paths
        action?.mediaItemsJson?.let { json ->
            runCatching {
                val items = kotlinx.serialization.json.Json.decodeFromString(
                    kotlinx.serialization.builtins.ListSerializer(PendingMediaItem.serializer()),
                    json,
                )
                items.forEach { item ->
                    item.localPath?.let { path -> runCatching { File(path).delete() } }
                }
            }
        }
        db.pendingActionDao().deleteById(actionId)
    }

    suspend fun incrementRetry(actionId: String) = db.pendingActionDao().incrementRetryCount(actionId)
    suspend fun markNeedsReselect(actionId: String, message: String) =
        db.pendingActionDao().updateNeedsReselect(actionId, true, message)

    suspend fun clearAll() {
        db.pendingActionDao().clearAll()
        db.progressDao().clearAll()
        db.challengeDao().clearAll()
    }

    private data class MediaSource(
        val sizeBytes: Long,
        val open: () -> InputStream,
    )

    companion object {
        private const val ACTION_TYPE_MEDIA_SUBMISSION = "media_submission"
        private const val DEFAULT_CHUNK_SIZE_BYTES = 8 * 1024 * 1024
        private const val MAX_RETRIES = 5
    }
}
