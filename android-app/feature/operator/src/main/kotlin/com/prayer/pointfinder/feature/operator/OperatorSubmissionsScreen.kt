package com.prayer.pointfinder.feature.operator

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.PlayCircle
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Badge
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.prayer.pointfinder.core.i18n.R
import com.prayer.pointfinder.core.model.Base
import com.prayer.pointfinder.core.model.Challenge
import com.prayer.pointfinder.core.model.SubmissionResponse
import com.prayer.pointfinder.core.model.SubmissionStatus
import com.prayer.pointfinder.core.model.Team
import coil.compose.AsyncImage
import coil.request.ImageRequest
import java.time.Instant

private fun getMediaUrls(sub: SubmissionResponse): List<String> {
    val urls = sub.fileUrls?.takeIf { it.isNotEmpty() }
    if (urls != null) return urls
    val single = sub.fileUrl?.takeIf { it.isNotBlank() }
    return if (single != null) listOf(single) else emptyList()
}

private fun isVideoUrl(url: String): Boolean {
    val path = url.substringBefore("?").lowercase()
    return path.endsWith(".mp4") || path.endsWith(".mov") || path.endsWith(".webm")
}

@Composable
fun OperatorSubmissionsScreen(
    submissions: List<SubmissionResponse>,
    teams: List<Team>,
    challenges: List<Challenge>,
    bases: List<Base>,
    isLoading: Boolean,
    onRefresh: () -> Unit,
    onReviewSubmission: (submissionId: String, status: SubmissionStatus, feedback: String?, points: Int?) -> Unit,
    operatorAccessToken: String?,
    apiBaseUrl: String,
    modifier: Modifier = Modifier,
) {
    var showPendingOnly by rememberSaveable { mutableStateOf(true) }
    var selectedSubmission by remember { mutableStateOf<SubmissionResponse?>(null) }
    var feedback by rememberSaveable { mutableStateOf("") }
    var pointsText by rememberSaveable { mutableStateOf("") }
    // Pending override confirmation: Pair(submissionId, newStatus)
    var pendingOverride by remember { mutableStateOf<Pair<String, SubmissionStatus>?>(null) }

    val filteredSubmissions = submissions
        .asSequence()
        .filter { !showPendingOnly || it.status == SubmissionStatus.PENDING }
        .sortedByDescending { parseSubmissionInstant(it.submittedAt) }
        .toList()

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FilterChip(
                selected = showPendingOnly,
                onClick = { showPendingOnly = true },
                label = { Text(stringResource(R.string.label_pending)) },
            )
            FilterChip(
                selected = !showPendingOnly,
                onClick = { showPendingOnly = false },
                label = { Text(stringResource(R.string.label_all)) },
            )
            Spacer(modifier = Modifier.weight(1f))
            IconButton(onClick = onRefresh) {
                Icon(Icons.Default.Refresh, contentDescription = stringResource(R.string.action_refresh))
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
                LazyColumn(modifier = Modifier.testTag("submission-list"), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(filteredSubmissions, key = { it.id }) { submission ->
                        val teamName = teams.firstOrNull { it.id == submission.teamId }?.name
                            ?: stringResource(R.string.label_unknown_team)
                        val challengeTitle = challenges.firstOrNull { it.id == submission.challengeId }?.title
                            ?: stringResource(R.string.label_unknown_challenge)
                        val baseName = bases.firstOrNull { it.id == submission.baseId }?.name
                            ?: stringResource(R.string.label_unknown_base)
                        val mediaUrls = getMediaUrls(submission)

                        Surface(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable {
                                    selectedSubmission = submission
                                    feedback = submission.feedback.orEmpty()
                                    val defaultPts = submission.points
                                        ?: challenges.firstOrNull { it.id == submission.challengeId }?.points
                                        ?: 0
                                    pointsText = defaultPts.toString()
                                },
                            tonalElevation = 1.dp,
                            shape = MaterialTheme.shapes.medium,
                        ) {
                            Column(modifier = Modifier.padding(12.dp)) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Text(teamName, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                                    Spacer(Modifier.weight(1f))
                                    if (mediaUrls.size > 1) {
                                        Badge(
                                            modifier = Modifier.padding(end = 6.dp),
                                            containerColor = MaterialTheme.colorScheme.secondaryContainer,
                                            contentColor = MaterialTheme.colorScheme.onSecondaryContainer,
                                        ) {
                                            Text(
                                                "\uD83D\uDCF7 ${mediaUrls.size}",
                                                style = MaterialTheme.typography.labelSmall,
                                            )
                                        }
                                    }
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
        val expectedChallengePoints = challenges.firstOrNull { it.id == reviewingSubmission.challengeId }?.points
        val mediaUrls = getMediaUrls(reviewingSubmission)

        androidx.compose.material3.AlertDialog(
            onDismissRequest = { selectedSubmission = null },
            title = { Text(stringResource(R.string.label_review_submission)) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("${stringResource(R.string.label_team)}: $teamName")
                    Text("${stringResource(R.string.submissions_challenge_label)}: $challengeTitle")
                    Text("${stringResource(R.string.submissions_base_label)}: $baseName")
                    if (reviewingSubmission.answer.isNotBlank()) {
                        Text("${stringResource(R.string.label_answer)}: ${reviewingSubmission.answer}")
                    }
                    if (mediaUrls.isNotEmpty()) {
                        SubmissionMediaGallery(
                            mediaUrls = mediaUrls,
                            apiBaseUrl = apiBaseUrl,
                            operatorAccessToken = operatorAccessToken,
                        )
                    }
                    OutlinedTextField(
                        value = pointsText,
                        onValueChange = { pointsText = it.filter { c -> c.isDigit() } },
                        label = {
                            Text(
                                expectedChallengePoints?.let {
                                    stringResource(R.string.submissions_points_label_with_expected, it)
                                } ?: stringResource(R.string.label_challenge_points)
                            )
                        },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                        keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = androidx.compose.ui.text.input.KeyboardType.Number),
                    )
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
                        if (reviewingSubmission.status != SubmissionStatus.PENDING) {
                            pendingOverride = Pair(reviewingSubmission.id, SubmissionStatus.APPROVED)
                        } else {
                            onReviewSubmission(reviewingSubmission.id, SubmissionStatus.APPROVED, feedback.takeIf { it.isNotBlank() }, pointsText.toIntOrNull())
                            selectedSubmission = null
                        }
                    },
                    modifier = Modifier.testTag("submission-approve-btn"),
                ) {
                    Text(stringResource(R.string.action_approve))
                }
            },
            dismissButton = {
                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    TextButton(onClick = { selectedSubmission = null }) {
                        Text(stringResource(R.string.action_cancel))
                    }
                    TextButton(
                        onClick = {
                            if (reviewingSubmission.status != SubmissionStatus.PENDING) {
                                pendingOverride = Pair(reviewingSubmission.id, SubmissionStatus.REJECTED)
                            } else {
                                onReviewSubmission(reviewingSubmission.id, SubmissionStatus.REJECTED, feedback.takeIf { it.isNotBlank() }, null)
                                selectedSubmission = null
                            }
                        },
                        modifier = Modifier.testTag("submission-reject-btn"),
                    ) {
                        Text(stringResource(R.string.action_reject), color = MaterialTheme.colorScheme.error)
                    }
                }
            },
        )
    }

    val override = pendingOverride
    val overrideSubmission = selectedSubmission
    if (override != null && overrideSubmission != null) {
        val currentStatusLabel = statusLabel(overrideSubmission.status)
        val newStatusLabel = if (override.second == SubmissionStatus.APPROVED) {
            stringResource(R.string.status_approved)
        } else {
            stringResource(R.string.status_rejected)
        }
        androidx.compose.material3.AlertDialog(
            onDismissRequest = { pendingOverride = null },
            title = { Text(stringResource(R.string.label_override_review_title)) },
            text = {
                Text(stringResource(R.string.label_override_review_message, currentStatusLabel, newStatusLabel))
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        val pts = if (override.second == SubmissionStatus.APPROVED) pointsText.toIntOrNull() else null
                        onReviewSubmission(override.first, override.second, feedback.takeIf { it.isNotBlank() }, pts)
                        pendingOverride = null
                        selectedSubmission = null
                    },
                ) {
                    Text(stringResource(R.string.action_confirm))
                }
            },
            dismissButton = {
                TextButton(onClick = { pendingOverride = null }) {
                    Text(stringResource(R.string.action_cancel))
                }
            },
        )
    }
}

@Composable
private fun SubmissionMediaGallery(
    mediaUrls: List<String>,
    apiBaseUrl: String,
    operatorAccessToken: String?,
) {
    var fullscreenIndex by remember { mutableIntStateOf(-1) }

    if (mediaUrls.size == 1) {
        Box(modifier = Modifier.clickable { fullscreenIndex = 0 }) {
            SubmissionMediaItem(
                fileUrl = mediaUrls[0],
                apiBaseUrl = apiBaseUrl,
                operatorAccessToken = operatorAccessToken,
            )
        }
    } else {
        val pagerState = rememberPagerState(pageCount = { mediaUrls.size })
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            HorizontalPager(
                state = pagerState,
                modifier = Modifier.fillMaxWidth(),
            ) { page ->
                Box(modifier = Modifier.clickable { fullscreenIndex = page }) {
                    SubmissionMediaItem(
                        fileUrl = mediaUrls[page],
                        apiBaseUrl = apiBaseUrl,
                        operatorAccessToken = operatorAccessToken,
                    )
                }
            }
            Text(
                text = "${pagerState.currentPage + 1} / ${mediaUrls.size}",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.align(Alignment.CenterHorizontally),
            )
        }
    }

    if (fullscreenIndex >= 0) {
        FullscreenMediaViewer(
            mediaUrls = mediaUrls,
            startIndex = fullscreenIndex,
            apiBaseUrl = apiBaseUrl,
            operatorAccessToken = operatorAccessToken,
            onDismiss = { fullscreenIndex = -1 },
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun FullscreenMediaViewer(
    mediaUrls: List<String>,
    startIndex: Int,
    apiBaseUrl: String,
    operatorAccessToken: String?,
    onDismiss: () -> Unit,
) {
    val pagerState = rememberPagerState(initialPage = startIndex, pageCount = { mediaUrls.size })

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false),
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color.Black),
        ) {
            HorizontalPager(
                state = pagerState,
                modifier = Modifier.fillMaxSize(),
            ) { page ->
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center,
                ) {
                    SubmissionMediaItem(
                        fileUrl = mediaUrls[page],
                        apiBaseUrl = apiBaseUrl,
                        operatorAccessToken = operatorAccessToken,
                    )
                }
            }

            // Close button
            IconButton(
                onClick = onDismiss,
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(16.dp),
            ) {
                Icon(
                    Icons.Default.Close,
                    contentDescription = stringResource(R.string.action_cancel),
                    tint = Color.White,
                )
            }

            // Counter
            if (mediaUrls.size > 1) {
                Text(
                    text = "${pagerState.currentPage + 1} / ${mediaUrls.size}",
                    color = Color.White.copy(alpha = 0.7f),
                    style = MaterialTheme.typography.labelMedium,
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .padding(bottom = 40.dp),
                )
            }
        }
    }
}

@Composable
private fun SubmissionMediaItem(
    fileUrl: String,
    apiBaseUrl: String,
    operatorAccessToken: String?,
) {
    val resolvedUrl = remember(fileUrl, apiBaseUrl) {
        resolveSubmissionFileUrl(fileUrl, apiBaseUrl)
    } ?: return

    if (isVideoUrl(resolvedUrl)) {
        SubmissionVideoPreview(resolvedUrl = resolvedUrl)
    } else {
        SubmissionPhotoPreview(
            resolvedUrl = resolvedUrl,
            operatorAccessToken = operatorAccessToken,
        )
    }
}

@Composable
private fun SubmissionPhotoPreview(
    resolvedUrl: String,
    operatorAccessToken: String?,
) {
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

@Composable
private fun SubmissionVideoPreview(resolvedUrl: String) {
    val context = LocalContext.current
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(220.dp)
            .clip(MaterialTheme.shapes.medium)
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .clickable {
                val intent = Intent(Intent.ACTION_VIEW, Uri.parse(resolvedUrl)).apply {
                    setDataAndType(Uri.parse(resolvedUrl), "video/*")
                }
                context.startActivity(intent)
            },
        contentAlignment = Alignment.Center,
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Icon(
                imageVector = Icons.Default.PlayCircle,
                contentDescription = null,
                modifier = Modifier.size(48.dp),
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                text = "Video",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
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
private fun statusLabel(status: SubmissionStatus): String {
    return when (status) {
        SubmissionStatus.PENDING -> stringResource(R.string.label_pending)
        SubmissionStatus.APPROVED -> stringResource(R.string.status_approved)
        SubmissionStatus.REJECTED -> stringResource(R.string.status_rejected)
        SubmissionStatus.CORRECT -> stringResource(R.string.status_correct)
    }
}

@Composable
private fun statusColor(status: SubmissionStatus): Color {
    return when (status) {
        SubmissionStatus.PENDING -> StatusSubmitted
        SubmissionStatus.APPROVED, SubmissionStatus.CORRECT -> StatusCompleted
        SubmissionStatus.REJECTED -> MaterialTheme.colorScheme.error
    }
}

private fun parseSubmissionInstant(value: String): Instant {
    return runCatching { Instant.parse(value) }.getOrElse { Instant.EPOCH }
}
