package com.prayer.pointfinder.feature.operator

import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Map
import androidx.compose.material.icons.filled.List
import androidx.compose.material.icons.filled.Settings
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Nfc
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.prayer.pointfinder.core.i18n.R
import androidx.compose.ui.draw.clip
import com.prayer.pointfinder.core.model.Assignment
import com.prayer.pointfinder.core.model.Base
import com.prayer.pointfinder.core.model.BaseStatus
import com.prayer.pointfinder.core.model.Challenge
import com.prayer.pointfinder.core.model.Game
import com.prayer.pointfinder.core.model.SubmissionResponse
import com.prayer.pointfinder.core.model.Team
import com.prayer.pointfinder.core.model.TeamBaseProgressResponse
import com.prayer.pointfinder.core.model.TeamLocationResponse
import androidx.compose.runtime.LaunchedEffect
import com.google.android.gms.maps.CameraUpdateFactory
import com.google.android.gms.maps.model.BitmapDescriptor
import com.google.android.gms.maps.model.BitmapDescriptorFactory
import com.google.android.gms.maps.model.LatLng
import com.google.android.gms.maps.model.LatLngBounds
import com.google.maps.android.compose.CameraPositionState
import com.google.maps.android.compose.GoogleMap
import com.google.maps.android.compose.Marker
import com.google.maps.android.compose.MarkerState
import coil.compose.AsyncImage
import coil.request.ImageRequest
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

enum class OperatorTab {
    LIVE_MAP,
    SUBMISSIONS,
    BASES,
    SETTINGS,
}

private const val PRIVACY_POLICY_URL = "https://pointfinder.pt/privacy/"

// Semantic color constants
private val StatusCheckedIn = Color(0xFF1565C0)
private val StatusCompleted = Color(0xFF2E7D32)
private val StatusSubmitted = Color(0xFFE08A00)
private val StarGold = Color(0xFFE08A00)
private val BadgePurple = Color(0xFF7B1FA2)
private val BadgeIndigo = Color(0xFF303F9F)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OperatorHomeScreen(
    games: List<Game>,
    onSelectGame: (Game) -> Unit,
    onLogout: () -> Unit,
    onRefresh: () -> Unit,
    isLoading: Boolean = false,
    errorMessage: String? = null,
    modifier: Modifier = Modifier,
) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.label_operator)) },
                actions = {
                    TextButton(onClick = onRefresh) { Text(stringResource(R.string.action_refresh)) }
                    TextButton(onClick = onLogout) { Text(stringResource(R.string.action_logout)) }
                },
            )
        },
    ) { padding ->
        PullToRefreshBox(
            isRefreshing = isLoading,
            onRefresh = onRefresh,
            modifier = modifier
                .fillMaxSize()
                .padding(padding),
        ) {
            when {
                isLoading && games.isEmpty() -> {
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center,
                    ) {
                        CircularProgressIndicator()
                    }
                }
                !errorMessage.isNullOrBlank() && games.isEmpty() -> {
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(24.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center,
                    ) {
                        Text(errorMessage, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium)
                        Spacer(Modifier.height(12.dp))
                        Button(onClick = onRefresh) { Text(stringResource(R.string.action_refresh)) }
                    }
                }
                games.isEmpty() -> {
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(24.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center,
                    ) {
                        Text(stringResource(R.string.label_no_games), style = MaterialTheme.typography.titleMedium)
                        Spacer(Modifier.height(8.dp))
                        Text(
                            stringResource(R.string.label_no_games_description),
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Spacer(Modifier.height(12.dp))
                        Button(onClick = onRefresh) { Text(stringResource(R.string.action_refresh)) }
                    }
                }
                else -> {
                    LazyColumn(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(12.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        items(games) { game ->
                            Surface(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable { onSelectGame(game) },
                                tonalElevation = 2.dp,
                                shape = MaterialTheme.shapes.medium,
                            ) {
                                Column(modifier = Modifier.padding(12.dp)) {
                                    Text(game.name, fontWeight = FontWeight.SemiBold)
                                    Spacer(Modifier.height(4.dp))
                                    Text(game.description, style = MaterialTheme.typography.bodySmall)
                                    Spacer(Modifier.height(6.dp))
                                    AssistChip(onClick = {}, label = { Text(game.status.uppercase()) })
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun OperatorGameScaffold(
    selectedTab: OperatorTab,
    showSubmissions: Boolean,
    onTabSelected: (OperatorTab) -> Unit,
    content: @Composable () -> Unit,
) {
    Scaffold(
        bottomBar = {
            NavigationBar {
                NavigationBarItem(
                    selected = selectedTab == OperatorTab.LIVE_MAP,
                    onClick = { onTabSelected(OperatorTab.LIVE_MAP) },
                    icon = { androidx.compose.material3.Icon(Icons.Default.Map, contentDescription = null) },
                    label = { Text(stringResource(R.string.label_live_map)) },
                )
                if (showSubmissions) {
                    NavigationBarItem(
                        selected = selectedTab == OperatorTab.SUBMISSIONS,
                        onClick = { onTabSelected(OperatorTab.SUBMISSIONS) },
                        icon = { androidx.compose.material3.Icon(Icons.Default.List, contentDescription = null) },
                        label = { Text(stringResource(R.string.label_submissions)) },
                    )
                }
                NavigationBarItem(
                    selected = selectedTab == OperatorTab.BASES,
                    onClick = { onTabSelected(OperatorTab.BASES) },
                    icon = { androidx.compose.material3.Icon(Icons.Default.LocationOn, contentDescription = stringResource(R.string.label_bases)) },
                    label = { Text(stringResource(R.string.label_bases)) },
                )
                NavigationBarItem(
                    selected = selectedTab == OperatorTab.SETTINGS,
                    onClick = { onTabSelected(OperatorTab.SETTINGS) },
                    icon = { androidx.compose.material3.Icon(Icons.Default.Settings, contentDescription = null) },
                    label = { Text(stringResource(R.string.label_settings)) },
                )
            }
        },
    ) { padding ->
        Box(modifier = Modifier.padding(padding)) { content() }
    }
}

@Composable
fun OperatorMapScreen(
    bases: List<Base>,
    teamLocations: List<TeamLocationResponse>,
    teams: List<Team>,
    baseProgress: List<TeamBaseProgressResponse>,
    cameraPositionState: CameraPositionState,
    onBaseSelected: (Base) -> Unit,
    onRefresh: () -> Unit,
    modifier: Modifier = Modifier,
) {
    LaunchedEffect(bases) {
        if (bases.isNotEmpty() && !cameraPositionState.isMoving) {
            val builder = LatLngBounds.builder()
            bases.forEach { builder.include(LatLng(it.lat, it.lng)) }
            runCatching {
                cameraPositionState.animate(CameraUpdateFactory.newLatLngBounds(builder.build(), 80))
            }
        }
    }

    Box(modifier = modifier.fillMaxSize()) {
        GoogleMap(modifier = Modifier.fillMaxSize(), cameraPositionState = cameraPositionState) {
            bases.forEach { base ->
                val aggregateStatus = aggregateBaseStatus(base, baseProgress)
                val markerIcon = statusToMarkerIcon(aggregateStatus)
                Marker(
                    state = MarkerState(LatLng(base.lat, base.lng)),
                    title = base.name,
                    snippet = stringResource(R.string.label_base_marker),
                    icon = markerIcon,
                    onClick = {
                        onBaseSelected(base)
                        true
                    },
                )
            }
            teamLocations.forEach { location ->
                val team = teams.firstOrNull { it.id == location.teamId }
                val playerName = location.displayName ?: team?.name ?: location.teamId.take(6)
                val teamName = team?.name ?: location.teamId.take(6)
                val teamColorInt = team?.color?.let { c ->
                    runCatching { android.graphics.Color.parseColor(c) }.getOrDefault(android.graphics.Color.GRAY)
                } ?: android.graphics.Color.GRAY
                Marker(
                    state = MarkerState(LatLng(location.lat, location.lng)),
                    title = "$playerName ($teamName)",
                    snippet = formatTimestamp(location.updatedAt),
                    icon = createCircleMarkerBitmap(teamColorInt),
                )
            }
        }
        Button(
            onClick = onRefresh,
            modifier = Modifier
                .align(Alignment.TopEnd)
                .padding(12.dp),
        ) {
            Text(stringResource(R.string.action_refresh))
        }
    }
}

private fun aggregateBaseStatus(
    base: Base,
    baseProgress: List<TeamBaseProgressResponse>,
): BaseStatus {
    val statuses = baseProgress.filter { it.baseId == base.id }
    if (statuses.isEmpty()) return BaseStatus.NOT_VISITED
    return statuses.mapNotNull { progress ->
        when (progress.status) {
            "not_visited" -> BaseStatus.NOT_VISITED
            "checked_in" -> BaseStatus.CHECKED_IN
            "submitted" -> BaseStatus.SUBMITTED
            "completed" -> BaseStatus.COMPLETED
            "rejected" -> BaseStatus.REJECTED
            else -> null
        }
    }.minByOrNull { it.ordinal } ?: BaseStatus.NOT_VISITED
}

private fun statusToMarkerIcon(status: BaseStatus): BitmapDescriptor {
    val colorInt = when (status) {
        BaseStatus.NOT_VISITED -> android.graphics.Color.GRAY
        BaseStatus.CHECKED_IN -> android.graphics.Color.parseColor("#1976D2") // blue
        BaseStatus.SUBMITTED -> android.graphics.Color.parseColor("#F57C00") // orange
        BaseStatus.COMPLETED -> android.graphics.Color.parseColor("#388E3C") // green
        BaseStatus.REJECTED -> android.graphics.Color.parseColor("#D32F2F") // red
    }
    return createPinMarkerBitmap(colorInt)
}

private fun createPinMarkerBitmap(colorInt: Int, width: Int = 48, height: Int = 64): BitmapDescriptor {
    val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = colorInt
        style = Paint.Style.FILL
    }
    // Draw teardrop: circle at top + triangle pointing down
    val circleRadius = width / 2f - 2f
    val circleCenterY = circleRadius + 2f
    canvas.drawCircle(width / 2f, circleCenterY, circleRadius, paint)
    val path = android.graphics.Path().apply {
        moveTo(width / 2f - circleRadius * 0.6f, circleCenterY + circleRadius * 0.7f)
        lineTo(width / 2f, height.toFloat() - 2f)
        lineTo(width / 2f + circleRadius * 0.6f, circleCenterY + circleRadius * 0.7f)
        close()
    }
    canvas.drawPath(path, paint)
    // White dot in center
    val dotPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = android.graphics.Color.WHITE
        style = Paint.Style.FILL
    }
    canvas.drawCircle(width / 2f, circleCenterY, circleRadius * 0.35f, dotPaint)
    return BitmapDescriptorFactory.fromBitmap(bitmap)
}

private fun createCircleMarkerBitmap(colorInt: Int, sizePx: Int = 48): BitmapDescriptor {
    val bitmap = Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = colorInt
        style = Paint.Style.FILL
    }
    canvas.drawCircle(sizePx / 2f, sizePx / 2f, sizePx / 2f - 3f, paint)
    val border = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = android.graphics.Color.WHITE
        style = Paint.Style.STROKE
        strokeWidth = 3f
    }
    canvas.drawCircle(sizePx / 2f, sizePx / 2f, sizePx / 2f - 3f, border)
    return BitmapDescriptorFactory.fromBitmap(bitmap)
}

private fun formatTimestamp(iso: String): String {
    return runCatching {
        val instant = Instant.parse(iso)
        val local = instant.atZone(ZoneId.systemDefault())
        DateTimeFormatter.ofPattern("HH:mm").format(local)
    }.getOrDefault(iso)
}

@Composable
fun OperatorSubmissionsScreen(
    submissions: List<SubmissionResponse>,
    teams: List<Team>,
    challenges: List<Challenge>,
    bases: List<Base>,
    isLoading: Boolean,
    onRefresh: () -> Unit,
    onReviewSubmission: (submissionId: String, status: String, feedback: String?) -> Unit,
    operatorAccessToken: String?,
    apiBaseUrl: String,
    modifier: Modifier = Modifier,
) {
    var showPendingOnly by rememberSaveable { mutableStateOf(true) }
    var selectedSubmission by remember { mutableStateOf<SubmissionResponse?>(null) }
    var feedback by rememberSaveable { mutableStateOf("") }

    val filteredSubmissions = submissions
        .asSequence()
        .filter { !showPendingOnly || it.status == "pending" }
        .sortedByDescending { parseSubmissionInstant(it.submittedAt) }
        .toList()

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            AssistChip(
                onClick = { showPendingOnly = true },
                label = { Text(stringResource(R.string.label_pending)) },
            )
            AssistChip(
                onClick = { showPendingOnly = false },
                label = { Text(stringResource(R.string.label_all)) },
            )
            Spacer(modifier = Modifier.weight(1f))
            TextButton(onClick = onRefresh) {
                Text(stringResource(R.string.action_refresh))
            }
        }

        when {
            isLoading && filteredSubmissions.isEmpty() -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            }
            filteredSubmissions.isEmpty() -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text(
                        if (showPendingOnly) {
                            stringResource(R.string.label_no_pending_submissions)
                        } else {
                            stringResource(R.string.label_no_submissions)
                        },
                    )
                }
            }
            else -> {
                LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(filteredSubmissions) { submission ->
                        val teamName = teams.firstOrNull { it.id == submission.teamId }?.name
                            ?: stringResource(R.string.label_unknown_team)
                        val challengeTitle = challenges.firstOrNull { it.id == submission.challengeId }?.title
                            ?: stringResource(R.string.label_unknown_challenge)
                        val baseName = bases.firstOrNull { it.id == submission.baseId }?.name
                            ?: stringResource(R.string.label_unknown_base)

                        Surface(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable {
                                    selectedSubmission = submission
                                    feedback = submission.feedback.orEmpty()
                                },
                            tonalElevation = 1.dp,
                            shape = MaterialTheme.shapes.medium,
                        ) {
                            Column(modifier = Modifier.padding(12.dp)) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Text(teamName, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                                    Spacer(Modifier.weight(1f))
                                    Text(
                                        statusLabel(submission.status),
                                        style = MaterialTheme.typography.labelSmall,
                                        color = statusColor(submission.status),
                                    )
                                }
                                Spacer(Modifier.height(4.dp))
                                Text(challengeTitle, style = MaterialTheme.typography.bodyMedium)
                                Text(baseName, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                Spacer(Modifier.height(2.dp))
                                Text(formatTimestamp(submission.submittedAt), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.outline)
                            }
                        }
                    }
                }
            }
        }
    }

    val reviewingSubmission = selectedSubmission
    if (reviewingSubmission != null) {
        val teamName = teams.firstOrNull { it.id == reviewingSubmission.teamId }?.name
            ?: stringResource(R.string.label_unknown_team)
        val challengeTitle = challenges.firstOrNull { it.id == reviewingSubmission.challengeId }?.title
            ?: stringResource(R.string.label_unknown_challenge)
        val baseName = bases.firstOrNull { it.id == reviewingSubmission.baseId }?.name
            ?: stringResource(R.string.label_unknown_base)

        androidx.compose.material3.AlertDialog(
            onDismissRequest = { selectedSubmission = null },
            title = { Text(stringResource(R.string.label_review_submission)) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("${stringResource(R.string.submissions_team_label)}: $teamName")
                    Text("${stringResource(R.string.submissions_challenge_label)}: $challengeTitle")
                    Text("${stringResource(R.string.submissions_base_label)}: $baseName")
                    if (reviewingSubmission.answer.isNotBlank()) {
                        Text("${stringResource(R.string.submissions_answer_label)}: ${reviewingSubmission.answer}")
                    }
                    reviewingSubmission.fileUrl
                        ?.takeIf { it.isNotBlank() }
                        ?.let { fileUrl ->
                            SubmissionPhotoPreview(
                                fileUrl = fileUrl,
                                apiBaseUrl = apiBaseUrl,
                                operatorAccessToken = operatorAccessToken,
                            )
                        }
                    OutlinedTextField(
                        value = feedback,
                        onValueChange = { feedback = it },
                        label = { Text(stringResource(R.string.submissions_feedback_label)) },
                        modifier = Modifier.fillMaxWidth(),
                        maxLines = 3,
                    )
                }
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        onReviewSubmission(reviewingSubmission.id, "approved", feedback.takeIf { it.isNotBlank() })
                        selectedSubmission = null
                    },
                ) {
                    Text(stringResource(R.string.action_approve))
                }
            },
            dismissButton = {
                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    TextButton(onClick = { selectedSubmission = null }) {
                        Text(stringResource(R.string.action_cancel))
                    }
                    TextButton(onClick = {
                        onReviewSubmission(reviewingSubmission.id, "rejected", feedback.takeIf { it.isNotBlank() })
                        selectedSubmission = null
                    }) {
                        Text(stringResource(R.string.action_reject), color = MaterialTheme.colorScheme.error)
                    }
                }
            },
        )
    }
}

@Composable
private fun SubmissionPhotoPreview(
    fileUrl: String,
    apiBaseUrl: String,
    operatorAccessToken: String?,
) {
    val resolvedUrl = remember(fileUrl, apiBaseUrl) {
        resolveSubmissionFileUrl(fileUrl, apiBaseUrl)
    } ?: return
    val context = LocalContext.current
    var loadFailed by remember(resolvedUrl, operatorAccessToken) { mutableStateOf(false) }

    val model = remember(resolvedUrl, operatorAccessToken, context) {
        ImageRequest.Builder(context)
            .data(resolvedUrl)
            .crossfade(true)
            .apply {
                if (!operatorAccessToken.isNullOrBlank()) {
                    addHeader("Authorization", "Bearer $operatorAccessToken")
                }
            }
            .build()
    }

    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        AsyncImage(
            model = model,
            contentDescription = stringResource(R.string.label_photo_mode),
            modifier = Modifier
                .fillMaxWidth()
                .height(220.dp)
                .clip(MaterialTheme.shapes.medium),
            contentScale = ContentScale.Crop,
            onSuccess = { loadFailed = false },
            onError = { loadFailed = true },
        )
        if (loadFailed) {
            Text(
                text = stringResource(R.string.error_generic),
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall,
            )
        }
    }
}

private fun resolveSubmissionFileUrl(fileUrl: String, apiBaseUrl: String): String? {
    val trimmed = fileUrl.trim()
    if (trimmed.isBlank()) return null
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed

    val normalizedBase = apiBaseUrl.trimEnd('/')
    val normalizedPath = if (trimmed.startsWith("/")) trimmed else "/$trimmed"
    return normalizedBase + normalizedPath
}

@Composable
private fun statusLabel(status: String): String {
    return when (status) {
        "pending" -> stringResource(R.string.status_pending)
        "approved" -> stringResource(R.string.status_approved)
        "rejected" -> stringResource(R.string.status_rejected)
        "correct" -> stringResource(R.string.status_correct)
        else -> status
    }
}

@Composable
private fun statusColor(status: String): Color {
    return when (status) {
        "pending" -> StatusSubmitted
        "approved", "correct" -> StatusCompleted
        "rejected" -> MaterialTheme.colorScheme.error
        else -> MaterialTheme.colorScheme.onSurfaceVariant
    }
}

private fun parseSubmissionInstant(value: String): Instant {
    return runCatching { Instant.parse(value) }.getOrElse { Instant.EPOCH }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LiveBaseProgressBottomSheet(
    base: Base,
    progress: List<TeamBaseProgressResponse>,
    teams: List<Team>,
    onWriteNfc: () -> Unit,
    writeStatus: String?,
    writeSuccess: Boolean?,
    onDismiss: () -> Unit,
) {
    val grouped = progress.filter { it.baseId == base.id }
    val completedCount = grouped.count { it.status == "completed" }
    val checkedInCount = grouped.count { it.status == "checked_in" }
    val pendingCount = grouped.count { it.status == "submitted" }
    val remainingCount = grouped.size - completedCount - checkedInCount - pendingCount

    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(base.name, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            if (base.description.isNotBlank()) {
                Spacer(Modifier.height(4.dp))
                Text(base.description, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Spacer(Modifier.height(12.dp))

            Button(
                onClick = onWriteNfc,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Icon(Icons.Default.Nfc, contentDescription = null)
                Spacer(Modifier.size(8.dp))
                Text(stringResource(R.string.action_write_nfc))
            }
            if (!writeStatus.isNullOrBlank()) {
                val statusColor = when (writeSuccess) {
                    true -> StatusCompleted
                    false -> MaterialTheme.colorScheme.error
                    null -> MaterialTheme.colorScheme.onSurfaceVariant
                }
                Spacer(Modifier.height(8.dp))
                Text(
                    text = writeStatus,
                    style = MaterialTheme.typography.bodySmall,
                    color = statusColor,
                )
            }
            Spacer(Modifier.height(12.dp))

            // Stat badges row
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                StatBadge(count = completedCount, label = stringResource(R.string.status_completed), color = StatusCompleted, modifier = Modifier.weight(1f))
                StatBadge(count = pendingCount, label = stringResource(R.string.status_submitted), color = StatusSubmitted, modifier = Modifier.weight(1f))
                StatBadge(count = checkedInCount, label = stringResource(R.string.status_checked_in), color = StatusCheckedIn, modifier = Modifier.weight(1f))
                StatBadge(count = remainingCount, label = stringResource(R.string.label_remaining), color = Color.Gray, modifier = Modifier.weight(1f))
            }
            Spacer(Modifier.height(16.dp))

            // Team rows
            grouped.forEach { item ->
                val team = teams.firstOrNull { it.id == item.teamId }
                val teamColor = team?.color?.let { c -> runCatching { Color(android.graphics.Color.parseColor(c)) }.getOrDefault(Color.Gray) } ?: Color.Gray
                val teamName = team?.name ?: item.teamId.take(8)
                val statusColor = when (item.status) {
                    "completed" -> StatusCompleted
                    "checked_in" -> StatusCheckedIn
                    "submitted" -> StatusSubmitted
                    else -> Color.Gray
                }
                val statusLabel = when (item.status) {
                    "completed" -> stringResource(R.string.status_completed)
                    "checked_in" -> stringResource(R.string.status_checked_in)
                    "submitted" -> stringResource(R.string.status_submitted)
                    "rejected" -> stringResource(R.string.status_rejected)
                    else -> stringResource(R.string.status_not_visited)
                }
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Box(modifier = Modifier.size(10.dp).clip(CircleShape).background(teamColor))
                        Text(teamName, style = MaterialTheme.typography.bodyMedium)
                    }
                    Text(
                        text = statusLabel,
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Medium,
                        color = statusColor,
                        modifier = Modifier
                            .background(statusColor.copy(alpha = 0.12f), shape = MaterialTheme.shapes.small)
                            .padding(horizontal = 8.dp, vertical = 4.dp),
                    )
                }
            }
            Spacer(Modifier.height(16.dp))
        }
    }
}

@Composable
private fun StatBadge(count: Int, label: String, color: Color, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .background(color.copy(alpha = 0.1f), shape = MaterialTheme.shapes.small)
            .padding(vertical = 8.dp, horizontal = 4.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(count.toString(), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = color)
        Text(label, style = MaterialTheme.typography.labelSmall, color = color, maxLines = 1)
    }
}

@Composable
fun OperatorBasesScreen(
    bases: List<Base>,
    onSelectBase: (Base) -> Unit,
    modifier: Modifier = Modifier,
) {
    LazyColumn(
        modifier = modifier
            .fillMaxSize()
            .padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        items(bases) { base ->
            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { onSelectBase(base) },
                tonalElevation = 1.dp,
                shape = MaterialTheme.shapes.medium,
            ) {
                Column(modifier = Modifier.padding(12.dp)) {
                    Text(base.name, fontWeight = FontWeight.SemiBold)
                    Spacer(Modifier.height(4.dp))
                    Text("${base.lat}, ${base.lng}", style = MaterialTheme.typography.bodySmall)
                    Spacer(Modifier.height(4.dp))
                    Text(
                        if (base.nfcLinked) {
                            stringResource(R.string.label_nfc_linked)
                        } else {
                            stringResource(R.string.label_nfc_not_linked)
                        },
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OperatorBaseDetailScreen(
    base: Base,
    challenges: List<Challenge>,
    assignments: List<Assignment>,
    teams: List<Team>,
    writeStatus: String?,
    writeSuccess: Boolean?,
    onBack: () -> Unit,
    onWriteNfc: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val baseAssignments = assignments.filter { it.baseId == base.id }
    val fixedChallenge = base.fixedChallengeId?.let { fid -> challenges.firstOrNull { it.id == fid } }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(base.name) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = stringResource(R.string.action_back))
                    }
                },
            )
        },
    ) { padding ->
        LazyColumn(
            modifier = modifier.fillMaxSize().padding(padding).padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            // Base info section
            item {
                Text(base.description, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    // NFC badge
                    val nfcColor = if (base.nfcLinked) StatusCompleted else StatusSubmitted
                    val nfcLabel = if (base.nfcLinked) stringResource(R.string.label_nfc_linked) else stringResource(R.string.label_nfc_not_linked)
                    CapsuleBadge(label = nfcLabel, color = nfcColor)
                    // Presence badge
                    if (base.requirePresenceToSubmit) {
                        CapsuleBadge(label = stringResource(R.string.label_presence_required), color = StatusCheckedIn)
                    }
                }
            }

            // NFC section
            item {
                SectionCard {
                    Text(stringResource(R.string.action_write_nfc), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    Spacer(Modifier.height(8.dp))
                    Button(
                        onClick = onWriteNfc,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Icon(Icons.Default.Nfc, contentDescription = null)
                        Spacer(Modifier.size(8.dp))
                        Text(stringResource(R.string.action_write_nfc))
                    }
                    if (!writeStatus.isNullOrBlank()) {
                        Spacer(Modifier.height(8.dp))
                        Text(
                            writeStatus,
                            color = if (writeSuccess == true) StatusCompleted else MaterialTheme.colorScheme.error,
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                }
            }

            // Challenge assignment section
            item {
                SectionCard {
                    Text(stringResource(R.string.label_challenge_assignment), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    Spacer(Modifier.height(8.dp))
                    if (fixedChallenge != null) {
                        CapsuleBadge(label = stringResource(R.string.label_fixed_challenge), color = BadgePurple)
                        Spacer(Modifier.height(8.dp))
                        ChallengeCard(challenge = fixedChallenge)
                    } else if (baseAssignments.isEmpty()) {
                        Text(stringResource(R.string.label_random_not_started), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    } else {
                        CapsuleBadge(label = stringResource(R.string.label_randomly_assigned), color = BadgeIndigo)
                        Spacer(Modifier.height(8.dp))
                        baseAssignments.forEach { assignment ->
                            val team = teams.firstOrNull { it.id == assignment.teamId }
                            val challenge = challenges.firstOrNull { it.id == assignment.challengeId }
                            if (team != null && challenge != null) {
                                TeamAssignmentRow(team = team, challenge = challenge)
                                Spacer(Modifier.height(6.dp))
                            }
                        }
                    }
                }
            }

            item { Spacer(Modifier.height(16.dp)) }
        }
    }
}

@Composable
private fun CapsuleBadge(label: String, color: Color) {
    Text(
        text = label,
        style = MaterialTheme.typography.labelSmall,
        fontWeight = FontWeight.Medium,
        color = color,
        modifier = Modifier
            .background(color.copy(alpha = 0.15f), shape = MaterialTheme.shapes.small)
            .padding(horizontal = 10.dp, vertical = 5.dp),
    )
}

@Composable
private fun SectionCard(content: @Composable ColumnScope.() -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f), shape = MaterialTheme.shapes.medium)
            .padding(14.dp),
        content = content,
    )
}

@Composable
private fun ChallengeCard(challenge: Challenge) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surface, shape = MaterialTheme.shapes.medium)
            .padding(12.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
            Text(challenge.title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                Icon(Icons.Default.Star, contentDescription = null, tint = StarGold, modifier = Modifier.size(14.dp))
                Text("${challenge.points} pts", style = MaterialTheme.typography.labelSmall, color = StarGold)
            }
        }
        Spacer(Modifier.height(4.dp))
        Text(challenge.description, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 3)
        Spacer(Modifier.height(4.dp))
        Text("Answer: ${challenge.answerType}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.outline)
    }
}

@Composable
private fun TeamAssignmentRow(team: Team, challenge: Challenge) {
    val teamColor = runCatching { Color(android.graphics.Color.parseColor(team.color)) }.getOrDefault(Color.Gray)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surface, shape = MaterialTheme.shapes.small)
            .padding(10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Box(modifier = Modifier.size(12.dp).clip(CircleShape).background(teamColor))
        Column(modifier = Modifier.weight(1f)) {
            Text(team.name, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
            Text(challenge.title, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(2.dp)) {
            Icon(Icons.Default.Star, contentDescription = null, tint = StarGold, modifier = Modifier.size(12.dp))
            Text("${challenge.points}", style = MaterialTheme.typography.labelSmall, color = StarGold)
        }
    }
}

@Composable
fun OperatorSettingsScreen(
    gameName: String?,
    gameStatus: String?,
    currentLanguage: String,
    notificationSettings: com.prayer.pointfinder.core.model.OperatorNotificationSettingsResponse?,
    isLoadingNotificationSettings: Boolean,
    isSavingNotificationSettings: Boolean,
    onLanguageChanged: (String) -> Unit,
    onNotificationSettingsChanged: (notifyPendingSubmissions: Boolean, notifyAllSubmissions: Boolean, notifyCheckIns: Boolean) -> Unit,
    onSwitchGame: () -> Unit,
    onLogout: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val notifyPendingSubmissions = notificationSettings?.notifyPendingSubmissions ?: true
    val notifyAllSubmissions = notificationSettings?.notifyAllSubmissions ?: false
    val notifyCheckIns = notificationSettings?.notifyCheckIns ?: false
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

        // Language section
        item {
            OperatorSettingsSection(title = stringResource(R.string.label_language)) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("en" to "English", "pt" to "Portugues", "de" to "Deutsch").forEach { (code, label) ->
                        val isSelected = code == currentLanguage
                        if (isSelected) {
                            Button(onClick = {}) { Text(label) }
                        } else {
                            TextButton(onClick = { onLanguageChanged(code) }) { Text(label) }
                        }
                    }
                }
            }
        }

        // Game info section
        item {
            OperatorSettingsSection(title = stringResource(R.string.label_current_game)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Text(stringResource(R.string.label_game))
                    Text(gameName ?: "-", color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Text(stringResource(R.string.label_status))
                    Text(
                        gameStatus?.replaceFirstChar { it.uppercase() } ?: "-",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }

        // Privacy section
        item {
            OperatorSettingsSection(title = stringResource(R.string.label_privacy)) {
                TextButton(
                    onClick = {
                        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(PRIVACY_POLICY_URL)))
                    },
                ) {
                    Text(stringResource(R.string.action_open_privacy_policy))
                }
            }
        }

        // Notification settings section
        item {
            OperatorSettingsSection(title = stringResource(R.string.label_notification_settings)) {
                if (isLoadingNotificationSettings && notificationSettings == null) {
                    CircularProgressIndicator(modifier = Modifier.size(20.dp))
                } else {
                    SettingToggleRow(
                        label = stringResource(R.string.label_notify_pending_submissions),
                        checked = notifyPendingSubmissions,
                        enabled = !isSavingNotificationSettings,
                    ) { enabled ->
                        onNotificationSettingsChanged(
                            enabled,
                            notifyAllSubmissions,
                            notifyCheckIns,
                        )
                    }
                    SettingToggleRow(
                        label = stringResource(R.string.label_notify_all_submissions),
                        checked = notifyAllSubmissions,
                        enabled = !isSavingNotificationSettings,
                    ) { enabled ->
                        onNotificationSettingsChanged(
                            notifyPendingSubmissions,
                            enabled,
                            notifyCheckIns,
                        )
                    }
                    SettingToggleRow(
                        label = stringResource(R.string.label_notify_check_ins),
                        checked = notifyCheckIns,
                        enabled = !isSavingNotificationSettings,
                    ) { enabled ->
                        onNotificationSettingsChanged(
                            notifyPendingSubmissions,
                            notifyAllSubmissions,
                            enabled,
                        )
                    }
                    if (isSavingNotificationSettings) {
                        Text(
                            text = stringResource(R.string.common_saving),
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }

        // Actions section
        item {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                androidx.compose.material3.OutlinedButton(
                    onClick = onSwitchGame,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Icon(Icons.Default.ArrowBack, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.size(8.dp))
                    Text(stringResource(R.string.action_switch_game))
                }
                TextButton(
                    onClick = onLogout,
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.textButtonColors(
                        contentColor = MaterialTheme.colorScheme.error,
                    ),
                ) {
                    Text(stringResource(R.string.action_logout))
                }
            }
        }

        item { Spacer(Modifier.height(16.dp)) }
    }
}

@Composable
private fun SettingToggleRow(
    label: String,
    checked: Boolean,
    enabled: Boolean,
    onCheckedChange: (Boolean) -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.weight(1f),
        )
        Switch(
            checked = checked,
            onCheckedChange = onCheckedChange,
            enabled = enabled,
        )
    }
}

@Composable
private fun OperatorSettingsSection(
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
