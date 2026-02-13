package com.dbv.companion.feature.operator

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
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
import androidx.compose.material.icons.filled.Settings
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Nfc
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.dbv.companion.core.i18n.R
import androidx.compose.ui.draw.clip
import com.dbv.companion.core.model.Assignment
import com.dbv.companion.core.model.Base
import com.dbv.companion.core.model.Challenge
import com.dbv.companion.core.model.Game
import com.dbv.companion.core.model.Team
import com.dbv.companion.core.model.TeamBaseProgressResponse
import com.dbv.companion.core.model.TeamLocationResponse
import androidx.compose.runtime.LaunchedEffect
import com.google.android.gms.maps.CameraUpdateFactory
import com.google.android.gms.maps.model.LatLng
import com.google.android.gms.maps.model.LatLngBounds
import com.google.maps.android.compose.CameraPositionState
import com.google.maps.android.compose.GoogleMap
import com.google.maps.android.compose.Marker
import com.google.maps.android.compose.MarkerState

enum class OperatorTab {
    LIVE_MAP,
    BASES,
    SETTINGS,
}

private const val PRIVACY_POLICY_URL = "https://desbravadores.dev/privacy/"

@OptIn(ExperimentalMaterial3Api::class)
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
            TopAppBar(
                title = { Text(stringResource(R.string.label_operator)) },
                actions = {
                    TextButton(onClick = onRefresh) { Text(stringResource(R.string.action_refresh)) }
                    TextButton(onClick = onLogout) { Text(stringResource(R.string.action_logout)) }
                },
            )
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
                item { Text(stringResource(R.string.label_no_games)) }
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
                    label = { Text(stringResource(R.string.label_live_map)) },
                )
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

@Composable
fun OperatorMapScreen(
    bases: List<Base>,
    teamLocations: List<TeamLocationResponse>,
    cameraPositionState: CameraPositionState,
    onBaseSelected: (Base) -> Unit,
    onRefresh: () -> Unit,
    modifier: Modifier = Modifier,
) {
    LaunchedEffect(bases) {
        if (bases.isNotEmpty() && !cameraPositionState.isMoving) {
            val builder = LatLngBounds.builder()
            bases.forEach { builder.include(LatLng(it.lat, it.lng)) }
            runCatching {
                cameraPositionState.animate(CameraUpdateFactory.newLatLngBounds(builder.build(), 80))
            }
        }
    }

    Box(modifier = modifier.fillMaxSize()) {
        GoogleMap(modifier = Modifier.fillMaxSize(), cameraPositionState = cameraPositionState) {
            bases.forEach { base ->
                Marker(
                    state = MarkerState(LatLng(base.lat, base.lng)),
                    title = base.name,
                    snippet = stringResource(R.string.label_base_marker),
                    onClick = {
                        onBaseSelected(base)
                        true
                    },
                )
            }
            teamLocations.forEach { location ->
                Marker(
                    state = MarkerState(LatLng(location.lat, location.lng)),
                    title = stringResource(R.string.label_team_marker, location.teamId.take(6)),
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
            Text(stringResource(R.string.action_refresh))
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LiveBaseProgressBottomSheet(
    base: Base,
    progress: List<TeamBaseProgressResponse>,
    teams: List<Team>,
    onDismiss: () -> Unit,
) {
    val grouped = progress.filter { it.baseId == base.id }
    val completedCount = grouped.count { it.status == "completed" }
    val checkedInCount = grouped.count { it.status == "checked_in" }
    val pendingCount = grouped.count { it.status == "submitted" }
    val remainingCount = grouped.size - completedCount - checkedInCount - pendingCount

    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(base.name, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            if (base.description.isNotBlank()) {
                Spacer(Modifier.height(4.dp))
                Text(base.description, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Spacer(Modifier.height(12.dp))

            // Stat badges row
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                StatBadge(count = completedCount, label = stringResource(R.string.status_completed), color = Color(0xFF2E7D32), modifier = Modifier.weight(1f))
                StatBadge(count = pendingCount, label = stringResource(R.string.status_submitted), color = Color(0xFFE08A00), modifier = Modifier.weight(1f))
                StatBadge(count = checkedInCount, label = stringResource(R.string.status_checked_in), color = Color(0xFF1565C0), modifier = Modifier.weight(1f))
                StatBadge(count = remainingCount, label = stringResource(R.string.label_remaining), color = Color.Gray, modifier = Modifier.weight(1f))
            }
            Spacer(Modifier.height(16.dp))

            // Team rows
            grouped.forEach { item ->
                val team = teams.firstOrNull { it.id == item.teamId }
                val teamColor = team?.color?.let { c -> runCatching { Color(android.graphics.Color.parseColor(c)) }.getOrDefault(Color.Gray) } ?: Color.Gray
                val teamName = team?.name ?: item.teamId.take(8)
                val statusColor = when (item.status) {
                    "completed" -> Color(0xFF2E7D32)
                    "checked_in" -> Color(0xFF1565C0)
                    "submitted" -> Color(0xFFE08A00)
                    else -> Color.Gray
                }
                val statusLabel = when (item.status) {
                    "completed" -> stringResource(R.string.status_completed)
                    "checked_in" -> stringResource(R.string.status_checked_in)
                    "submitted" -> stringResource(R.string.status_submitted)
                    "rejected" -> stringResource(R.string.status_rejected)
                    else -> stringResource(R.string.status_not_visited)
                }
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Box(modifier = Modifier.size(10.dp).clip(CircleShape).background(teamColor))
                        Text(teamName, style = MaterialTheme.typography.bodyMedium)
                    }
                    Text(
                        text = statusLabel,
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Medium,
                        color = statusColor,
                        modifier = Modifier
                            .background(statusColor.copy(alpha = 0.12f), shape = MaterialTheme.shapes.small)
                            .padding(horizontal = 8.dp, vertical = 4.dp),
                    )
                }
            }
            Spacer(Modifier.height(16.dp))
        }
    }
}

@Composable
private fun StatBadge(count: Int, label: String, color: Color, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .background(color.copy(alpha = 0.1f), shape = MaterialTheme.shapes.small)
            .padding(vertical = 8.dp, horizontal = 4.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(count.toString(), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = color)
        Text(label, style = MaterialTheme.typography.labelSmall, color = color, maxLines = 1)
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
                    Text(
                        if (base.nfcLinked) {
                            stringResource(R.string.label_nfc_linked)
                        } else {
                            stringResource(R.string.label_nfc_not_linked)
                        },
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OperatorBaseDetailScreen(
    base: Base,
    challenges: List<Challenge>,
    assignments: List<Assignment>,
    teams: List<Team>,
    writeStatus: String?,
    writeSuccess: Boolean?,
    onBack: () -> Unit,
    onWriteNfc: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val baseAssignments = assignments.filter { it.baseId == base.id }
    val fixedChallenge = base.fixedChallengeId?.let { fid -> challenges.firstOrNull { it.id == fid } }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(base.name) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = stringResource(R.string.action_back))
                    }
                },
            )
        },
    ) { padding ->
        LazyColumn(
            modifier = modifier.fillMaxSize().padding(padding).padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            // Base info section
            item {
                Text(base.description, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    // NFC badge
                    val nfcColor = if (base.nfcLinked) Color(0xFF2E7D32) else Color(0xFFE08A00)
                    val nfcLabel = if (base.nfcLinked) stringResource(R.string.label_nfc_linked) else stringResource(R.string.label_nfc_not_linked)
                    CapsuleBadge(label = nfcLabel, color = nfcColor)
                    // Presence badge
                    if (base.requirePresenceToSubmit) {
                        CapsuleBadge(label = stringResource(R.string.label_presence_required), color = Color(0xFF1565C0))
                    }
                }
            }

            // NFC section
            item {
                SectionCard {
                    Text(stringResource(R.string.action_write_nfc), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    Spacer(Modifier.height(8.dp))
                    Button(
                        onClick = onWriteNfc,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Icon(Icons.Default.Nfc, contentDescription = null)
                        Spacer(Modifier.size(8.dp))
                        Text(stringResource(R.string.action_write_nfc))
                    }
                    if (!writeStatus.isNullOrBlank()) {
                        Spacer(Modifier.height(8.dp))
                        Text(
                            writeStatus,
                            color = if (writeSuccess == true) Color(0xFF2E7D32) else MaterialTheme.colorScheme.error,
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                }
            }

            // Challenge assignment section
            item {
                SectionCard {
                    Text(stringResource(R.string.label_challenge_assignment), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    Spacer(Modifier.height(8.dp))
                    if (fixedChallenge != null) {
                        CapsuleBadge(label = stringResource(R.string.label_fixed_challenge), color = Color(0xFF7B1FA2))
                        Spacer(Modifier.height(8.dp))
                        ChallengeCard(challenge = fixedChallenge)
                    } else if (baseAssignments.isEmpty()) {
                        Text(stringResource(R.string.label_random_not_started), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    } else {
                        CapsuleBadge(label = stringResource(R.string.label_randomly_assigned), color = Color(0xFF303F9F))
                        Spacer(Modifier.height(8.dp))
                        baseAssignments.forEach { assignment ->
                            val team = teams.firstOrNull { it.id == assignment.teamId }
                            val challenge = challenges.firstOrNull { it.id == assignment.challengeId }
                            if (team != null && challenge != null) {
                                TeamAssignmentRow(team = team, challenge = challenge)
                                Spacer(Modifier.height(6.dp))
                            }
                        }
                    }
                }
            }

            item { Spacer(Modifier.height(16.dp)) }
        }
    }
}

@Composable
private fun CapsuleBadge(label: String, color: Color) {
    Text(
        text = label,
        style = MaterialTheme.typography.labelSmall,
        fontWeight = FontWeight.Medium,
        color = color,
        modifier = Modifier
            .background(color.copy(alpha = 0.15f), shape = MaterialTheme.shapes.small)
            .padding(horizontal = 10.dp, vertical = 5.dp),
    )
}

@Composable
private fun SectionCard(content: @Composable ColumnScope.() -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f), shape = MaterialTheme.shapes.medium)
            .padding(14.dp),
        content = content,
    )
}

@Composable
private fun ChallengeCard(challenge: Challenge) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surface, shape = MaterialTheme.shapes.medium)
            .padding(12.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
            Text(challenge.title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                Icon(Icons.Default.Star, contentDescription = null, tint = Color(0xFFE08A00), modifier = Modifier.size(14.dp))
                Text("${challenge.points} pts", style = MaterialTheme.typography.labelSmall, color = Color(0xFFE08A00))
            }
        }
        Spacer(Modifier.height(4.dp))
        Text(challenge.description, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 3)
        Spacer(Modifier.height(4.dp))
        Text("Answer: ${challenge.answerType}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.outline)
    }
}

@Composable
private fun TeamAssignmentRow(team: Team, challenge: Challenge) {
    val teamColor = runCatching { Color(android.graphics.Color.parseColor(team.color)) }.getOrDefault(Color.Gray)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surface, shape = MaterialTheme.shapes.small)
            .padding(10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Box(modifier = Modifier.size(12.dp).clip(CircleShape).background(teamColor))
        Column(modifier = Modifier.weight(1f)) {
            Text(team.name, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
            Text(challenge.title, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(2.dp)) {
            Icon(Icons.Default.Star, contentDescription = null, tint = Color(0xFFE08A00), modifier = Modifier.size(12.dp))
            Text("${challenge.points}", style = MaterialTheme.typography.labelSmall, color = Color(0xFFE08A00))
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
    val context = LocalContext.current
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(stringResource(R.string.label_settings), style = MaterialTheme.typography.titleLarge)
        Text("${stringResource(R.string.label_game)}: ${gameName ?: "-"}")
        Text("${stringResource(R.string.label_status)}: ${gameStatus ?: "-"}")
        Text("${stringResource(R.string.label_language)}: ${currentLanguage.uppercase()}")
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf("en", "pt", "de").forEach { lang ->
                Button(onClick = { onLanguageChanged(lang) }) {
                    Text(lang.uppercase())
                }
            }
        }
        Button(
            onClick = {
                context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(PRIVACY_POLICY_URL)))
            },
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(stringResource(R.string.action_open_privacy_policy))
        }
        Button(onClick = onSwitchGame) { Text(stringResource(R.string.action_switch_game)) }
        Button(onClick = onLogout) { Text(stringResource(R.string.action_logout)) }
    }
}
