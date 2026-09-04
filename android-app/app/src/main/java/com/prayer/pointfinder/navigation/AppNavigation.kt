package com.prayer.pointfinder.navigation

import android.net.Uri
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTagsAsResourceId
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.prayer.pointfinder.BuildConfig
import com.prayer.pointfinder.core.model.AuthType
import com.prayer.pointfinder.feature.auth.OperatorLoginScreen
import com.prayer.pointfinder.feature.auth.PlayerJoinScreen
import com.prayer.pointfinder.feature.auth.PlayerNameScreen
import com.prayer.pointfinder.feature.auth.WelcomeScreen
import com.prayer.pointfinder.feature.operator.CreateGameScreen
import com.prayer.pointfinder.feature.operator.OperatorHomeScreen
import com.prayer.pointfinder.feature.operator.MyInvitesScreen
import com.prayer.pointfinder.session.AppSessionViewModel
import com.prayer.pointfinder.session.OperatorViewModel
import com.google.mlkit.common.MlKitException
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning
import java.util.Locale
import kotlinx.coroutines.delay

@Composable
fun AppNavigation(
    navController: NavHostController = rememberNavController(),
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val sessionViewModel: AppSessionViewModel = hiltViewModel()
    val operatorViewModel: OperatorViewModel = hiltViewModel()
    val sessionState by sessionViewModel.state.collectAsStateWithLifecycle()

    var joinCode by rememberSaveable { mutableStateOf("") }
    var displayName by rememberSaveable { mutableStateOf("") }
    var cameraDenied by rememberSaveable { mutableStateOf(false) }
    var operatorEmail by rememberSaveable { mutableStateOf("") }
    var operatorPassword by rememberSaveable { mutableStateOf("") }

    LaunchedEffect(sessionState.authType) {
        val currentRoute = navController.currentBackStackEntry?.destination?.route
        when (sessionState.authType) {
            is AuthType.Player -> {
                if (currentRoute != Routes.PLAYER_HOME) {
                    navController.navigate(Routes.PLAYER_HOME) { popUpTo(0) { inclusive = true } }
                }
            }

            is AuthType.Operator -> {
                if (currentRoute !in setOf(
                        Routes.OPERATOR_HOME,
                        Routes.OPERATOR_GAME,
                        Routes.OPERATOR_CREATE_GAME,
                    )
                ) {
                    navController.navigate(Routes.OPERATOR_HOME) { popUpTo(0) { inclusive = true } }
                }
            }

            AuthType.None -> {
                if (currentRoute !in setOf(
                        Routes.WELCOME,
                        Routes.OPERATOR_LOGIN,
                        Routes.PLAYER_JOIN,
                        Routes.PLAYER_NAME,
                    )
                ) {
                    navController.navigate(Routes.WELCOME) { popUpTo(0) { inclusive = true } }
                }
            }
        }
    }

    NavHost(
        navController = navController,
        startDestination = Routes.WELCOME,
        modifier = modifier.semantics { testTagsAsResourceId = true },
    ) {
        composable(Routes.WELCOME) {
            WelcomeScreen(
                onJoinGame = {
                    sessionViewModel.clearError()
                    navController.navigate(Routes.PLAYER_JOIN)
                },
                onOperatorLogin = {
                    sessionViewModel.clearError()
                    navController.navigate(Routes.OPERATOR_LOGIN)
                },
            )
        }

        composable(Routes.PLAYER_JOIN) {
            PlayerJoinScreen(
                joinCode = joinCode,
                canContinue = isJoinCodeValid(joinCode),
                onJoinCodeChange = {
                    joinCode = extractJoinCodeFromPayload(it) ?: normalizeJoinCodeInput(it)
                    cameraDenied = false
                    sessionViewModel.clearError()
                },
                onContinue = {
                    if (!isJoinCodeValid(joinCode)) return@PlayerJoinScreen
                    sessionViewModel.clearError()
                    navController.navigate(Routes.PLAYER_NAME)
                },
                onScanQr = {
                    val scannerOptions = GmsBarcodeScannerOptions.Builder()
                        .setBarcodeFormats(Barcode.FORMAT_QR_CODE)
                        .enableAutoZoom()
                        .build()
                    val scanner = GmsBarcodeScanning.getClient(context, scannerOptions)
                    scanner.startScan()
                        .addOnSuccessListener { barcode ->
                            val scanned = barcode.rawValue.orEmpty()
                            val parsed = extractJoinCodeFromPayload(scanned) ?: normalizeJoinCodeInput(scanned)
                            joinCode = parsed
                            cameraDenied = false
                            sessionViewModel.clearError()
                            if (isJoinCodeValid(parsed)) {
                                navController.navigate(Routes.PLAYER_NAME)
                            }
                        }
                        .addOnCanceledListener {
                            // User cancelled scanning; no-op.
                        }
                        .addOnFailureListener { err ->
                            cameraDenied = err is MlKitException &&
                                err.errorCode == MlKitException.CODE_SCANNER_CAMERA_PERMISSION_NOT_GRANTED
                        }
                },
                cameraDenied = cameraDenied,
            )
        }

        composable(Routes.PLAYER_NAME) {
            PlayerNameScreen(
                name = displayName,
                onNameChange = {
                    displayName = it
                    sessionViewModel.clearError()
                },
                onJoin = { sessionViewModel.joinPlayer(joinCode, displayName) },
                isLoading = sessionState.isLoading,
                errorMessage = sessionState.errorMessage,
            )
        }

        composable(Routes.OPERATOR_LOGIN) {
            OperatorLoginScreen(
                email = operatorEmail,
                password = operatorPassword,
                onEmailChange = {
                    operatorEmail = it
                    sessionViewModel.clearError()
                },
                onPasswordChange = {
                    operatorPassword = it
                    sessionViewModel.clearError()
                },
                onSignIn = { sessionViewModel.loginOperator(operatorEmail, operatorPassword) },
                isLoading = sessionState.isLoading,
                errorMessage = sessionState.errorMessage,
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
                failedActionsCount = sessionState.failedActionsCount, // Audit 11.2
                currentLanguage = sessionState.currentLanguage,
                currentThemeMode = sessionState.themeMode,
                isDeletingAccount = sessionState.isDeletingAccount,
                sessionErrorMessage = sessionState.errorMessage,
                showPermissionDisclosure = sessionState.showPermissionDisclosure,
            )
        }

        composable(Routes.OPERATOR_HOME) {
            OperatorHomeRoot(
                viewModel = operatorViewModel,
                sessionViewModel = sessionViewModel,
                onOpenGame = { navController.navigate(Routes.OPERATOR_GAME) },
                onCreateGame = { navController.navigate(Routes.OPERATOR_CREATE_GAME) },
            )
        }

        composable(Routes.OPERATOR_CREATE_GAME) {
            val state by operatorViewModel.state.collectAsStateWithLifecycle()
            CreateGameScreen(
                onBack = { navController.popBackStack() },
                onGameCreated = { game ->
                    navController.popBackStack()
                    operatorViewModel.selectGame(game)
                    navController.navigate(Routes.OPERATOR_GAME)
                },
                createGame = operatorViewModel::createGame,
                importGame = operatorViewModel::importGame,
                isLoading = state.isLoading,
                errorMessage = state.errorMessage,
                onClearError = operatorViewModel::clearError,
            )
        }

        composable(Routes.OPERATOR_GAME) {
            val operatorAuth = sessionState.authType as? AuthType.Operator
            OperatorGameRoot(
                viewModel = operatorViewModel,
                sessionViewModel = sessionViewModel,
                currentLanguage = sessionState.currentLanguage,
                currentThemeMode = sessionState.themeMode,
                operatorAccessToken = operatorAuth?.accessToken,
                apiBaseUrl = BuildConfig.API_BASE_URL,
                onSwitchGame = { navController.popBackStack() },
            )
        }
    }
}

private val JOIN_CODE_REGEX = Regex("^[A-Z0-9]{6,20}$")

private fun normalizeJoinCodeInput(value: String): String {
    return value
        .trim()
        .uppercase(Locale.ROOT)
        .filter { it.isLetterOrDigit() }
        .take(20)
}

private fun isJoinCodeValid(value: String): Boolean {
    return JOIN_CODE_REGEX.matches(normalizeJoinCodeInput(value))
}

private fun extractJoinCodeFromPayload(payload: String): String? {
    val raw = payload.trim()
    if (raw.isBlank()) return null

    val direct = normalizeJoinCodeInput(raw)
    if (JOIN_CODE_REGEX.matches(direct)) {
        return direct
    }

    val uri = runCatching { Uri.parse(raw) }.getOrNull() ?: return null
    val candidates = listOfNotNull(
        uri.getQueryParameter("joinCode"),
        uri.getQueryParameter("join_code"),
        uri.getQueryParameter("code"),
        uri.getQueryParameter("join"),
        uri.lastPathSegment,
        uri.pathSegments.lastOrNull(),
    )

    return candidates
        .asSequence()
        .map(::normalizeJoinCodeInput)
        .firstOrNull(JOIN_CODE_REGEX::matches)
}

@Composable
private fun OperatorHomeRoot(
    viewModel: OperatorViewModel,
    sessionViewModel: AppSessionViewModel,
    onOpenGame: () -> Unit,
    onCreateGame: () -> Unit,
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var showMyInvites by remember { mutableStateOf(false) }
    val pendingDashboardDeepLink by sessionViewModel.pendingDashboardDeepLink.collectAsStateWithLifecycle()

    LaunchedEffect(state.authExpired) {
        if (state.authExpired) {
            viewModel.clearAuthExpired()
            sessionViewModel.logout()
        }
    }
    LaunchedEffect(Unit) {
        viewModel.loadGames()
        viewModel.loadMyInvites()
        viewModel.loadWorkspaces()
    }
    LaunchedEffect(Unit) {
        while (true) {
            delay(30_000)
            viewModel.loadMyInvites()
        }
    }
    // Email invite universal link: the user tapped
    // https://pointfinder.{pt,ch}/dashboard. Surface the My Invites screen
    // and refresh the list so pending invitations are visible without
    // bouncing to the browser. Flag is consumed after use so re-entering
    // the home screen later doesn't force the invites sheet again.
    LaunchedEffect(pendingDashboardDeepLink) {
        if (pendingDashboardDeepLink) {
            viewModel.loadMyInvites()
            showMyInvites = true
            sessionViewModel.consumeDashboardDeepLink()
        }
    }

    if (showMyInvites) {
        MyInvitesScreen(
            invites = state.myInvites,
            onAccept = { inviteId ->
                viewModel.acceptInvite(inviteId)
            },
            onBack = { showMyInvites = false },
        )
    } else {
        OperatorHomeScreen(
            games = state.games,
            onSelectGame = {
                viewModel.selectGame(it)
                onOpenGame()
            },
            onCreateGame = onCreateGame,
            onLogout = sessionViewModel::logout,
            onRefresh = viewModel::loadGames,
            isLoading = state.isLoading,
            errorMessage = state.errorMessage,
            pendingInviteCount = state.myInvites.count { it.status.lowercase() == "pending" },
            onOpenMyInvites = { showMyInvites = true },
            orgs = state.workspaces?.organizations ?: emptyList(),
            selectedOrgId = state.selectedOrgId,
            onSelectOrg = { orgId -> viewModel.selectOrg(orgId) },
        )
    }
}

