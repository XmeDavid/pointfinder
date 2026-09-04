package com.prayer.pointfinder.navigation

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageDecoder
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.nfc.NfcAdapter
import android.os.Build
import android.provider.MediaStore
import android.provider.OpenableColumns
import android.provider.Settings
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.isSystemInDarkTheme
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
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.prayer.pointfinder.core.model.AuthType
import com.prayer.pointfinder.core.model.CheckInResponse
import com.prayer.pointfinder.core.model.GameStatus
import com.prayer.pointfinder.core.model.ThemeMode
import com.prayer.pointfinder.core.platform.NfcPayloadCodec
import com.prayer.pointfinder.feature.player.BaseCheckInDetailScreen
import com.prayer.pointfinder.feature.player.BaseDetailBottomSheet
import com.prayer.pointfinder.feature.player.CheckInScreen
import com.prayer.pointfinder.feature.player.MediaItem
import com.prayer.pointfinder.feature.player.NfcScanDialog
import com.prayer.pointfinder.feature.player.NfcState
import com.prayer.pointfinder.feature.player.PendingActionUiItem
import com.prayer.pointfinder.feature.player.PlayerHomeScaffold
import com.prayer.pointfinder.feature.player.PlayerMapScreen
import com.prayer.pointfinder.feature.player.PlayerNotificationListScreen
import com.prayer.pointfinder.feature.player.PlayerSettingsScreen
import com.prayer.pointfinder.feature.player.PlayerTab
import com.prayer.pointfinder.feature.player.SolveScreen
import com.prayer.pointfinder.feature.player.SubmissionResultScreen
import com.prayer.pointfinder.session.AppSessionViewModel
import com.prayer.pointfinder.session.PlayerViewModel
import java.io.ByteArrayOutputStream
import java.io.File
import kotlinx.coroutines.delay

@Composable
internal fun PlayerRootScreen(
    auth: AuthType.Player,
    sessionViewModel: AppSessionViewModel,
    isOnline: Boolean,
    pendingActionsCount: Int,
    failedActionsCount: Int = 0, // Audit 11.2
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

    // NFC capability state: re-evaluated on resume and on adapter state change broadcasts.
    fun resolveNfcState(): NfcState {
        val adapter = NfcAdapter.getDefaultAdapter(context)
        return when {
            adapter == null -> NfcState.UNSUPPORTED
            !adapter.isEnabled -> NfcState.DISABLED
            else -> NfcState.ENABLED
        }
    }
    var nfcState by remember { mutableStateOf(resolveNfcState()) }

    // Re-check on every ON_RESUME (player may have come back from Settings).
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                nfcState = resolveNfcState()
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    // Also listen for ACTION_ADAPTER_STATE_CHANGED so the screen auto-unblocks
    // when the player enables NFC from Settings and returns to the app.
    DisposableEffect(Unit) {
        val receiver = object : BroadcastReceiver() {
            override fun onReceive(ctx: android.content.Context, intent: Intent) {
                if (intent.action == NfcAdapter.ACTION_ADAPTER_STATE_CHANGED) {
                    nfcState = resolveNfcState()
                }
            }
        }
        val filter = IntentFilter(NfcAdapter.ACTION_ADAPTER_STATE_CHANGED)
        context.registerReceiver(receiver, filter)
        onDispose { context.unregisterReceiver(receiver) }
    }

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
        viewModel.startCheckIn(auth, baseId, online = isOnline)
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

    // Camera temp file URI — regenerated before each launch so captures don't overwrite each other
    var cameraPhotoUri by remember {
        val photoDir = File(context.cacheDir, "photos").apply { mkdirs() }
        val timestamp = System.currentTimeMillis()
        val photoFile = File(photoDir, "capture_$timestamp.jpg")
        mutableStateOf(FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", photoFile))
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
            val photoDir = File(context.cacheDir, "photos").apply { mkdirs() }
            cameraPhotoUri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", File(photoDir, "capture_${System.currentTimeMillis()}.jpg"))
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
                if (isOnline) viewModel.refreshFromSnapshot(auth)
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
            // P1 Phase 4 W4: the label shown next to each pending
            // action is the challenge title, not the operator-oriented
            // base name. Falls back to null so the sheet picks a
            // generic type-based label (e.g. "Submission").
            val progressList = state.progress
            viewModel.loadPendingActions().map { e ->
                val label = progressList.firstOrNull { it.baseId == e.baseId }?.challengeTitle
                PendingActionUiItem(
                    id = e.id,
                    type = e.type,
                    label = label,
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
                            val photoDir = File(context.cacheDir, "photos").apply { mkdirs() }
                            cameraPhotoUri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", File(photoDir, "capture_${System.currentTimeMillis()}.jpg"))
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
                        gameName = auth.gameName,
                        gameStatus = gameStatus?.name?.lowercase(),
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
                        failedActionsCount = failedActionsCount, // Audit 11.2
                        scanError = state.scanError,
                        onScan = {
                            showNfcScanDialog = true
                        },
                        nfcState = nfcState,
                        onOpenNfcSettings = {
                            context.startActivity(Intent(Settings.ACTION_NFC_SETTINGS))
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
                viewModel.startCheckIn(auth, selectedBase.baseId, online = isOnline)
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
            viewModel.scannedPayloads.collect { payload ->
                if (payload != null) {
                    showNfcScanDialog = false
                    if (currentNfcAction != null) {
                        currentNfcAction(payload.baseId)
                        pendingNfcAction = null
                    } else {
                        // Default: check-in flow
                        viewModel.startCheckIn(auth, payload.baseId, payload.nfcToken, isOnline)
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
                    icon = { Icon(Icons.Default.LocationOn, contentDescription = stringResource(com.prayer.pointfinder.core.i18n.R.string.cd_location), tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(22.dp)) },
                    title = stringResource(com.prayer.pointfinder.core.i18n.R.string.disclosure_location_title),
                    detail = stringResource(com.prayer.pointfinder.core.i18n.R.string.disclosure_location_detail),
                )
                DisclosureRow(
                    icon = { Icon(Icons.Default.Notifications, contentDescription = stringResource(com.prayer.pointfinder.core.i18n.R.string.cd_notifications), tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(22.dp)) },
                    title = stringResource(com.prayer.pointfinder.core.i18n.R.string.label_notifications),
                    detail = stringResource(com.prayer.pointfinder.core.i18n.R.string.disclosure_notifications_detail),
                )
                DisclosureRow(
                    icon = { Icon(Icons.Default.CameraAlt, contentDescription = stringResource(com.prayer.pointfinder.core.i18n.R.string.cd_camera), tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(22.dp)) },
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
