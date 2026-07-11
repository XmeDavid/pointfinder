package com.prayer.pointfinder.feature.operator

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.BarChart
import androidx.compose.material.icons.filled.Checklist
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Map
import androidx.compose.material.icons.filled.List
import androidx.compose.material.icons.filled.MoreHoriz
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.IconButton
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.prayer.pointfinder.core.i18n.R
import com.prayer.pointfinder.core.model.EntityId
import com.prayer.pointfinder.core.model.Game
import com.prayer.pointfinder.core.model.GameStatus
import com.prayer.pointfinder.core.model.OrgWorkspace
import com.prayer.pointfinder.core.model.PRIVACY_POLICY_URL
import com.prayer.pointfinder.core.designsystem.PFColors

enum class OperatorTab {
    LIVE_MAP,
    SETUP,
    LIVE,
    SUBMISSIONS,
    MORE,
}

// Semantic color constants shared across operator screens
internal val StatusCheckedIn = PFColors.StatusCheckedInLight
internal val StatusCompleted = PFColors.StatusCompletedLight
internal val StatusSubmitted = PFColors.StatusPendingLight
internal val StatusRejected = PFColors.StatusRejectedLight
internal val StarGold = PFColors.StatusPendingLight
internal val BadgePurple = PFColors.StatusOperatorOverrideLight
internal val BadgeIndigo = PFColors.StatusOperatorOverrideLight

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OperatorHomeScreen(
    games: List<Game>,
    onSelectGame: (Game) -> Unit,
    onCreateGame: () -> Unit,
    onLogout: () -> Unit,
    onRefresh: () -> Unit,
    isLoading: Boolean = false,
    errorMessage: String? = null,
    pendingInviteCount: Int = 0,
    onOpenMyInvites: () -> Unit = {},
    orgs: List<OrgWorkspace> = emptyList(),
    selectedOrgId: EntityId? = null,
    onSelectOrg: (EntityId?) -> Unit = {},
    modifier: Modifier = Modifier,
) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.label_my_games)) },
                actions = {
                    IconButton(onClick = onOpenMyInvites) {
                        BadgedBox(
                            badge = {
                                if (pendingInviteCount > 0) {
                                    Badge { Text(pendingInviteCount.toString()) }
                                }
                            },
                        ) {
                            Icon(
                                Icons.Default.Notifications,
                                contentDescription = stringResource(R.string.cd_notifications),
                            )
                        }
                    }
                    TextButton(onClick = onLogout) { Text(stringResource(R.string.action_logout)) }
                },
            )
        },
        floatingActionButton = {
            FloatingActionButton(
                onClick = onCreateGame,
                modifier = Modifier.testTag("create-game-btn"),
            ) {
                Icon(Icons.Default.Add, contentDescription = stringResource(R.string.label_create_game))
            }
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
                        WorkspaceSwitcher(
                            orgs = orgs,
                            selectedOrgId = selectedOrgId,
                            onSelectOrg = onSelectOrg,
                        )
                        Spacer(Modifier.height(16.dp))
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
                        modifier = Modifier.fillMaxSize(),
                        verticalArrangement = Arrangement.spacedBy(10.dp),
                        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
                    ) {
                        item {
                            WorkspaceSwitcher(
                                orgs = orgs,
                                selectedOrgId = selectedOrgId,
                                onSelectOrg = onSelectOrg,
                            )
                            Spacer(Modifier.height(4.dp))
                        }

                        item {
                            GameLibrarySummary(
                                listOf(
                                    GameLibraryMetric(games.count { it.status == GameStatus.SETUP }.toString(), stringResource(R.string.game_status_setup), OperatorTone.INFO),
                                    GameLibraryMetric(games.count { it.status == GameStatus.LIVE }.toString(), stringResource(R.string.game_status_live), OperatorTone.SUCCESS),
                                    GameLibraryMetric(games.count { it.status == GameStatus.ENDED }.toString(), stringResource(R.string.game_status_ended), OperatorTone.MUTED),
                                ),
                            )
                        }

                        items(games, key = { it.id }, contentType = { "game" }) { game ->
                            GameLibraryCard(
                                name = game.name,
                                description = game.description,
                                statusLabel = when (game.status) {
                                    GameStatus.SETUP -> stringResource(R.string.game_status_setup)
                                    GameStatus.LIVE -> stringResource(R.string.game_status_live)
                                    GameStatus.ENDED -> stringResource(R.string.game_status_ended)
                                },
                                statusTone = when (game.status) {
                                    GameStatus.SETUP -> OperatorTone.INFO
                                    GameStatus.LIVE -> OperatorTone.SUCCESS
                                    GameStatus.ENDED -> OperatorTone.MUTED
                                },
                                onClick = { onSelectGame(game) },
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun WorkspaceSwitcher(
    orgs: List<OrgWorkspace>,
    selectedOrgId: EntityId?,
    onSelectOrg: (EntityId?) -> Unit,
) {
    LazyRow(
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        item {
            WorkspaceChip(
                label = stringResource(R.string.label_personal_workspace),
                detail = null,
                selected = selectedOrgId == null,
                onClick = { onSelectOrg(null) },
            )
        }
        items(orgs, key = { it.id }) { org ->
            WorkspaceChip(
                label = org.name,
                detail = stringResource(R.string.label_member_count, org.memberCount),
                selected = selectedOrgId == org.id,
                onClick = { onSelectOrg(org.id) },
            )
        }
    }
}

@Composable
private fun WorkspaceChip(
    label: String,
    detail: String?,
    selected: Boolean,
    onClick: () -> Unit,
) {
    GameLibraryWorkspaceChip(label, detail, selected, onClick)
}

@Composable
fun OperatorGameScaffold(
    selectedTab: OperatorTab,
    gameStatus: GameStatus,
    onTabSelected: (OperatorTab) -> Unit,
    content: @Composable () -> Unit,
) {
    val isSetupMode = gameStatus == GameStatus.SETUP

    Scaffold(
        bottomBar = {
            NavigationBar {
                NavigationBarItem(
                    selected = selectedTab == OperatorTab.LIVE_MAP,
                    onClick = { onTabSelected(OperatorTab.LIVE_MAP) },
                    icon = { androidx.compose.material3.Icon(Icons.Default.Map, contentDescription = stringResource(R.string.cd_tab_map)) },
                    label = { Text(stringResource(R.string.label_live_map)) },
                    modifier = Modifier.testTag("nav-monitoring"),
                )
                if (isSetupMode) {
                    NavigationBarItem(
                        selected = selectedTab == OperatorTab.SETUP,
                        onClick = { onTabSelected(OperatorTab.SETUP) },
                        icon = { androidx.compose.material3.Icon(Icons.Default.Checklist, contentDescription = stringResource(R.string.cd_tab_submissions)) },
                        label = { Text(stringResource(R.string.label_setup)) },
                        modifier = Modifier.testTag("nav-games"),
                    )
                } else {
                    NavigationBarItem(
                        selected = selectedTab == OperatorTab.LIVE,
                        onClick = { onTabSelected(OperatorTab.LIVE) },
                        icon = { androidx.compose.material3.Icon(Icons.Default.BarChart, contentDescription = stringResource(R.string.cd_tab_leaderboard)) },
                        label = { Text(stringResource(R.string.label_live)) },
                        modifier = Modifier.testTag("nav-games"),
                    )
                }
                if (!isSetupMode) {
                    NavigationBarItem(
                        selected = selectedTab == OperatorTab.SUBMISSIONS,
                        onClick = { onTabSelected(OperatorTab.SUBMISSIONS) },
                        icon = { androidx.compose.material3.Icon(Icons.Default.List, contentDescription = stringResource(R.string.cd_tab_activity)) },
                        label = { Text(stringResource(R.string.label_submissions)) },
                        modifier = Modifier.testTag("monitoring-tab"),
                    )
                }
                NavigationBarItem(
                    selected = selectedTab == OperatorTab.MORE,
                    onClick = { onTabSelected(OperatorTab.MORE) },
                    icon = { androidx.compose.material3.Icon(Icons.Default.MoreHoriz, contentDescription = stringResource(R.string.cd_tab_more)) },
                    label = { Text(stringResource(R.string.label_more)) },
                    modifier = Modifier.testTag("nav-teams"),
                )
            }
        },
    ) { padding ->
        Box(modifier = Modifier.padding(padding)) { content() }
    }
}
