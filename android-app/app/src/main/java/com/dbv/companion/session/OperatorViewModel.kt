package com.dbv.companion.session

import android.nfc.Tag
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.dbv.companion.core.data.repo.OperatorRepository
import com.dbv.companion.core.model.Assignment
import com.dbv.companion.core.model.Base
import com.dbv.companion.core.model.Challenge
import com.dbv.companion.core.model.Game
import com.dbv.companion.core.model.Team
import com.dbv.companion.core.model.TeamBaseProgressResponse
import com.dbv.companion.core.model.TeamLocationResponse
import com.dbv.companion.core.platform.NfcEventBus
import com.dbv.companion.core.platform.NfcService
import com.dbv.companion.feature.operator.OperatorTab
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

data class OperatorState(
    val isLoading: Boolean = false,
    val games: List<Game> = emptyList(),
    val selectedGame: Game? = null,
    val selectedTab: OperatorTab = OperatorTab.LIVE_MAP,
    val bases: List<Base> = emptyList(),
    val locations: List<TeamLocationResponse> = emptyList(),
    val baseProgress: List<TeamBaseProgressResponse> = emptyList(),
    val teams: List<Team> = emptyList(),
    val challenges: List<Challenge> = emptyList(),
    val assignments: List<Assignment> = emptyList(),
    val selectedBase: Base? = null,
    val assignmentSummary: String = "Unknown",
    val awaitingNfcWrite: Boolean = false,
    val writeStatus: String? = null,
    val writeSuccess: Boolean? = null,
    val errorMessage: String? = null,
)

@HiltViewModel
class OperatorViewModel @Inject constructor(
    private val operatorRepository: OperatorRepository,
    private val nfcService: NfcService,
    private val nfcEventBus: NfcEventBus,
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
    }

    fun loadGames() {
        viewModelScope.launch {
            _state.value = _state.value.copy(isLoading = true, errorMessage = null)
            runCatching {
                operatorRepository.games()
            }.onSuccess { games ->
                _state.value = _state.value.copy(isLoading = false, games = games)
            }.onFailure { err ->
                _state.value = _state.value.copy(isLoading = false, errorMessage = err.message)
            }
        }
    }

    fun selectGame(game: Game) {
        _state.value = _state.value.copy(selectedGame = game, selectedTab = OperatorTab.LIVE_MAP)
        refreshSelectedGameData()
        loadGameMeta(game.id)
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
                )
            }
        }
    }

    fun clearSelectedGame() {
        pollingJob?.cancel()
        _state.value = _state.value.copy(
            selectedGame = null,
            bases = emptyList(),
            locations = emptyList(),
            baseProgress = emptyList(),
            selectedBase = null,
            writeStatus = null,
            writeSuccess = null,
        )
    }

    fun setTab(tab: OperatorTab) {
        _state.value = _state.value.copy(selectedTab = tab)
        if (tab == OperatorTab.LIVE_MAP) {
            startPolling()
        } else {
            pollingJob?.cancel()
        }
    }

    fun refreshSelectedGameData() {
        val gameId = _state.value.selectedGame?.id ?: return
        viewModelScope.launch {
            runCatching {
                Triple(
                    operatorRepository.gameBases(gameId),
                    operatorRepository.teamLocations(gameId),
                    operatorRepository.teamProgress(gameId),
                )
            }.onSuccess { (bases, locations, progress) ->
                _state.value = _state.value.copy(
                    bases = bases,
                    locations = locations,
                    baseProgress = progress,
                )
            }.onFailure { err ->
                _state.value = _state.value.copy(errorMessage = err.message)
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
                    matching.isEmpty() -> "Random assignment not started"
                    matching.any { it.teamId == null } -> "Fixed challenge assignment"
                    else -> "Per-team assignments (${matching.size})"
                }
            }.onSuccess { summary ->
                _state.value = _state.value.copy(
                    selectedBase = base,
                    assignmentSummary = summary,
                    awaitingNfcWrite = false,
                    writeStatus = null,
                    writeSuccess = null,
                )
            }.onFailure {
                _state.value = _state.value.copy(
                    selectedBase = base,
                    assignmentSummary = "Unknown",
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
        _state.value = _state.value.copy(
            awaitingNfcWrite = true,
            writeStatus = "Hold an NFC tag near the device to write base payload.",
            writeSuccess = null,
        )
    }

    private fun writeBaseNfc(tag: Tag) {
        val game = _state.value.selectedGame ?: return
        val base = _state.value.selectedBase ?: return
        val result = nfcService.writeBaseTag(tag, base.id)
        if (result.isSuccess) {
            // Auto-link in backend after successful write
            viewModelScope.launch {
                runCatching {
                    operatorRepository.linkBaseNfc(game.id, base.id)
                }.onSuccess {
                    _state.value = _state.value.copy(
                        awaitingNfcWrite = false,
                        writeStatus = "NFC written and linked successfully",
                        writeSuccess = true,
                    )
                    refreshSelectedGameData()
                }.onFailure { err ->
                    _state.value = _state.value.copy(
                        awaitingNfcWrite = false,
                        writeStatus = "NFC written but link failed: ${err.message}",
                        writeSuccess = false,
                    )
                }
            }
        } else {
            _state.value = _state.value.copy(
                awaitingNfcWrite = false,
                writeStatus = "NFC write failed: ${result.exceptionOrNull()?.message}",
                writeSuccess = false,
            )
        }
    }

    fun clearError() {
        _state.value = _state.value.copy(errorMessage = null)
    }

    private fun startPolling() {
        pollingJob?.cancel()
        pollingJob = viewModelScope.launch {
            while (true) {
                refreshSelectedGameData()
                delay(5_000L)
            }
        }
    }
}
