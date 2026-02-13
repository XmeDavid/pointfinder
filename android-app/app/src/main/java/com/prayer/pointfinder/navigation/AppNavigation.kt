package com.prayer.pointfinder.navigation

import android.Manifest
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageDecoder
import android.os.Build
import android.provider.MediaStore
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
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
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import java.io.ByteArrayOutputStream
import java.io.File
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
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
import com.prayer.pointfinder.feature.operator.OperatorTab
import com.prayer.pointfinder.core.platform.NfcEventBus
import com.prayer.pointfinder.feature.player.BaseCheckInDetailScreen
import com.prayer.pointfinder.feature.player.BaseDetailBottomSheet
import com.prayer.pointfinder.feature.player.CheckInScreen
import com.prayer.pointfinder.feature.player.NfcScanDialog
import com.prayer.pointfinder.feature.player.PlayerHomeScaffold
import com.prayer.pointfinder.feature.player.PlayerMapScreen
import com.prayer.pointfinder.feature.player.PlayerSettingsScreen
import com.prayer.pointfinder.feature.player.PlayerTab
import com.prayer.pointfinder.feature.player.SolveScreen
import com.prayer.pointfinder.feature.player.SubmissionResultScreen
import com.prayer.pointfinder.session.AppSessionViewModel
import com.prayer.pointfinder.session.OperatorViewModel
import com.prayer.pointfinder.session.PlayerViewModel
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
                onJoinCodeChange = {
                    joinCode = it
                    sessionViewModel.clearError()
                },
                onContinue = {
                    sessionViewModel.clearError()
                    navController.navigate(Routes.PLAYER_NAME)
                },
                onScanQr = {},
                cameraDenied = false,
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
    isDeletingAccount: Boolean,
    sessionErrorMessage: String?,
    showPermissionDisclosure: Boolean = false,
) {
    val viewModel: PlayerViewModel = hiltViewModel()
    val state by viewModel.state.collectAsStateWithLifecycle()
    val playerCameraState = rememberCameraPositionState()
    val context = LocalContext.current

    var selectedTab by rememberSaveable { mutableStateOf(PlayerTab.MAP) }
    var solving by remember { mutableStateOf<Pair<String, String>?>(null) }
    var photoBytes by remember { mutableStateOf<ByteArray?>(null) }
    var photoBitmap by remember { mutableStateOf<Bitmap?>(null) }
    var showNfcScanDialog by remember { mutableStateOf(false) }

    // Permission launchers (fired after disclosure accepted)
    var pendingPermissionRequest by remember { mutableStateOf(false) }

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
            selectedTab = tab
        },
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
                        val checkInChallenge = state.activeCheckIn?.challenge
                        viewModel.setPhotoMode(checkInChallenge?.answerType == "file")
                    },
                    onBack = { viewModel.clearCheckIn() },
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
                        showNfcScanDialog = true
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
                viewModel.startCheckIn(auth, selectedBase.baseId, isOnline)
                viewModel.clearSelectedBase()
            },
            onSolve = {
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

    // NFC scan dialog: shown when the user taps "Check In at Base".
    // Listens for NFC tag scans and automatically triggers check-in.
    if (showNfcScanDialog) {
        LaunchedEffect(Unit) {
            viewModel.scannedBaseIds.collect { baseId ->
                if (baseId != null) {
                    showNfcScanDialog = false
                    viewModel.startCheckIn(auth, baseId, isOnline)
                }
            }
        }
        NfcScanDialog(
            onDismiss = { showNfcScanDialog = false },
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
        isLoading = state.isLoading,
        errorMessage = state.errorMessage,
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
