package com.prayer.pointfinder.feature.player

import android.graphics.Color as AndroidColor
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Map
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.prayer.pointfinder.core.i18n.R
import com.prayer.pointfinder.core.model.BaseStatus

enum class PlayerTab {
    MAP,
    CHECK_IN,
    SETTINGS,
}

internal const val PRIVACY_POLICY_URL = "https://pointfinder.pt/privacy/"

// Semantic color constants for status, accents, and indicators
internal val StatusCheckedIn = Color(0xFF1565C0)
internal val StatusCompleted = Color(0xFF2E7D32)
internal val StatusSubmitted = Color(0xFFE08A00)
internal val StatusRejected = Color(0xFFD32F2F)
internal val StarGold = Color(0xFFE08A00)
internal val OfflineOrange = Color(0xFFE08A00)

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
