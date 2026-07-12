package com.prayer.pointfinder.feature.player

import android.content.res.Configuration
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.prayer.pointfinder.core.designsystem.PFColors
import com.prayer.pointfinder.core.designsystem.PFRadiusToken
import com.prayer.pointfinder.core.designsystem.PFSpacingToken

internal data class PlayerMapLegendItem(val label: String, val tone: PlayerFieldTone)

@Composable
internal fun PlayerMapHeader(
    title: String,
    liveLabel: String?,
    unseenNotificationCount: Long,
    isLoading: Boolean,
    notificationsLabel: String,
    refreshLabel: String,
    onNotificationsClick: () -> Unit,
    onRefresh: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val dark = isSystemInDarkTheme()
    val panel = if (dark) PFColors.SurfaceOverlayDark else PFColors.SurfaceOverlayLight
    val content = if (dark) PFColors.ContentPrimaryDark else PFColors.ContentPrimaryLight
    Surface(
        modifier = modifier.fillMaxWidth(),
        color = panel,
        contentColor = content,
        shadowElevation = 8.dp,
        shape = MaterialTheme.shapes.large,
        border = BorderStroke(1.dp, (if (dark) PFColors.BorderDefaultDark else PFColors.BorderDefaultLight).copy(alpha = 0.8f)),
    ) {
        Row(
            modifier = Modifier.padding(start = PFSpacingToken.Space4, end = PFSpacingToken.Space2, top = PFSpacingToken.Space2, bottom = PFSpacingToken.Space2),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold, maxLines = 2)
                if (liveLabel != null) {
                    Text(liveLabel.uppercase(), style = MaterialTheme.typography.labelSmall, color = if (dark) PFColors.StatusLiveDark else PFColors.StatusLiveLight)
                }
            }
            BadgedBox(
                badge = {
                    if (unseenNotificationCount > 0) {
                        Badge(containerColor = if (dark) PFColors.StatusRejectedDark else PFColors.StatusRejectedLight) {
                            Text(if (unseenNotificationCount > 99) "99+" else unseenNotificationCount.toString())
                        }
                    }
                },
            ) {
                IconButton(onClick = onNotificationsClick) {
                    Icon(Icons.Default.Notifications, contentDescription = notificationsLabel)
                }
            }
            IconButton(onClick = onRefresh, enabled = !isLoading) {
                if (isLoading) {
                    CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                } else {
                    Icon(Icons.Default.Refresh, contentDescription = refreshLabel)
                }
            }
        }
    }
}

@Composable
internal fun PlayerMapLegend(items: List<PlayerMapLegendItem>, modifier: Modifier = Modifier) {
    val dark = isSystemInDarkTheme()
    val panel = if (dark) PFColors.SurfaceOverlayDark else PFColors.SurfaceOverlayLight
    val content = if (dark) PFColors.ContentSecondaryDark else PFColors.ContentSecondaryLight
    Surface(modifier = modifier, color = panel, contentColor = content, shape = MaterialTheme.shapes.medium, shadowElevation = 4.dp) {
        Row(
            modifier = Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = PFSpacingToken.Space3, vertical = PFSpacingToken.Space2),
            horizontalArrangement = Arrangement.spacedBy(PFSpacingToken.Space3),
        ) {
            items.forEach { item ->
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(PFSpacingToken.Space1)) {
                    Surface(modifier = Modifier.size(8.dp), shape = androidx.compose.foundation.shape.CircleShape, color = item.tone.mapColor(dark)) {}
                    Text(item.label, style = MaterialTheme.typography.labelSmall, maxLines = 1)
                }
            }
        }
    }
}

@Composable
internal fun PlayerDetailMessage(
    icon: ImageVector,
    title: String,
    message: String? = null,
    tone: PlayerFieldTone = PlayerFieldTone.UNKNOWN,
    modifier: Modifier = Modifier,
) {
    val dark = isSystemInDarkTheme()
    val accent = tone.mapColor(dark)
    Column(
        modifier = modifier.fillMaxWidth().padding(vertical = PFSpacingToken.Space6),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(PFSpacingToken.Space2),
    ) {
        Surface(color = accent.copy(alpha = 0.12f), shape = androidx.compose.foundation.shape.CircleShape) {
            Icon(icon, contentDescription = title, tint = accent, modifier = Modifier.padding(PFSpacingToken.Space4).size(36.dp))
        }
        Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center)
        if (!message.isNullOrBlank()) {
            Text(message, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center)
        }
    }
}

@Composable
private fun PlayerFieldTone.mapColor(dark: Boolean): Color = when (this) {
    PlayerFieldTone.INFO -> if (dark) PFColors.StatusCheckedInDark else PFColors.StatusCheckedInLight
    PlayerFieldTone.PENDING -> if (dark) PFColors.StatusPendingDark else PFColors.StatusPendingLight
    PlayerFieldTone.SUCCESS -> if (dark) PFColors.StatusCompletedDark else PFColors.StatusCompletedLight
    PlayerFieldTone.DANGER -> if (dark) PFColors.StatusRejectedDark else PFColors.StatusRejectedLight
    PlayerFieldTone.UNKNOWN -> if (dark) PFColors.StatusUnknownDark else PFColors.StatusUnknownLight
}

@Preview(name = "Player map chrome · light", showBackground = true, widthDp = 390)
@Preview(name = "Player map chrome · dark", showBackground = true, widthDp = 390, uiMode = Configuration.UI_MODE_NIGHT_YES)
@Composable
private fun PlayerMapChromePreview() {
    Surface(color = MaterialTheme.colorScheme.background) {
        Column(modifier = Modifier.padding(PFSpacingToken.Space3), verticalArrangement = Arrangement.spacedBy(PFSpacingToken.Space4)) {
            PlayerMapHeader(
                title = "International Pathfinder Field Exercise",
                liveLabel = "Live",
                unseenNotificationCount = 12,
                isLoading = false,
                notificationsLabel = "Notifications",
                refreshLabel = "Refresh",
                onNotificationsClick = {},
                onRefresh = {},
            )
            PlayerMapLegend(
                listOf(
                    PlayerMapLegendItem("Not visited", PlayerFieldTone.UNKNOWN),
                    PlayerMapLegendItem("Checked in", PlayerFieldTone.INFO),
                    PlayerMapLegendItem("Awaiting review", PlayerFieldTone.PENDING),
                    PlayerMapLegendItem("Completed", PlayerFieldTone.SUCCESS),
                    PlayerMapLegendItem("Rejected", PlayerFieldTone.DANGER),
                ),
                Modifier.fillMaxWidth(),
            )
            PlayerDetailMessage(Icons.Default.Lock, "Challenge locked", "Scan the NFC tag at this location to continue.")
            PlayerFieldStatusBanner("Challenge completed", icon = Icons.Default.CheckCircle, tone = PlayerFieldTone.SUCCESS)
        }
    }
}
