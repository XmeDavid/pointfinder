package com.prayer.pointfinder.session

import android.content.Context
import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.prayer.pointfinder.BuildConfig
import com.prayer.pointfinder.core.data.repo.OfflineSyncWorker
import com.prayer.pointfinder.core.data.local.PendingActionEntity
import com.prayer.pointfinder.core.data.repo.OfflineQueueFullException
import com.prayer.pointfinder.core.data.repo.PlayerRepository
import com.prayer.pointfinder.core.model.AuthType
import com.prayer.pointfinder.core.model.BaseProgress
import com.prayer.pointfinder.core.model.BaseStatus
import com.prayer.pointfinder.core.model.CheckInResponse
import com.prayer.pointfinder.core.model.GameStatus
import com.prayer.pointfinder.core.model.PlayerNotificationResponse
import com.prayer.pointfinder.core.model.SubmissionResponse
import com.prayer.pointfinder.core.network.ApiErrorParser
import com.prayer.pointfinder.core.network.MobileRealtimeClient
import com.prayer.pointfinder.core.network.RealtimeConnectionState
import com.prayer.pointfinder.core.platform.NfcEventBus
import com.prayer.pointfinder.core.platform.NfcPayloadCodec
import com.prayer.pointfinder.core.platform.NfcScanEvent
import com.prayer.pointfinder.core.platform.PlayerLocationService
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.File
import java.io.IOException
import java.util.UUID
import javax.inject.Inject
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import com.prayer.pointfinder.core.i18n.R as StringR

data class PlayerState(
    val isLoading: Boolean = false,
    val progress: List<BaseProgress> = emptyList(),
    val gameStatus: GameStatus? = null,
    val selectedBase: BaseProgress? = null,
    val selectedChallenge: CheckInResponse.ChallengeInfo? = null,
    val activeCheckIn: CheckInResponse? = null,
    val answerText: String = "",
    val isPhotoMode: Boolean = false,
    val presenceRequired: Boolean = false,
    val presenceVerified: Boolean = false,
    val awaitingPresenceBaseId: String? = null,
    val lastScannedBaseId: String? = null,
    val scanError: String? = null,
    val solveError: String? = null,
    val isSubmitting: Boolean = false,
    val latestSubmission: SubmissionResponse? = null,
    val authExpired: Boolean = false,
    val realtimeConnected: Boolean = false,
    val notifications: List<PlayerNotificationResponse> = emptyList(),
    val unseenNotificationCount: Long = 0,
    val isLoadingNotifications: Boolean = false,
    val showingNotifications: Boolean = false,
    val notificationError: String? = null,
    val lastNotificationsSeenAt: String? = null,
)

@HiltViewModel
class PlayerViewModel @Inject constructor(
    private val playerRepository: PlayerRepository,
    private val nfcEventBus: NfcEventBus,
    private val locationService: PlayerLocationService,
    private val realtimeClient: MobileRealtimeClient,
    private val api: com.prayer.pointfinder.core.network.CompanionApi,
    private val sessionStore: com.prayer.pointfinder.core.data.repo.SessionStore,
    @ApplicationContext private val context: Context,
) : ViewModel() {
    private val _state = MutableStateFlow(PlayerState())
    val state: StateFlow<PlayerState> = _state.asStateFlow()

    /** Exposed so the NFC scan dialog can collect base IDs while open. */
    val scannedBaseIds: SharedFlow<String?> = nfcEventBus.scannedBaseIds

    /** Exposed so the NFC scan dialog can collect full payloads (including nfcToken). */
    val scannedPayloads = nfcEventBus.scannedPayloads

    /** Deep link base ID (StateFlow so late collectors get the value). */
    val deepLinkBaseId: StateFlow<String?> = nfcEventBus.deepLinkBaseId

    fun consumeDeepLinkBaseId() {
        nfcEventBus.consumeDeepLinkBaseId()
    }

    private var lastAuth: AuthType.Player? = null
    private var lastOnline: Boolean = true
    private var checkInJob: Job? = null
    private var wasRealtimeConnected: Boolean = false

    init {
        viewModelScope.launch {
            nfcEventBus.scannedBaseIds.collectLatest { baseId ->
                _state.value = _state.value.copy(lastScannedBaseId = baseId)
                val expected = _state.value.awaitingPresenceBaseId ?: return@collectLatest
                verifyPresence(baseId, expected)
            }
        }
        viewModelScope.launch {
            // Surface invalid-payload scans as a localised error. iOS parity:
            // `NFCError.invalidData` shows "Invalid tag data" to the player
            // instead of silently dropping the scan (audit Wave D finding 4).
            nfcEventBus.scanEvents.collectLatest { event ->
                if (event is NfcScanEvent.InvalidPayload) {
                    _state.value = _state.value.copy(
                        scanError = context.getString(StringR.string.nfc_invalid_tag_data),
                    )
                }
            }
        }
        viewModelScope.launch {
            realtimeClient.connectionState.collectLatest { state ->
                val isNowConnected = state is RealtimeConnectionState.Connected
                _state.value = _state.value.copy(
                    realtimeConnected = isNowConnected,
                )
                // Trigger canonical state reconciliation when the WebSocket
                // has just become connected after being disconnected — any
                // broadcasts emitted while the socket was down are lost, so
                // the snapshot is the safety net. Pure "already connected"
                // state transitions do not trigger a refresh.
                val justReconnected = isNowConnected && !wasRealtimeConnected
                wasRealtimeConnected = isNowConnected
                if (justReconnected && lastAuth != null) {
                    refreshFromSnapshot(lastAuth!!)
                }
            }
        }
        viewModelScope.launch {
            realtimeClient.events.collectLatest { event ->
                when (event.type) {
                    "game_status" -> {
                        val statusStr: String? = event.data
                            ?.jsonObject
                            ?.get("status")
                            ?.let { jsonValue ->
                                runCatching { jsonValue.jsonPrimitive.content }.getOrNull()
                            }
                        val status = statusStr?.let { runCatching { GameStatus.valueOf(it.uppercase()) }.getOrNull() }
                        if (status != null) {
                            _state.value = _state.value.copy(gameStatus = status)
                            launch { sessionStore.updateGameStatus(status) }
                        }
                    }

                    "submission_status",
                    "activity",
                    "stage_unlock" -> {
                        val auth = lastAuth ?: return@collectLatest
                        refresh(auth, lastOnline)
                    }

                    "notification" -> {
                        _state.value = _state.value.copy(
                            unseenNotificationCount = _state.value.unseenNotificationCount + 1,
                        )
                    }
                }
            }
        }
    }

    fun refresh(auth: AuthType.Player, online: Boolean) {
        lastAuth = auth
        lastOnline = online
        viewModelScope.launch {
            _state.value = _state.value.copy(
                isLoading = true,
                scanError = null,
                solveError = null,
                gameStatus = _state.value.gameStatus ?: auth.gameStatus,
            )
            runCatching {
                playerRepository.loadProgress(auth, online)
            }.onSuccess { result ->
                val freshStatus = result.gameStatus ?: _state.value.gameStatus
                _state.value = _state.value.copy(
                    isLoading = false,
                    progress = result.progress,
                    gameStatus = freshStatus,
                    authExpired = false,
                )
                val apiStatus = result.gameStatus
                if (apiStatus != null) {
                    launch { sessionStore.updateGameStatus(apiStatus) }
                }
            }.onFailure { err ->
                val authExpired = ApiErrorParser.isAuthExpired(err)
                _state.value = _state.value.copy(
                    isLoading = false,
                    solveError = if (authExpired) null else friendlyError(err),
                    authExpired = _state.value.authExpired || authExpired,
                )
            }
        }
    }

    /**
     * Fetches the canonical state snapshot from the backend and reconciles
     * local state (game status, team, progress) with the server's
     * authoritative answer. This is the P0 Track 2 Slice 2 recovery path
     * wired to:
     *
     *  - App lifecycle `ON_RESUME` (see `AppNavigation.kt` `DisposableEffect`
     *    around the `PlayerHomeScaffold` — this replaces the older
     *    `viewModel.refresh(auth, true)` call on resume).
     *  - Realtime WebSocket reconnect (see the `realtimeClient.connectionState`
     *    observer in `init` — fires when transitioning from disconnected to
     *    connected).
     *  - Network restoration (see [AppSessionViewModel.observeNetwork] — fires
     *    on offline → online transition for authenticated players).
     *
     * Failure-tolerant: auth errors update the `authExpired` flag so the UI
     * can route to login; other errors are logged but do not surface. The
     * snapshot call is a silent background recovery, not a user-visible
     * operation. The heavier `refresh()` / `loadProgress()` path remains the
     * initial-load and polling fallback since it ALSO refreshes cached
     * bases, challenges, and assignments (the snapshot only carries the
     * dynamic state that goes stale — game status, progress, team info,
     * submissions, upload sessions).
     */
    fun refreshFromSnapshot(auth: AuthType.Player) {
        lastAuth = auth
        viewModelScope.launch {
            runCatching {
                playerRepository.refreshFromSnapshot(auth)
            }.onSuccess { snapshot ->
                _state.value = _state.value.copy(
                    progress = snapshot.progress,
                    gameStatus = snapshot.game.status,
                    authExpired = false,
                )
                launch { sessionStore.updateGameStatus(snapshot.game.status) }
                android.util.Log.i(
                    "PlayerViewModel",
                    "Snapshot refresh applied: status=${snapshot.game.status} stateVersion=${snapshot.stateVersion}",
                )
            }.onFailure { err ->
                val authExpired = ApiErrorParser.isAuthExpired(err)
                if (authExpired) {
                    _state.value = _state.value.copy(authExpired = true)
                } else {
                    // Recovery call — log and carry on, never block UI.
                    android.util.Log.w(
                        "PlayerViewModel",
                        "Snapshot refresh failed: ${err.message}",
                    )
                }
            }
        }
    }

    fun selectBase(auth: AuthType.Player, base: BaseProgress) {
        viewModelScope.launch {
            val challenge = playerRepository.cachedChallenge(auth, base.baseId)
            _state.value = _state.value.copy(
                selectedBase = base,
                selectedChallenge = challenge,
            )
        }
    }

    fun clearSelectedBase() {
        _state.value = _state.value.copy(
            selectedBase = null,
            selectedChallenge = null,
        )
    }

    fun startCheckIn(auth: AuthType.Player, baseId: String, nfcToken: String? = null, online: Boolean) {
        checkInJob?.cancel()
        checkInJob = viewModelScope.launch {
            runCatching {
                playerRepository.checkIn(auth, baseId, nfcToken, online)
            }.onSuccess { result ->
                // Optimistic update: mark base as checked-in locally before
                // refresh() replaces progress with (potentially stale) API data.
                updateLocalBaseStatus(baseId, BaseStatus.CHECKED_IN)
                // Reveal any hidden bases unlocked by challenges at this base
                revealUnlockedBases(baseId)
                // If the action was queued offline, trigger sync immediately
                // so it retries as soon as connectivity allows.
                if (result.queued) {
                    launch { playerRepository.trySyncPendingActions(auth) }
                    OfflineSyncWorker.enqueue(context)
                }
                // Send location immediately after check-in (matches iOS behavior)
                launch { locationService.sendLocationNow() }
                // Auto-submit for check-in-only challenges — no user interaction needed.
                val challenge = result.response.challenge
                if (challenge != null && challenge.answerType == "none") {
                    submitNone(auth, baseId, challenge.id.toString(), online)
                } else {
                    _state.value = _state.value.copy(
                        activeCheckIn = result.response,
                        scanError = null,
                        authExpired = false,
                    )
                    refresh(auth, online)
                }
            }.onFailure { err ->
                val authExpired = ApiErrorParser.isAuthExpired(err)
                _state.value = _state.value.copy(
                    scanError = if (authExpired) null else friendlyError(err),
                    authExpired = _state.value.authExpired || authExpired,
                )
            }
        }
    }

    fun clearCheckIn() {
        checkInJob?.cancel()
        checkInJob = null
        _state.value = _state.value.copy(activeCheckIn = null)
    }

    fun setAnswerText(value: String) {
        _state.value = _state.value.copy(answerText = value)
    }

    fun setPhotoMode(isPhotoMode: Boolean) {
        _state.value = _state.value.copy(isPhotoMode = isPhotoMode)
    }

    fun setPresenceRequired(required: Boolean) {
        _state.value = _state.value.copy(presenceRequired = required)
    }

    fun verifyPresence(scannedBaseId: String?, expectedBaseId: String) {
        val normalizedScannedBaseId = NfcPayloadCodec.normalizeBaseId(scannedBaseId)
        if (normalizedScannedBaseId == null) {
            _state.value = _state.value.copy(
                presenceVerified = false,
                solveError = context.getString(StringR.string.error_invalid_nfc),
            )
            return
        }
        val normalizedExpectedBaseId = NfcPayloadCodec.normalizeBaseId(expectedBaseId)
        if (normalizedScannedBaseId != normalizedExpectedBaseId) {
            _state.value = _state.value.copy(
                presenceVerified = false,
                solveError = context.getString(StringR.string.error_presence_wrong_base),
            )
            return
        }
        _state.value = _state.value.copy(
            presenceVerified = true,
            awaitingPresenceBaseId = null,
            solveError = null,
        )
    }

    fun beginPresenceVerification(expectedBaseId: String) {
        _state.value = _state.value.copy(
            awaitingPresenceBaseId = expectedBaseId,
            solveError = null,
            presenceVerified = false,
        )
    }

    fun checkInFromLatestScan(auth: AuthType.Player, online: Boolean) {
        val baseId = _state.value.lastScannedBaseId
        if (baseId.isNullOrBlank()) {
            _state.value = _state.value.copy(
                scanError = context.getString(StringR.string.error_scan_nfc_first),
            )
            return
        }
        startCheckIn(auth, baseId, nfcToken = null, online)
    }

    fun submitNone(
        auth: AuthType.Player,
        baseId: String,
        challengeId: String,
        online: Boolean,
    ) {
        viewModelScope.launch {
            _state.value = _state.value.copy(isSubmitting = true, solveError = null)
            runCatching {
                playerRepository.submitText(auth, baseId, challengeId, "", online)
            }.onSuccess { result ->
                _state.value = _state.value.copy(
                    isSubmitting = false,
                    latestSubmission = result.response,
                    solveError = null,
                    presenceVerified = false,
                    authExpired = false,
                )
                updateLocalBaseStatus(baseId, BaseStatus.SUBMITTED)
                if (result.queued) {
                    launch { playerRepository.trySyncPendingActions(auth) }
                    OfflineSyncWorker.enqueue(context)
                }
                refresh(auth, online)
                launch { locationService.sendLocationNow() }
            }.onFailure { err ->
                val authExpired = ApiErrorParser.isAuthExpired(err)
                _state.value = _state.value.copy(
                    isSubmitting = false,
                    solveError = if (authExpired) null else friendlyError(err),
                    authExpired = _state.value.authExpired || authExpired,
                )
            }
        }
    }

    fun submitText(
        auth: AuthType.Player,
        baseId: String,
        challengeId: String,
        online: Boolean,
    ) {
        val answer = _state.value.answerText.trim()
        if (answer.isBlank()) {
            _state.value = _state.value.copy(
                solveError = context.getString(StringR.string.error_answer_required),
            )
            return
        }
        viewModelScope.launch {
            _state.value = _state.value.copy(isSubmitting = true, solveError = null)
            runCatching {
                playerRepository.submitText(auth, baseId, challengeId, answer, online)
            }.onSuccess { result ->
                _state.value = _state.value.copy(
                    isSubmitting = false,
                    latestSubmission = result.response,
                    solveError = null,
                    answerText = "",
                    presenceVerified = false,
                    authExpired = false,
                )
                updateLocalBaseStatus(baseId, BaseStatus.SUBMITTED)
                // If the action was queued offline, trigger sync immediately
                // so it retries as soon as connectivity allows.
                if (result.queued) {
                    launch { playerRepository.trySyncPendingActions(auth) }
                    OfflineSyncWorker.enqueue(context)
                }
                refresh(auth, online)
                // Send location immediately after submission (matches iOS behavior)
                launch { locationService.sendLocationNow() }
            }.onFailure { err ->
                val authExpired = ApiErrorParser.isAuthExpired(err)
                _state.value = _state.value.copy(
                    isSubmitting = false,
                    solveError = if (authExpired) null else friendlyError(err),
                    authExpired = _state.value.authExpired || authExpired,
                )
            }
        }
    }

    data class MediaItemData(
        val bytes: ByteArray? = null,
        val sourceUri: String? = null,
        val contentType: String,
        val sizeBytes: Long,
        val fileName: String? = null,
    ) {
        override fun equals(other: Any?): Boolean {
            if (this === other) return true
            if (other !is MediaItemData) return false
            return bytes.contentEquals(other.bytes) &&
                sourceUri == other.sourceUri &&
                contentType == other.contentType &&
                sizeBytes == other.sizeBytes &&
                fileName == other.fileName
        }

        override fun hashCode(): Int {
            var result = bytes?.contentHashCode() ?: 0
            result = 31 * result + (sourceUri?.hashCode() ?: 0)
            result = 31 * result + contentType.hashCode()
            result = 31 * result + sizeBytes.hashCode()
            result = 31 * result + (fileName?.hashCode() ?: 0)
            return result
        }
    }

    fun submitPhoto(
        auth: AuthType.Player,
        baseId: String,
        challengeId: String,
        mediaItemDataList: List<MediaItemData>,
        notes: String,
        online: Boolean,
    ) {
        if (!BuildConfig.ENABLE_CHUNKED_MEDIA_UPLOAD) {
            _state.value = _state.value.copy(
                solveError = context.getString(StringR.string.hint_media_upload_disabled),
            )
            return
        }
        if (mediaItemDataList.isEmpty()) {
            _state.value = _state.value.copy(
                solveError = context.getString(StringR.string.error_photo_required),
            )
            return
        }
        if (mediaItemDataList.size > 5) {
            _state.value = _state.value.copy(
                solveError = context.getString(StringR.string.error_max_media),
            )
            return
        }

        val pendingItems = mutableListOf<com.prayer.pointfinder.core.model.PendingMediaItem>()
        for (item in mediaItemDataList) {
            val resolvedContentType = item.contentType.ifBlank { "image/jpeg" }
            val resolvedSizeBytes = item.sizeBytes.takeIf { it > 0 }
                ?: item.bytes?.size?.toLong()
                ?: 0L
            if (resolvedSizeBytes <= 0L) {
                _state.value = _state.value.copy(
                    solveError = context.getString(StringR.string.error_photo_required),
                )
                return
            }

            val guaranteedCopyPath: String?
            val queuedSourceUri: String?
            if (resolvedSizeBytes <= MEDIA_COPY_THRESHOLD_BYTES) {
                guaranteedCopyPath = try {
                    createGuaranteedMediaCopy(
                        mediaBytes = item.bytes,
                        mediaSourceUri = item.sourceUri,
                        contentType = resolvedContentType,
                        originalFileName = item.fileName,
                    )
                } catch (_: IOException) {
                    null
                }
                if (guaranteedCopyPath == null) {
                    _state.value = _state.value.copy(
                        solveError = context.getString(StringR.string.error_photo_required),
                    )
                    return
                }
                queuedSourceUri = null
            } else {
                if (item.sourceUri.isNullOrBlank()) {
                    _state.value = _state.value.copy(
                        solveError = context.getString(StringR.string.hint_media_reselect_required),
                    )
                    return
                }
                guaranteedCopyPath = null
                queuedSourceUri = item.sourceUri
            }

            pendingItems.add(
                com.prayer.pointfinder.core.model.PendingMediaItem(
                    localPath = guaranteedCopyPath,
                    sourceUri = queuedSourceUri,
                    contentType = resolvedContentType,
                    sizeBytes = resolvedSizeBytes,
                    fileName = item.fileName,
                ),
            )
        }

        viewModelScope.launch {
            _state.value = _state.value.copy(isSubmitting = true, solveError = null)
            runCatching {
                playerRepository.submitMultiMedia(
                    auth = auth,
                    baseId = baseId,
                    challengeId = challengeId,
                    answer = notes,
                    mediaItems = pendingItems,
                )
            }.onSuccess { result ->
                _state.value = _state.value.copy(
                    isSubmitting = false,
                    latestSubmission = result.response,
                    solveError = null,
                    presenceVerified = false,
                    authExpired = false,
                )
                updateLocalBaseStatus(baseId, BaseStatus.SUBMITTED)
                launch { playerRepository.trySyncPendingActions(auth) }
                OfflineSyncWorker.enqueue(context)
                refresh(auth, online)
                // Send location immediately after media submission (matches iOS behavior)
                launch { locationService.sendLocationNow() }
            }.onFailure { err ->
                val authExpired = ApiErrorParser.isAuthExpired(err)
                _state.value = _state.value.copy(
                    isSubmitting = false,
                    solveError = if (authExpired) null else friendlyError(err),
                    authExpired = _state.value.authExpired || authExpired,
                )
            }
        }
    }

    private fun createGuaranteedMediaCopy(
        mediaBytes: ByteArray?,
        mediaSourceUri: String?,
        contentType: String,
        originalFileName: String?,
    ): String? {
        val pendingDir = File(context.filesDir, "pending-media")
        if (!pendingDir.exists()) {
            pendingDir.mkdirs()
        }
        val extension = extensionForContentType(contentType, originalFileName)
        val target = File(pendingDir, "${UUID.randomUUID()}.$extension")
        if (mediaBytes != null) {
            target.writeBytes(mediaBytes)
            return target.absolutePath
        }
        val uri = mediaSourceUri?.let(Uri::parse) ?: return null
        context.contentResolver.openInputStream(uri)?.use { input ->
            target.outputStream().use { output -> input.copyTo(output) }
            return target.absolutePath
        }
        return null
    }

    private fun extensionForContentType(contentType: String, originalFileName: String?): String {
        val lowerContentType = contentType.lowercase()
        if (lowerContentType == "image/png") return "png"
        if (lowerContentType == "image/webp") return "webp"
        if (lowerContentType == "image/heic" || lowerContentType == "image/heif") return "heic"
        if (lowerContentType == "video/mp4") return "mp4"
        if (lowerContentType == "video/quicktime") return "mov"

        val original = originalFileName.orEmpty().lowercase()
        if (original.endsWith(".png")) return "png"
        if (original.endsWith(".webp")) return "webp"
        if (original.endsWith(".heic") || original.endsWith(".heif")) return "heic"
        if (original.endsWith(".mp4")) return "mp4"
        if (original.endsWith(".mov")) return "mov"
        return "jpg"
    }

    /**
     * Reveal hidden bases that are unlocked by challenges at [checkedInBaseId].
     * Uses cached game data to avoid a server round-trip.
     */
    private fun revealUnlockedBases(checkedInBaseId: String) {
        val current = _state.value.progress
        val newBases = playerRepository.computeUnlockedBases(checkedInBaseId, current)
        if (newBases.isNotEmpty()) {
            _state.value = _state.value.copy(progress = current + newBases)
        }
    }

    /**
     * Optimistically update the local progress list so the UI reflects
     * the new status immediately, before the server round-trip completes.
     */
    private fun updateLocalBaseStatus(baseId: String, status: BaseStatus) {
        val current = _state.value.progress
        val index = current.indexOfFirst { it.baseId == baseId }
        if (index < 0) return
        val updated = current.toMutableList()
        updated[index] = updated[index].copy(
            status = status,
            checkedInAt = if (status == BaseStatus.CHECKED_IN) {
                java.time.Instant.now().toString()
            } else {
                updated[index].checkedInAt
            },
            submissionStatus = if (status == BaseStatus.SUBMITTED) "pending" else updated[index].submissionStatus,
        )
        _state.value = _state.value.copy(progress = updated)
    }

    companion object {
        private const val MEDIA_COPY_THRESHOLD_BYTES = 100L * 1024L * 1024L
    }

    private fun friendlyError(err: Throwable): String = when {
        err is OfflineQueueFullException ->
            context.getString(StringR.string.error_offline_queue_full)
        ApiErrorParser.isNetworkError(err) ->
            context.getString(StringR.string.error_network_unavailable)
        else -> ApiErrorParser.extractMessage(err)
    }

    fun clearSubmissionResult() {
        _state.value = _state.value.copy(latestSubmission = null)
    }

    fun clearAuthExpired() {
        _state.value = _state.value.copy(authExpired = false)
    }

    fun setSolveError(message: String) {
        _state.value = _state.value.copy(solveError = message)
    }

    fun loadUnseenCount() {
        viewModelScope.launch {
            runCatching { api.getUnseenNotificationCount() }
                .onSuccess { response ->
                    _state.value = _state.value.copy(unseenNotificationCount = response.count)
                }
                .onFailure { err ->
                    // Log error instead of silently swallowing
                    android.util.Log.e("PlayerViewModel", "Failed to load unseen notification count", err)
                }
        }
    }

    /**
     * Check for permanently failed offline actions and show warning to user if any exist.
     */
    fun checkForFailedActions(auth: AuthType.Player) {
        viewModelScope.launch {
            runCatching { playerRepository.hasPermanentlyFailedActions(auth) }
                .onSuccess { hasFailedActions ->
                    if (hasFailedActions) {
                        _state.value = _state.value.copy(
                            solveError = context.getString(StringR.string.error_sync_permanently_failed),
                        )
                    }
                }
        }
    }

    suspend fun loadPendingActions(): List<PendingActionEntity> =
        playerRepository.pendingActions()

    fun openNotifications() {
        _state.value = _state.value.copy(showingNotifications = true, isLoadingNotifications = true, notificationError = null)
        viewModelScope.launch {
            runCatching { api.getPlayerNotifications() }
                .onSuccess { notifications ->
                    _state.value = _state.value.copy(
                        notifications = notifications,
                        isLoadingNotifications = false,
                        notificationError = null,
                    )
                }
                .onFailure { err ->
                    _state.value = _state.value.copy(
                        isLoadingNotifications = false,
                        notificationError = friendlyError(err),
                    )
                }
            runCatching { api.markNotificationsSeen() }
                .onSuccess {
                    _state.value = _state.value.copy(
                        unseenNotificationCount = 0,
                        lastNotificationsSeenAt = java.time.Instant.now().toString(),
                    )
                }
        }
    }

    fun closeNotifications() {
        _state.value = _state.value.copy(showingNotifications = false)
    }
}
