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
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Cancel
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Group
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Send
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
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
import com.prayer.pointfinder.core.i18n.R
import com.prayer.pointfinder.core.model.ActivityEvent
import com.prayer.pointfinder.core.model.Team

private val EVENT_TYPES = listOf(
    "all",
    "check_in",
    "submission",
    "approval",
    "rejection",
    "operator_override",
    "team_join",
    "team_switch",
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ActivityLogScreen(
    events: List<ActivityEvent>,
    teams: List<Team>,
    isLoading: Boolean,
    isLoadingMore: Boolean,
    hasMore: Boolean,
    errorMessage: String?,
    onBack: () -> Unit,
    onRefresh: () -> Unit,
    onLoadMore: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var typeFilter by rememberSaveable { mutableStateOf("all") }
    var teamFilter by rememberSaveable { mutableStateOf("all") }

    val filtered by remember(events, typeFilter, teamFilter) {
        derivedStateOf {
            var result = events
            if (typeFilter != "all") result = result.filter { it.type == typeFilter }
            if (teamFilter != "all") result = result.filter { it.teamId == teamFilter }
            result
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.label_activity_log)) },
                navigationIcon = {
                    IconButton(onClick = onBack, modifier = Modifier.testTag("activity-log-back-btn")) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.cd_back))
                    }
                },
            )
        },
        modifier = modifier,
    ) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding)) {
            // Filter bar
            ActivityLogFilterBar(
                teams = teams,
                typeFilter = typeFilter,
                teamFilter = teamFilter,
                onTypeFilterChanged = { typeFilter = it },
                onTeamFilterChanged = { teamFilter = it },
                onClearFilters = { typeFilter = "all"; teamFilter = "all" },
            )

            // Content
            PullToRefreshBox(
                isRefreshing = isLoading,
                onRefresh = onRefresh,
                modifier = Modifier.fillMaxSize(),
            ) {
                when {
                    isLoading && events.isEmpty() -> {
                        ActivityLogSkeleton(modifier = Modifier.fillMaxSize())
                    }
                    errorMessage != null && events.isEmpty() -> {
                        ActivityLogError(
                            message = errorMessage,
                            onRetry = onRefresh,
                            modifier = Modifier.fillMaxSize(),
                        )
                    }
                    filtered.isEmpty() -> {
                        ActivityLogEmpty(
                            isFiltered = typeFilter != "all" || teamFilter != "all",
                            onClearFilters = { typeFilter = "all"; teamFilter = "all" },
                            modifier = Modifier.fillMaxSize(),
                        )
                    }
                    else -> {
                        ActivityLogList(
                            events = filtered,
                            teams = teams,
                            isLoadingMore = isLoadingMore,
                            hasMore = hasMore && typeFilter == "all" && teamFilter == "all",
                            onLoadMore = onLoadMore,
                            modifier = Modifier.fillMaxSize(),
                        )
                    }
                }
            }
        }
    }
}

// MARK: - Filter Bar

@Composable
private fun ActivityLogFilterBar(
    teams: List<Team>,
    typeFilter: String,
    teamFilter: String,
    onTypeFilterChanged: (String) -> Unit,
    onTeamFilterChanged: (String) -> Unit,
    onClearFilters: () -> Unit,
) {
    var typeMenuExpanded by remember { mutableStateOf(false) }
    var teamMenuExpanded by remember { mutableStateOf(false) }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // Type filter chip
        Box {
            FilterChip(
                selected = typeFilter != "all",
                onClick = { typeMenuExpanded = true },
                label = {
                    Text(
                        text = if (typeFilter == "all") stringResource(R.string.label_all_types)
                        else eventTypeLabel(typeFilter),
                    )
                },
                modifier = Modifier.testTag("activity-type-filter"),
            )
            DropdownMenu(
                expanded = typeMenuExpanded,
                onDismissRequest = { typeMenuExpanded = false },
            ) {
                EVENT_TYPES.forEach { type ->
                    DropdownMenuItem(
                        text = {
                            Text(
                                text = if (type == "all") stringResource(R.string.label_all_types)
                                else eventTypeLabel(type),
                            )
                        },
                        onClick = {
                            onTypeFilterChanged(type)
                            typeMenuExpanded = false
                        },
                        modifier = Modifier.testTag("activity-type-option-$type"),
                    )
                }
            }
        }

        // Team filter chip
        Box {
            FilterChip(
                selected = teamFilter != "all",
                onClick = { teamMenuExpanded = true },
                label = {
                    Text(
                        text = if (teamFilter == "all") stringResource(R.string.label_all_teams)
                        else teams.firstOrNull { it.id == teamFilter }?.name ?: stringResource(R.string.label_all_teams),
                    )
                },
                modifier = Modifier.testTag("activity-team-filter"),
            )
            DropdownMenu(
                expanded = teamMenuExpanded,
                onDismissRequest = { teamMenuExpanded = false },
            ) {
                DropdownMenuItem(
                    text = { Text(stringResource(R.string.label_all_teams)) },
                    onClick = { onTeamFilterChanged("all"); teamMenuExpanded = false },
                )
                teams.forEach { team ->
                    DropdownMenuItem(
                        text = { Text(team.name) },
                        onClick = { onTeamFilterChanged(team.id); teamMenuExpanded = false },
                        modifier = Modifier.testTag("activity-team-option-${team.id}"),
                    )
                }
            }
        }

        if (typeFilter != "all" || teamFilter != "all") {
            TextButton(
                onClick = onClearFilters,
                modifier = Modifier.testTag("activity-clear-filters-btn"),
            ) {
                Text(stringResource(R.string.label_clear_filters), style = MaterialTheme.typography.labelSmall)
            }
        }
    }
}

// MARK: - List

@Composable
private fun ActivityLogList(
    events: List<ActivityEvent>,
    teams: List<Team>,
    isLoadingMore: Boolean,
    hasMore: Boolean,
    onLoadMore: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val teamColorMap = remember(teams) { teams.associate { it.id to it.color } }
    val listState = rememberLazyListState()

    LazyColumn(
        state = listState,
        modifier = modifier.testTag("activity-log-list"),
        verticalArrangement = Arrangement.spacedBy(8.dp),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(12.dp),
    ) {
        itemsIndexed(events, key = { _, e -> e.id }) { _, event ->
            ActivityLogRow(
                event = event,
                teamColorHex = event.teamId?.let { teamColorMap[it] },
            )
        }

        if (hasMore) {
            item {
                Box(
                    modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    if (isLoadingMore) {
                        CircularProgressIndicator(modifier = Modifier.size(24.dp))
                    } else {
                        Button(
                            onClick = onLoadMore,
                            modifier = Modifier.testTag("activity-load-more-btn"),
                        ) {
                            Text(stringResource(R.string.label_load_more))
                        }
                    }
                }
            }
        }
    }
}

// MARK: - Row

@Composable
private fun ActivityLogRow(
    event: ActivityEvent,
    teamColorHex: String?,
    modifier: Modifier = Modifier,
) {
    val (icon, iconColor) = eventTypeIconAndColor(event.type)

    Surface(
        modifier = modifier
            .fillMaxWidth()
            .testTag("activity-row-${event.id}"),
        tonalElevation = 1.dp,
        shape = MaterialTheme.shapes.medium,
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalAlignment = Alignment.Top,
        ) {
            // Icon circle
            Box(
                modifier = Modifier
                    .size(36.dp)
                    .clip(CircleShape)
                    .background(iconColor.copy(alpha = 0.15f)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = iconColor,
                    modifier = Modifier
                        .size(20.dp)
                        .testTag("activity-row-icon-${event.type}"),
                )
            }

            Spacer(Modifier.width(10.dp))

            Column(modifier = Modifier.weight(1f)) {
                // Badge row
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    // Color-coded action badge
                    Text(
                        text = eventTypeLabel(event.type),
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.SemiBold,
                        color = iconColor,
                        modifier = Modifier
                            .background(iconColor.copy(alpha = 0.12f), shape = MaterialTheme.shapes.small)
                            .padding(horizontal = 8.dp, vertical = 3.dp)
                            .testTag("activity-badge-${event.type}"),
                    )

                    // Team color dot
                    if (teamColorHex != null) {
                        Box(
                            modifier = Modifier
                                .size(8.dp)
                                .clip(CircleShape)
                                .background(parseTeamColor(teamColorHex)),
                        )
                    }
                }

                Spacer(Modifier.height(4.dp))

                // Message
                Text(
                    text = event.message,
                    style = MaterialTheme.typography.bodyMedium,
                )

                Spacer(Modifier.height(4.dp))

                // Relative timestamp
                Text(
                    text = relativeTime(event.timestamp),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

// MARK: - Skeleton

@Composable
private fun ActivityLogSkeleton(modifier: Modifier = Modifier) {
    LazyColumn(
        modifier = modifier.testTag("activity-log-skeleton"),
        verticalArrangement = Arrangement.spacedBy(8.dp),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(12.dp),
    ) {
        items(5) {
            Surface(
                modifier = Modifier.fillMaxWidth(),
                tonalElevation = 1.dp,
                shape = MaterialTheme.shapes.medium,
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(12.dp),
                    verticalAlignment = Alignment.Top,
                ) {
                    Box(
                        modifier = Modifier
                            .size(36.dp)
                            .clip(CircleShape)
                            .background(MaterialTheme.colorScheme.surfaceVariant),
                    )
                    Spacer(Modifier.width(10.dp))
                    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth(0.4f)
                                .height(14.dp)
                                .background(MaterialTheme.colorScheme.surfaceVariant, MaterialTheme.shapes.small),
                        )
                        Box(
                            modifier = Modifier
                                .fillMaxWidth(0.8f)
                                .height(14.dp)
                                .background(MaterialTheme.colorScheme.surfaceVariant, MaterialTheme.shapes.small),
                        )
                        Box(
                            modifier = Modifier
                                .fillMaxWidth(0.3f)
                                .height(12.dp)
                                .background(MaterialTheme.colorScheme.surfaceVariant, MaterialTheme.shapes.small),
                        )
                    }
                }
            }
        }
    }
}

// MARK: - Empty / Error

@Composable
private fun ActivityLogEmpty(
    isFiltered: Boolean,
    onClearFilters: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier.padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(
            Icons.Default.Group,
            contentDescription = null,
            modifier = Modifier.size(48.dp),
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(12.dp))
        Text(
            text = if (isFiltered) stringResource(R.string.label_no_matching_events)
            else stringResource(R.string.label_no_activity),
            style = MaterialTheme.typography.titleMedium,
        )
        if (isFiltered) {
            Spacer(Modifier.height(8.dp))
            TextButton(
                onClick = onClearFilters,
                modifier = Modifier.testTag("activity-empty-clear-filters-btn"),
            ) {
                Text(stringResource(R.string.label_clear_filters))
            }
        }
    }
}

@Composable
private fun ActivityLogError(
    message: String,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier.padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(
            Icons.Default.Warning,
            contentDescription = null,
            modifier = Modifier.size(48.dp),
            tint = MaterialTheme.colorScheme.error,
        )
        Spacer(Modifier.height(12.dp))
        Text(
            text = stringResource(R.string.label_activity_load_error),
            style = MaterialTheme.typography.titleMedium,
        )
        Spacer(Modifier.height(4.dp))
        Text(
            text = message,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(12.dp))
        Button(
            onClick = onRetry,
            modifier = Modifier.testTag("activity-error-retry-btn"),
        ) {
            Text(stringResource(R.string.action_refresh))
        }
    }
}

// MARK: - Helpers

@Composable
private fun eventTypeLabel(type: String): String = when (type) {
    "check_in" -> stringResource(R.string.activity_type_check_in)
    "submission" -> stringResource(R.string.activity_type_submission)
    "approval" -> stringResource(R.string.activity_type_approval)
    "rejection" -> stringResource(R.string.activity_type_rejection)
    "operator_override" -> stringResource(R.string.activity_type_operator_override)
    "team_join" -> stringResource(R.string.activity_type_team_join)
    "team_switch" -> stringResource(R.string.activity_type_team_switch)
    else -> type.replace("_", " ")
}

private fun eventTypeIconAndColor(type: String): Pair<ImageVector, Color> = when (type) {
    "check_in" -> Icons.Default.LocationOn to Color(0xFF1565C0)
    "submission" -> Icons.Default.Send to Color(0xFF1565C0)
    "approval" -> Icons.Default.CheckCircle to Color(0xFF2E7D32)
    "rejection" -> Icons.Default.Cancel to Color(0xFFD32F2F)
    "operator_override" -> Icons.Default.Shield to Color(0xFFE08A00)
    "team_join" -> Icons.Default.Person to Color(0xFF757575)
    "team_switch" -> Icons.Default.Group to Color(0xFF757575)
    else -> Icons.Default.Group to Color(0xFF757575)
}

private fun relativeTime(timestamp: String): String {
    return try {
        val instant = java.time.Instant.parse(timestamp)
        val now = java.time.Instant.now()
        val seconds = java.time.Duration.between(instant, now).seconds
        when {
            seconds < 60 -> "${seconds}s ago"
            seconds < 3600 -> "${seconds / 60}m ago"
            seconds < 86400 -> "${seconds / 3600}h ago"
            else -> "${seconds / 86400}d ago"
        }
    } catch (_: Exception) {
        timestamp
    }
}
