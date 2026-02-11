package com.dbv.companion.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.dbv.companion.core.model.AuthType
import com.dbv.companion.feature.auth.OperatorLoginScreen
import com.dbv.companion.feature.auth.PlayerJoinScreen
import com.dbv.companion.feature.auth.PlayerNameScreen
import com.dbv.companion.feature.auth.WelcomeScreen
import com.dbv.companion.feature.operator.OperatorBasesScreen
import com.dbv.companion.feature.operator.OperatorBaseDetailScreen
import com.dbv.companion.feature.operator.OperatorGameScaffold
import com.dbv.companion.feature.operator.OperatorHomeScreen
import com.dbv.companion.feature.operator.LiveBaseProgressBottomSheet
import com.dbv.companion.feature.operator.OperatorMapScreen
import com.dbv.companion.feature.operator.OperatorSettingsScreen
import com.dbv.companion.feature.operator.OperatorTab
import com.dbv.companion.feature.player.BaseCheckInDetailScreen
import com.dbv.companion.feature.player.BaseDetailBottomSheet
import com.dbv.companion.feature.player.CheckInScreen
import com.dbv.companion.feature.player.PlayerHomeScaffold
import com.dbv.companion.feature.player.PlayerMapScreen
import com.dbv.companion.feature.player.PlayerSettingsScreen
import com.dbv.companion.feature.player.PlayerTab
import com.dbv.companion.feature.player.SolveScreen
import com.dbv.companion.feature.player.SubmissionResultScreen
import com.dbv.companion.session.AppSessionViewModel
import com.dbv.companion.session.OperatorViewModel
import com.dbv.companion.session.PlayerViewModel
import com.google.maps.android.compose.CameraPositionState
import com.google.maps.android.compose.rememberCameraPositionState

@Composable
fun AppNavigation(
    navController: NavHostController = rememberNavController(),
    modifier: Modifier = Modifier,
) {
    val sessionViewModel: AppSessionViewModel = hiltViewModel()
    val operatorViewModel: OperatorViewModel = hiltViewModel()
    val sessionState by sessionViewModel.state.collectAsStateWithLifecycle()

    var joinCode by rememberSaveable { mutableStateOf("") }
    var displayName by rememberSaveable { mutableStateOf("") }
    var operatorEmail by rememberSaveable { mutableStateOf("") }
    var operatorPassword by rememberSaveable { mutableStateOf("") }

    LaunchedEffect(sessionState.authType) {
        when (sessionState.authType) {
            is AuthType.Player -> navController.navigate(Routes.PLAYER_HOME) {
                popUpTo(0) { inclusive = true }
            }

            is AuthType.Operator -> navController.navigate(Routes.OPERATOR_HOME) {
                popUpTo(0) { inclusive = true }
            }

            AuthType.None -> navController.navigate(Routes.WELCOME) {
                popUpTo(0) { inclusive = true }
            }
        }
    }

    NavHost(
        navController = navController,
        startDestination = Routes.WELCOME,
        modifier = modifier,
    ) {
        composable(Routes.WELCOME) {
            WelcomeScreen(
                onJoinGame = { navController.navigate(Routes.PLAYER_JOIN) },
                onOperatorLogin = { navController.navigate(Routes.OPERATOR_LOGIN) },
            )
        }

        composable(Routes.PLAYER_JOIN) {
            PlayerJoinScreen(
                joinCode = joinCode,
                onJoinCodeChange = { joinCode = it },
                onContinue = { navController.navigate(Routes.PLAYER_NAME) },
                onScanQr = {},
                cameraDenied = false,
            )
        }

        composable(Routes.PLAYER_NAME) {
            PlayerNameScreen(
                name = displayName,
                onNameChange = { displayName = it },
                onJoin = { sessionViewModel.joinPlayer(joinCode, displayName) },
                isLoading = sessionState.isLoading,
            )
        }

        composable(Routes.OPERATOR_LOGIN) {
            OperatorLoginScreen(
                email = operatorEmail,
                password = operatorPassword,
                onEmailChange = { operatorEmail = it },
                onPasswordChange = { operatorPassword = it },
                onSignIn = { sessionViewModel.loginOperator(operatorEmail, operatorPassword) },
                isLoading = sessionState.isLoading,
            )
        }

        composable(Routes.PLAYER_HOME) {
            val auth = sessionState.authType as? AuthType.Player
            if (auth == null) return@composable
            PlayerRootScreen(
                auth = auth,
                sessionViewModel = sessionViewModel,
                isOnline = sessionState.isOnline,
                pendingActionsCount = sessionState.pendingActionsCount,
                currentLanguage = sessionState.currentLanguage,
            )
        }

        composable(Routes.OPERATOR_HOME) {
            OperatorHomeRoot(
                viewModel = operatorViewModel,
                sessionViewModel = sessionViewModel,
                onOpenGame = { navController.navigate(Routes.OPERATOR_GAME) },
            )
        }

        composable(Routes.OPERATOR_GAME) {
            OperatorGameRoot(
                viewModel = operatorViewModel,
                sessionViewModel = sessionViewModel,
                currentLanguage = sessionState.currentLanguage,
                onSwitchGame = { navController.popBackStack() },
            )
        }
    }
}

@Composable
private fun PlayerRootScreen(
    auth: AuthType.Player,
    sessionViewModel: AppSessionViewModel,
    isOnline: Boolean,
    pendingActionsCount: Int,
    currentLanguage: String,
) {
    val viewModel: PlayerViewModel = hiltViewModel()
    val state by viewModel.state.collectAsStateWithLifecycle()
    val playerCameraState = rememberCameraPositionState()

    var selectedTab by rememberSaveable { mutableStateOf(PlayerTab.MAP) }
    var solving by remember { mutableStateOf<Pair<String, String>?>(null) }
    var photoBytes by remember { mutableStateOf<ByteArray?>(null) }

    LaunchedEffect(auth.gameId, isOnline) {
        viewModel.refresh(auth, isOnline)
    }

    PlayerHomeScaffold(
        selectedTab = selectedTab,
        onTabSelected = { selectedTab = it },
        isOffline = !isOnline,
    ) {
        when {
            state.latestSubmission != null -> {
                val submission = state.latestSubmission!!
                SubmissionResultScreen(
                    submission = submission,
                    onBack = { viewModel.clearSubmissionResult() },
                )
            }

            solving != null -> {
                val (baseId, challengeId) = solving ?: return@PlayerHomeScaffold
                SolveScreen(
                    answer = state.answerText,
                    onAnswerChange = viewModel::setAnswerText,
                    isPhotoMode = state.isPhotoMode,
                    presenceRequired = state.presenceRequired,
                    presenceVerified = state.presenceVerified,
                    onVerifyPresence = { viewModel.beginPresenceVerification(baseId) },
                    onPickPhoto = { photoBytes = ByteArray(1) },
                    onCapturePhoto = { photoBytes = ByteArray(1) },
                    onSubmit = {
                        if (state.isPhotoMode) {
                            viewModel.submitPhoto(
                                auth = auth,
                                baseId = baseId,
                                challengeId = challengeId,
                                imageBytes = photoBytes,
                                notes = state.answerText,
                                online = isOnline,
                            )
                        } else {
                            viewModel.submitText(
                                auth = auth,
                                baseId = baseId,
                                challengeId = challengeId,
                                online = isOnline,
                            )
                        }
                    },
                    isOnline = isOnline,
                    errorMessage = state.solveError,
                )
            }

            state.activeCheckIn != null -> {
                val checkIn = state.activeCheckIn!!
                BaseCheckInDetailScreen(
                    response = checkIn,
                    isOffline = !isOnline,
                    onSolve = { baseId, challengeId ->
                        solving = baseId to challengeId
                        viewModel.setPresenceRequired(
                            state.progress.firstOrNull { it.baseId == baseId }?.requirePresenceToSubmit == true,
                        )
                    },
                )
            }

            selectedTab == PlayerTab.MAP -> {
                PlayerMapScreen(
                    progress = state.progress,
                    isLoading = state.isLoading,
                    cameraPositionState = playerCameraState,
                    onBaseSelected = { viewModel.selectBase(auth, it) },
                    onRefresh = { viewModel.refresh(auth, isOnline) },
                )
            }

            selectedTab == PlayerTab.CHECK_IN -> {
                CheckInScreen(
                    pendingActionsCount = pendingActionsCount,
                    scanError = state.scanError,
                    onScan = {
                        viewModel.checkInFromLatestScan(auth, isOnline)
                    },
                )
            }

            else -> {
                PlayerSettingsScreen(
                    gameName = auth.gameName,
                    gameStatus = auth.gameStatus,
                    teamName = auth.teamName,
                    teamColor = auth.teamColor,
                    displayName = auth.displayName,
                    deviceId = auth.playerId,
                    pendingActionsCount = pendingActionsCount,
                    progress = state.progress,
                    currentLanguage = currentLanguage,
                    onLanguageChanged = sessionViewModel::updateLanguage,
                    onLogout = sessionViewModel::logout,
                )
            }
        }
    }

    val selectedBase = state.selectedBase
    if (selectedBase != null) {
        BaseDetailBottomSheet(
            baseProgress = selectedBase,
            challenge = state.selectedChallenge,
            onCheckIn = {
                viewModel.startCheckIn(auth, selectedBase.baseId, isOnline)
                viewModel.clearSelectedBase()
            },
            onSolve = {
                val challengeId = state.selectedChallenge?.id ?: selectedBase.challengeId
                if (challengeId != null) {
                    solving = selectedBase.baseId to challengeId
                    viewModel.setPresenceRequired(selectedBase.requirePresenceToSubmit)
                }
                viewModel.clearSelectedBase()
            },
            onDismiss = { viewModel.clearSelectedBase() },
        )
    }
}

@Composable
private fun OperatorHomeRoot(
    viewModel: OperatorViewModel,
    sessionViewModel: AppSessionViewModel,
    onOpenGame: () -> Unit,
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    LaunchedEffect(Unit) { viewModel.loadGames() }

    OperatorHomeScreen(
        games = state.games,
        onSelectGame = {
            viewModel.selectGame(it)
            onOpenGame()
        },
        onLogout = sessionViewModel::logout,
        onRefresh = viewModel::loadGames,
    )
}

@Composable
private fun OperatorGameRoot(
    viewModel: OperatorViewModel,
    sessionViewModel: AppSessionViewModel,
    currentLanguage: String,
    onSwitchGame: () -> Unit,
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val operatorCameraState = rememberCameraPositionState()
    val selectedGame = state.selectedGame

    if (selectedGame == null) {
        onSwitchGame()
        return
    }

    OperatorGameScaffold(
        selectedTab = state.selectedTab,
        onTabSelected = viewModel::setTab,
    ) {
        when (state.selectedTab) {
            OperatorTab.LIVE_MAP -> {
                OperatorMapScreen(
                    bases = state.bases,
                    teamLocations = state.locations,
                    cameraPositionState = operatorCameraState,
                    onBaseSelected = viewModel::selectBase,
                    onRefresh = viewModel::refreshSelectedGameData,
                )
                if (state.selectedBase != null) {
                    val base = state.selectedBase!!
                    LiveBaseProgressBottomSheet(
                        base = base,
                        progress = state.baseProgress,
                        teams = state.teams,
                        onDismiss = viewModel::clearSelectedBase,
                    )
                }
            }

            OperatorTab.BASES -> {
                if (state.selectedBase == null) {
                    OperatorBasesScreen(
                        bases = state.bases,
                        onSelectBase = viewModel::selectBase,
                    )
                } else {
                    val base = state.selectedBase!!
                    OperatorBaseDetailScreen(
                        base = base,
                        challenges = state.challenges,
                        assignments = state.assignments,
                        teams = state.teams,
                        writeStatus = state.writeStatus,
                        writeSuccess = state.writeSuccess,
                        onBack = viewModel::clearSelectedBase,
                        onWriteNfc = viewModel::beginWriteNfc,
                    )
                }
            }

            OperatorTab.SETTINGS -> {
                OperatorSettingsScreen(
                    gameName = selectedGame.name,
                    gameStatus = selectedGame.status,
                    currentLanguage = currentLanguage,
                    onLanguageChanged = sessionViewModel::updateLanguage,
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
