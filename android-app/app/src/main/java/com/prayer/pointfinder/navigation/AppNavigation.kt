package com.prayer.pointfinder.navigation

import android.Manifest
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageDecoder
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.background
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import java.io.ByteArrayOutputStream
import java.io.File
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
import com.prayer.pointfinder.feature.operator.OperatorBasesScreen
import com.prayer.pointfinder.feature.operator.OperatorBaseDetailScreen
import com.prayer.pointfinder.feature.operator.OperatorGameScaffold
import com.prayer.pointfinder.feature.operator.OperatorHomeScreen
import com.prayer.pointfinder.feature.operator.LiveBaseProgressBottomSheet
import com.prayer.pointfinder.feature.operator.OperatorMapScreen
import com.prayer.pointfinder.feature.operator.OperatorSettingsScreen
import com.prayer.pointfinder.feature.operator.OperatorSubmissionsScreen
import com.prayer.pointfinder.feature.operator.OperatorTab
import com.prayer.pointfinder.core.platform.NfcEventBus
import com.prayer.pointfinder.core.platform.NfcPayloadCodec
import com.prayer.pointfinder.feature.player.BaseCheckInDetailScreen
import com.prayer.pointfinder.feature.player.BaseDetailBottomSheet
import com.prayer.pointfinder.feature.player.CheckInScreen
import com.prayer.pointfinder.feature.player.NfcScanDialog
import com.prayer.pointfinder.feature.player.PlayerHomeScaffold
import com.prayer.pointfinder.feature.player.PlayerMapScreen
import com.prayer.pointfinder.feature.player.PlayerNotificationListScreen
import com.prayer.pointfinder.feature.player.PlayerSettingsScreen
import com.prayer.pointfinder.feature.player.PlayerTab
import com.prayer.pointfinder.feature.player.SolveScreen
import com.prayer.pointfinder.feature.player.SubmissionResultScreen
import com.prayer.pointfinder.session.AppSessionViewModel
import com.prayer.pointfinder.session.OperatorViewModel
import com.prayer.pointfinder.session.PlayerViewModel
import com.google.maps.android.compose.CameraPositionState
import com.google.maps.android.compose.rememberCameraPositionState
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
                currentLanguage = sessionState.currentLanguage,
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
            )
        }

        composable(Routes.OPERATOR_GAME) {
            val operatorAuth = sessionState.authType as? AuthType.Operator
            OperatorGameRoot(
                viewModel = operatorViewModel,
                sessionViewModel = sessionViewModel,
                currentLanguage = sessionState.currentLanguage,
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
private fun PlayerRootScreen(
    auth: AuthType.Player,
    sessionViewModel: AppSessionViewModel,
    isOnline: Boolean,
    pendingActionsCount: Int,
    currentLanguage: String,
    isDeletingAccount: Boolean,
    sessionErrorMessage: String?,
    showPermissionDisclosure: Boolean = false,
) {
    val viewModel: PlayerViewModel = hiltViewModel()
    val state by viewModel.state.collectAsStateWithLifecycle()
    val playerCameraState = rememberCameraPositionState()
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current

    var selectedTab by rememberSaveable { mutableStateOf(PlayerTab.MAP) }
    var solving by remember { mutableStateOf<Pair<String, String>?>(null) }
    var photoBytes by remember { mutableStateOf<ByteArray?>(null) }
    var photoBitmap by remember { mutableStateOf<Bitmap?>(null) }
    var showNfcScanDialog by remember { mutableStateOf(false) }
    // Callback to invoke when an NFC scan completes (used for both check-in and presence verification).
    var pendingNfcAction by remember { mutableStateOf<((String) -> Unit)?>(null) }

    // Permission launchers (fired after disclosure accepted)
    var pendingPermissionRequest by remember { mutableStateOf(false) }
    val gameStatus = state.gameStatus ?: auth.gameStatus
    val shouldBlockGameplay = gameStatus == "setup" || gameStatus == "ended"

    val backToMapFromSubmission = {
        // Fully clear transient solve/check-in UI state so result screen doesn't reopen.
        viewModel.clearSubmissionResult()
        viewModel.clearCheckIn()
        solving = null
        photoBytes = null
        photoBitmap = null
        showNfcScanDialog = false
        pendingNfcAction = null
        selectedTab = PlayerTab.MAP
        viewModel.refresh(auth, isOnline)
    }

    LaunchedEffect(state.authExpired) {
        if (state.authExpired) {
            viewModel.clearAuthExpired()
            sessionViewModel.logout()
        }
    }

    val locationPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions(),
    ) { _ ->
        // Start location service now that permission has been granted (or denied)
        sessionViewModel.onLocationPermissionResult()
        // After location result, request notifications on Android 13+
        pendingPermissionRequest = true
    }

    val notificationPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { _ ->
        // Done — permissions flow complete
    }

    // Chain: after location permission result, request notification permission
    LaunchedEffect(pendingPermissionRequest) {
        if (pendingPermissionRequest) {
            pendingPermissionRequest = false
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
        }
    }

    // Permission disclosure dialog
    if (showPermissionDisclosure) {
        PermissionDisclosureDialog(
            onContinue = {
                sessionViewModel.onPermissionDisclosureAccepted()
                // Launch location permission request
                locationPermissionLauncher.launch(
                    arrayOf(
                        Manifest.permission.ACCESS_FINE_LOCATION,
                        Manifest.permission.ACCESS_COARSE_LOCATION,
                    ),
                )
            },
        )
    }

    // Camera temp file URI
    val cameraPhotoUri = remember {
        val photoDir = File(context.cacheDir, "photos").apply { mkdirs() }
        val photoFile = File(photoDir, "capture.jpg")
        FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", photoFile)
    }

    // Gallery picker
    val pickPhotoLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.PickVisualMedia(),
    ) { uri ->
        if (uri != null) {
            runCatching {
                val bitmap = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                    // Force software bitmap — hardware bitmaps cannot be compressed
                    ImageDecoder.decodeBitmap(
                        ImageDecoder.createSource(context.contentResolver, uri),
                    ) { decoder, _, _ ->
                        decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
                    }
                } else {
                    @Suppress("DEPRECATION")
                    MediaStore.Images.Media.getBitmap(context.contentResolver, uri)
                }
                val scaled = scaleBitmapDown(bitmap, 1920)
                photoBitmap = scaled
                val out = ByteArrayOutputStream()
                scaled.compress(Bitmap.CompressFormat.JPEG, 70, out)
                photoBytes = out.toByteArray()
            }
        }
    }

    // Camera capture
    val cameraLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.TakePicture(),
    ) { success ->
        if (success) {
            runCatching {
                val inputStream = context.contentResolver.openInputStream(cameraPhotoUri)
                val bitmap = BitmapFactory.decodeStream(inputStream)
                inputStream?.close()
                if (bitmap != null) {
                    val scaled = scaleBitmapDown(bitmap, 1920)
                    photoBitmap = scaled
                    val out = ByteArrayOutputStream()
                    scaled.compress(Bitmap.CompressFormat.JPEG, 70, out)
                    photoBytes = out.toByteArray()
                }
            }
        }
    }

    // Camera permission launcher — needed because CAMERA is declared in manifest.
    // On Android 11+, ACTION_IMAGE_CAPTURE requires the permission to be granted
    // if it is declared in the manifest.
    val cameraPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted ->
        if (granted) {
            cameraLauncher.launch(cameraPhotoUri)
        }
    }

    LaunchedEffect(auth.gameId, isOnline) {
        viewModel.refresh(auth, isOnline)
        if (isOnline) viewModel.loadUnseenCount()
    }

    LaunchedEffect(auth.gameId, isOnline, state.realtimeConnected) {
        if (!isOnline) return@LaunchedEffect
        while ((state.gameStatus ?: auth.gameStatus) != "live") {
            // Keep polling as fallback, but back off when realtime socket is healthy.
            delay(if (state.realtimeConnected) 30_000L else 10_000L)
            viewModel.refresh(auth, true)
        }
    }

    DisposableEffect(lifecycleOwner, auth.gameId, isOnline) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME && isOnline) {
                viewModel.refresh(auth, true)
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
        }
    }

    PlayerHomeScaffold(
        selectedTab = selectedTab,
        onTabSelected = { tab ->
            // Clear sub-screen state so tabs always navigate
            solving = null
            photoBytes = null
            photoBitmap = null
            viewModel.clearCheckIn()
            viewModel.clearSubmissionResult()
            viewModel.closeNotifications()
            selectedTab = tab
        },
        isOffline = !isOnline,
    ) {
        when {
            state.showingNotifications -> {
                PlayerNotificationListScreen(
                    notifications = state.notifications,
                    lastSeenAt = state.lastNotificationsSeenAt,
                    isLoading = state.isLoadingNotifications,
                    onBack = { viewModel.closeNotifications() },
                )
            }
            state.latestSubmission != null -> {
                val submission = state.latestSubmission!!
                SubmissionResultScreen(
                    submission = submission,
                    onBack = backToMapFromSubmission,
                )
            }

            solving != null -> {
                val (baseId, challengeId) = solving ?: return@PlayerHomeScaffold

                // Closure that performs the actual submission (reused by direct and NFC paths).
                val doSubmit = {
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
                }

                SolveScreen(
                    answer = state.answerText,
                    onAnswerChange = viewModel::setAnswerText,
                    isPhotoMode = state.isPhotoMode,
                    presenceRequired = state.presenceRequired,
                    onPickPhoto = { pickPhotoLauncher.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
                    onCapturePhoto = {
                        if (context.checkSelfPermission(Manifest.permission.CAMERA) == android.content.pm.PackageManager.PERMISSION_GRANTED) {
                            cameraLauncher.launch(cameraPhotoUri)
                        } else {
                            cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
                        }
                    },
                    photoBitmap = photoBitmap,
                    onClearPhoto = { photoBitmap = null; photoBytes = null },
                    onBack = { solving = null },
                    onSubmit = {
                        if (state.presenceRequired) {
                            // Show NFC scan dialog; on scan, verify base match then submit
                            pendingNfcAction = { scannedBaseId ->
                                val normalizedScannedBaseId = NfcPayloadCodec.normalizeBaseId(scannedBaseId)
                                val normalizedExpectedBaseId = NfcPayloadCodec.normalizeBaseId(baseId)
                                if (normalizedScannedBaseId != null && normalizedScannedBaseId == normalizedExpectedBaseId) {
                                    doSubmit()
                                } else {
                                    viewModel.setSolveError(
                                        context.getString(com.prayer.pointfinder.core.i18n.R.string.error_presence_wrong_base),
                                    )
                                }
                            }
                            showNfcScanDialog = true
                        } else {
                            doSubmit()
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
                        val checkInChallenge = state.activeCheckIn?.challenge
                        viewModel.setPhotoMode(checkInChallenge?.answerType == "file")
                    },
                    onBack = {
                        viewModel.clearCheckIn()
                        viewModel.refresh(auth, isOnline)
                    },
                )
            }

            selectedTab == PlayerTab.MAP -> {
                Box(modifier = Modifier.fillMaxSize()) {
                    PlayerMapScreen(
                        progress = state.progress,
                        isLoading = state.isLoading,
                        unseenNotificationCount = state.unseenNotificationCount,
                        cameraPositionState = playerCameraState,
                        onBaseSelected = { viewModel.selectBase(auth, it) },
                        onRefresh = { viewModel.refresh(auth, isOnline) },
                        onNotificationsClick = { viewModel.openNotifications() },
                    )
                    if (shouldBlockGameplay) {
                        GameNotLiveOverlay()
                    }
                }
            }

            selectedTab == PlayerTab.CHECK_IN -> {
                Box(modifier = Modifier.fillMaxSize()) {
                    CheckInScreen(
                        pendingActionsCount = pendingActionsCount,
                        scanError = state.scanError,
                        onScan = {
                            showNfcScanDialog = true
                        },
                    )
                    if (shouldBlockGameplay) {
                        GameNotLiveOverlay()
                    }
                }
            }

            else -> {
                PlayerSettingsScreen(
                    gameName = auth.gameName,
                    gameStatus = gameStatus,
                    teamName = auth.teamName,
                    teamColor = auth.teamColor,
                    displayName = auth.displayName,
                    deviceId = auth.playerId,
                    pendingActionsCount = pendingActionsCount,
                    progress = state.progress,
                    currentLanguage = currentLanguage,
                    onLanguageChanged = sessionViewModel::updateLanguage,
                    isDeletingAccount = isDeletingAccount,
                    onDeleteAccount = sessionViewModel::deletePlayerAccount,
                    onLogout = sessionViewModel::logout,
                    errorMessage = sessionErrorMessage,
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
                if (shouldBlockGameplay) return@BaseDetailBottomSheet
                viewModel.startCheckIn(auth, selectedBase.baseId, isOnline)
                viewModel.clearSelectedBase()
            },
            onSolve = {
                if (shouldBlockGameplay) return@BaseDetailBottomSheet
                val challengeId = state.selectedChallenge?.id ?: selectedBase.challengeId
                if (challengeId != null) {
                    solving = selectedBase.baseId to challengeId
                    viewModel.setPresenceRequired(selectedBase.requirePresenceToSubmit)
                    viewModel.setPhotoMode(state.selectedChallenge?.answerType == "file")
                }
                viewModel.clearSelectedBase()
            },
            onDismiss = { viewModel.clearSelectedBase() },
        )
    }

    // NFC scan dialog: used for both check-in and presence-verified submission.
    // Listens for NFC tag scans and invokes the appropriate action.
    if (showNfcScanDialog) {
        val currentNfcAction = pendingNfcAction
        LaunchedEffect(Unit) {
            viewModel.scannedBaseIds.collect { baseId ->
                if (baseId != null) {
                    showNfcScanDialog = false
                    if (currentNfcAction != null) {
                        currentNfcAction(baseId)
                        pendingNfcAction = null
                    } else {
                        // Default: check-in flow
                        viewModel.startCheckIn(auth, baseId, isOnline)
                    }
                }
            }
        }
        NfcScanDialog(
            onDismiss = {
                showNfcScanDialog = false
                pendingNfcAction = null
            },
        )
    }
}

@Composable
private fun GameNotLiveOverlay() {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.surface.copy(alpha = 0.85f)),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            modifier = Modifier
                .padding(24.dp)
                .background(
                    color = MaterialTheme.colorScheme.background,
                    shape = MaterialTheme.shapes.medium,
                )
                .padding(horizontal = 20.dp, vertical = 16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(
                text = stringResource(com.prayer.pointfinder.core.i18n.R.string.label_game_not_active_title),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                text = stringResource(com.prayer.pointfinder.core.i18n.R.string.label_game_not_active_message),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
            )
        }
    }
}

@Composable
private fun OperatorHomeRoot(
    viewModel: OperatorViewModel,
    sessionViewModel: AppSessionViewModel,
    onOpenGame: () -> Unit,
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    LaunchedEffect(state.authExpired) {
        if (state.authExpired) {
            viewModel.clearAuthExpired()
            sessionViewModel.logout()
        }
    }
    LaunchedEffect(Unit) { viewModel.loadGames() }

    OperatorHomeScreen(
        games = state.games,
        onSelectGame = {
            viewModel.selectGame(it)
            onOpenGame()
        },
        onLogout = sessionViewModel::logout,
        onRefresh = viewModel::loadGames,
        isLoading = state.isLoading,
        errorMessage = state.errorMessage,
    )
}

@Composable
private fun OperatorGameRoot(
    viewModel: OperatorViewModel,
    sessionViewModel: AppSessionViewModel,
    currentLanguage: String,
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
    val operatorCameraState = rememberCameraPositionState()
    val selectedGame = state.selectedGame

    if (selectedGame == null) {
        onSwitchGame()
        return
    }

    val showSubmissionsTab = selectedGame.status == "live"

    LaunchedEffect(showSubmissionsTab, state.selectedTab) {
        if (!showSubmissionsTab && state.selectedTab == OperatorTab.SUBMISSIONS) {
            viewModel.setTab(OperatorTab.LIVE_MAP)
        }
    }

    OperatorGameScaffold(
        selectedTab = state.selectedTab,
        showSubmissions = showSubmissionsTab,
        onTabSelected = viewModel::setTab,
    ) {
        when (state.selectedTab) {
            OperatorTab.LIVE_MAP -> {
                OperatorMapScreen(
                    bases = state.bases,
                    teamLocations = state.locations,
                    teams = state.teams,
                    baseProgress = state.baseProgress,
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
                        onWriteNfc = viewModel::beginWriteNfc,
                        writeStatus = state.writeStatus,
                        writeSuccess = state.writeSuccess,
                        onDismiss = viewModel::clearSelectedBase,
                    )
                }
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
                )
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
                    notificationSettings = state.notificationSettings,
                    isLoadingNotificationSettings = state.isLoadingNotificationSettings,
                    isSavingNotificationSettings = state.isSavingNotificationSettings,
                    onLanguageChanged = sessionViewModel::updateLanguage,
                    onNotificationSettingsChanged = viewModel::updateNotificationSettings,
                    onSwitchGame = {
                        viewModel.clearSelectedGame()
                        onSwitchGame()
                    },
                    onLogout = sessionViewModel::logout,
                )
            }
        }
    }

    if (state.awaitingNfcWrite && state.selectedBase != null) {
        NfcScanDialog(
            onDismiss = viewModel::cancelWriteNfc,
            title = stringResource(com.prayer.pointfinder.core.i18n.R.string.nfc_write_dialog_title),
            message = stringResource(com.prayer.pointfinder.core.i18n.R.string.nfc_write_dialog_message),
        )
    }
}

@Composable
private fun PermissionDisclosureDialog(onContinue: () -> Unit) {
    AlertDialog(
        onDismissRequest = { /* non-dismissible */ },
        title = {
            Text(
                stringResource(com.prayer.pointfinder.core.i18n.R.string.disclosure_title),
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth(),
            )
        },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                Text(
                    stringResource(com.prayer.pointfinder.core.i18n.R.string.disclosure_subtitle),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                DisclosureRow(
                    icon = { Icon(Icons.Default.LocationOn, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(22.dp)) },
                    title = stringResource(com.prayer.pointfinder.core.i18n.R.string.disclosure_location_title),
                    detail = stringResource(com.prayer.pointfinder.core.i18n.R.string.disclosure_location_detail),
                )
                DisclosureRow(
                    icon = { Icon(Icons.Default.Notifications, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(22.dp)) },
                    title = stringResource(com.prayer.pointfinder.core.i18n.R.string.disclosure_notifications_title),
                    detail = stringResource(com.prayer.pointfinder.core.i18n.R.string.disclosure_notifications_detail),
                )
                DisclosureRow(
                    icon = { Icon(Icons.Default.CameraAlt, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(22.dp)) },
                    title = stringResource(com.prayer.pointfinder.core.i18n.R.string.disclosure_camera_title),
                    detail = stringResource(com.prayer.pointfinder.core.i18n.R.string.disclosure_camera_detail),
                )
                Spacer(Modifier.height(4.dp))
                Text(
                    stringResource(com.prayer.pointfinder.core.i18n.R.string.disclosure_footer),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.outline,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        },
        confirmButton = {
            Button(onClick = onContinue, modifier = Modifier.fillMaxWidth()) {
                Text(stringResource(com.prayer.pointfinder.core.i18n.R.string.disclosure_continue))
            }
        },
    )
}

@Composable
private fun DisclosureRow(
    icon: @Composable () -> Unit,
    title: String,
    detail: String,
) {
    Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.Top) {
        icon()
        Column {
            Text(title, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
            Text(detail, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

/** Scale a bitmap so its longest side is at most [maxSide] pixels. */
private fun scaleBitmapDown(bitmap: Bitmap, maxSide: Int): Bitmap {
    val w = bitmap.width
    val h = bitmap.height
    if (w <= maxSide && h <= maxSide) return bitmap
    val ratio = maxSide.toFloat() / maxOf(w, h)
    return Bitmap.createScaledBitmap(
        bitmap,
        (w * ratio).toInt(),
        (h * ratio).toInt(),
        true,
    )
}
