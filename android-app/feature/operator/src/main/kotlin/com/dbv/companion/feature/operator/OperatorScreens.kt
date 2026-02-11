package com.dbv.companion.feature.operator

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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Map
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.dbv.companion.core.model.Base
import com.dbv.companion.core.model.Game
import com.dbv.companion.core.model.TeamBaseProgressResponse
import com.dbv.companion.core.model.TeamLocationResponse
import com.google.android.gms.maps.model.LatLng
import com.google.maps.android.compose.GoogleMap
import com.google.maps.android.compose.Marker
import com.google.maps.android.compose.MarkerState

enum class OperatorTab {
    LIVE_MAP,
    BASES,
    SETTINGS,
}

@Composable
fun OperatorHomeScreen(
    games: List<Game>,
    onSelectGame: (Game) -> Unit,
    onLogout: () -> Unit,
    onRefresh: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Scaffold(
        topBar = {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(12.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text("Operator", style = MaterialTheme.typography.titleLarge)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(onClick = onRefresh) { Text("Refresh") }
                    Button(onClick = onLogout) { Text("Logout") }
                }
            }
        },
    ) { padding ->
        LazyColumn(
            modifier = modifier
                .fillMaxSize()
                .padding(padding)
                .padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            if (games.isEmpty()) {
                item { Text("No Games") }
            } else {
                items(games) { game ->
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
                            AssistChip(onClick = {}, label = { Text(game.status.uppercase()) })
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
                    label = { Text("Live Map") },
                )
                NavigationBarItem(
                    selected = selectedTab == OperatorTab.BASES,
                    onClick = { onTabSelected(OperatorTab.BASES) },
                    icon = { Text("B") },
                    label = { Text("Bases") },
                )
                NavigationBarItem(
                    selected = selectedTab == OperatorTab.SETTINGS,
                    onClick = { onTabSelected(OperatorTab.SETTINGS) },
                    icon = { androidx.compose.material3.Icon(Icons.Default.Settings, contentDescription = null) },
                    label = { Text("Settings") },
                )
            }
        },
    ) { padding ->
        Box(modifier = Modifier.padding(padding)) { content() }
    }
}

@Composable
fun OperatorMapScreen(
    bases: List<Base>,
    teamLocations: List<TeamLocationResponse>,
    onBaseSelected: (Base) -> Unit,
    onRefresh: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(modifier = modifier.fillMaxSize()) {
        GoogleMap(modifier = Modifier.fillMaxSize()) {
            bases.forEach { base ->
                Marker(
                    state = MarkerState(LatLng(base.lat, base.lng)),
                    title = base.name,
                    snippet = "Base",
                    onClick = {
                        onBaseSelected(base)
                        true
                    },
                )
            }
            teamLocations.forEach { location ->
                Marker(
                    state = MarkerState(LatLng(location.lat, location.lng)),
                    title = "Team ${location.teamId.take(6)}",
                    snippet = location.updatedAt,
                )
            }
        }
        Button(
            onClick = onRefresh,
            modifier = Modifier
                .align(Alignment.TopEnd)
                .padding(12.dp),
        ) {
            Text("Refresh")
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LiveBaseProgressBottomSheet(
    base: Base,
    progress: List<TeamBaseProgressResponse>,
    onDismiss: () -> Unit,
) {
    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(base.name, style = MaterialTheme.typography.titleLarge)
            Spacer(Modifier.height(8.dp))
            val grouped = progress.filter { it.baseId == base.id }
            Text("Teams: ${grouped.size}")
            Spacer(Modifier.height(8.dp))
            grouped.forEach { item ->
                Text("Team ${item.teamId.take(6)} - ${item.status}")
            }
            Spacer(Modifier.height(16.dp))
        }
    }
}

@Composable
fun OperatorBasesScreen(
    bases: List<Base>,
    onSelectBase: (Base) -> Unit,
    modifier: Modifier = Modifier,
) {
    LazyColumn(
        modifier = modifier
            .fillMaxSize()
            .padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        items(bases) { base ->
            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { onSelectBase(base) },
                tonalElevation = 1.dp,
                shape = MaterialTheme.shapes.medium,
            ) {
                Column(modifier = Modifier.padding(12.dp)) {
                    Text(base.name, fontWeight = FontWeight.SemiBold)
                    Spacer(Modifier.height(4.dp))
                    Text("${base.lat}, ${base.lng}", style = MaterialTheme.typography.bodySmall)
                    Spacer(Modifier.height(4.dp))
                    Text(if (base.nfcLinked) "NFC linked" else "NFC not linked")
                }
            }
        }
    }
}

@Composable
fun OperatorBaseDetailScreen(
    base: Base,
    assignmentSummary: String,
    writeStatus: String?,
    onBack: () -> Unit,
    onWriteNfc: () -> Unit,
    onLinkBackend: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(16.dp),
    ) {
        Text(base.name, style = MaterialTheme.typography.titleLarge)
        Spacer(Modifier.height(8.dp))
        Text(base.description)
        Spacer(Modifier.height(8.dp))
        Text("Presence required: ${base.requirePresenceToSubmit}")
        Spacer(Modifier.height(8.dp))
        Text("Assignments: $assignmentSummary")
        Spacer(Modifier.height(12.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(onClick = onBack) { Text("Back") }
            Button(onClick = onWriteNfc) { Text("Write NFC") }
            Button(onClick = onLinkBackend) { Text("Link in Backend") }
        }
        if (!writeStatus.isNullOrBlank()) {
            Spacer(Modifier.height(12.dp))
            Text(writeStatus, color = if (writeStatus.contains("success", ignoreCase = true)) Color(0xFF0F7A36) else MaterialTheme.colorScheme.error)
        }
    }
}

@Composable
fun OperatorSettingsScreen(
    gameName: String?,
    gameStatus: String?,
    currentLanguage: String,
    onLanguageChanged: (String) -> Unit,
    onSwitchGame: () -> Unit,
    onLogout: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("Settings", style = MaterialTheme.typography.titleLarge)
        Text("Game: ${gameName ?: "-"}")
        Text("Status: ${gameStatus ?: "-"}")
        Text("Language: ${currentLanguage.uppercase()}")
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf("en", "pt", "de").forEach { lang ->
                Button(onClick = { onLanguageChanged(lang) }) {
                    Text(lang.uppercase())
                }
            }
        }
        Button(onClick = onSwitchGame) { Text("Switch game") }
        Button(onClick = onLogout) { Text("Logout") }
    }
}
