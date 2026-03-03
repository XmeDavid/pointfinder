package com.prayer.pointfinder.feature.player

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Nfc
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.prayer.pointfinder.core.i18n.R
import com.prayer.pointfinder.core.model.PlayerNotificationResponse

@Composable
fun NfcScanDialog(
    onDismiss: () -> Unit,
    title: String? = null,
    message: String? = null,
) {
    val dialogTitle = title ?: stringResource(R.string.nfc_scan_dialog_title)
    val dialogMessage = message ?: stringResource(R.string.nfc_scan_dialog_message)
    val pulseTransition = rememberInfiniteTransition(label = "nfc-scan-pulse")
    val pulseScale by pulseTransition.animateFloat(
        initialValue = 1f,
        targetValue = 1.15f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1200),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "nfc-scan-scale",
    )

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text(
                dialogTitle,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth(),
            )
        },
        text = {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Spacer(Modifier.height(8.dp))
                Icon(
                    Icons.Default.Nfc,
                    contentDescription = null,
                    modifier = Modifier
                        .size(64.dp)
                        .graphicsLayer {
                            scaleX = pulseScale
                            scaleY = pulseScale
                        },
                    tint = MaterialTheme.colorScheme.primary,
                )
                Spacer(Modifier.height(16.dp))
                Text(
                    dialogMessage,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                )
                Spacer(Modifier.height(8.dp))
            }
        },
        confirmButton = {},
        dismissButton = {
            TextButton(onClick = onDismiss, modifier = Modifier.fillMaxWidth()) {
                Text(stringResource(R.string.action_cancel))
            }
        },
    )
}

@Composable
fun PlayerNotificationListScreen(
    notifications: List<PlayerNotificationResponse>,
    lastSeenAt: String?,
    isLoading: Boolean,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier.fillMaxSize()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 8.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            TextButton(onClick = onBack) { Text(stringResource(R.string.action_back)) }
            Spacer(Modifier.width(8.dp))
            Text(
                stringResource(R.string.label_notifications),
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
            )
        }

        if (isLoading) {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center,
            ) {
                CircularProgressIndicator()
            }
        } else if (notifications.isEmpty()) {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center,
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(
                        Icons.Default.Notifications,
                        contentDescription = null,
                        modifier = Modifier.size(48.dp),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f),
                    )
                    Spacer(Modifier.height(8.dp))
                    Text(
                        stringResource(R.string.label_no_notifications),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
            ) {
                items(notifications, key = { it.id }) { notification ->
                    val isUnseen = lastSeenAt == null || notification.sentAt > lastSeenAt
                    NotificationRow(notification = notification, isUnseen = isUnseen)
                    HorizontalDivider()
                }
            }
        }
    }
}

@Composable
private fun NotificationRow(
    notification: PlayerNotificationResponse,
    isUnseen: Boolean,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(
                if (isUnseen) MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.15f)
                else Color.Transparent,
            )
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.Top,
    ) {
        if (isUnseen) {
            Box(
                modifier = Modifier
                    .padding(top = 6.dp)
                    .size(8.dp)
                    .clip(CircleShape)
                    .background(MaterialTheme.colorScheme.primary),
            )
            Spacer(Modifier.width(12.dp))
        }
        Column(modifier = Modifier.weight(1f)) {
            Text(
                notification.message,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = if (isUnseen) FontWeight.SemiBold else FontWeight.Normal,
            )
            Spacer(Modifier.height(4.dp))
            Text(
                formatNotificationTime(notification.sentAt),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

private fun formatNotificationTime(isoTimestamp: String): String {
    return runCatching {
        val instant = java.time.Instant.parse(isoTimestamp)
        val now = java.time.Instant.now()
        val duration = java.time.Duration.between(instant, now)
        when {
            duration.toMinutes() < 1 -> "Just now"
            duration.toMinutes() < 60 -> "${duration.toMinutes()}m ago"
            duration.toHours() < 24 -> "${duration.toHours()}h ago"
            duration.toDays() < 7 -> "${duration.toDays()}d ago"
            else -> {
                val formatter = java.time.format.DateTimeFormatter
                    .ofPattern("MMM d")
                    .withZone(java.time.ZoneId.systemDefault())
                formatter.format(instant)
            }
        }
    }.getOrDefault(isoTimestamp)
}
