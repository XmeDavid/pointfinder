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
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
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
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
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
    modifier: Modifier = Modifier,
) {
    var selectedSegment by rememberSaveable { mutableIntStateOf(0) }

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(12.dp),
    ) {
        SingleChoiceSegmentedButtonRow(
            modifier = Modifier.fillMaxWidth(),
        ) {
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

        Spacer(Modifier.height(12.dp))

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

@Composable
private fun LeaderboardContent(leaderboard: List<LeaderboardEntry>) {
    if (leaderboard.isEmpty()) {
        Box(
            modifier = Modifier.fillMaxSize(),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = stringResource(R.string.label_no_leaderboard),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        return
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize().testTag("leaderboard-view"),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        itemsIndexed(leaderboard, key = { _, entry -> entry.teamId }) { index, entry ->
            val rank = index + 1
            val isTopThree = rank <= 3
            val accentColor = when (rank) {
                1 -> Color(0xFFFFD700) // Gold
                2 -> Color(0xFFC0C0C0) // Silver
                3 -> Color(0xFFCD7F32) // Bronze
                else -> null
            }

            Surface(
                modifier = Modifier.fillMaxWidth(),
                tonalElevation = if (isTopThree) 4.dp else 1.dp,
                shape = MaterialTheme.shapes.medium,
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    // Rank number
                    Text(
                        text = stringResource(R.string.label_rank, rank),
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = if (isTopThree) FontWeight.Bold else FontWeight.Normal,
                        color = accentColor ?: MaterialTheme.colorScheme.onSurface,
                        modifier = Modifier.width(36.dp),
                    )

                    // Team color dot
                    val teamColor = parseTeamColor(entry.color)
                    Box(
                        modifier = Modifier
                            .size(14.dp)
                            .clip(CircleShape)
                            .background(teamColor),
                    )

                    Spacer(Modifier.width(10.dp))

                    // Team name
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = entry.teamName,
                            style = MaterialTheme.typography.bodyLarge,
                            fontWeight = if (isTopThree) FontWeight.SemiBold else FontWeight.Normal,
                        )
                        Text(
                            text = stringResource(R.string.label_completed_count, entry.completedChallenges),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }

                    // Points
                    Text(
                        text = stringResource(R.string.label_pts, entry.points),
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = if (isTopThree) {
                            accentColor ?: MaterialTheme.colorScheme.primary
                        } else {
                            MaterialTheme.colorScheme.primary
                        },
                    )
                }
            }
        }
    }
}

@Composable
private fun ActivityContent(activity: List<ActivityEvent>, teams: List<Team>) {
    val teamColorMap = teams.associate { it.id to it.color }
    if (activity.isEmpty()) {
        Box(
            modifier = Modifier.fillMaxSize(),
            contentAlignment = Alignment.Center,
        ) {
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
            val (icon, iconColor) = eventTypeIcon(event.type)

            Surface(
                modifier = Modifier.fillMaxWidth(),
                tonalElevation = 1.dp,
                shape = MaterialTheme.shapes.medium,
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(12.dp),
                    verticalAlignment = Alignment.Top,
                ) {
                    Icon(
                        imageVector = icon,
                        contentDescription = null,
                        tint = iconColor,
                        modifier = Modifier.size(24.dp),
                    )

                    Spacer(Modifier.width(8.dp))

                    // Team color badge
                    val teamColorHex = event.teamId?.let { teamColorMap[it] }
                    if (teamColorHex != null) {
                        Box(
                            modifier = Modifier
                                .size(10.dp)
                                .clip(CircleShape)
                                .background(parseTeamColor(teamColorHex)),
                        )
                        Spacer(Modifier.width(8.dp))
                    }

                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = event.message,
                            style = MaterialTheme.typography.bodyMedium,
                        )
                        Spacer(Modifier.height(4.dp))
                        Text(
                            text = formatTimestamp(event.timestamp),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }
    }
}

private fun eventTypeIcon(type: String): Pair<ImageVector, Color> {
    return when (type) {
        "check_in" -> Icons.Default.LocationOn to StatusCheckedIn
        "submission" -> Icons.AutoMirrored.Filled.Send to StatusSubmitted
        "approval" -> Icons.Default.CheckCircle to StatusCompleted
        "rejection" -> Icons.Default.Cancel to Color(0xFFD32F2F)
        else -> Icons.AutoMirrored.Filled.Send to Color.Gray
    }
}

