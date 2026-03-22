package com.prayer.pointfinder.feature.player

import android.graphics.Bitmap
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Cancel
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.PlayCircleFilled
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.prayer.pointfinder.core.i18n.R
import com.prayer.pointfinder.core.model.CheckInResponse
import com.prayer.pointfinder.core.model.SubmissionResponse
import com.prayer.pointfinder.core.model.SubmissionStatus

data class MediaItem(
    val uri: String,
    val thumbnail: Bitmap,
    val isVideo: Boolean,
    val contentType: String,
    val sizeBytes: Long,
    val fileName: String?,
)

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
            .verticalScroll(rememberScrollState())
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
            Column(modifier = Modifier.testTag("player-challenge-list")) {
                Text(challenge.title, style = MaterialTheme.typography.titleMedium)
                Spacer(Modifier.height(8.dp))
                Text(challenge.description)
                if (challenge.content.isNotBlank()) {
                    Spacer(Modifier.height(8.dp))
                    HtmlContentView(html = challenge.content)
                }
                Spacer(Modifier.height(12.dp))
                Button(onClick = { onSolve(response.baseId, challenge.id) }) {
                    Text(stringResource(R.string.action_solve_challenge))
                }
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
    mediaItems: List<MediaItem>,
    onPickMedia: () -> Unit,
    onCapturePhoto: () -> Unit,
    onRemoveMedia: (Int) -> Unit,
    onSubmit: () -> Unit,
    onBack: () -> Unit,
    isOnline: Boolean,
    isSubmitting: Boolean,
    errorMessage: String?,
    challengeTitle: String = "",
    challengeDescription: String = "",
    challengeContent: String = "",
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = onBack) { Text(stringResource(R.string.action_back)) }
            Spacer(Modifier.size(8.dp))
            Text(stringResource(R.string.action_solve_challenge), style = MaterialTheme.typography.titleLarge)
        }
        Spacer(Modifier.height(12.dp))

        if (challengeTitle.isNotBlank()) {
            Text(challengeTitle, style = MaterialTheme.typography.titleMedium)
            if (challengeDescription.isNotBlank()) {
                Spacer(Modifier.height(4.dp))
                Text(challengeDescription, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            if (challengeContent.isNotBlank()) {
                Spacer(Modifier.height(8.dp))
                HtmlContentView(html = challengeContent)
            }
            Spacer(Modifier.height(12.dp))
            HorizontalDivider()
            Spacer(Modifier.height(12.dp))
        }

        if (isPhotoMode) {
            Text(stringResource(R.string.label_photo_mode))
            Spacer(Modifier.height(8.dp))
            if (mediaItems.isNotEmpty()) {
                LazyRow(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    itemsIndexed(mediaItems) { index, item ->
                        Box(
                            modifier = Modifier
                                .size(120.dp)
                                .clip(MaterialTheme.shapes.medium),
                        ) {
                            Image(
                                bitmap = item.thumbnail.asImageBitmap(),
                                contentDescription = null,
                                modifier = Modifier.fillMaxSize(),
                                contentScale = ContentScale.Crop,
                            )
                            if (item.isVideo) {
                                Icon(
                                    Icons.Default.PlayCircleFilled,
                                    contentDescription = null,
                                    modifier = Modifier
                                        .size(36.dp)
                                        .align(Alignment.Center),
                                    tint = Color.White.copy(alpha = 0.85f),
                                )
                            }
                            IconButton(
                                onClick = { onRemoveMedia(index) },
                                modifier = Modifier
                                    .size(28.dp)
                                    .align(Alignment.TopEnd),
                            ) {
                                Icon(
                                    Icons.Default.Close,
                                    contentDescription = stringResource(R.string.action_remove),
                                    tint = Color.White,
                                    modifier = Modifier
                                        .size(20.dp)
                                        .background(
                                            Color.Black.copy(alpha = 0.5f),
                                            MaterialTheme.shapes.small,
                                        ),
                                )
                            }
                        }
                    }
                }
                Spacer(Modifier.height(4.dp))
                Text(
                    stringResource(R.string.label_media_selected, mediaItems.size),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(8.dp))
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(
                    onClick = onPickMedia,
                    enabled = mediaItems.size < 5,
                ) { Text(stringResource(R.string.action_choose_media)) }
                Button(
                    onClick = onCapturePhoto,
                    enabled = mediaItems.size < 5,
                ) { Text(stringResource(R.string.action_take_photo)) }
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
                Text(
                    stringResource(R.string.hint_media_offline_queue),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        } else {
            OutlinedTextField(
                value = answer,
                onValueChange = onAnswerChange,
                modifier = Modifier.fillMaxWidth().testTag("player-answer-input"),
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
            enabled = !isSubmitting && (!isPhotoMode || mediaItems.isNotEmpty()),
            modifier = Modifier.testTag("player-submit-btn"),
        ) {
            if (isSubmitting) {
                CircularProgressIndicator(
                    modifier = Modifier.size(18.dp),
                    strokeWidth = 2.dp,
                    color = MaterialTheme.colorScheme.onPrimary,
                )
            } else {
                Text(
                    stringResource(
                        if (presenceRequired) R.string.action_confirm_at_base else R.string.action_submit,
                    ),
                )
            }
        }
    }
}

@Composable
fun SubmissionResultScreen(
    submission: SubmissionResponse,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val isSuccess = submission.status == SubmissionStatus.CORRECT || submission.status == SubmissionStatus.APPROVED
    val isFailure = submission.status == SubmissionStatus.REJECTED

    val resultIcon = when {
        isSuccess -> Icons.Default.CheckCircle
        isFailure -> Icons.Default.Cancel
        else -> Icons.Default.Schedule
    }
    val resultColor = when {
        isSuccess -> StatusCompleted
        isFailure -> StatusRejected
        else -> StatusSubmitted
    }
    val resultTitle = when (submission.status) {
        SubmissionStatus.CORRECT -> stringResource(R.string.result_correct)
        SubmissionStatus.APPROVED -> stringResource(R.string.result_approved)
        SubmissionStatus.REJECTED -> stringResource(R.string.status_rejected)
        else -> stringResource(R.string.result_submitted)
    }
    val resultMessage = when (submission.status) {
        SubmissionStatus.CORRECT -> stringResource(R.string.result_correct_msg)
        SubmissionStatus.APPROVED -> stringResource(R.string.result_approved_msg)
        SubmissionStatus.REJECTED -> stringResource(R.string.result_rejected_msg)
        else -> stringResource(R.string.result_submitted_msg)
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Spacer(Modifier.height(32.dp))
        Icon(resultIcon, contentDescription = null, modifier = Modifier.size(72.dp), tint = resultColor)
        Spacer(Modifier.height(12.dp))
        Text(resultTitle, style = MaterialTheme.typography.titleLarge, modifier = Modifier.testTag("player-submission-status"))
        Spacer(Modifier.height(4.dp))
        Text(
            resultMessage,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
        val feedback = submission.feedback
        if (!feedback.isNullOrBlank()) {
            Spacer(Modifier.height(12.dp))
            Text(feedback, style = MaterialTheme.typography.bodyMedium)
        }
        // Only show completion content for correct/approved submissions
        if (isSuccess) {
            val completionContent = submission.completionContent
            if (!completionContent.isNullOrBlank()) {
                Spacer(Modifier.height(16.dp))
                HtmlContentView(
                    html = completionContent,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
        Spacer(Modifier.height(16.dp))
        Button(onClick = onBack) {
            Text(stringResource(R.string.action_back_to_map))
        }
    }
}
