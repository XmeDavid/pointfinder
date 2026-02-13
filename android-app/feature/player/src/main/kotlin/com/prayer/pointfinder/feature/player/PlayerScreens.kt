package com.prayer.pointfinder.feature.player

import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Color as AndroidColor
import android.net.Uri
import androidx.compose.foundation.background
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Map
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.foundation.Image
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.prayer.pointfinder.core.i18n.R
import com.prayer.pointfinder.core.model.BaseProgress
import com.prayer.pointfinder.core.model.BaseStatus
import com.prayer.pointfinder.core.model.CheckInResponse
import com.prayer.pointfinder.core.model.SubmissionResponse
import com.google.android.gms.maps.CameraUpdateFactory
import com.google.android.gms.maps.model.BitmapDescriptorFactory
import com.google.android.gms.maps.model.LatLng
import com.google.android.gms.maps.model.LatLngBounds
import com.google.maps.android.compose.CameraPositionState
import com.google.maps.android.compose.GoogleMap
import com.google.maps.android.compose.Marker
import com.google.maps.android.compose.MarkerState

enum class PlayerTab {
    MAP,
    CHECK_IN,
    SETTINGS,
}

private const val PRIVACY_POLICY_URL = "https://desbravadores.dev/privacy/"

// Semantic color constants for status, accents, and indicators
private val StatusCheckedIn = Color(0xFF1565C0)
private val StatusCompleted = Color(0xFF2E7D32)
private val StatusSubmitted = Color(0xFFE08A00)
private val StatusRejected = Color(0xFFD32F2F)
private val StarGold = Color(0xFFE08A00)
private val OfflineOrange = Color(0xFFE08A00)

@Composable
fun PlayerHomeScaffold(
    selectedTab: PlayerTab,
    onTabSelected: (PlayerTab) -> Unit,
    isOffline: Boolean,
    content: @Composable () -> Unit,
) {
    Scaffold(
        topBar = {
            if (isOffline) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(OfflineOrange)
                        .padding(8.dp),
                ) {
                    Text(
                        text = stringResource(R.string.label_offline),
                        color = Color.Black,
                        style = MaterialTheme.typography.labelLarge,
                    )
                }
            }
        },
        bottomBar = {
            NavigationBar {
                NavigationBarItem(
                    selected = selectedTab == PlayerTab.MAP,
                    onClick = { onTabSelected(PlayerTab.MAP) },
                    icon = { Icon(Icons.Default.Map, contentDescription = stringResource(R.string.label_map)) },
                    label = { Text(stringResource(R.string.label_map)) },
                )
                NavigationBarItem(
                    selected = selectedTab == PlayerTab.CHECK_IN,
                    onClick = { onTabSelected(PlayerTab.CHECK_IN) },
                    icon = { Icon(Icons.Default.LocationOn, contentDescription = stringResource(R.string.label_check_in)) },
                    label = { Text(stringResource(R.string.label_check_in)) },
                )
                NavigationBarItem(
                    selected = selectedTab == PlayerTab.SETTINGS,
                    onClick = { onTabSelected(PlayerTab.SETTINGS) },
                    icon = { Icon(Icons.Default.Settings, contentDescription = stringResource(R.string.label_settings)) },
                    label = { Text(stringResource(R.string.label_settings)) },
                )
            }
        },
    ) { padding ->
        Box(modifier = Modifier.padding(padding)) {
            content()
        }
    }
}

@Composable
fun PlayerMapScreen(
    progress: List<BaseProgress>,
    isLoading: Boolean,
    cameraPositionState: CameraPositionState,
    onBaseSelected: (BaseProgress) -> Unit,
    onRefresh: () -> Unit,
    modifier: Modifier = Modifier,
) {
    LaunchedEffect(progress) {
        if (progress.isNotEmpty() && !cameraPositionState.isMoving) {
            val builder = LatLngBounds.builder()
            progress.forEach { builder.include(LatLng(it.lat, it.lng)) }
            runCatching {
                cameraPositionState.animate(CameraUpdateFactory.newLatLngBounds(builder.build(), 80))
            }
        }
    }

    Box(modifier = modifier.fillMaxSize()) {
        GoogleMap(
            modifier = Modifier.fillMaxSize(),
            cameraPositionState = cameraPositionState,
        ) {
            progress.forEach { item ->
                val markerHue = when (item.baseStatus()) {
                    BaseStatus.NOT_VISITED -> BitmapDescriptorFactory.HUE_RED
                    BaseStatus.CHECKED_IN -> BitmapDescriptorFactory.HUE_AZURE
                    BaseStatus.SUBMITTED -> BitmapDescriptorFactory.HUE_ORANGE
                    BaseStatus.COMPLETED -> BitmapDescriptorFactory.HUE_GREEN
                    BaseStatus.REJECTED -> BitmapDescriptorFactory.HUE_ROSE
                }
                Marker(
                    state = MarkerState(position = LatLng(item.lat, item.lng)),
                    title = item.baseName,
                    snippet = item.status,
                    icon = BitmapDescriptorFactory.defaultMarker(markerHue),
                    onClick = {
                        onBaseSelected(item)
                        true
                    },
                )
            }
        }

        Row(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(bottom = 12.dp, start = 16.dp, end = 16.dp)
                .background(Color.Black.copy(alpha = 0.55f), shape = MaterialTheme.shapes.small)
                .padding(horizontal = 12.dp, vertical = 6.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            LegendDot(color = Color.Gray, label = stringResource(R.string.status_not_visited))
            LegendDot(color = StatusCheckedIn, label = stringResource(R.string.status_checked_in))
            LegendDot(color = StatusSubmitted, label = stringResource(R.string.status_submitted))
            LegendDot(color = StatusCompleted, label = stringResource(R.string.status_completed))
        }

        Button(
            onClick = onRefresh,
            modifier = Modifier
                .align(Alignment.TopEnd)
                .padding(12.dp),
        ) {
            if (isLoading) {
                CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
            } else {
                Text(stringResource(R.string.action_refresh))
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BaseDetailBottomSheet(
    baseProgress: BaseProgress,
    challenge: CheckInResponse.ChallengeInfo?,
    onCheckIn: () -> Unit,
    onSolve: () -> Unit,
    onDismiss: () -> Unit,
) {
    val status = baseProgress.baseStatus()
    val statusColor = when (status) {
        BaseStatus.NOT_VISITED -> Color.Gray
        BaseStatus.CHECKED_IN -> StatusCheckedIn
        BaseStatus.SUBMITTED -> StatusSubmitted
        BaseStatus.COMPLETED -> StatusCompleted
        BaseStatus.REJECTED -> StatusRejected
    }
    val statusIcon = when (status) {
        BaseStatus.NOT_VISITED -> Icons.Default.LocationOn
        BaseStatus.CHECKED_IN -> Icons.Default.CheckCircle
        BaseStatus.SUBMITTED -> Icons.Default.CheckCircle
        BaseStatus.COMPLETED -> Icons.Default.CheckCircle
        BaseStatus.REJECTED -> Icons.Default.LocationOn
    }

    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)) {
            Text(baseProgress.baseName, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(12.dp))

            // Status banner
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(statusColor.copy(alpha = 0.12f), shape = MaterialTheme.shapes.medium)
                    .padding(12.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Icon(statusIcon, contentDescription = null, tint = statusColor, modifier = Modifier.size(20.dp))
                    Text(baseStatusLabel(status), fontWeight = FontWeight.Medium, color = statusColor)
                }
                if (challenge != null && status != BaseStatus.NOT_VISITED) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        Icon(Icons.Default.Star, contentDescription = null, tint = StarGold, modifier = Modifier.size(16.dp))
                        Text("${challenge.points} pts", style = MaterialTheme.typography.labelMedium, color = StarGold)
                    }
                }
            }

            Spacer(Modifier.height(12.dp))

            if (status == BaseStatus.NOT_VISITED) {
                Column(
                    modifier = Modifier.fillMaxWidth().padding(vertical = 24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Icon(
                        Icons.Default.Lock,
                        contentDescription = null,
                        modifier = Modifier.size(48.dp),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f),
                    )
                    Text(
                        stringResource(R.string.label_challenge_locked),
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Text(
                        stringResource(R.string.label_challenge_locked_hint),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f),
                        textAlign = TextAlign.Center,
                    )
                }
            } else {
                Text(
                    challenge?.description ?: stringResource(R.string.label_no_challenge_details),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Spacer(Modifier.height(16.dp))

            when (status) {
                BaseStatus.NOT_VISITED -> {
                    // No action button -- player must use the Check-In tab (NFC scan)
                }
                BaseStatus.CHECKED_IN, BaseStatus.REJECTED -> {
                    Button(
                        onClick = onSolve,
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.buttonColors(containerColor = StatusCheckedIn),
                    ) { Text(stringResource(R.string.action_solve_challenge)) }
                }
                BaseStatus.SUBMITTED -> {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(StatusSubmitted.copy(alpha = 0.12f), shape = MaterialTheme.shapes.small)
                            .padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.Center,
                    ) {
                        Icon(Icons.Default.CheckCircle, contentDescription = null, tint = StatusSubmitted, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.size(8.dp))
                        Text(stringResource(R.string.label_awaiting_review), color = StatusSubmitted, fontWeight = FontWeight.Medium)
                    }
                }
                BaseStatus.COMPLETED -> {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(StatusCompleted.copy(alpha = 0.12f), shape = MaterialTheme.shapes.small)
                            .padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.Center,
                    ) {
                        Icon(Icons.Default.CheckCircle, contentDescription = null, tint = StatusCompleted, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.size(8.dp))
                        Text(stringResource(R.string.status_completed), color = StatusCompleted, fontWeight = FontWeight.Medium)
                    }
                }
            }
            Spacer(Modifier.height(16.dp))
        }
    }
}

@Composable
fun CheckInScreen(
    pendingActionsCount: Int,
    scanError: String?,
    onScan: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val pulseTransition = rememberInfiniteTransition(label = "check-in-pulse")
    val pulseScale by pulseTransition.animateFloat(
        initialValue = 1f,
        targetValue = 1.08f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1400),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "check-in-scale",
    )

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Box(
            contentAlignment = Alignment.Center,
            modifier = Modifier.graphicsLayer {
                scaleX = pulseScale
                scaleY = pulseScale
            },
        ) {
            Box(
                modifier = Modifier
                    .size(160.dp)
                    .background(StatusCompleted.copy(alpha = 0.10f), shape = MaterialTheme.shapes.extraLarge),
            )
            Box(
                modifier = Modifier
                    .size(120.dp)
                    .background(StatusCompleted.copy(alpha = 0.20f), shape = MaterialTheme.shapes.extraLarge),
            )
            Icon(Icons.Default.LocationOn, contentDescription = null, modifier = Modifier.size(52.dp), tint = MaterialTheme.colorScheme.primary)
        }
        Spacer(Modifier.height(18.dp))
        Text(stringResource(R.string.label_base_check_in), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(8.dp))
        Text(
            stringResource(R.string.hint_checkin_instructions),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            style = MaterialTheme.typography.bodyMedium,
        )
        Spacer(Modifier.height(16.dp))
        if (pendingActionsCount > 0) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.CheckCircle, contentDescription = null, tint = StatusSubmitted)
                val label = if (pendingActionsCount == 1) {
                    stringResource(R.string.label_pending_sync_one, pendingActionsCount)
                } else {
                    stringResource(R.string.label_pending_sync_other, pendingActionsCount)
                }
                Text(label, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Spacer(Modifier.height(8.dp))
        }
        if (!scanError.isNullOrBlank()) {
            Text(scanError, color = MaterialTheme.colorScheme.error)
            Spacer(Modifier.height(8.dp))
        }
        Spacer(Modifier.height(8.dp))
        Button(onClick = onScan, modifier = Modifier.fillMaxWidth()) {
            Icon(Icons.Default.LocationOn, contentDescription = null)
            Spacer(Modifier.size(8.dp))
            Text(stringResource(R.string.action_check_in_at_base))
        }
    }
}

@Composable
fun BaseCheckInDetailScreen(
    response: CheckInResponse,
    isOffline: Boolean,
    onSolve: (baseId: String, challengeId: String) -> Unit,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(16.dp),
    ) {
        TextButton(onClick = onBack) { Text(stringResource(R.string.action_back_to_map)) }
        Spacer(Modifier.height(4.dp))
        Text(stringResource(R.string.label_checked_in_at_base, response.baseName), style = MaterialTheme.typography.titleLarge)
        if (isOffline) {
            Spacer(Modifier.height(8.dp))
            Text(stringResource(R.string.hint_offline_sync), color = OfflineOrange)
        }
        Spacer(Modifier.height(12.dp))
        val challenge = response.challenge
        if (challenge != null) {
            Text(challenge.title, style = MaterialTheme.typography.titleMedium)
            Spacer(Modifier.height(8.dp))
            Text(challenge.description)
            Spacer(Modifier.height(12.dp))
            Button(onClick = { onSolve(response.baseId, challenge.id) }) {
                Text(stringResource(R.string.action_solve_challenge))
            }
        } else {
            Text(stringResource(R.string.label_no_challenge_assigned))
        }
    }
}

@Composable
fun SolveScreen(
    answer: String,
    onAnswerChange: (String) -> Unit,
    isPhotoMode: Boolean,
    presenceRequired: Boolean,
    presenceVerified: Boolean,
    onVerifyPresence: () -> Unit,
    onPickPhoto: () -> Unit,
    onCapturePhoto: () -> Unit,
    photoBitmap: Bitmap?,
    onClearPhoto: () -> Unit,
    onSubmit: () -> Unit,
    onBack: () -> Unit,
    isOnline: Boolean,
    errorMessage: String?,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(16.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = onBack) { Text(stringResource(R.string.action_back)) }
            Spacer(Modifier.size(8.dp))
            Text(stringResource(R.string.label_solve_title), style = MaterialTheme.typography.titleLarge)
        }
        Spacer(Modifier.height(12.dp))

        if (presenceRequired) {
            Text(stringResource(R.string.label_presence_required))
            Spacer(Modifier.height(8.dp))
            Button(onClick = onVerifyPresence, enabled = !presenceVerified) {
                Text(
                    if (presenceVerified) {
                        stringResource(R.string.label_presence_verified)
                    } else {
                        stringResource(R.string.action_verify_with_nfc)
                    },
                )
            }
            Spacer(Modifier.height(12.dp))
        }

        if (isPhotoMode) {
            Text(stringResource(R.string.label_photo_mode))
            Spacer(Modifier.height(8.dp))
            if (photoBitmap != null) {
                Box(contentAlignment = Alignment.TopEnd) {
                    Image(
                        bitmap = photoBitmap.asImageBitmap(),
                        contentDescription = null,
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(220.dp)
                            .clip(MaterialTheme.shapes.medium),
                        contentScale = ContentScale.Crop,
                    )
                    TextButton(onClick = onClearPhoto) {
                        Text(stringResource(R.string.action_remove), color = Color.White)
                    }
                }
                Spacer(Modifier.height(8.dp))
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = onPickPhoto) { Text(stringResource(R.string.action_choose_photo)) }
                Button(onClick = onCapturePhoto) { Text(stringResource(R.string.action_take_photo)) }
            }
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(
                value = answer,
                onValueChange = onAnswerChange,
                modifier = Modifier.fillMaxWidth(),
                minLines = 2,
                label = { Text(stringResource(R.string.label_notes)) },
            )
            Spacer(Modifier.height(8.dp))
            if (!isOnline) {
                Text(stringResource(R.string.hint_photo_required_online), color = MaterialTheme.colorScheme.error)
            }
        } else {
            OutlinedTextField(
                value = answer,
                onValueChange = onAnswerChange,
                modifier = Modifier.fillMaxWidth(),
                minLines = 5,
                label = { Text(stringResource(R.string.label_answer)) },
            )
        }

        if (!errorMessage.isNullOrBlank()) {
            Spacer(Modifier.height(8.dp))
            Text(errorMessage, color = MaterialTheme.colorScheme.error)
        }

        Spacer(Modifier.height(12.dp))
        Button(
            onClick = onSubmit,
            enabled = (!isPhotoMode || isOnline) && (!presenceRequired || presenceVerified),
        ) {
            Text(stringResource(R.string.action_submit))
        }
    }
}

@Composable
fun SubmissionResultScreen(
    submission: SubmissionResponse,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(Icons.Default.CheckCircle, contentDescription = null, modifier = Modifier.size(72.dp))
        Spacer(Modifier.height(12.dp))
        Text(stringResource(R.string.label_submission_status, submission.status), style = MaterialTheme.typography.titleLarge)
        val feedback = submission.feedback
        if (!feedback.isNullOrBlank()) {
            Spacer(Modifier.height(8.dp))
            Text(feedback)
        }
        Spacer(Modifier.height(16.dp))
        Button(onClick = onBack) {
            Text(stringResource(R.string.action_back_to_map))
        }
    }
}

@Composable
fun PlayerSettingsScreen(
    gameName: String?,
    gameStatus: String?,
    teamName: String?,
    teamColor: String?,
    displayName: String?,
    deviceId: String,
    pendingActionsCount: Int,
    progress: List<BaseProgress>,
    currentLanguage: String,
    onLanguageChanged: (String) -> Unit,
    isDeletingAccount: Boolean,
    onDeleteAccount: () -> Unit,
    onLogout: () -> Unit,
    errorMessage: String? = null,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    var showDeleteDialog by remember { mutableStateOf(false) }
    val completedCount = progress.count { it.baseStatus() == BaseStatus.COMPLETED }
    val checkedInCount = progress.count { it.baseStatus() == BaseStatus.CHECKED_IN }
    val pendingReviewCount = progress.count { it.baseStatus() == BaseStatus.SUBMITTED }
    val teamDotColor = parseTeamColor(teamColor)

    LazyColumn(
        modifier = modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        item {
            Text(
                stringResource(R.string.label_settings),
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
            )
        }

        // Language (first, matching iOS)
        item {
            SettingsSection(title = stringResource(R.string.label_language)) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("en" to "English", "pt" to "Portugues", "de" to "Deutsch").forEach { (code, label) ->
                        val isSelected = code == currentLanguage
                        if (isSelected) {
                            Button(onClick = {}) {
                                Text(label)
                            }
                        } else {
                            TextButton(onClick = { onLanguageChanged(code) }) {
                                Text(label)
                            }
                        }
                    }
                }
            }
        }

        // Current game
        item {
            SettingsSection(title = stringResource(R.string.label_current_game)) {
                SettingValueRow(label = stringResource(R.string.label_game), value = gameName ?: "-")
                SettingValueRow(label = stringResource(R.string.label_status), value = gameStatus?.replaceFirstChar { it.uppercase() } ?: "-")
            }
        }

        // Team
        item {
            SettingsSection(title = stringResource(R.string.label_your_team)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Text(stringResource(R.string.label_team))
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Box(
                            modifier = Modifier
                                .size(12.dp)
                                .clip(CircleShape)
                                .background(teamDotColor),
                        )
                        Text(teamName ?: "-", color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }

        // Profile
        item {
            SettingsSection(title = stringResource(R.string.label_your_profile)) {
                SettingValueRow(label = stringResource(R.string.label_name), value = displayName ?: "-")
            }
        }

        // Progress
        item {
            SettingsSection(title = stringResource(R.string.label_progress)) {
                SettingValueRow(label = stringResource(R.string.label_total_bases), value = progress.size.toString())
                SettingValueRow(label = stringResource(R.string.status_completed), value = completedCount.toString(), valueColor = StatusCompleted)
                SettingValueRow(label = stringResource(R.string.status_checked_in), value = checkedInCount.toString(), valueColor = StatusCheckedIn)
                SettingValueRow(label = stringResource(R.string.status_submitted), value = pendingReviewCount.toString(), valueColor = StatusSubmitted)
            }
        }

        // Device + pending
        item {
            SettingsSection(title = stringResource(R.string.label_device)) {
                SettingValueRow(label = stringResource(R.string.label_device_id), value = stringResource(R.string.label_device_id_short, deviceId.take(8)))
                SettingValueRow(label = stringResource(R.string.label_pending_actions), value = pendingActionsCount.toString())
            }
        }

        // Privacy
        item {
            SettingsSection(title = stringResource(R.string.label_privacy)) {
                TextButton(
                    onClick = {
                        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(PRIVACY_POLICY_URL)))
                    },
                ) {
                    Text(stringResource(R.string.action_open_privacy_policy))
                }
            }
        }

        // Error display
        if (!errorMessage.isNullOrBlank()) {
            item {
                Text(
                    errorMessage,
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodySmall,
                )
            }
        }

        // Account actions
        item {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                TextButton(onClick = onLogout, modifier = Modifier.fillMaxWidth()) {
                    Text(stringResource(R.string.action_leave_game))
                }
                TextButton(
                    onClick = { showDeleteDialog = true },
                    modifier = Modifier.fillMaxWidth(),
                    enabled = !isDeletingAccount,
                    colors = ButtonDefaults.textButtonColors(
                        contentColor = MaterialTheme.colorScheme.error,
                    ),
                ) {
                    Text(
                        if (isDeletingAccount) {
                            stringResource(R.string.label_deleting_account)
                        } else {
                            stringResource(R.string.action_delete_account)
                        },
                    )
                }
            }
        }

        item { Spacer(Modifier.height(16.dp)) }
    }

    if (showDeleteDialog) {
        AlertDialog(
            onDismissRequest = { showDeleteDialog = false },
            title = { Text(stringResource(R.string.dialog_delete_account_title)) },
            text = { Text(stringResource(R.string.dialog_delete_account_message)) },
            confirmButton = {
                TextButton(
                    onClick = {
                        showDeleteDialog = false
                        onDeleteAccount()
                    },
                ) {
                    Text(stringResource(R.string.dialog_delete_account_confirm))
                }
            },
            dismissButton = {
                TextButton(onClick = { showDeleteDialog = false }) {
                    Text(stringResource(android.R.string.cancel))
                }
            },
        )
    }
}

@Composable
private fun SettingsSection(
    title: String,
    content: @Composable () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(
                MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f),
                shape = MaterialTheme.shapes.medium,
            )
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Text(title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
        content()
    }
}

@Composable
private fun SettingValueRow(
    label: String,
    value: String,
    valueColor: Color = MaterialTheme.colorScheme.onSurfaceVariant,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label)
        Text(value, color = valueColor)
    }
}

private fun parseTeamColor(teamColor: String?): Color {
    if (teamColor.isNullOrBlank()) return Color.Gray
    return runCatching { Color(AndroidColor.parseColor(teamColor)) }.getOrDefault(Color.Gray)
}

@Composable
private fun LegendDot(color: Color, label: String) {
    Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(modifier = Modifier.size(8.dp).clip(CircleShape).background(color))
        Text(label, style = MaterialTheme.typography.labelSmall, color = Color.White)
    }
}

@Composable
private fun baseStatusLabel(status: BaseStatus): String {
    return when (status) {
        BaseStatus.NOT_VISITED -> stringResource(R.string.status_not_visited)
        BaseStatus.CHECKED_IN -> stringResource(R.string.status_checked_in)
        BaseStatus.SUBMITTED -> stringResource(R.string.status_submitted)
        BaseStatus.COMPLETED -> stringResource(R.string.status_completed)
        BaseStatus.REJECTED -> stringResource(R.string.status_rejected)
    }
}
