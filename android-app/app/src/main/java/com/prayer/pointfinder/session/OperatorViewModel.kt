package com.prayer.pointfinder.session

import android.content.Context
import android.nfc.Tag
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.prayer.pointfinder.core.data.repo.OperatorRepository
import com.prayer.pointfinder.core.data.repo.SessionStore
import com.prayer.pointfinder.core.model.Assignment
import com.prayer.pointfinder.core.model.Base
import com.prayer.pointfinder.core.model.Challenge
import com.prayer.pointfinder.core.model.Game
import com.prayer.pointfinder.core.model.OperatorNotificationSettingsResponse
import com.prayer.pointfinder.core.model.SubmissionResponse
import com.prayer.pointfinder.core.model.Team
import com.prayer.pointfinder.core.model.TeamBaseProgressResponse
import com.prayer.pointfinder.core.model.TeamLocationResponse
import com.prayer.pointfinder.core.model.UpdateOperatorNotificationSettingsRequest
import com.prayer.pointfinder.core.network.ApiErrorParser
import com.prayer.pointfinder.core.network.MobileRealtimeClient
import com.prayer.pointfinder.core.network.RealtimeConnectionState
import com.prayer.pointfinder.core.platform.NfcEventBus
import com.prayer.pointfinder.core.platform.NfcService
import com.prayer.pointfinder.feature.operator.OperatorTab
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import com.prayer.pointfinder.core.i18n.R as StringR

data class OperatorState(
    val isLoading: Boolean = false,
    val games: List<Game> = emptyList(),
    val selectedGame: Game? = null,
    val selectedTab: OperatorTab = OperatorTab.LIVE_MAP,
    val bases: List<Base> = emptyList(),
    val locations: List<TeamLocationResponse> = emptyList(),
    val baseProgress: List<TeamBaseProgressResponse> = emptyList(),
    val submissions: List<SubmissionResponse> = emptyList(),
    val teams: List<Team> = emptyList(),
    val challenges: List<Challenge> = emptyList(),
    val assignments: List<Assignment> = emptyList(),
    val notificationSettings: OperatorNotificationSettingsResponse? = null,
    val isLoadingNotificationSettings: Boolean = false,
    val isSavingNotificationSettings: Boolean = false,
    val selectedBase: Base? = null,
    val assignmentSummary: String = "",
    val awaitingNfcWrite: Boolean = false,
    val writeStatus: String? = null,
    val writeSuccess: Boolean? = null,
    val errorMessage: String? = null,
    val authExpired: Boolean = false,
)

@HiltViewModel
class OperatorViewModel @Inject constructor(
    private val operatorRepository: OperatorRepository,
    private val sessionStore: SessionStore,
    private val realtimeClient: MobileRealtimeClient,
    private val nfcService: NfcService,
    private val nfcEventBus: NfcEventBus,
    @ApplicationContext private val context: Context,
) : ViewModel() {
    private val _state = MutableStateFlow(OperatorState())
    val state: StateFlow<OperatorState> = _state.asStateFlow()

    private var pollingJob: Job? = null

    init {
        viewModelScope.launch {
            nfcEventBus.discoveredTags.collectLatest { tag ->
                if (_state.value.awaitingNfcWrite) {
                    writeBaseNfc(tag)
                }
            }
        }
        viewModelScope.launch {
            realtimeClient.events.collectLatest { event ->
                val selectedGameId = _state.value.selectedGame?.id ?: return@collectLatest
                if (event.gameId != null && event.gameId != selectedGameId) return@collectLatest

                when (event.type) {
                    "activity",
                    "location",
                    "submission_status",
                    "notification" -> refreshSelectedGameData()

                    "game_status" -> {
                        loadGames()
                        refreshSelectedGameData()
                    }
                }
            }
        }
    }

    fun loadGames() {
        viewModelScope.launch {
            _state.value = _state.value.copy(isLoading = true, errorMessage = null)
            runCatching {
                operatorRepository.games()
            }.onSuccess { games ->
                val selectedId = _state.value.selectedGame?.id
                val updatedSelectedGame = selectedId?.let { id -> games.firstOrNull { it.id == id } }
                _state.value = _state.value.copy(
                    isLoading = false,
                    games = games,
                    selectedGame = updatedSelectedGame ?: _state.value.selectedGame,
                    authExpired = false,
                )
            }.onFailure { err ->
                if (markAuthExpiredIfNeeded(err)) return@onFailure
                _state.value = _state.value.copy(
                    isLoading = false,
                    errorMessage = ApiErrorParser.extractMessage(err),
                )
            }
        }
    }

    fun selectGame(game: Game) {
        _state.value = _state.value.copy(selectedGame = game, selectedTab = OperatorTab.LIVE_MAP)
        sessionStore.operatorToken()?.let { token ->
            realtimeClient.connect(gameId = game.id, token = token)
        }
        refreshSelectedGameData()
        loadGameMeta(game.id)
        loadNotificationSettings()
        startPolling()
    }

    private fun loadGameMeta(gameId: String) {
        viewModelScope.launch {
            runCatching {
                Triple(
                    operatorRepository.gameTeams(gameId),
                    operatorRepository.gameChallenges(gameId),
                    operatorRepository.gameAssignments(gameId),
                )
            }.onSuccess { (teams, challenges, assignments) ->
                _state.value = _state.value.copy(
                    teams = teams,
                    challenges = challenges,
                    assignments = assignments,
                    authExpired = false,
                )
            }.onFailure { err ->
                if (markAuthExpiredIfNeeded(err)) return@onFailure
            }
        }
    }

    fun clearSelectedGame() {
        pollingJob?.cancel()
        realtimeClient.disconnect()
        _state.value = _state.value.copy(
            selectedGame = null,
            bases = emptyList(),
            locations = emptyList(),
            baseProgress = emptyList(),
            submissions = emptyList(),
            notificationSettings = null,
            selectedBase = null,
            writeStatus = null,
            writeSuccess = null,
        )
    }

    fun setTab(tab: OperatorTab) {
        _state.value = _state.value.copy(selectedTab = tab)
        if (tab == OperatorTab.LIVE_MAP || tab == OperatorTab.SUBMISSIONS) {
            startPolling()
        } else {
            pollingJob?.cancel()
        }
    }

    fun refreshSelectedGameData() {
        val gameId = _state.value.selectedGame?.id ?: return
        viewModelScope.launch {
            runCatching {
                val bases = operatorRepository.gameBases(gameId)
                val locations = operatorRepository.teamLocations(gameId)
                val progress = operatorRepository.teamProgress(gameId)
                val submissions = operatorRepository.gameSubmissions(gameId)
                RefreshData(
                    bases = bases,
                    locations = locations,
                    progress = progress,
                    submissions = submissions,
                )
            }.onSuccess { refreshed ->
                _state.value = _state.value.copy(
                    bases = refreshed.bases,
                    locations = refreshed.locations,
                    baseProgress = refreshed.progress,
                    submissions = refreshed.submissions,
                    authExpired = false,
                )
            }.onFailure { err ->
                if (markAuthExpiredIfNeeded(err)) return@onFailure
                _state.value = _state.value.copy(
                    errorMessage = ApiErrorParser.extractMessage(err),
                )
            }
        }
    }

    fun reviewSubmission(submissionId: String, status: String, feedback: String?, points: Int? = null) {
        val gameId = _state.value.selectedGame?.id ?: return
        viewModelScope.launch {
            runCatching {
                operatorRepository.reviewSubmission(
                    gameId = gameId,
                    submissionId = submissionId,
                    status = status,
                    feedback = feedback,
                    points = points,
                )
            }.onSuccess {
                _state.value = _state.value.copy(errorMessage = null, authExpired = false)
                refreshSelectedGameData()
            }.onFailure { err ->
                if (markAuthExpiredIfNeeded(err)) return@onFailure
                _state.value = _state.value.copy(errorMessage = ApiErrorParser.extractMessage(err))
            }
        }
    }

    fun loadNotificationSettings() {
        val gameId = _state.value.selectedGame?.id ?: return
        viewModelScope.launch {
            _state.value = _state.value.copy(isLoadingNotificationSettings = true)
            runCatching {
                operatorRepository.getOperatorNotificationSettings(gameId)
            }.onSuccess { settings ->
                _state.value = _state.value.copy(
                    notificationSettings = settings,
                    isLoadingNotificationSettings = false,
                    authExpired = false,
                )
            }.onFailure { err ->
                if (markAuthExpiredIfNeeded(err)) return@onFailure
                _state.value = _state.value.copy(
                    isLoadingNotificationSettings = false,
                    errorMessage = ApiErrorParser.extractMessage(err),
                )
            }
        }
    }

    fun updateNotificationSettings(
        notifyPendingSubmissions: Boolean,
        notifyAllSubmissions: Boolean,
        notifyCheckIns: Boolean,
    ) {
        val gameId = _state.value.selectedGame?.id ?: return
        viewModelScope.launch {
            _state.value = _state.value.copy(isSavingNotificationSettings = true)
            runCatching {
                operatorRepository.updateOperatorNotificationSettings(
                    gameId = gameId,
                    request = UpdateOperatorNotificationSettingsRequest(
                        notifyPendingSubmissions = notifyPendingSubmissions,
                        notifyAllSubmissions = notifyAllSubmissions,
                        notifyCheckIns = notifyCheckIns,
                    ),
                )
            }.onSuccess { settings ->
                _state.value = _state.value.copy(
                    notificationSettings = settings,
                    isSavingNotificationSettings = false,
                    authExpired = false,
                )
            }.onFailure { err ->
                if (markAuthExpiredIfNeeded(err)) return@onFailure
                _state.value = _state.value.copy(
                    isSavingNotificationSettings = false,
                    errorMessage = ApiErrorParser.extractMessage(err),
                )
            }
        }
    }

    fun selectBase(base: Base) {
        val game = _state.value.selectedGame ?: return
        viewModelScope.launch {
            runCatching {
                val assignments = operatorRepository.gameAssignments(game.id)
                val matching = assignments.filter { it.baseId == base.id }
                when {
                    matching.isEmpty() -> context.getString(StringR.string.label_assignment_random_not_started)
                    matching.any { it.teamId == null } -> context.getString(StringR.string.label_assignment_fixed)
                    else -> context.getString(StringR.string.label_assignment_per_team, matching.size)
                }
            }.onSuccess { summary ->
                _state.value = _state.value.copy(
                    selectedBase = base,
                    assignmentSummary = summary,
                    awaitingNfcWrite = false,
                    writeStatus = null,
                    writeSuccess = null,
                    authExpired = false,
                )
            }.onFailure { err ->
                if (markAuthExpiredIfNeeded(err)) return@onFailure
                _state.value = _state.value.copy(
                    selectedBase = base,
                    assignmentSummary = context.getString(StringR.string.label_status),
                    awaitingNfcWrite = false,
                    writeSuccess = null,
                )
            }
        }
    }

    fun clearSelectedBase() {
        _state.value = _state.value.copy(
            selectedBase = null,
            writeStatus = null,
            writeSuccess = null,
            awaitingNfcWrite = false,
        )
    }

    fun beginWriteNfc() {
        if (!nfcService.isAvailable()) {
            _state.value = _state.value.copy(
                awaitingNfcWrite = false,
                writeStatus = context.getString(StringR.string.error_nfc_unavailable),
                writeSuccess = false,
            )
            return
        }
        _state.value = _state.value.copy(
            awaitingNfcWrite = true,
            writeStatus = context.getString(StringR.string.hint_nfc_hold_near),
            writeSuccess = null,
        )
    }

    fun cancelWriteNfc() {
        _state.value = _state.value.copy(
            awaitingNfcWrite = false,
            writeStatus = null,
            writeSuccess = null,
        )
    }

    private fun writeBaseNfc(tag: Tag) {
        val game = _state.value.selectedGame ?: return
        val base = _state.value.selectedBase ?: return
        val result = nfcService.writeBaseTag(tag, base.id)
        if (result.isSuccess) {
            _state.value = _state.value.copy(
                awaitingNfcWrite = false,
                writeStatus = null,
                writeSuccess = null,
            )
            // Auto-link in backend after successful write
            viewModelScope.launch {
                runCatching {
                    operatorRepository.linkBaseNfc(game.id, base.id)
                }.onSuccess {
                    _state.value = _state.value.copy(
                        writeStatus = context.getString(StringR.string.success_nfc_written),
                        writeSuccess = true,
                        authExpired = false,
                    )
                    refreshSelectedGameData()
                }.onFailure { err ->
                    if (markAuthExpiredIfNeeded(err)) return@onFailure
                    _state.value = _state.value.copy(
                        writeStatus = context.getString(StringR.string.error_nfc_link_failed, ApiErrorParser.extractMessage(err)),
                        writeSuccess = false,
                    )
                }
            }
        } else {
            _state.value = _state.value.copy(
                awaitingNfcWrite = false,
                writeStatus = context.getString(StringR.string.error_nfc_write_failed),
                writeSuccess = false,
            )
        }
    }

    fun clearError() {
        _state.value = _state.value.copy(errorMessage = null)
    }

    fun clearAuthExpired() {
        _state.value = _state.value.copy(authExpired = false)
    }

    private fun startPolling() {
        pollingJob?.cancel()
        pollingJob = viewModelScope.launch {
            while (true) {
                if (realtimeClient.connectionState.value !is RealtimeConnectionState.Connected) {
                    refreshSelectedGameData()
                }
                delay(20_000L)
            }
        }
    }

    private fun markAuthExpiredIfNeeded(err: Throwable): Boolean {
        if (!ApiErrorParser.isAuthExpired(err)) return false
        realtimeClient.disconnect()
        _state.value = _state.value.copy(
            isLoading = false,
            awaitingNfcWrite = false,
            errorMessage = null,
            authExpired = true,
        )
        return true
    }

    private data class RefreshData(
        val bases: List<Base>,
        val locations: List<TeamLocationResponse>,
        val progress: List<TeamBaseProgressResponse>,
        val submissions: List<SubmissionResponse>,
    )
}
