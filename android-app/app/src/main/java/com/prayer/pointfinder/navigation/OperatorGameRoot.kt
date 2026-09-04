package com.prayer.pointfinder.navigation

import android.content.Intent
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Box
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.prayer.pointfinder.core.model.CreateBaseRequest
import com.prayer.pointfinder.core.model.CreateChallengeRequest
import com.prayer.pointfinder.core.model.GameStatus
import com.prayer.pointfinder.core.model.MarkCompletedRequest
import com.prayer.pointfinder.core.model.PlayerResponse
import com.prayer.pointfinder.core.model.BaseUnlockOverrideResponse
import com.prayer.pointfinder.core.model.TeamVariable
import com.prayer.pointfinder.core.model.ThemeMode
import com.prayer.pointfinder.core.model.TileSources
import com.prayer.pointfinder.core.model.UpdateBaseRequest
import com.prayer.pointfinder.core.model.UpdateChallengeRequest
import com.prayer.pointfinder.feature.operator.ActivityLogScreen
import com.prayer.pointfinder.feature.operator.AssignmentsScreen
import com.prayer.pointfinder.feature.operator.BaseEditScreen
import com.prayer.pointfinder.feature.operator.BasesListScreen
import com.prayer.pointfinder.feature.operator.ChallengeEditScreen
import com.prayer.pointfinder.feature.operator.ChallengesListScreen
import com.prayer.pointfinder.feature.operator.GameSettingsScreen
import com.prayer.pointfinder.feature.operator.LiveBaseProgressBottomSheet
import com.prayer.pointfinder.feature.operator.LiveScreen
import com.prayer.pointfinder.feature.operator.ManageTagsScreen
import com.prayer.pointfinder.feature.operator.MoreScreen
import com.prayer.pointfinder.feature.operator.NotificationsScreen
import com.prayer.pointfinder.feature.operator.OperatorGameScaffold
import com.prayer.pointfinder.feature.operator.OperatorMapScreen
import com.prayer.pointfinder.feature.operator.OperatorSubmissionsScreen
import com.prayer.pointfinder.feature.operator.OperatorTab
import com.prayer.pointfinder.feature.operator.OperatorsScreen
import com.prayer.pointfinder.feature.operator.OrganizationScreen
import com.prayer.pointfinder.feature.operator.SetupHubScreen
import com.prayer.pointfinder.feature.operator.TeamDetailScreen
import com.prayer.pointfinder.feature.operator.TeamsListScreen
import com.prayer.pointfinder.feature.operator.TeamVariablesManagementScreen
import com.prayer.pointfinder.feature.player.NfcScanDialog
import com.prayer.pointfinder.session.AppSessionViewModel
import com.prayer.pointfinder.session.OperatorViewModel
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json

@Composable
internal fun OperatorGameRoot(
    viewModel: OperatorViewModel,
    sessionViewModel: AppSessionViewModel,
    currentLanguage: String,
    currentThemeMode: ThemeMode,
    operatorAccessToken: String?,
    apiBaseUrl: String,
    onSwitchGame: () -> Unit,
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    LaunchedEffect(state.authExpired) {
        if (state.authExpired) {
            viewModel.clearAuthExpired()
            sessionViewModel.logout()
        }
    }
    val selectedGame = state.selectedGame

    if (selectedGame == null) {
        onSwitchGame()
        return
    }

    val gameStatus = selectedGame.status

    // Setup sub-screen navigation state
    // null = show hub, "bases_list" / "base_edit:<id>" / "base_create"
    // "challenges_list" / "challenge_edit:<id>" / "challenge_create" / "challenge_create_for_base:<baseId>"
    // "teams_list" / "team_detail:<id>"
    var setupSubScreen by remember { mutableStateOf<String?>(null) }
    // Sub-screen state for map-initiated actions (base create/edit from map)
    var mapSubScreen by remember { mutableStateOf<String?>(null) }
    // Sub-screen state for More tab navigation
    var moreSubScreen by remember { mutableStateOf<String?>(null) }

    val snackbarHostState = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    val context = LocalContext.current

    LaunchedEffect(state.errorMessage) {
        val msg = state.errorMessage
        if (!msg.isNullOrBlank()) {
            snackbarHostState.showSnackbar(msg)
            viewModel.clearError()
        }
    }

    // Reset sub-screen when switching tabs
    LaunchedEffect(state.selectedTab) {
        if (state.selectedTab != OperatorTab.SETUP) {
            setupSubScreen = null
        }
        if (state.selectedTab != OperatorTab.LIVE_MAP) {
            mapSubScreen = null
        }
        if (state.selectedTab != OperatorTab.MORE) {
            moreSubScreen = null
        }
    }

    // When switching from setup to live mode, if current tab is SETUP, switch to LIVE
    LaunchedEffect(gameStatus, state.selectedTab) {
        if (gameStatus != GameStatus.SETUP && state.selectedTab == OperatorTab.SETUP) {
            viewModel.setTab(OperatorTab.LIVE)
        }
        if (gameStatus == GameStatus.SETUP && state.selectedTab == OperatorTab.LIVE) {
            viewModel.setTab(OperatorTab.SETUP)
        }
        if (gameStatus == GameStatus.SETUP && state.selectedTab == OperatorTab.SUBMISSIONS) {
            viewModel.setTab(OperatorTab.LIVE_MAP)
        }
    }

    OperatorGameScaffold(
        selectedTab = state.selectedTab,
        gameStatus = gameStatus,
        onTabSelected = viewModel::setTab,
    ) {
        Box {
        when (state.selectedTab) {
            OperatorTab.LIVE_MAP -> {
                when {
                    mapSubScreen?.startsWith("base_create_at:") == true -> {
                        val coords = mapSubScreen!!.removePrefix("base_create_at:")
                        val parts = coords.split(",")
                        val lat = parts.getOrNull(0)?.toDoubleOrNull()
                        val lng = parts.getOrNull(1)?.toDoubleOrNull()
                        BaseEditScreen(
                            base = null,
                            bases = state.bases,
                            challenges = state.challenges,
                            linkedChallenges = emptyList(),
                            onSave = { request ->
                                viewModel.createBase(request as CreateBaseRequest) { base ->
                                    mapSubScreen = "base_edit:${base.id}"
                                    scope.launch { snackbarHostState.showSnackbar(context.getString(com.prayer.pointfinder.core.i18n.R.string.toast_base_created)) }
                                }
                            },
                            onDelete = null,
                            onWriteNfc = null,
                            onNavigateToCreateChallenge = null,
                            onBack = { mapSubScreen = null },
                            initialLat = lat,
                            initialLng = lng,
                            tileSource = selectedGame.tileSource,
                        )
                    }
                    mapSubScreen?.startsWith("base_edit:") == true -> {
                        val baseId = mapSubScreen!!.removePrefix("base_edit:")
                        val base = state.bases.firstOrNull { it.id == baseId }
                        if (base != null) {
                            val fromAssignments = state.assignments
                                .filter { it.baseId == base.id }
                                .mapNotNull { assignment ->
                                    state.challenges.firstOrNull { it.id == assignment.challengeId }
                                }
                            val fixedToBase = state.challenges.filter { ch ->
                                base.fixedChallengeId == ch.id
                            }
                            val linkedChallenges = (fromAssignments + fixedToBase).distinctBy { it.id }
                            BaseEditScreen(
                                base = base,
                                bases = state.bases,
                                challenges = state.challenges,
                                linkedChallenges = linkedChallenges,
                                onSave = { request ->
                                    viewModel.updateBase(base.id, request as UpdateBaseRequest) {
                                        mapSubScreen = null
                                        scope.launch { snackbarHostState.showSnackbar(context.getString(com.prayer.pointfinder.core.i18n.R.string.toast_base_saved)) }
                                    }
                                },
                                onDelete = {
                                    viewModel.deleteBase(base.id) {
                                        mapSubScreen = null
                                    }
                                },
                                onWriteNfc = {
                                    viewModel.selectBase(base)
                                    viewModel.beginWriteNfc()
                                },
                                onNavigateToCreateChallenge = { bId -> mapSubScreen = "challenge_create_for_base:$bId" },
                                onBack = { mapSubScreen = null },
                                initialLat = null,
                                initialLng = null,
                                tileSource = selectedGame.tileSource,
                            )
                        } else {
                            mapSubScreen = null
                        }
                    }
                    mapSubScreen?.startsWith("challenge_create_for_base:") == true -> {
                        val preLinkedBaseId = mapSubScreen!!.removePrefix("challenge_create_for_base:")
                        ChallengeEditScreen(
                            challenge = null,
                            bases = state.bases,
                            challenges = state.challenges,
                            teams = state.teams,
                            variables = state.variables,
                            onSave = { request ->
                                viewModel.createChallenge(
                                    request as CreateChallengeRequest,
                                    onSuccess = {
                                        mapSubScreen = null
                                        scope.launch { snackbarHostState.showSnackbar(context.getString(com.prayer.pointfinder.core.i18n.R.string.toast_challenge_created)) }
                                    },
                                    onError = { msg -> scope.launch { snackbarHostState.showSnackbar(msg) } },
                                )
                            },
                            onDelete = null,
                            onBack = { mapSubScreen = "base_edit:$preLinkedBaseId" },
                            preLinkedBaseId = preLinkedBaseId,
                            onCreateVariable = viewModel::createVariable,
                        )
                    }
                    else -> {
                        val operatorIsDark = when (currentThemeMode) {
                            ThemeMode.SYSTEM -> isSystemInDarkTheme()
                            ThemeMode.LIGHT -> false
                            ThemeMode.DARK -> true
                        }
                        OperatorMapScreen(
                            gameName = selectedGame.name,
                            bases = state.bases,
                            teamLocations = state.locations,
                            teams = state.teams,
                            baseProgress = state.baseProgress,
                            challenges = state.challenges,
                            assignments = state.assignments,
                            tileSource = selectedGame.tileSource,
                            isDark = operatorIsDark,
                            gameStatus = gameStatus,
                            onBaseSelected = viewModel::selectBase,
                            onCreateBaseAt = { lat, lng ->
                                mapSubScreen = "base_create_at:$lat,$lng"
                            },
                            onEditBase = { base ->
                                mapSubScreen = "base_edit:${base.id}"
                            },
                            onAddChallengeForBase = { base ->
                                mapSubScreen = "challenge_create_for_base:${base.id}"
                            },
                            onWriteNfc = { base ->
                                viewModel.selectBase(base)
                                viewModel.beginWriteNfc()
                            },
                            onRefresh = viewModel::refreshSelectedGameData,
                        )
                        if (state.selectedBase != null && !state.awaitingNfcWrite) {
                            val base = state.selectedBase!!
                            LiveBaseProgressBottomSheet(
                                base = base,
                                progress = state.baseProgress,
                                teams = state.teams,
                                onWriteNfc = viewModel::beginWriteNfc,
                                writeStatus = state.writeStatus,
                                writeSuccess = state.writeSuccess,
                                onDismiss = viewModel::clearSelectedBase,
                                onManualCheckIn = { teamId, baseId ->
                                    viewModel.manualCheckIn(
                                        teamId = teamId,
                                        baseId = baseId,
                                        onSuccess = { viewModel.clearSelectedBase() },
                                        onError = { /* error shown by ViewModel state */ },
                                    )
                                },
                            )
                        }
                    }
                }
            }

            OperatorTab.SETUP -> {
                when {
                    setupSubScreen == "bases_list" -> {
                        BasesListScreen(
                            bases = state.bases,
                            challenges = state.challenges,
                            assignments = state.assignments,
                            gameTags = state.gameTags,
                            onSelectBase = { base -> setupSubScreen = "base_edit:${base.id}" },
                            onCreateBase = { setupSubScreen = "base_create" },
                            onBack = { setupSubScreen = null },
                        )
                    }
                    setupSubScreen == "base_create" -> {
                        BaseEditScreen(
                            base = null,
                            bases = state.bases,
                            challenges = state.challenges,
                            linkedChallenges = emptyList(),
                            onSave = { request ->
                                viewModel.createBase(request as CreateBaseRequest) { base ->
                                    setupSubScreen = "base_edit:${base.id}"
                                    scope.launch { snackbarHostState.showSnackbar(context.getString(com.prayer.pointfinder.core.i18n.R.string.toast_base_created)) }
                                }
                            },
                            onDelete = null,
                            onWriteNfc = null,
                            onNavigateToCreateChallenge = null,
                            onBack = { setupSubScreen = "bases_list" },
                            initialLat = state.bases.lastOrNull()?.lat ?: TileSources.getDefaultCenter(selectedGame.tileSource).first,
                            initialLng = state.bases.lastOrNull()?.lng ?: TileSources.getDefaultCenter(selectedGame.tileSource).second,
                            tileSource = selectedGame.tileSource,
                        )
                    }
                    setupSubScreen?.startsWith("base_edit:") == true -> {
                        val baseId = setupSubScreen!!.removePrefix("base_edit:")
                        val base = state.bases.firstOrNull { it.id == baseId }
                        if (base != null) {
                            val fromAssignments = state.assignments
                                .filter { it.baseId == base.id }
                                .mapNotNull { assignment ->
                                    state.challenges.firstOrNull { it.id == assignment.challengeId }
                                }
                            val fixedToBase = state.challenges.filter { ch ->
                                base.fixedChallengeId == ch.id
                            }
                            val linkedChallenges = (fromAssignments + fixedToBase).distinctBy { it.id }
                            BaseEditScreen(
                                base = base,
                                bases = state.bases,
                                challenges = state.challenges,
                                linkedChallenges = linkedChallenges,
                                onSave = { request ->
                                    viewModel.updateBase(base.id, request as UpdateBaseRequest) {
                                        setupSubScreen = "bases_list"
                                        scope.launch { snackbarHostState.showSnackbar(context.getString(com.prayer.pointfinder.core.i18n.R.string.toast_base_saved)) }
                                    }
                                },
                                onDelete = {
                                    viewModel.deleteBase(base.id) {
                                        setupSubScreen = "bases_list"
                                    }
                                },
                                onWriteNfc = {
                                    viewModel.selectBase(base)
                                    viewModel.beginWriteNfc()
                                },
                                onNavigateToCreateChallenge = { baseId -> setupSubScreen = "challenge_create_for_base:$baseId" },
                                onBack = { setupSubScreen = "bases_list" },
                                initialLat = null,
                                initialLng = null,
                                tileSource = selectedGame.tileSource,
                            )
                        } else {
                            setupSubScreen = "bases_list"
                        }
                    }
                    setupSubScreen == "challenges_list" -> {
                        ChallengesListScreen(
                            challenges = state.challenges,
                            bases = state.bases,
                            assignments = state.assignments,
                            gameTags = state.gameTags,
                            onSelectChallenge = { challenge -> setupSubScreen = "challenge_edit:${challenge.id}" },
                            onCreateChallenge = { setupSubScreen = "challenge_create" },
                            onBack = { setupSubScreen = null },
                        )
                    }
                    setupSubScreen == "challenge_create" || setupSubScreen?.startsWith("challenge_create_for_base:") == true -> {
                        val preLinkedBaseId = setupSubScreen?.removePrefix("challenge_create_for_base:")
                            ?.takeIf { setupSubScreen?.startsWith("challenge_create_for_base:") == true }
                        ChallengeEditScreen(
                            challenge = null,
                            bases = state.bases,
                            challenges = state.challenges,
                            teams = state.teams,
                            variables = state.variables,
                            onSave = { request ->
                                viewModel.createChallenge(
                                    request as CreateChallengeRequest,
                                    onSuccess = { challenge ->
                                        setupSubScreen = "challenge_edit:${challenge.id}"
                                        scope.launch { snackbarHostState.showSnackbar(context.getString(com.prayer.pointfinder.core.i18n.R.string.toast_challenge_created)) }
                                    },
                                    onError = { msg -> scope.launch { snackbarHostState.showSnackbar(msg) } },
                                )
                            },
                            onDelete = null,
                            onBack = {
                                setupSubScreen = if (preLinkedBaseId != null) {
                                    "base_edit:$preLinkedBaseId"
                                } else {
                                    "challenges_list"
                                }
                            },
                            preLinkedBaseId = preLinkedBaseId,
                            onCreateVariable = viewModel::createVariable,
                        )
                    }
                    setupSubScreen?.startsWith("challenge_edit:") == true -> {
                        val challengeId = setupSubScreen!!.removePrefix("challenge_edit:")
                        val challenge = state.challenges.firstOrNull { it.id == challengeId }
                        if (challenge != null) {
                            var challengeVars by remember(challengeId) { mutableStateOf<List<TeamVariable>>(emptyList()) }
                            LaunchedEffect(challengeId) {
                                challengeVars = viewModel.loadChallengeVariables(challengeId)
                            }
                            ChallengeEditScreen(
                                challenge = challenge,
                                bases = state.bases,
                                challenges = state.challenges,
                                teams = state.teams,
                                variables = state.variables,
                                challengeVariables = challengeVars,
                                onSaveChallengeVariables = { variables ->
                                    val saved = viewModel.saveChallengeVariablesList(challengeId, variables)
                                    challengeVars = saved
                                    saved
                                },
                                assignments = state.assignments,
                                onSave = { request ->
                                    viewModel.updateChallenge(
                                        challenge.id,
                                        request as UpdateChallengeRequest,
                                        onSuccess = {
                                            setupSubScreen = "challenges_list"
                                            scope.launch { snackbarHostState.showSnackbar(context.getString(com.prayer.pointfinder.core.i18n.R.string.toast_challenge_saved)) }
                                        },
                                        onError = { msg -> scope.launch { snackbarHostState.showSnackbar(msg) } },
                                    )
                                },
                                onDelete = {
                                    viewModel.deleteChallenge(
                                        challenge.id,
                                        onSuccess = { setupSubScreen = "challenges_list" },
                                        onError = { msg -> scope.launch { snackbarHostState.showSnackbar(msg) } },
                                    )
                                },
                                onBack = { setupSubScreen = "challenges_list" },
                                onCreateVariable = viewModel::createVariable,
                            )
                        } else {
                            setupSubScreen = "challenges_list"
                        }
                    }
                    setupSubScreen == "teams_list" -> {
                        TeamsListScreen(
                            teams = state.teams,
                            onSelectTeam = { team -> setupSubScreen = "team_detail:${team.id}" },
                            onCreateTeam = { name, color ->
                                viewModel.createTeam(name, color) { /* created */ }
                            },
                            onManageVariables = { setupSubScreen = "team_variables" },
                            onBack = { setupSubScreen = null },
                        )
                    }
                    setupSubScreen == "team_variables" -> {
                        var gameVariables by remember { mutableStateOf<List<TeamVariable>>(emptyList()) }
                        var isLoadingVars by remember { mutableStateOf(true) }
                        LaunchedEffect(Unit) {
                            gameVariables = state.variables
                            isLoadingVars = false
                        }
                        TeamVariablesManagementScreen(
                            teams = state.teams,
                            initialVariables = gameVariables,
                            isLoading = isLoadingVars,
                            onSave = { variables -> viewModel.saveGameVariablesList(variables) },
                            onBack = { setupSubScreen = "teams_list" },
                        )
                    }
                    setupSubScreen?.startsWith("team_detail:") == true -> {
                        val teamId = setupSubScreen!!.removePrefix("team_detail:")
                        val team = state.teams.firstOrNull { it.id == teamId }
                        if (team != null) {
                            var players by remember(teamId) { mutableStateOf<List<PlayerResponse>>(emptyList()) }
                            var unlockOverrides by remember(teamId) { mutableStateOf<List<BaseUnlockOverrideResponse>>(emptyList()) }
                            LaunchedEffect(teamId) {
                                viewModel.loadTeamPlayers(teamId) { players = it }
                                viewModel.loadUnlockOverrides(teamId) { unlockOverrides = it }
                            }
                            TeamDetailScreen(
                                team = team,
                                players = players,
                                variables = state.variables,
                                bases = state.bases,
                                teamProgress = state.baseProgress.filter { it.teamId == teamId },
                                unlockOverrides = unlockOverrides,
                                onSave = { request ->
                                    viewModel.updateTeam(team.id, request) {
                                        setupSubScreen = "teams_list"
                                        scope.launch { snackbarHostState.showSnackbar(context.getString(com.prayer.pointfinder.core.i18n.R.string.toast_team_saved)) }
                                    }
                                },
                                onDelete = {
                                    viewModel.deleteTeam(team.id) {
                                        setupSubScreen = "teams_list"
                                    }
                                },
                                onRemovePlayer = { playerId ->
                                    viewModel.removePlayer(team.id, playerId) {
                                        viewModel.loadTeamPlayers(teamId) { players = it }
                                    }
                                },
                                onSaveVariableValue = { variableKey, value ->
                                    viewModel.saveTeamVariableValue(variableKey, team.id, value)
                                },
                                onCreateVariable = { variableName ->
                                    viewModel.createVariable(variableName)
                                },
                                onDeleteVariable = { variableKey ->
                                    viewModel.deleteVariable(variableKey)
                                },
                                onMarkCompleted = { baseId, challengeId, reason, pointsOverride ->
                                    viewModel.markCompleted(
                                        teamId = teamId,
                                        baseId = baseId,
                                        request = MarkCompletedRequest(
                                            challengeId = challengeId,
                                            reason = reason,
                                            pointsOverride = pointsOverride,
                                        ),
                                    ) {
                                        scope.launch { snackbarHostState.showSnackbar(context.getString(com.prayer.pointfinder.core.i18n.R.string.label_mark_completed_success)) }
                                    }
                                },
                                onGrantOverride = { baseId, reason ->
                                    viewModel.grantUnlockOverride(teamId, baseId, reason) { newOverride ->
                                        unlockOverrides = unlockOverrides.filter { it.baseId != baseId } + newOverride
                                        scope.launch { snackbarHostState.showSnackbar(context.getString(com.prayer.pointfinder.core.i18n.R.string.label_unlock_override_success)) }
                                    }
                                },
                                onManualCheckIn = { baseId ->
                                    viewModel.manualCheckIn(
                                        teamId = teamId,
                                        baseId = baseId,
                                        onSuccess = {
                                            scope.launch { snackbarHostState.showSnackbar(context.getString(com.prayer.pointfinder.core.i18n.R.string.label_manual_check_in_success)) }
                                        },
                                        onError = { /* error shown by ViewModel state */ },
                                    )
                                },
                                onRemoveOverride = { baseId ->
                                    viewModel.removeUnlockOverride(teamId, baseId) {
                                        unlockOverrides = unlockOverrides.filter { it.baseId != baseId }
                                        scope.launch { snackbarHostState.showSnackbar(context.getString(com.prayer.pointfinder.core.i18n.R.string.label_remove_override_success)) }
                                    }
                                },
                                onBack = { setupSubScreen = "teams_list" },
                                // iOS parity: show an in-screen 3s success
                                // snackbar after each rescue mutation (mirrors
                                // `TeamDetailView.showRescueToast`).
                                rescueSuccessTrigger = viewModel.rescueSuccessEvents,
                            )
                        } else {
                            setupSubScreen = "teams_list"
                        }
                    }
                    else -> {
                        SetupHubScreen(
                            game = selectedGame,
                            bases = state.bases,
                            challenges = state.challenges,
                            teams = state.teams,
                            assignments = state.assignments,
                            teamVariablesIncomplete = state.teamVariablesIncomplete,
                            onNavigateToMap = { viewModel.setTab(OperatorTab.LIVE_MAP) },
                            onNavigateToBases = { setupSubScreen = "bases_list" },
                            onNavigateToChallenges = { setupSubScreen = "challenges_list" },
                            onNavigateToTeams = { setupSubScreen = "teams_list" },
                            onGoLive = { viewModel.updateGameStatus("live") },
                        )
                    }
                }
            }

            OperatorTab.LIVE -> {
                LaunchedEffect(Unit) {
                    viewModel.refreshLiveData()
                }
                LiveScreen(
                    leaderboard = state.leaderboard,
                    activity = state.activity,
                    teams = state.teams,
                    isRefreshing = state.isLiveRefreshing,
                    onRefresh = viewModel::refreshLiveData,
                    lastSyncedAt = state.lastSyncedAt,
                )
            }

            OperatorTab.SUBMISSIONS -> {
                OperatorSubmissionsScreen(
                    submissions = state.submissions,
                    teams = state.teams,
                    challenges = state.challenges,
                    bases = state.bases,
                    isLoading = state.isLoading,
                    onRefresh = viewModel::refreshSelectedGameData,
                    onReviewSubmission = viewModel::reviewSubmission,
                    operatorAccessToken = operatorAccessToken,
                    apiBaseUrl = apiBaseUrl,
                    okHttpClient = viewModel.okHttpClient,
                )
            }

            OperatorTab.MORE -> {
                val moreContext = LocalContext.current
                when (moreSubScreen) {
                    "settings" -> {
                        GameSettingsScreen(
                            game = selectedGame,
                            onSave = { request ->
                                viewModel.updateGame(request) {
                                    scope.launch { snackbarHostState.showSnackbar(context.getString(com.prayer.pointfinder.core.i18n.R.string.toast_game_saved)) }
                                }
                            },
                            onUpdateStatus = viewModel::updateGameStatus,
                            onDeleteGame = {
                                viewModel.deleteGame {
                                    onSwitchGame()
                                }
                            },
                            onBack = { moreSubScreen = null },
                        )
                    }
                    "notifications" -> {
                        LaunchedEffect(Unit) { viewModel.loadNotifications() }
                        NotificationsScreen(
                            notifications = state.notifications,
                            teams = state.teams,
                            onSend = { message, teamId ->
                                viewModel.sendNotification(message, teamId) {}
                            },
                            onRefresh = viewModel::loadNotifications,
                            isRefreshing = state.isLoading,
                            onBack = { moreSubScreen = null },
                        )
                    }
                    "operators" -> {
                        LaunchedEffect(Unit) { viewModel.loadOperators() }
                        OperatorsScreen(
                            operators = state.operators,
                            invites = state.invites,
                            onInvite = { email ->
                                viewModel.inviteOperator(email) {
                                    scope.launch {
                                        snackbarHostState.showSnackbar(
                                            context.getString(com.prayer.pointfinder.core.i18n.R.string.toast_invite_sent)
                                        )
                                    }
                                }
                            },
                            onRemove = { userId -> viewModel.removeOperator(userId) },
                            onRevokeInvite = { inviteId -> viewModel.revokeInvite(inviteId) },
                            currentUserId = viewModel.currentOperatorUserId(),
                            onRefresh = viewModel::loadOperators,
                            isRefreshing = state.isLoading,
                            onBack = { moreSubScreen = null },
                        )
                    }
                    "bases_list" -> {
                        BasesListScreen(
                            bases = state.bases,
                            challenges = state.challenges,
                            assignments = state.assignments,
                            gameTags = state.gameTags,
                            onSelectBase = { base -> moreSubScreen = "base_edit:${base.id}" },
                            onCreateBase = { /* not available from More */ },
                            onBack = { moreSubScreen = null },
                        )
                    }
                    "challenges_list" -> {
                        ChallengesListScreen(
                            challenges = state.challenges,
                            bases = state.bases,
                            assignments = state.assignments,
                            gameTags = state.gameTags,
                            onSelectChallenge = { challenge -> moreSubScreen = "challenge_edit:${challenge.id}" },
                            onCreateChallenge = { /* not available from More */ },
                            onBack = { moreSubScreen = null },
                        )
                    }
                    "teams_list" -> {
                        TeamsListScreen(
                            teams = state.teams,
                            onSelectTeam = { team -> moreSubScreen = "team_detail:${team.id}" },
                            onCreateTeam = { name, color -> viewModel.createTeam(name, color) {} },
                            onBack = { moreSubScreen = null },
                        )
                    }
                    "tags" -> {
                        ManageTagsScreen(
                            gameId = selectedGame.id,
                            onBack = { moreSubScreen = null },
                            loadTags = { viewModel.listTags(selectedGame.id) },
                            createTag = { req -> viewModel.createTag(selectedGame.id, req) },
                            updateTag = { tagId, req -> viewModel.updateTag(selectedGame.id, tagId, req) },
                            deleteTag = { tagId -> viewModel.deleteTag(selectedGame.id, tagId) },
                        )
                    }
                    "assignments" -> {
                        AssignmentsScreen(
                            assignments = state.assignments,
                            bases = state.bases,
                            challenges = state.challenges,
                            teams = state.teams,
                            onCreateAssignment = { request ->
                                viewModel.createAssignment(request, onSuccess = {}, onError = {})
                            },
                            onDeleteAssignment = { assignmentId ->
                                viewModel.deleteAssignment(assignmentId, onSuccess = {})
                            },
                            onBack = { moreSubScreen = null },
                        )
                    }
                    "activity" -> {
                        ActivityLogScreen(
                            events = state.activity,
                            teams = state.teams,
                            isLoading = state.isLoading,
                            isLoadingMore = false,
                            hasMore = false,
                            errorMessage = null,
                            onBack = { moreSubScreen = null },
                            onRefresh = viewModel::refreshLiveData,
                            onLoadMore = {},
                        )
                    }
                    else -> if (moreSubScreen?.startsWith("base_edit:") == true) {
                        val baseId = moreSubScreen!!.removePrefix("base_edit:")
                        val base = state.bases.firstOrNull { it.id == baseId }
                        if (base != null) {
                            val fromAssignments = state.assignments
                                .filter { it.baseId == base.id }
                                .mapNotNull { assignment ->
                                    state.challenges.firstOrNull { it.id == assignment.challengeId }
                                }
                            val fixedToBase = state.challenges.filter { ch ->
                                base.fixedChallengeId == ch.id
                            }
                            val linkedChallenges = (fromAssignments + fixedToBase).distinctBy { it.id }
                            BaseEditScreen(
                                base = base,
                                bases = state.bases,
                                challenges = state.challenges,
                                linkedChallenges = linkedChallenges,
                                onSave = { request ->
                                    viewModel.updateBase(base.id, request as UpdateBaseRequest) {
                                        moreSubScreen = "bases_list"
                                        scope.launch { snackbarHostState.showSnackbar(context.getString(com.prayer.pointfinder.core.i18n.R.string.toast_base_saved)) }
                                    }
                                },
                                onDelete = {
                                    viewModel.deleteBase(base.id) {
                                        moreSubScreen = "bases_list"
                                    }
                                },
                                onWriteNfc = {
                                    viewModel.selectBase(base)
                                    viewModel.beginWriteNfc()
                                },
                                onNavigateToCreateChallenge = null,
                                onBack = { moreSubScreen = "bases_list" },
                                initialLat = null,
                                initialLng = null,
                                tileSource = selectedGame.tileSource,
                            )
                        } else {
                            moreSubScreen = "bases_list"
                        }
                    } else if (moreSubScreen?.startsWith("challenge_edit:") == true) {
                        val challengeId = moreSubScreen!!.removePrefix("challenge_edit:")
                        val challenge = state.challenges.firstOrNull { it.id == challengeId }
                        if (challenge != null) {
                            ChallengeEditScreen(
                                challenge = challenge,
                                bases = state.bases,
                                challenges = state.challenges,
                                teams = state.teams,
                                variables = state.variables,
                                onSave = { request ->
                                    viewModel.updateChallenge(
                                        challenge.id,
                                        request as UpdateChallengeRequest,
                                        onSuccess = { moreSubScreen = "challenges_list" },
                                        onError = { msg -> scope.launch { snackbarHostState.showSnackbar(msg) } },
                                    )
                                },
                                onDelete = {
                                    viewModel.deleteChallenge(
                                        challenge.id,
                                        onSuccess = { moreSubScreen = "challenges_list" },
                                        onError = { msg -> scope.launch { snackbarHostState.showSnackbar(msg) } },
                                    )
                                },
                                onBack = { moreSubScreen = "challenges_list" },
                                onCreateVariable = viewModel::createVariable,
                            )
                        } else {
                            moreSubScreen = "challenges_list"
                        }
                    } else if (moreSubScreen?.startsWith("team_detail:") == true) {
                        val teamId = moreSubScreen!!.removePrefix("team_detail:")
                        val team = state.teams.firstOrNull { it.id == teamId }
                        if (team != null) {
                            var players by remember(teamId) { mutableStateOf<List<PlayerResponse>>(emptyList()) }
                            var unlockOverrides by remember(teamId) { mutableStateOf<List<BaseUnlockOverrideResponse>>(emptyList()) }
                            LaunchedEffect(teamId) {
                                viewModel.loadTeamPlayers(teamId) { players = it }
                                viewModel.loadUnlockOverrides(teamId) { unlockOverrides = it }
                            }
                            TeamDetailScreen(
                                team = team,
                                players = players,
                                variables = state.variables,
                                bases = state.bases,
                                teamProgress = state.baseProgress.filter { it.teamId == teamId },
                                unlockOverrides = unlockOverrides,
                                onSave = { request ->
                                    viewModel.updateTeam(team.id, request) {
                                        moreSubScreen = "teams_list"
                                        scope.launch { snackbarHostState.showSnackbar(context.getString(com.prayer.pointfinder.core.i18n.R.string.toast_team_saved)) }
                                    }
                                },
                                onDelete = {
                                    viewModel.deleteTeam(team.id) {
                                        moreSubScreen = "teams_list"
                                    }
                                },
                                onRemovePlayer = { playerId ->
                                    viewModel.removePlayer(team.id, playerId) {
                                        viewModel.loadTeamPlayers(teamId) { players = it }
                                    }
                                },
                                onSaveVariableValue = { variableKey, value ->
                                    viewModel.saveTeamVariableValue(variableKey, team.id, value)
                                },
                                onCreateVariable = { name -> viewModel.createVariable(name) },
                                onDeleteVariable = { key -> viewModel.deleteVariable(key) },
                                onMarkCompleted = { baseId, challengeId, reason, pointsOverride ->
                                    viewModel.markCompleted(
                                        teamId = teamId,
                                        baseId = baseId,
                                        request = MarkCompletedRequest(
                                            challengeId = challengeId,
                                            reason = reason,
                                            pointsOverride = pointsOverride,
                                        ),
                                    ) {
                                        scope.launch { snackbarHostState.showSnackbar(context.getString(com.prayer.pointfinder.core.i18n.R.string.label_mark_completed_success)) }
                                    }
                                },
                                onGrantOverride = { baseId, reason ->
                                    viewModel.grantUnlockOverride(teamId, baseId, reason) { newOverride ->
                                        unlockOverrides = unlockOverrides.filter { it.baseId != baseId } + newOverride
                                        scope.launch { snackbarHostState.showSnackbar(context.getString(com.prayer.pointfinder.core.i18n.R.string.label_unlock_override_success)) }
                                    }
                                },
                                onManualCheckIn = { baseId ->
                                    viewModel.manualCheckIn(
                                        teamId = teamId,
                                        baseId = baseId,
                                        onSuccess = {
                                            scope.launch { snackbarHostState.showSnackbar(context.getString(com.prayer.pointfinder.core.i18n.R.string.label_manual_check_in_success)) }
                                        },
                                        onError = { /* error shown by ViewModel state */ },
                                    )
                                },
                                onRemoveOverride = { baseId ->
                                    viewModel.removeUnlockOverride(teamId, baseId) {
                                        unlockOverrides = unlockOverrides.filter { it.baseId != baseId }
                                        scope.launch { snackbarHostState.showSnackbar(context.getString(com.prayer.pointfinder.core.i18n.R.string.label_remove_override_success)) }
                                    }
                                },
                                onBack = { moreSubScreen = "teams_list" },
                                // iOS parity: in-screen 3s success snackbar
                                // after each rescue mutation.
                                rescueSuccessTrigger = viewModel.rescueSuccessEvents,
                            )
                        } else {
                            moreSubScreen = "teams_list"
                        }
                    } else if (moreSubScreen?.startsWith("org:") == true) {
                        val orgId = moreSubScreen!!.removePrefix("org:")
                        val org = state.workspaces?.organizations?.firstOrNull { it.id == orgId }
                        if (org != null) {
                            OrganizationScreen(
                                org = org,
                                onBack = { moreSubScreen = null },
                                loadMembers = { viewModel.getOrgMembers(orgId) },
                                inviteMember = { email -> viewModel.inviteOrgMember(orgId, email) },
                                removeMember = { userId -> viewModel.removeOrgMember(orgId, userId) },
                                updatePermissions = { userId, perms ->
                                    viewModel.updateMemberPermissions(orgId, userId, perms)
                                },
                            )
                        } else {
                            moreSubScreen = null
                        }
                    } else {
                        MoreScreen(
                            currentLanguage = currentLanguage,
                            currentThemeMode = currentThemeMode.name,
                            notificationSettings = state.notificationSettings,
                            isLoadingNotificationSettings = state.isLoadingNotificationSettings,
                            isSavingNotificationSettings = state.isSavingNotificationSettings,
                            onLanguageChanged = sessionViewModel::updateLanguage,
                            onThemeModeChanged = { sessionViewModel.updateThemeMode(ThemeMode.valueOf(it)) },
                            onNotificationSettingsChanged = viewModel::updateNotificationSettings,
                            onNavigateToSettings = { moreSubScreen = "settings" },
                            onNavigateToNotifications = { moreSubScreen = "notifications" },
                            onNavigateToBases = { moreSubScreen = "bases_list" },
                            onNavigateToChallenges = { moreSubScreen = "challenges_list" },
                            onNavigateToTeams = { moreSubScreen = "teams_list" },
                            onNavigateToOperators = { moreSubScreen = "operators" },
                            onNavigateToTags = { moreSubScreen = "tags" },
                            onNavigateToAssignments = { moreSubScreen = "assignments" },
                            onNavigateToActivity = { moreSubScreen = "activity" },
                            onNavigateToOrganization = state.selectedOrgId?.let { orgId ->
                                { moreSubScreen = "org:$orgId" }
                            },
                            onExportGame = {
                                viewModel.exportGame { exportDto ->
                                    val jsonString = Json { prettyPrint = true }.encodeToString(
                                        com.prayer.pointfinder.core.model.GameExportDto.serializer(),
                                        exportDto,
                                    )
                                    val shareIntent = Intent(Intent.ACTION_SEND).apply {
                                        type = "application/json"
                                        putExtra(Intent.EXTRA_TEXT, jsonString)
                                        putExtra(Intent.EXTRA_SUBJECT, "${selectedGame.name}_export.json")
                                    }
                                    moreContext.startActivity(Intent.createChooser(shareIntent, null))
                                }
                            },
                            onSwitchGame = {
                                viewModel.clearSelectedGame()
                                onSwitchGame()
                            },
                            onLogout = sessionViewModel::logout,
                        )
                    }
                }
            }
        }
        SnackbarHost(
            hostState = snackbarHostState,
            modifier = Modifier.align(Alignment.BottomCenter),
        )
        } // end Box
    }

    if (state.awaitingNfcWrite && state.selectedBase != null) {
        NfcScanDialog(
            onDismiss = viewModel::cancelWriteNfc,
            title = stringResource(com.prayer.pointfinder.core.i18n.R.string.action_write_nfc),
            message = stringResource(com.prayer.pointfinder.core.i18n.R.string.nfc_write_dialog_message),
        )
    }
}
