package com.dbv.companion.session

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.dbv.companion.core.data.repo.PlayerRepository
import com.dbv.companion.core.model.AuthType
import com.dbv.companion.core.model.BaseProgress
import com.dbv.companion.core.model.CheckInResponse
import com.dbv.companion.core.model.SubmissionResponse
import com.dbv.companion.core.network.ApiErrorParser
import com.dbv.companion.core.platform.NfcEventBus
import com.dbv.companion.core.platform.PlayerLocationService
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import com.dbv.companion.core.i18n.R as StringR

data class PlayerState(
    val isLoading: Boolean = false,
    val progress: List<BaseProgress> = emptyList(),
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
    val latestSubmission: SubmissionResponse? = null,
)

@HiltViewModel
class PlayerViewModel @Inject constructor(
    private val playerRepository: PlayerRepository,
    private val nfcEventBus: NfcEventBus,
    private val locationService: PlayerLocationService,
    @ApplicationContext private val context: Context,
) : ViewModel() {
    private val _state = MutableStateFlow(PlayerState())
    val state: StateFlow<PlayerState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            nfcEventBus.scannedBaseIds.collectLatest { baseId ->
                _state.value = _state.value.copy(lastScannedBaseId = baseId)
                val expected = _state.value.awaitingPresenceBaseId ?: return@collectLatest
                verifyPresence(baseId, expected)
            }
        }
    }

    fun refresh(auth: AuthType.Player, online: Boolean) {
        viewModelScope.launch {
            _state.value = _state.value.copy(isLoading = true, scanError = null, solveError = null)
            runCatching {
                playerRepository.loadProgress(auth, online)
            }.onSuccess { progress ->
                _state.value = _state.value.copy(isLoading = false, progress = progress)
            }.onFailure { err ->
                _state.value = _state.value.copy(
                    isLoading = false,
                    solveError = ApiErrorParser.extractMessage(err),
                )
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

    fun startCheckIn(auth: AuthType.Player, baseId: String, online: Boolean) {
        viewModelScope.launch {
            runCatching {
                playerRepository.checkIn(auth, baseId, online)
            }.onSuccess { result ->
                _state.value = _state.value.copy(
                    activeCheckIn = result.response,
                    scanError = null,
                )
                refresh(auth, online)
                // Send location immediately after check-in (matches iOS behavior)
                launch { locationService.sendLocationNow() }
            }.onFailure { err ->
                _state.value = _state.value.copy(
                    scanError = ApiErrorParser.extractMessage(err),
                )
            }
        }
    }

    fun clearCheckIn() {
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
        if (scannedBaseId == null) {
            _state.value = _state.value.copy(
                presenceVerified = false,
                solveError = context.getString(StringR.string.error_invalid_nfc),
            )
            return
        }
        if (scannedBaseId != expectedBaseId) {
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
        startCheckIn(auth, baseId, online)
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
            runCatching {
                playerRepository.submitText(auth, baseId, challengeId, answer, online)
            }.onSuccess { result ->
                _state.value = _state.value.copy(
                    latestSubmission = result.response,
                    solveError = null,
                    answerText = "",
                    presenceVerified = false,
                )
                refresh(auth, online)
                // Send location immediately after submission (matches iOS behavior)
                launch { locationService.sendLocationNow() }
            }.onFailure { err ->
                _state.value = _state.value.copy(
                    solveError = ApiErrorParser.extractMessage(err),
                )
            }
        }
    }

    fun submitPhoto(
        auth: AuthType.Player,
        baseId: String,
        challengeId: String,
        imageBytes: ByteArray?,
        notes: String,
        online: Boolean,
    ) {
        if (!online) {
            _state.value = _state.value.copy(
                solveError = context.getString(StringR.string.hint_photo_required_online),
            )
            return
        }
        if (imageBytes == null) {
            _state.value = _state.value.copy(
                solveError = context.getString(StringR.string.error_photo_required),
            )
            return
        }
        viewModelScope.launch {
            runCatching {
                playerRepository.submitPhoto(
                    auth = auth,
                    baseId = baseId,
                    challengeId = challengeId,
                    answer = notes,
                    imageBytes = imageBytes,
                )
            }.onSuccess { response ->
                _state.value = _state.value.copy(
                    latestSubmission = response,
                    solveError = null,
                    presenceVerified = false,
                )
                refresh(auth, online)
                // Send location immediately after photo submission (matches iOS behavior)
                launch { locationService.sendLocationNow() }
            }.onFailure { err ->
                _state.value = _state.value.copy(
                    solveError = ApiErrorParser.extractMessage(err),
                )
            }
        }
    }

    fun clearSubmissionResult() {
        _state.value = _state.value.copy(latestSubmission = null)
    }
}
