package com.prayer.pointfinder.navigation

import android.Manifest
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageDecoder
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import android.provider.OpenableColumns
import androidx.activity.compose.BackHandler
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
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.rememberCoroutineScope
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
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTagsAsResourceId
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
import com.prayer.pointfinder.core.model.CheckInResponse
import com.prayer.pointfinder.core.model.GameStatus
import com.prayer.pointfinder.core.model.ThemeMode
import com.prayer.pointfinder.feature.auth.OperatorLoginScreen
import com.prayer.pointfinder.feature.auth.PlayerJoinScreen
import com.prayer.pointfinder.feature.auth.PlayerNameScreen
import com.prayer.pointfinder.feature.auth.WelcomeScreen
import com.prayer.pointfinder.core.model.CreateBaseRequest
import com.prayer.pointfinder.core.model.CreateChallengeRequest
import com.prayer.pointfinder.core.model.UpdateBaseRequest
import com.prayer.pointfinder.core.model.UpdateChallengeRequest
import com.prayer.pointfinder.core.model.TeamVariable
import com.prayer.pointfinder.core.model.UpdateTeamRequest
import com.prayer.pointfinder.core.model.PlayerResponse
import com.prayer.pointfinder.feature.operator.BaseEditScreen
import com.prayer.pointfinder.feature.operator.BasesListScreen
import com.prayer.pointfinder.feature.operator.ChallengeEditScreen
import com.prayer.pointfinder.feature.operator.ChallengesListScreen
import com.prayer.pointfinder.feature.operator.TeamDetailScreen
import com.prayer.pointfinder.feature.operator.TeamsListScreen
import com.prayer.pointfinder.feature.operator.TeamVariablesManagementScreen
import com.prayer.pointfinder.feature.operator.LiveScreen
import com.prayer.pointfinder.feature.operator.OperatorGameScaffold
import com.prayer.pointfinder.feature.operator.CreateGameScreen
import com.prayer.pointfinder.feature.operator.OperatorHomeScreen
import com.prayer.pointfinder.feature.operator.LiveBaseProgressBottomSheet
import com.prayer.pointfinder.feature.operator.OperatorMapScreen
import com.prayer.pointfinder.feature.operator.SetupHubScreen
import com.prayer.pointfinder.feature.operator.OperatorSettingsScreen
import com.prayer.pointfinder.feature.operator.OperatorSubmissionsScreen
import com.prayer.pointfinder.feature.operator.OperatorTab
import com.prayer.pointfinder.feature.operator.MoreScreen
import com.prayer.pointfinder.feature.operator.GameSettingsScreen
import com.prayer.pointfinder.feature.operator.NotificationsScreen
import com.prayer.pointfinder.feature.operator.OperatorsScreen
import kotlinx.serialization.json.Json
import com.prayer.pointfinder.core.platform.NfcEventBus
import com.prayer.pointfinder.core.platform.NfcPayloadCodec
import com.prayer.pointfinder.feature.player.BaseCheckInDetailScreen
import com.prayer.pointfinder.feature.player.BaseDetailBottomSheet
import com.prayer.pointfinder.feature.player.CheckInScreen
import com.prayer.pointfinder.feature.player.NfcScanDialog
import com.prayer.pointfinder.feature.player.PendingActionUiItem
import com.prayer.pointfinder.feature.player.PlayerHomeScaffold
import com.prayer.pointfinder.feature.player.PlayerMapScreen
import com.prayer.pointfinder.feature.player.PlayerNotificationListScreen
import com.prayer.pointfinder.feature.player.PlayerSettingsScreen
import com.prayer.pointfinder.feature.player.PlayerTab
import com.prayer.pointfinder.feature.player.MediaItem
import com.prayer.pointfinder.feature.player.SolveScreen
import com.prayer.pointfinder.feature.player.SubmissionResultScreen
import com.prayer.pointfinder.session.AppSessionViewModel
import com.prayer.pointfinder.session.OperatorViewModel
import com.prayer.pointfinder.session.PlayerViewModel
import com.google.mlkit.common.MlKitException
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning
import java.util.Locale
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

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
private fun PlayerRootScreen(
    auth: AuthType.Player,
    sessionViewModel: AppSessionViewModel,
    isOnline: Boolean,
    pendingActionsCount: Int,
    currentLanguage: String,
    currentThemeMode: ThemeMode,
    isDeletingAccount: Boolean,
    sessionErrorMessage: String?,
    showPermissionDisclosure: Boolean = false,
) {
    val viewModel: PlayerViewModel = hiltViewModel()
    val state by viewModel.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current

    var selectedTab by rememberSaveable { mutableStateOf(PlayerTab.MAP) }
    var solving by remember { mutableStateOf<Pair<String, String>?>(null) }
    var solvingChallenge by remember { mutableStateOf<CheckInResponse.ChallengeInfo?>(null) }
    var selectedMediaItems by remember { mutableStateOf<List<MediaItem>>(emptyList()) }
    var showNfcScanDialog by remember { mutableStateOf(false) }
    // Callback to invoke when an NFC scan completes (used for both check-in and presence verification).
    var pendingNfcAction by remember { mutableStateOf<((String) -> Unit)?>(null) }

    // Permission launchers (fired after disclosure accepted)
    var pendingPermissionRequest by remember { mutableStateOf(false) }
    val gameStatus = state.gameStatus ?: auth.gameStatus
    val shouldBlockGameplay = gameStatus == GameStatus.SETUP || gameStatus == GameStatus.ENDED

    val backToMapFromSubmission = {
        // Fully clear transient solve/check-in UI state so result screen doesn't reopen.
        viewModel.clearSubmissionResult()
        viewModel.clearCheckIn()
        solving = null
        solvingChallenge = null
        selectedMediaItems = emptyList()
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

    // Deep link: auto check-in when a /tag/ URL opens the app
    val deepLinkBaseId by viewModel.deepLinkBaseId.collectAsStateWithLifecycle()
    LaunchedEffect(deepLinkBaseId) {
        val baseId = deepLinkBaseId ?: return@LaunchedEffect
        viewModel.consumeDeepLinkBaseId()
        selectedTab = PlayerTab.CHECK_IN
        viewModel.startCheckIn(auth, baseId, isOnline)
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
        val timestamp = System.currentTimeMillis()
        val photoFile = File(photoDir, "capture_$timestamp.jpg")
        FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", photoFile)
    }

    // Gallery picker (multi-select, up to 5)
    val pickMediaLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.PickMultipleVisualMedia(5),
    ) { uris ->
        val remaining = 5 - selectedMediaItems.size
        val toProcess = uris.take(remaining)
        val newItems = mutableListOf<MediaItem>()
        for (uri in toProcess) {
            runCatching {
                context.contentResolver.takePersistableUriPermission(
                    uri,
                    Intent.FLAG_GRANT_READ_URI_PERMISSION,
                )
            }
            val metadata = resolvePickedMediaMetadata(context, uri)
            val isVideo = metadata.mimeType.startsWith("video/")

            val thumbnail: Bitmap? = runCatching {
                if (isVideo) {
                    val retriever = MediaMetadataRetriever()
                    retriever.setDataSource(context, uri)
                    val frame = retriever.getScaledFrameAtTime(
                        0,
                        MediaMetadataRetriever.OPTION_CLOSEST_SYNC,
                        320,
                        320,
                    )
                    retriever.release()
                    frame
                } else {
                    val bitmap = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                        ImageDecoder.decodeBitmap(
                            ImageDecoder.createSource(context.contentResolver, uri),
                        ) { decoder, _, _ ->
                            decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
                        }
                    } else {
                        @Suppress("DEPRECATION")
                        MediaStore.Images.Media.getBitmap(context.contentResolver, uri)
                    }
                    scaleBitmapDown(bitmap, 320)
                }
            }.getOrNull()

            if (thumbnail != null) {
                newItems.add(
                    MediaItem(
                        uri = uri.toString(),
                        thumbnail = thumbnail,
                        isVideo = isVideo,
                        contentType = metadata.mimeType,
                        sizeBytes = metadata.sizeBytes ?: 0L,
                        fileName = metadata.displayName,
                    ),
                )
            }
        }
        selectedMediaItems = selectedMediaItems + newItems
    }

    // Camera capture (adds photo to list)
    val cameraLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.TakePicture(),
    ) { success ->
        if (success && selectedMediaItems.size < 5) {
            runCatching {
                val inputStream = context.contentResolver.openInputStream(cameraPhotoUri)
                val bitmap = BitmapFactory.decodeStream(inputStream)
                inputStream?.close()
                if (bitmap != null) {
                    val thumbnail = scaleBitmapDown(bitmap, 320)
                    val scaled = scaleBitmapDown(bitmap, 1920)
                    val out = ByteArrayOutputStream()
                    scaled.compress(Bitmap.CompressFormat.JPEG, 70, out)
                    val jpegBytes = out.toByteArray()
                    // Extract filename from the URI path
                    val fileName = cameraPhotoUri.path?.substringAfterLast('/') ?: "capture.jpg"
                    selectedMediaItems = selectedMediaItems + MediaItem(
                        uri = cameraPhotoUri.toString(),
                        thumbnail = thumbnail,
                        isVideo = false,
                        contentType = "image/jpeg",
                        sizeBytes = jpegBytes.size.toLong(),
                        fileName = fileName,
                    )
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
        // Check for permanently failed sync actions and warn the user (finding 11.2)
        viewModel.checkForFailedActions(auth)
    }

    LaunchedEffect(auth.gameId, isOnline, state.realtimeConnected) {
        if (!isOnline) return@LaunchedEffect
        while (viewModel.state.value.gameStatus?.let { it != GameStatus.LIVE } != false) {
            // Keep polling as fallback, but back off when realtime socket is healthy.
            delay(if (viewModel.state.value.realtimeConnected) 30_000L else 10_000L)
            viewModel.refresh(auth, true)
        }
    }

    DisposableEffect(lifecycleOwner, auth.gameId, isOnline) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                sessionViewModel.resumeLocationIfNeeded()
                if (isOnline) viewModel.refresh(auth, true)
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
            solvingChallenge = null
            selectedMediaItems = emptyList()
            viewModel.clearCheckIn()
            viewModel.clearSubmissionResult()
            viewModel.closeNotifications()
            selectedTab = tab
        },
        isOffline = !isOnline,
        pendingActionsCount = pendingActionsCount,
        onLoadPendingActions = {
            viewModel.loadPendingActions().map { e ->
                PendingActionUiItem(
                    id = e.id,
                    type = e.type,
                    uploadSessionId = e.uploadSessionId,
                    uploadChunkIndex = e.uploadChunkIndex,
                    uploadTotalChunks = e.uploadTotalChunks,
                )
            }
        },
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
                BackHandler { backToMapFromSubmission() }
                val submission = state.latestSubmission!!
                SubmissionResultScreen(
                    submission = submission,
                    onBack = backToMapFromSubmission,
                )
            }

            solving != null -> {
                BackHandler { solving = null; solvingChallenge = null }
                val (baseId, challengeId) = solving ?: return@PlayerHomeScaffold

                // Closure that performs the actual submission (reused by direct and NFC paths).
                val doSubmit = {
                    if (state.isPhotoMode) {
                        val mediaItemDataList = selectedMediaItems.map { item ->
                            val itemUri = Uri.parse(item.uri)
                            // For images, re-compress; for videos, pass source URI
                            if (!item.isVideo) {
                                val bmp = runCatching {
                                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                                        ImageDecoder.decodeBitmap(
                                            ImageDecoder.createSource(context.contentResolver, itemUri),
                                        ) { decoder, _, _ ->
                                            decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
                                        }
                                    } else {
                                        @Suppress("DEPRECATION")
                                        MediaStore.Images.Media.getBitmap(context.contentResolver, itemUri)
                                    }
                                }.getOrNull()
                                if (bmp != null) {
                                    val scaled = scaleBitmapDown(bmp, 1920)
                                    val out = ByteArrayOutputStream()
                                    scaled.compress(Bitmap.CompressFormat.JPEG, 70, out)
                                    val bytes = out.toByteArray()
                                    PlayerViewModel.MediaItemData(
                                        bytes = bytes,
                                        sourceUri = item.uri,
                                        contentType = "image/jpeg",
                                        sizeBytes = bytes.size.toLong(),
                                        fileName = item.fileName ?: "capture.jpg",
                                    )
                                } else {
                                    PlayerViewModel.MediaItemData(
                                        sourceUri = item.uri,
                                        contentType = item.contentType,
                                        sizeBytes = item.sizeBytes,
                                        fileName = item.fileName,
                                    )
                                }
                            } else {
                                PlayerViewModel.MediaItemData(
                                    sourceUri = item.uri,
                                    contentType = item.contentType,
                                    sizeBytes = item.sizeBytes,
                                    fileName = item.fileName,
                                )
                            }
                        }
                        viewModel.submitPhoto(
                            auth = auth,
                            baseId = baseId,
                            challengeId = challengeId,
                            mediaItemDataList = mediaItemDataList,
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

                val solveChallenge = state.activeCheckIn?.challenge ?: solvingChallenge
                SolveScreen(
                    answer = state.answerText,
                    onAnswerChange = viewModel::setAnswerText,
                    isPhotoMode = state.isPhotoMode,
                    presenceRequired = state.presenceRequired,
                    mediaItems = selectedMediaItems,
                    onPickMedia = {
                        pickMediaLauncher.launch(
                            PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageAndVideo),
                        )
                    },
                    onCapturePhoto = {
                        if (context.checkSelfPermission(Manifest.permission.CAMERA) == android.content.pm.PackageManager.PERMISSION_GRANTED) {
                            cameraLauncher.launch(cameraPhotoUri)
                        } else {
                            cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
                        }
                    },
                    onRemoveMedia = { index ->
                        selectedMediaItems = selectedMediaItems.toMutableList().apply { removeAt(index) }
                    },
                    onBack = { solving = null; solvingChallenge = null },
                    isSubmitting = state.isSubmitting,
                    challengeTitle = solveChallenge?.title ?: "",
                    challengeDescription = solveChallenge?.description ?: "",
                    challengeContent = solveChallenge?.content ?: "",
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
                BackHandler {
                    viewModel.clearCheckIn()
                    viewModel.refresh(auth, isOnline)
                }
                val checkIn = state.activeCheckIn!!
                BaseCheckInDetailScreen(
                    response = checkIn,
                    isOffline = !isOnline,
                    onSolve = { baseId, challengeId ->
                        val checkInChallenge = state.activeCheckIn?.challenge
                        if (checkInChallenge?.answerType == "none") {
                            viewModel.submitNone(auth, baseId, challengeId, isOnline)
                        } else {
                            solving = baseId to challengeId
                            viewModel.setPresenceRequired(
                                checkInChallenge?.requirePresenceToSubmit == true,
                            )
                            viewModel.setPhotoMode(checkInChallenge?.answerType == "file")
                        }
                    },
                    onBack = {
                        viewModel.clearCheckIn()
                        viewModel.refresh(auth, isOnline)
                    },
                )
            }

            selectedTab == PlayerTab.MAP -> {
                Box(modifier = Modifier.fillMaxSize()) {
                    val isDark = when (currentThemeMode) {
                        ThemeMode.SYSTEM -> isSystemInDarkTheme()
                        ThemeMode.LIGHT -> false
                        ThemeMode.DARK -> true
                    }
                    PlayerMapScreen(
                        progress = state.progress,
                        isLoading = state.isLoading,
                        unseenNotificationCount = state.unseenNotificationCount,
                        tileSource = auth.tileSource ?: "osm",
                        isDark = isDark,
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
                    currentThemeMode = currentThemeMode.name,
                    onThemeModeChanged = { sessionViewModel.updateThemeMode(ThemeMode.valueOf(it)) },
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
        BackHandler { viewModel.clearSelectedBase() }
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
                    if (state.selectedChallenge?.answerType == "none") {
                        viewModel.submitNone(auth, selectedBase.baseId, challengeId, isOnline)
                    } else {
                        solvingChallenge = state.selectedChallenge
                        solving = selectedBase.baseId to challengeId
                        viewModel.setPresenceRequired(state.selectedChallenge?.requirePresenceToSubmit == true)
                        viewModel.setPhotoMode(state.selectedChallenge?.answerType == "file")
                    }
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
    onCreateGame: () -> Unit,
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
        onCreateGame = onCreateGame,
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
                            initialLat = null,
                            initialLng = null,
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
                            LaunchedEffect(teamId) {
                                viewModel.loadTeamPlayers(teamId) { players = it }
                            }
                            TeamDetailScreen(
                                team = team,
                                players = players,
                                variables = state.variables,
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
                                onBack = { setupSubScreen = "teams_list" },
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
                                viewModel.inviteOperator(email) {}
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
                            LaunchedEffect(teamId) {
                                viewModel.loadTeamPlayers(teamId) { players = it }
                            }
                            TeamDetailScreen(
                                team = team,
                                players = players,
                                variables = state.variables,
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
                                onBack = { moreSubScreen = "teams_list" },
                            )
                        } else {
                            moreSubScreen = "teams_list"
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
                    title = stringResource(com.prayer.pointfinder.core.i18n.R.string.label_notifications),
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
                Text(stringResource(com.prayer.pointfinder.core.i18n.R.string.action_continue))
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

private data class PickedMediaMetadata(
    val mimeType: String,
    val sizeBytes: Long?,
    val displayName: String?,
)

private fun resolvePickedMediaMetadata(context: android.content.Context, uri: Uri): PickedMediaMetadata {
    val mimeType = context.contentResolver.getType(uri) ?: "application/octet-stream"
    var sizeBytes: Long? = null
    var displayName: String? = null
    context.contentResolver.query(uri, arrayOf(OpenableColumns.SIZE, OpenableColumns.DISPLAY_NAME), null, null, null)
        ?.use { cursor ->
            if (cursor.moveToFirst()) {
                val sizeIdx = cursor.getColumnIndex(OpenableColumns.SIZE)
                if (sizeIdx >= 0 && !cursor.isNull(sizeIdx)) {
                    sizeBytes = cursor.getLong(sizeIdx)
                }
                val nameIdx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                if (nameIdx >= 0 && !cursor.isNull(nameIdx)) {
                    displayName = cursor.getString(nameIdx)
                }
            }
        }
    return PickedMediaMetadata(
        mimeType = mimeType,
        sizeBytes = sizeBytes,
        displayName = displayName,
    )
}
