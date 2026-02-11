package com.dbv.companion.core.data.repo

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
import com.dbv.companion.core.data.local.PendingActionEntity
import com.dbv.companion.core.model.AuthType
import com.dbv.companion.core.model.PlayerSubmissionRequest
import com.dbv.companion.core.network.CompanionApi
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
            val synced = runCatching {
                when (action.type) {
                    "check_in" -> api.checkIn(action.gameId, action.baseId)
                    "submission" -> api.submitAnswer(
                        gameId = action.gameId,
                        request = PlayerSubmissionRequest(
                            baseId = action.baseId,
                            challengeId = action.challengeId ?: return@runCatching false,
                            answer = action.answer.orEmpty(),
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
                .enqueueUniqueWork(UNIQUE_WORK, ExistingWorkPolicy.REPLACE, request)
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
