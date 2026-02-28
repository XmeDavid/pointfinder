package com.prayer.pointfinder.core.data.repo

import android.content.Context
import androidx.hilt.work.HiltWorker
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.prayer.pointfinder.core.data.local.PendingActionEntity
import com.prayer.pointfinder.core.model.AuthType
import com.prayer.pointfinder.core.model.PlayerSubmissionRequest
import com.prayer.pointfinder.core.network.CompanionApi
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject
import java.time.Duration

@HiltWorker
class OfflineSyncWorker @AssistedInject constructor(
    @Assisted appContext: Context,
    @Assisted params: WorkerParameters,
    private val sessionStore: SessionStore,
    private val playerRepository: PlayerRepository,
    private val api: CompanionApi,
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        val auth = sessionStore.currentAuthType()
        if (auth !is AuthType.Player) return Result.success()

        val pending = prioritizedPendingActions(playerRepository.pendingActions())

        pending.forEach { action ->
            if (action.type == "media_submission" && action.requiresReselect) {
                return@forEach
            }

            if (action.type == "media_submission") {
                when (playerRepository.syncMediaSubmission(auth, action)) {
                    MediaSyncOutcome.Synced -> playerRepository.markSynced(action.id)
                    MediaSyncOutcome.NeedsReselect -> {
                        // Keep action persisted with requiresReselect so UI can prompt re-selection.
                    }
                    MediaSyncOutcome.PermanentFailure -> playerRepository.markSynced(action.id)
                    MediaSyncOutcome.Retry -> {
                        if (action.retryCount >= 5) {
                            playerRepository.markSynced(action.id)
                        } else {
                            playerRepository.incrementRetry(action.id)
                            return Result.retry()
                        }
                    }
                }
                return@forEach
            }

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
                playerRepository.markSynced(action.id)
            } else {
                if (action.retryCount >= 5) {
                    // Drop permanently failing actions after cap to avoid deadlock.
                    playerRepository.markSynced(action.id)
                } else {
                    playerRepository.incrementRetry(action.id)
                    return Result.retry()
                }
            }
        }

        // If new actions arrived while we were processing, schedule a fresh worker.
        // Using REPLACE is safe here because the current worker is finishing.
        if (playerRepository.pendingActions().isNotEmpty()) {
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()
            val request = OneTimeWorkRequestBuilder<OfflineSyncWorker>()
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, Duration.ofSeconds(2))
                .setConstraints(constraints)
                .build()
            WorkManager.getInstance(applicationContext)
                .enqueueUniqueWork(UNIQUE_WORK, ExistingWorkPolicy.REPLACE, request)
        }

        return Result.success()
    }

    companion object {
        private const val UNIQUE_WORK = "player-offline-sync"

        fun enqueue(context: Context) {
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()
            val request = OneTimeWorkRequestBuilder<OfflineSyncWorker>()
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, Duration.ofSeconds(2))
                .setConstraints(constraints)
                .build()
            WorkManager.getInstance(context)
                .enqueueUniqueWork(UNIQUE_WORK, ExistingWorkPolicy.KEEP, request)
        }
    }
}

internal fun prioritizedPendingActions(actions: List<PendingActionEntity>): List<PendingActionEntity> {
    return actions.sortedWith(
        compareBy(
            { if (it.type == "check_in") 0 else 1 },
            { it.createdAtEpochMs },
        ),
    )
}
