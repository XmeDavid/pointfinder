package com.prayer.pointfinder.feature.player

import android.graphics.Color as AndroidColor
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Map
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.TextFields
import androidx.compose.material.icons.filled.WifiOff
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.prayer.pointfinder.core.i18n.R
import com.prayer.pointfinder.core.model.PRIVACY_POLICY_URL
import com.prayer.pointfinder.core.model.BaseStatus

data class PendingActionUiItem(
    val id: String,
    val type: String,
    val uploadSessionId: String? = null,
    val uploadChunkIndex: Int? = null,
    val uploadTotalChunks: Int? = null,
)

enum class PlayerTab {
    MAP,
    CHECK_IN,
    SETTINGS,
}

// Semantic color constants for status, accents, and indicators
internal val StatusCheckedIn = Color(0xFF1565C0)
internal val StatusCompleted = Color(0xFF2E7D32)
internal val StatusSubmitted = Color(0xFFE08A00)
internal val StatusRejected = Color(0xFFD32F2F)
internal val StarGold = Color(0xFFE08A00)
internal val OfflineOrange = Color(0xFFE08A00)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PlayerHomeScaffold(
    selectedTab: PlayerTab,
    onTabSelected: (PlayerTab) -> Unit,
    isOffline: Boolean,
    pendingActionsCount: Int = 0,
    onLoadPendingActions: (suspend () -> List<PendingActionUiItem>)? = null,
    content: @Composable () -> Unit,
) {
    var showQueueSheet by remember { mutableStateOf(false) }
    var queueItems by remember { mutableStateOf<List<PendingActionUiItem>>(emptyList()) }
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    // Auto-dismiss sheet when queue empties
    LaunchedEffect(pendingActionsCount) {
        if (pendingActionsCount == 0) {
            showQueueSheet = false
        }
    }

    if (showQueueSheet && onLoadPendingActions != null) {
        LaunchedEffect(showQueueSheet, pendingActionsCount) {
            queueItems = onLoadPendingActions()
        }
        ModalBottomSheet(
            onDismissRequest = { showQueueSheet = false },
            sheetState = sheetState,
        ) {
            SyncQueueSheet(
                items = queueItems,
                isOffline = isOffline,
            )
        }
    }

    Scaffold(
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

            // Floating sync status pill centered at the top
            AnimatedVisibility(
                visible = pendingActionsCount > 0,
                enter = fadeIn(),
                exit = fadeOut(),
                modifier = Modifier
                    .align(Alignment.TopCenter)
                    .padding(top = 12.dp),
            ) {
                SyncStatusPill(
                    isOffline = isOffline,
                    pendingActionsCount = pendingActionsCount,
                    onClick = { showQueueSheet = true },
                )
            }
        }
    }
}

@Composable
private fun SyncStatusPill(
    isOffline: Boolean,
    pendingActionsCount: Int,
    onClick: () -> Unit,
) {
    val pillColor = if (isOffline) Color(0xFFD32F2F) else Color(0xFF1565C0)
    val label = if (isOffline) {
        stringResource(R.string.label_offline_count, pendingActionsCount)
    } else {
        stringResource(R.string.label_syncing, pendingActionsCount)
    }
    Surface(
        shape = RoundedCornerShape(16.dp),
        color = pillColor,
        modifier = Modifier.clickable { onClick() },
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            if (isOffline) {
                Icon(
                    imageVector = Icons.Default.WifiOff,
                    contentDescription = null,
                    tint = Color.White,
                    modifier = Modifier.size(14.dp),
                )
            } else {
                CircularProgressIndicator(
                    modifier = Modifier.size(12.dp),
                    color = Color.White,
                    strokeWidth = 2.dp,
                )
            }
            Text(
                text = label,
                color = Color.White,
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.SemiBold,
            )
        }
    }
}

@Composable
private fun SyncQueueSheet(
    items: List<PendingActionUiItem>,
    isOffline: Boolean,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(bottom = 24.dp),
    ) {
        Text(
            text = stringResource(R.string.label_pending_actions),
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
        )
        if (items.isEmpty()) {
            Text(
                text = stringResource(R.string.label_no_pending_actions),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
            )
        } else {
            LazyColumn {
                items(items) { action ->
                    SyncQueueItem(action = action, isOffline = isOffline)
                }
            }
        }
    }
}

@Composable
private fun SyncQueueItem(
    action: PendingActionUiItem,
    isOffline: Boolean,
) {
    val isUploading = !isOffline && action.uploadSessionId != null && action.uploadChunkIndex != null && action.uploadTotalChunks != null && action.uploadTotalChunks > 0
    val icon = when (action.type) {
        "check_in" -> Icons.Default.LocationOn
        "media_submission" -> Icons.Default.CameraAlt
        else -> Icons.Default.TextFields
    }
    val name = when (action.type) {
        "check_in" -> stringResource(R.string.label_check_in_action)
        "media_submission" -> stringResource(R.string.label_photo_mode)
        else -> stringResource(R.string.label_submission)
    }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(20.dp),
            )
            Spacer(modifier = Modifier.width(12.dp))
            Text(
                text = name,
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.weight(1f),
            )
            val (badgeLabel, badgeColor) = when {
                isOffline -> stringResource(R.string.label_no_connection) to Color(0xFFD32F2F)
                isUploading -> stringResource(R.string.label_uploading) to Color(0xFF1565C0)
                else -> stringResource(R.string.label_queued) to Color(0xFF757575)
            }
            Surface(
                shape = RoundedCornerShape(4.dp),
                color = badgeColor.copy(alpha = 0.12f),
            ) {
                Text(
                    text = badgeLabel,
                    color = badgeColor,
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                )
            }
        }
        if (isUploading) {
            val progress = action.uploadChunkIndex!!.toFloat() / action.uploadTotalChunks!!.toFloat()
            LinearProgressIndicator(
                progress = { progress },
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 4.dp),
            )
        }
    }
}

@Composable
internal fun baseStatusLabel(status: BaseStatus): String {
    return when (status) {
        BaseStatus.NOT_VISITED -> stringResource(R.string.status_not_visited)
        BaseStatus.CHECKED_IN -> stringResource(R.string.status_checked_in)
        BaseStatus.SUBMITTED -> stringResource(R.string.status_submitted)
        BaseStatus.COMPLETED -> stringResource(R.string.status_completed)
        BaseStatus.REJECTED -> stringResource(R.string.status_rejected)
    }
}

@Composable
internal fun LegendDot(color: Color, label: String) {
    Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(modifier = Modifier.size(8.dp).clip(CircleShape).background(color))
        Text(
            label,
            style = MaterialTheme.typography.labelSmall,
            color = Color.White,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

internal fun parseTeamColor(teamColor: String?): Color {
    if (teamColor.isNullOrBlank()) return Color.Gray
    return runCatching { Color(AndroidColor.parseColor(teamColor)) }.getOrDefault(Color.Gray)
}

@Composable
internal fun SettingsSection(
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
internal fun SettingValueRow(
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
