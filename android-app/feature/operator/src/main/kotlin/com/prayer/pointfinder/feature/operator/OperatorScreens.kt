package com.prayer.pointfinder.feature.operator

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Map
import androidx.compose.material.icons.filled.List
import androidx.compose.material.icons.filled.Settings
import androidx.compose.foundation.background
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.prayer.pointfinder.core.i18n.R
import com.prayer.pointfinder.core.model.Game
import com.prayer.pointfinder.core.model.GameStatus

enum class OperatorTab {
    LIVE_MAP,
    SUBMISSIONS,
    BASES,
    SETTINGS,
}

internal const val PRIVACY_POLICY_URL = "https://pointfinder.pt/privacy/"

// Semantic color constants shared across operator screens
internal val StatusCheckedIn = Color(0xFF1565C0)
internal val StatusCompleted = Color(0xFF2E7D32)
internal val StatusSubmitted = Color(0xFFE08A00)
internal val StarGold = Color(0xFFE08A00)
internal val BadgePurple = Color(0xFF7B1FA2)
internal val BadgeIndigo = Color(0xFF303F9F)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OperatorHomeScreen(
    games: List<Game>,
    onSelectGame: (Game) -> Unit,
    onLogout: () -> Unit,
    onRefresh: () -> Unit,
    isLoading: Boolean = false,
    errorMessage: String? = null,
    modifier: Modifier = Modifier,
) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.label_operator)) },
                actions = {
                    TextButton(onClick = onLogout) { Text(stringResource(R.string.action_logout)) }
                },
            )
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
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(12.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        items(games, key = { it.id }) { game ->
                            Surface(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable { onSelectGame(game) },
                                tonalElevation = 2.dp,
                                shape = MaterialTheme.shapes.medium,
                            ) {
                                Column(modifier = Modifier.padding(12.dp)) {
                                    Text(game.name, fontWeight = FontWeight.SemiBold)
                                    Spacer(Modifier.height(4.dp))
                                    Text(game.description, style = MaterialTheme.typography.bodySmall)
                                    Spacer(Modifier.height(6.dp))
                                    val statusColor = when (game.status) {
                                        GameStatus.LIVE -> StatusCompleted
                                        GameStatus.SETUP -> StatusSubmitted
                                        GameStatus.ENDED -> Color(0xFFD32F2F)
                                    }
                                    Text(
                                        text = game.status.name.uppercase(),
                                        style = MaterialTheme.typography.labelSmall,
                                        fontWeight = FontWeight.Medium,
                                        color = statusColor,
                                        modifier = Modifier
                                            .background(statusColor.copy(alpha = 0.15f), shape = MaterialTheme.shapes.small)
                                            .padding(horizontal = 10.dp, vertical = 5.dp),
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun OperatorGameScaffold(
    selectedTab: OperatorTab,
    showSubmissions: Boolean,
    onTabSelected: (OperatorTab) -> Unit,
    content: @Composable () -> Unit,
) {
    Scaffold(
        bottomBar = {
            NavigationBar {
                NavigationBarItem(
                    selected = selectedTab == OperatorTab.LIVE_MAP,
                    onClick = { onTabSelected(OperatorTab.LIVE_MAP) },
                    icon = { androidx.compose.material3.Icon(Icons.Default.Map, contentDescription = null) },
                    label = { Text(stringResource(R.string.label_live_map)) },
                )
                if (showSubmissions) {
                    NavigationBarItem(
                        selected = selectedTab == OperatorTab.SUBMISSIONS,
                        onClick = { onTabSelected(OperatorTab.SUBMISSIONS) },
                        icon = { androidx.compose.material3.Icon(Icons.Default.List, contentDescription = null) },
                        label = { Text(stringResource(R.string.label_submissions)) },
                    )
                }
                NavigationBarItem(
                    selected = selectedTab == OperatorTab.BASES,
                    onClick = { onTabSelected(OperatorTab.BASES) },
                    icon = { androidx.compose.material3.Icon(Icons.Default.LocationOn, contentDescription = stringResource(R.string.label_bases)) },
                    label = { Text(stringResource(R.string.label_bases)) },
                )
                NavigationBarItem(
                    selected = selectedTab == OperatorTab.SETTINGS,
                    onClick = { onTabSelected(OperatorTab.SETTINGS) },
                    icon = { androidx.compose.material3.Icon(Icons.Default.Settings, contentDescription = null) },
                    label = { Text(stringResource(R.string.label_settings)) },
                )
            }
        },
    ) { padding ->
        Box(modifier = Modifier.padding(padding)) { content() }
    }
}
