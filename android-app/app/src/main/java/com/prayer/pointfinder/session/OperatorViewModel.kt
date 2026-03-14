package com.prayer.pointfinder.session

import android.content.Context
import android.nfc.Tag
import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.prayer.pointfinder.core.data.repo.OperatorRepository
import com.prayer.pointfinder.core.data.repo.SessionStore
import com.prayer.pointfinder.core.model.Assignment
import com.prayer.pointfinder.core.model.Base
import com.prayer.pointfinder.core.model.Challenge
import com.prayer.pointfinder.core.model.CreateBaseRequest
import com.prayer.pointfinder.core.model.CreateChallengeRequest
import com.prayer.pointfinder.core.model.CreateGameRequest
import com.prayer.pointfinder.core.model.CreateTeamRequest
import com.prayer.pointfinder.core.model.Game
import com.prayer.pointfinder.core.model.GameExportDto
import com.prayer.pointfinder.core.model.ImportGameRequest
import com.prayer.pointfinder.core.model.InviteRequest
import com.prayer.pointfinder.core.model.InviteResponse
import com.prayer.pointfinder.core.model.NotificationResponse
import com.prayer.pointfinder.core.model.OperatorUserResponse
import com.prayer.pointfinder.core.model.SendNotificationRequest
import com.prayer.pointfinder.core.model.PlayerResponse
import com.prayer.pointfinder.core.model.TeamVariable
import com.prayer.pointfinder.core.model.TeamVariablesRequest
import com.prayer.pointfinder.core.model.UpdateBaseRequest
import com.prayer.pointfinder.core.model.UpdateChallengeRequest
import com.prayer.pointfinder.core.model.UpdateGameRequest
import com.prayer.pointfinder.core.model.UpdateTeamRequest
import com.prayer.pointfinder.core.model.OperatorNotificationSettingsResponse
import com.prayer.pointfinder.core.model.AuthType
import com.prayer.pointfinder.core.model.ActivityEvent
import com.prayer.pointfinder.core.model.LeaderboardEntry
import com.prayer.pointfinder.core.model.SubmissionResponse
import com.prayer.pointfinder.core.model.SubmissionStatus
import com.prayer.pointfinder.core.model.Team
import com.prayer.pointfinder.core.model.TeamBaseProgressResponse
import com.prayer.pointfinder.core.model.TeamLocationResponse
import com.prayer.pointfinder.core.model.UpdateGameStatusRequest
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
    val variables: List<TeamVariable> = emptyList(),
    val teamVariablesIncomplete: Boolean = false,
    val leaderboard: List<LeaderboardEntry> = emptyList(),
    val activity: List<ActivityEvent> = emptyList(),
    val isLiveRefreshing: Boolean = false,
    val notificationSettings: OperatorNotificationSettingsResponse? = null,
    val isLoadingNotificationSettings: Boolean = false,
    val isSavingNotificationSettings: Boolean = false,
    val selectedBase: Base? = null,
    val assignmentSummary: String = "",
    val awaitingNfcWrite: Boolean = false,
    val writeStatus: String? = null,
    val writeSuccess: Boolean? = null,
    val notifications: List<NotificationResponse> = emptyList(),
    val operators: List<OperatorUserResponse> = emptyList(),
    val invites: List<InviteResponse> = emptyList(),
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
                    "submission_status" -> {
                        refreshSelectedGameData()
                        loadLeaderboard()
                        loadActivity()
                    }

                    "location",
                    "notification" -> refreshSelectedGameData()

                    "game_status" -> {
                        loadGames()
                        refreshSelectedGameData()
                        loadLeaderboard()
                        loadActivity()
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
                    errorMessage = friendlyError(err),
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
            val teams = runCatching { operatorRepository.gameTeams(gameId) }
                .onFailure { Log.e("OperatorVM", "Failed to load teams", it) }
                .getOrDefault(emptyList())
            val challenges = runCatching { operatorRepository.gameChallenges(gameId) }
                .onFailure { Log.e("OperatorVM", "Failed to load challenges", it) }
                .getOrDefault(emptyList())
            val assignments = runCatching { operatorRepository.gameAssignments(gameId) }
                .onFailure { Log.e("OperatorVM", "Failed to load assignments", it) }
                .getOrDefault(emptyList())
            val variables = runCatching { operatorRepository.getGameVariables(gameId).variables }
                .onFailure { Log.e("OperatorVM", "Failed to load variables", it) }
                .getOrDefault(emptyList())
            val teamVariablesIncomplete = if (variables.isNotEmpty()) {
                runCatching { !operatorRepository.getVariablesCompleteness(gameId).complete }
                    .onFailure { Log.e("OperatorVM", "Failed to check variables completeness", it) }
                    .getOrDefault(false)
            } else {
                false
            }

            _state.value = _state.value.copy(
                teams = teams,
                challenges = challenges,
                assignments = assignments,
                variables = variables,
                teamVariablesIncomplete = teamVariablesIncomplete,
                authExpired = false,
            )
        }
    }

    private data class GameMeta(
        val teams: List<Team>,
        val challenges: List<Challenge>,
        val assignments: List<Assignment>,
        val variables: List<TeamVariable>,
    )

    fun clearSelectedGame() {
        pollingJob?.cancel()
        realtimeClient.disconnect()
        _state.value = _state.value.copy(
            selectedGame = null,
            bases = emptyList(),
            locations = emptyList(),
            baseProgress = emptyList(),
            submissions = emptyList(),
            leaderboard = emptyList(),
            activity = emptyList(),
            notificationSettings = null,
            notifications = emptyList(),
            operators = emptyList(),
            invites = emptyList(),
            selectedBase = null,
            writeStatus = null,
            writeSuccess = null,
        )
    }

    fun setTab(tab: OperatorTab) {
        _state.value = _state.value.copy(selectedTab = tab)
        if (tab == OperatorTab.LIVE_MAP || tab == OperatorTab.SUBMISSIONS || tab == OperatorTab.LIVE) {
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
                    errorMessage = friendlyError(err),
                )
            }
        }
        loadLeaderboard()
        loadActivity()
    }

    fun loadLeaderboard() {
        val gameId = _state.value.selectedGame?.id ?: return
        viewModelScope.launch {
            runCatching { operatorRepository.getLeaderboard(gameId) }
                .onSuccess { entries ->
                    _state.value = _state.value.copy(leaderboard = entries, authExpired = false)
                }
                .onFailure { err ->
                    if (markAuthExpiredIfNeeded(err)) return@onFailure
                }
        }
    }

    fun loadActivity() {
        val gameId = _state.value.selectedGame?.id ?: return
        viewModelScope.launch {
            runCatching { operatorRepository.getActivity(gameId) }
                .onSuccess { events ->
                    _state.value = _state.value.copy(activity = events, authExpired = false)
                }
                .onFailure { err ->
                    if (markAuthExpiredIfNeeded(err)) return@onFailure
                }
        }
    }

    fun refreshLiveData() {
        val gameId = _state.value.selectedGame?.id ?: return
        viewModelScope.launch {
            _state.value = _state.value.copy(isLiveRefreshing = true)
            runCatching {
                val leaderboard = operatorRepository.getLeaderboard(gameId)
                val activity = operatorRepository.getActivity(gameId)
                leaderboard to activity
            }.onSuccess { (leaderboard, activity) ->
                _state.value = _state.value.copy(
                    leaderboard = leaderboard,
                    activity = activity,
                    isLiveRefreshing = false,
                    authExpired = false,
                )
            }.onFailure { err ->
                _state.value = _state.value.copy(isLiveRefreshing = false)
                if (markAuthExpiredIfNeeded(err)) return@onFailure
            }
        }
    }

    fun reviewSubmission(submissionId: String, status: SubmissionStatus, feedback: String?, points: Int? = null) {
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
                _state.value = _state.value.copy(errorMessage = friendlyError(err))
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
                    errorMessage = friendlyError(err),
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
                    errorMessage = friendlyError(err),
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
                        writeStatus = context.getString(StringR.string.error_nfc_link_failed, friendlyError(err)),
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

    fun createBase(request: CreateBaseRequest, onSuccess: (Base) -> Unit) {
        val gameId = _state.value.selectedGame?.id ?: return
        viewModelScope.launch {
            runCatching { operatorRepository.createBase(gameId, request) }
                .onSuccess { base ->
                    refreshSelectedGameData()
                    loadGameMeta(gameId)
                    onSuccess(base)
                }
                .onFailure { e ->
                    if (markAuthExpiredIfNeeded(e)) return@onFailure
                    _state.value = _state.value.copy(errorMessage = friendlyError(e))
                }
        }
    }

    fun updateBase(baseId: String, request: UpdateBaseRequest, onSuccess: (Base) -> Unit) {
        val gameId = _state.value.selectedGame?.id ?: return
        viewModelScope.launch {
            runCatching { operatorRepository.updateBase(gameId, baseId, request) }
                .onSuccess { base ->
                    refreshSelectedGameData()
                    loadGameMeta(gameId)
                    onSuccess(base)
                }
                .onFailure { e ->
                    if (markAuthExpiredIfNeeded(e)) return@onFailure
                    _state.value = _state.value.copy(errorMessage = friendlyError(e))
                }
        }
    }

    fun deleteBase(baseId: String, onSuccess: () -> Unit) {
        val gameId = _state.value.selectedGame?.id ?: return
        viewModelScope.launch {
            runCatching { operatorRepository.deleteBaseUnit(gameId, baseId) }
                .onSuccess {
                    refreshSelectedGameData()
                    loadGameMeta(gameId)
                    onSuccess()
                }
                .onFailure { e ->
                    if (markAuthExpiredIfNeeded(e)) return@onFailure
                    _state.value = _state.value.copy(errorMessage = friendlyError(e))
                }
        }
    }

    fun createChallenge(request: CreateChallengeRequest, onSuccess: (Challenge) -> Unit) {
        val gameId = _state.value.selectedGame?.id ?: return
        viewModelScope.launch {
            runCatching { operatorRepository.createChallenge(gameId, request) }
                .onSuccess { challenge ->
                    refreshSelectedGameData()
                    loadGameMeta(gameId)
                    onSuccess(challenge)
                }
                .onFailure { e ->
                    if (markAuthExpiredIfNeeded(e)) return@onFailure
                    _state.value = _state.value.copy(errorMessage = friendlyError(e))
                }
        }
    }

    fun updateChallenge(challengeId: String, request: UpdateChallengeRequest, onSuccess: (Challenge) -> Unit) {
        val gameId = _state.value.selectedGame?.id ?: return
        viewModelScope.launch {
            runCatching { operatorRepository.updateChallenge(gameId, challengeId, request) }
                .onSuccess { challenge ->
                    refreshSelectedGameData()
                    loadGameMeta(gameId)
                    onSuccess(challenge)
                }
                .onFailure { e ->
                    if (markAuthExpiredIfNeeded(e)) return@onFailure
                    _state.value = _state.value.copy(errorMessage = friendlyError(e))
                }
        }
    }

    fun deleteChallenge(challengeId: String, onSuccess: () -> Unit) {
        val gameId = _state.value.selectedGame?.id ?: return
        viewModelScope.launch {
            runCatching { operatorRepository.deleteChallengeUnit(gameId, challengeId) }
                .onSuccess {
                    refreshSelectedGameData()
                    loadGameMeta(gameId)
                    onSuccess()
                }
                .onFailure { e ->
                    if (markAuthExpiredIfNeeded(e)) return@onFailure
                    _state.value = _state.value.copy(errorMessage = friendlyError(e))
                }
        }
    }

    fun createVariable(variableName: String) {
        val gameId = _state.value.selectedGame?.id ?: return
        viewModelScope.launch {
            runCatching {
                val currentVars = _state.value.variables.toMutableList()
                if (currentVars.none { it.key == variableName }) {
                    currentVars.add(TeamVariable(key = variableName, teamValues = emptyMap()))
                }
                operatorRepository.saveGameVariables(gameId, TeamVariablesRequest(variables = currentVars))
            }.onSuccess { response ->
                _state.value = _state.value.copy(variables = response.variables)
            }.onFailure { e ->
                if (markAuthExpiredIfNeeded(e)) return@onFailure
                _state.value = _state.value.copy(errorMessage = friendlyError(e))
            }
        }
    }

    fun deleteVariable(variableKey: String) {
        val gameId = _state.value.selectedGame?.id ?: return
        viewModelScope.launch {
            runCatching {
                val currentVars = _state.value.variables.filter { it.key != variableKey }
                operatorRepository.saveGameVariables(gameId, TeamVariablesRequest(variables = currentVars))
            }.onSuccess { response ->
                _state.value = _state.value.copy(variables = response.variables)
            }.onFailure { e ->
                if (markAuthExpiredIfNeeded(e)) return@onFailure
                _state.value = _state.value.copy(errorMessage = friendlyError(e))
            }
        }
    }

    fun createTeam(name: String, color: String, onSuccess: (Team) -> Unit) {
        val gameId = _state.value.selectedGame?.id ?: return
        viewModelScope.launch {
            runCatching {
                val team = operatorRepository.createTeam(gameId, CreateTeamRequest(name = name))
                operatorRepository.updateTeam(gameId, team.id, UpdateTeamRequest(name = name, color = color))
            }.onSuccess { team ->
                loadGameMeta(gameId)
                onSuccess(team)
            }.onFailure { e ->
                if (markAuthExpiredIfNeeded(e)) return@onFailure
                _state.value = _state.value.copy(errorMessage = friendlyError(e))
            }
        }
    }

    fun updateTeam(teamId: String, request: UpdateTeamRequest, onSuccess: () -> Unit) {
        val gameId = _state.value.selectedGame?.id ?: return
        viewModelScope.launch {
            runCatching { operatorRepository.updateTeam(gameId, teamId, request) }
                .onSuccess { loadGameMeta(gameId); onSuccess() }
                .onFailure { e ->
                    if (markAuthExpiredIfNeeded(e)) return@onFailure
                    _state.value = _state.value.copy(errorMessage = friendlyError(e))
                }
        }
    }

    fun deleteTeam(teamId: String, onSuccess: () -> Unit) {
        val gameId = _state.value.selectedGame?.id ?: return
        viewModelScope.launch {
            runCatching { operatorRepository.deleteTeamUnit(gameId, teamId) }
                .onSuccess { loadGameMeta(gameId); onSuccess() }
                .onFailure { e ->
                    if (markAuthExpiredIfNeeded(e)) return@onFailure
                    _state.value = _state.value.copy(errorMessage = friendlyError(e))
                }
        }
    }

    fun loadTeamPlayers(teamId: String, onSuccess: (List<PlayerResponse>) -> Unit) {
        val gameId = _state.value.selectedGame?.id ?: return
        viewModelScope.launch {
            runCatching { operatorRepository.getTeamPlayers(gameId, teamId) }
                .onSuccess(onSuccess)
                .onFailure { /* ignore */ }
        }
    }

    fun removePlayer(teamId: String, playerId: String, onSuccess: () -> Unit) {
        val gameId = _state.value.selectedGame?.id ?: return
        viewModelScope.launch {
            runCatching { operatorRepository.removePlayerUnit(gameId, teamId, playerId) }
                .onSuccess { onSuccess() }
                .onFailure { e ->
                    if (markAuthExpiredIfNeeded(e)) return@onFailure
                    _state.value = _state.value.copy(errorMessage = friendlyError(e))
                }
        }
    }

    fun saveTeamVariableValue(variableKey: String, teamId: String, value: String) {
        val gameId = _state.value.selectedGame?.id ?: return
        viewModelScope.launch {
            val currentVars = _state.value.variables.toMutableList()
            val varIndex = currentVars.indexOfFirst { it.key == variableKey }
            if (varIndex >= 0) {
                val updated = currentVars[varIndex].let { v ->
                    v.copy(teamValues = v.teamValues.toMutableMap().apply { put(teamId, value) })
                }
                currentVars[varIndex] = updated
            }
            runCatching {
                operatorRepository.saveGameVariables(gameId, TeamVariablesRequest(variables = currentVars))
            }.onSuccess { response ->
                _state.value = _state.value.copy(variables = response.variables)
            }.onFailure { /* ignore */ }
        }
    }

    fun createGame(name: String, description: String, onSuccess: (Game) -> Unit) {
        viewModelScope.launch {
            _state.value = _state.value.copy(isLoading = true)
            runCatching {
                operatorRepository.createGame(CreateGameRequest(name = name, description = description))
            }.onSuccess { game ->
                _state.value = _state.value.copy(isLoading = false)
                loadGames()
                onSuccess(game)
            }.onFailure { e ->
                _state.value = _state.value.copy(isLoading = false, errorMessage = friendlyError(e))
            }
        }
    }

    fun importGame(name: String, exportData: GameExportDto, onSuccess: (Game) -> Unit) {
        viewModelScope.launch {
            _state.value = _state.value.copy(isLoading = true)
            runCatching {
                operatorRepository.importGame(
                    ImportGameRequest(
                        gameData = exportData.copy(game = exportData.game.copy(name = name)),
                    ),
                )
            }.onSuccess { game ->
                _state.value = _state.value.copy(isLoading = false)
                loadGames()
                onSuccess(game)
            }.onFailure { e ->
                _state.value = _state.value.copy(isLoading = false, errorMessage = friendlyError(e))
            }
        }
    }

    fun updateGameStatus(status: String) {
        val gameId = _state.value.selectedGame?.id ?: return
        viewModelScope.launch {
            runCatching {
                operatorRepository.updateGameStatus(gameId, UpdateGameStatusRequest(status = status))
            }.onSuccess { updatedGame ->
                _state.value = _state.value.copy(selectedGame = updatedGame, authExpired = false)
                loadGames()
            }.onFailure { e ->
                if (markAuthExpiredIfNeeded(e)) return@onFailure
                _state.value = _state.value.copy(errorMessage = friendlyError(e))
            }
        }
    }

    fun updateGame(request: UpdateGameRequest, onSuccess: () -> Unit) {
        val gameId = _state.value.selectedGame?.id ?: return
        viewModelScope.launch {
            runCatching {
                operatorRepository.updateGame(gameId, request)
            }.onSuccess { updatedGame ->
                _state.value = _state.value.copy(selectedGame = updatedGame, authExpired = false)
                loadGames()
                onSuccess()
            }.onFailure { e ->
                if (markAuthExpiredIfNeeded(e)) return@onFailure
                _state.value = _state.value.copy(errorMessage = friendlyError(e))
            }
        }
    }

    fun loadNotifications() {
        val gameId = _state.value.selectedGame?.id ?: return
        viewModelScope.launch {
            runCatching {
                operatorRepository.getNotifications(gameId)
            }.onSuccess { list ->
                _state.value = _state.value.copy(notifications = list, authExpired = false)
            }.onFailure { err ->
                if (markAuthExpiredIfNeeded(err)) return@onFailure
                _state.value = _state.value.copy(errorMessage = friendlyError(err))
            }
        }
    }

    fun sendNotification(message: String, targetTeamId: String?, onSuccess: () -> Unit) {
        val gameId = _state.value.selectedGame?.id ?: return
        viewModelScope.launch {
            runCatching {
                operatorRepository.sendNotification(gameId, SendNotificationRequest(message = message, targetTeamId = targetTeamId))
            }.onSuccess {
                _state.value = _state.value.copy(authExpired = false)
                loadNotifications()
                onSuccess()
            }.onFailure { err ->
                if (markAuthExpiredIfNeeded(err)) return@onFailure
                _state.value = _state.value.copy(errorMessage = friendlyError(err))
            }
        }
    }

    fun loadOperators() {
        val gameId = _state.value.selectedGame?.id ?: return
        viewModelScope.launch {
            runCatching {
                val ops = operatorRepository.getGameOperators(gameId)
                val inv = operatorRepository.getGameInvites(gameId)
                ops to inv
            }.onSuccess { (ops, inv) ->
                _state.value = _state.value.copy(operators = ops, invites = inv, authExpired = false)
            }.onFailure { err ->
                if (markAuthExpiredIfNeeded(err)) return@onFailure
                _state.value = _state.value.copy(errorMessage = friendlyError(err))
            }
        }
    }

    fun removeOperator(userId: String) {
        val gameId = _state.value.selectedGame?.id ?: return
        viewModelScope.launch {
            try {
                operatorRepository.removeGameOperatorUnit(gameId, userId)
                _state.value = _state.value.copy(authExpired = false)
                loadOperators()
            } catch (err: Exception) {
                if (markAuthExpiredIfNeeded(err)) return@launch
                _state.value = _state.value.copy(errorMessage = friendlyError(err))
            }
        }
    }

    fun inviteOperator(email: String, onSuccess: () -> Unit) {
        val gameId = _state.value.selectedGame?.id ?: return
        viewModelScope.launch {
            runCatching {
                operatorRepository.createInvite(InviteRequest(email = email, gameId = gameId))
            }.onSuccess {
                _state.value = _state.value.copy(authExpired = false)
                loadOperators()
                onSuccess()
            }.onFailure { err ->
                if (markAuthExpiredIfNeeded(err)) return@onFailure
                _state.value = _state.value.copy(errorMessage = friendlyError(err))
            }
        }
    }

    fun exportGame(onSuccess: (GameExportDto) -> Unit) {
        val gameId = _state.value.selectedGame?.id ?: return
        viewModelScope.launch {
            runCatching {
                operatorRepository.exportGame(gameId)
            }.onSuccess { export ->
                _state.value = _state.value.copy(authExpired = false)
                onSuccess(export)
            }.onFailure { err ->
                if (markAuthExpiredIfNeeded(err)) return@onFailure
                _state.value = _state.value.copy(errorMessage = friendlyError(err))
            }
        }
    }

    fun currentOperatorUserId(): String? {
        return (sessionStore.authType() as? AuthType.Operator)?.userId
    }

    private fun friendlyError(err: Throwable): String =
        if (ApiErrorParser.isNetworkError(err))
            context.getString(StringR.string.error_network_unavailable)
        else friendlyError(err)

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
