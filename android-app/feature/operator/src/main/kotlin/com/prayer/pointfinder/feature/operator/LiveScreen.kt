package com.prayer.pointfinder.feature.operator

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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Cancel
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.prayer.pointfinder.core.i18n.R
import com.prayer.pointfinder.core.model.ActivityEvent
import com.prayer.pointfinder.core.model.LeaderboardEntry
import com.prayer.pointfinder.core.model.Team

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LiveScreen(
    leaderboard: List<LeaderboardEntry>,
    activity: List<ActivityEvent>,
    teams: List<Team>,
    onRefresh: () -> Unit,
    isRefreshing: Boolean = false,
    isConnected: Boolean = true,
    lastSyncedAt: String? = null,
    modifier: Modifier = Modifier,
) {
    var selectedSegment by rememberSaveable { mutableIntStateOf(0) }

    // Derived stats
    val pendingCount = activity.count { it.type == "submission" }
    val progressPercent = run {
        if (leaderboard.isEmpty()) 0
        else {
            val maxCompleted = leaderboard.maxOfOrNull { it.completedChallenges } ?: 0
            if (maxCompleted == 0) 0
            else {
                val total = leaderboard.sumOf { it.completedChallenges }
                val possible = leaderboard.size * maxCompleted
                (total * 100 / possible)
            }
        }
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        // Offline sync badge
        if (lastSyncedAt != null) {
            Surface(
                shape = RoundedCornerShape(50),
                color = MaterialTheme.colorScheme.surfaceVariant,
            ) {
                Text(
                    text = stringResource(R.string.label_last_synced, lastSyncedAt),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier
                        .padding(horizontal = 12.dp, vertical = 5.dp)
                        .testTag("offline-sync-badge"),
                )
            }
        }

        // Stats strip
        StatsStrip(
            teamCount = teams.size,
            pendingCount = pendingCount,
            progressPercent = progressPercent,
        )

        // Segmented picker
        SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
            SegmentedButton(
                selected = selectedSegment == 0,
                onClick = { selectedSegment = 0 },
                shape = SegmentedButtonDefaults.itemShape(index = 0, count = 2),
            ) {
                Text(stringResource(R.string.label_leaderboard))
            }
            SegmentedButton(
                selected = selectedSegment == 1,
                onClick = { selectedSegment = 1 },
                shape = SegmentedButtonDefaults.itemShape(index = 1, count = 2),
            ) {
                Text(stringResource(R.string.label_activity))
            }
        }

        // Content
        PullToRefreshBox(
            isRefreshing = isRefreshing,
            onRefresh = onRefresh,
            modifier = Modifier.fillMaxSize(),
        ) {
            when (selectedSegment) {
                0 -> LeaderboardContent(leaderboard)
                1 -> ActivityContent(activity, teams)
            }
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Stats strip
// ─────────────────────────────────────────────────────────────────────────────

@Composable
private fun StatsStrip(teamCount: Int, pendingCount: Int, progressPercent: Int) {
    LazyRow(
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        item {
            StatPill(value = "$teamCount", label = "TEAMS", color = MaterialTheme.colorScheme.onSurface)
        }
        item {
            StatPill(
                value = "$pendingCount",
                label = "PENDING",
                color = if (pendingCount > 0) StatusSubmitted else MaterialTheme.colorScheme.onSurface,
            )
        }
        item {
            StatPill(value = "$progressPercent%", label = "PROGRESS", color = StatusCompleted)
        }
    }
}

@Composable
private fun StatPill(value: String, label: String, color: Color) {
    Surface(
        shape = RoundedCornerShape(10.dp),
        color = MaterialTheme.colorScheme.surface,
        tonalElevation = 1.dp,
        shadowElevation = 2.dp,
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 8.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                text = value,
                style = MaterialTheme.typography.titleMedium.copy(fontSize = 16.sp),
                fontWeight = FontWeight.Bold,
                color = color,
            )
            Text(
                text = label,
                style = MaterialTheme.typography.labelSmall.copy(fontSize = 9.sp),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Leaderboard
// ─────────────────────────────────────────────────────────────────────────────

@Composable
private fun LeaderboardContent(leaderboard: List<LeaderboardEntry>) {
    if (leaderboard.isEmpty()) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text(
                text = stringResource(R.string.label_no_leaderboard),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        return
    }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .testTag("leaderboard-view"),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        itemsIndexed(leaderboard, key = { _, entry -> entry.teamId }) { index, entry ->
            val rank = index + 1
            val isTopThree = rank <= 3
            val accentColor: Color? = when (rank) {
                1 -> Color(0xFFFFD700) // Gold
                2 -> Color(0xFFC0C0C0) // Silver
                3 -> Color(0xFFCD7F32) // Bronze
                else -> null
            }

            LeaderboardRow(
                rank = rank,
                entry = entry,
                isTopThree = isTopThree,
                accentColor = accentColor,
            )
        }
    }
}

@Composable
private fun LeaderboardRow(
    rank: Int,
    entry: LeaderboardEntry,
    isTopThree: Boolean,
    accentColor: Color?,
) {
    Surface(
        shape = RoundedCornerShape(14.dp),
        color = MaterialTheme.colorScheme.surface,
        tonalElevation = if (isTopThree) 2.dp else 1.dp,
        shadowElevation = if (isTopThree) 3.dp else 1.dp,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            // Colored left accent bar for top 3
            if (isTopThree && accentColor != null) {
                Box(
                    modifier = Modifier
                        .width(3.dp)
                        .height(36.dp)
                        .clip(RoundedCornerShape(2.dp))
                        .background(accentColor),
                )
                Spacer(Modifier.width(10.dp))
            }

            // Rank number
            Text(
                text = "$rank",
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.Bold,
                color = accentColor ?: MaterialTheme.colorScheme.onSurface,
                modifier = Modifier.width(24.dp),
            )

            Spacer(Modifier.width(8.dp))

            // Team color dot
            val teamColor = parseTeamColor(entry.color)
            Box(
                modifier = Modifier
                    .size(12.dp)
                    .clip(CircleShape)
                    .background(teamColor),
            )

            Spacer(Modifier.width(10.dp))

            // Name + completed count
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = entry.teamName,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = if (isTopThree) FontWeight.SemiBold else FontWeight.Normal,
                )
                Text(
                    text = stringResource(R.string.label_completed_count, entry.completedChallenges),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            // Points
            Text(
                text = stringResource(R.string.label_pts, entry.points),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                color = accentColor ?: MaterialTheme.colorScheme.primary,
            )
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Activity
// ─────────────────────────────────────────────────────────────────────────────

@Composable
private fun ActivityContent(activity: List<ActivityEvent>, teams: List<Team>) {
    val teamColorMap = teams.associate { it.id to it.color }

    if (activity.isEmpty()) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text(
                text = stringResource(R.string.label_no_activity),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        return
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        itemsIndexed(activity, key = { _, event -> event.id }) { _, event ->
            ActivityCard(event = event, teamColorMap = teamColorMap)
        }
    }
}

@Composable
private fun ActivityCard(event: ActivityEvent, teamColorMap: Map<*, String>) {
    val (icon, iconColor) = eventTypeIcon(event.type)

    Surface(
        shape = RoundedCornerShape(12.dp),
        color = MaterialTheme.colorScheme.surface,
        tonalElevation = 1.dp,
        shadowElevation = 1.dp,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(10.dp),
            verticalAlignment = Alignment.Top,
        ) {
            // Colored left border
            Box(
                modifier = Modifier
                    .width(3.dp)
                    .height(36.dp)
                    .clip(RoundedCornerShape(2.dp))
                    .background(iconColor),
            )

            Spacer(Modifier.width(10.dp))

            // Event icon
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = iconColor,
                modifier = Modifier.size(20.dp),
            )

            Spacer(Modifier.width(8.dp))

            // Team color dot
            val teamColorHex = event.teamId?.let { teamColorMap[it] }
            if (teamColorHex != null) {
                Box(
                    modifier = Modifier
                        .padding(top = 2.dp)
                        .size(8.dp)
                        .clip(CircleShape)
                        .background(parseTeamColor(teamColorHex)),
                )
                Spacer(Modifier.width(6.dp))
            }

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = event.message,
                    style = MaterialTheme.typography.bodySmall,
                    fontWeight = FontWeight.Medium,
                )
                Spacer(Modifier.height(2.dp))
                Text(
                    text = formatTimestamp(event.timestamp),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

private fun eventTypeIcon(type: String): Pair<ImageVector, Color> {
    return when (type) {
        "check_in" -> Icons.Default.LocationOn to StatusCheckedIn
        "submission" -> Icons.AutoMirrored.Filled.Send to StatusSubmitted
        "approval" -> Icons.Default.CheckCircle to StatusCompleted
        "rejection" -> Icons.Default.Cancel to StatusRejected
        else -> Icons.AutoMirrored.Filled.Send to Color.Gray
    }
}
