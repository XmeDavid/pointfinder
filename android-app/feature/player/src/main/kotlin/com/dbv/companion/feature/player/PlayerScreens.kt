package com.dbv.companion.feature.player

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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Map
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.dbv.companion.core.model.BaseProgress
import com.dbv.companion.core.model.BaseStatus
import com.dbv.companion.core.model.CheckInResponse
import com.dbv.companion.core.model.SubmissionResponse
import com.google.android.gms.maps.model.LatLng
import com.google.maps.android.compose.GoogleMap
import com.google.maps.android.compose.Marker
import com.google.maps.android.compose.MarkerState

enum class PlayerTab {
    MAP,
    CHECK_IN,
    SETTINGS,
}

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
                        .background(Color(0xFFE08A00))
                        .padding(8.dp),
                ) {
                    Text(
                        text = "Offline mode",
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
                    icon = { Icon(Icons.Default.Map, contentDescription = "Map") },
                    label = { Text("Map") },
                )
                NavigationBarItem(
                    selected = selectedTab == PlayerTab.CHECK_IN,
                    onClick = { onTabSelected(PlayerTab.CHECK_IN) },
                    icon = { Icon(Icons.Default.LocationOn, contentDescription = "Check In") },
                    label = { Text("Check In") },
                )
                NavigationBarItem(
                    selected = selectedTab == PlayerTab.SETTINGS,
                    onClick = { onTabSelected(PlayerTab.SETTINGS) },
                    icon = { Icon(Icons.Default.Settings, contentDescription = "Settings") },
                    label = { Text("Settings") },
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
fun PlayerMapScreen(
    progress: List<BaseProgress>,
    isLoading: Boolean,
    onBaseSelected: (BaseProgress) -> Unit,
    onRefresh: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(modifier = modifier.fillMaxSize()) {
        GoogleMap(
            modifier = Modifier.fillMaxSize(),
        ) {
            progress.forEach { item ->
                Marker(
                    state = MarkerState(position = LatLng(item.lat, item.lng)),
                    title = item.baseName,
                    snippet = item.status,
                    onClick = {
                        onBaseSelected(item)
                        true
                    },
                )
            }
        }

        Surface(
            modifier = Modifier
                .align(Alignment.TopStart)
                .padding(12.dp),
            shape = MaterialTheme.shapes.medium,
            tonalElevation = 2.dp,
        ) {
            Column(modifier = Modifier.padding(8.dp)) {
                Text("Legend", fontWeight = FontWeight.Bold)
                Text("Not visited")
                Text("Checked in")
                Text("Pending review")
                Text("Completed")
                Text("Rejected")
            }
        }

        Button(
            onClick = onRefresh,
            modifier = Modifier
                .align(Alignment.TopEnd)
                .padding(12.dp),
        ) {
            if (isLoading) {
                CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
            } else {
                Text("Refresh")
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BaseDetailBottomSheet(
    baseProgress: BaseProgress,
    challenge: CheckInResponse.ChallengeInfo?,
    onCheckIn: () -> Unit,
    onSolve: () -> Unit,
    onDismiss: () -> Unit,
) {
    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(baseProgress.baseName, style = MaterialTheme.typography.titleLarge)
            Spacer(Modifier.height(8.dp))
            Text("Status: ${baseProgress.status}")
            Spacer(Modifier.height(8.dp))
            Text(challenge?.description ?: "No challenge details yet.")
            Spacer(Modifier.height(12.dp))
            when (baseProgress.baseStatus()) {
                BaseStatus.NOT_VISITED -> Button(onClick = onCheckIn) { Text("Check in") }
                BaseStatus.CHECKED_IN, BaseStatus.REJECTED -> Button(onClick = onSolve) { Text("Solve") }
                BaseStatus.SUBMITTED -> Text("Awaiting review")
                BaseStatus.COMPLETED -> Text("Completed")
            }
            Spacer(Modifier.height(8.dp))
        }
    }
}

@Composable
fun CheckInScreen(
    pendingActionsCount: Int,
    scanError: String?,
    onScan: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(Icons.Default.LocationOn, contentDescription = null, modifier = Modifier.size(64.dp))
        Spacer(Modifier.height(12.dp))
        Button(onClick = onScan) {
            Text("Scan NFC")
        }
        Spacer(Modifier.height(12.dp))
        if (pendingActionsCount > 0) {
            Text("Pending sync: $pendingActionsCount")
        }
        if (!scanError.isNullOrBlank()) {
            Spacer(Modifier.height(8.dp))
            Text(scanError, color = MaterialTheme.colorScheme.error)
        }
    }
}

@Composable
fun BaseCheckInDetailScreen(
    response: CheckInResponse,
    isOffline: Boolean,
    onSolve: (baseId: String, challengeId: String) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(16.dp),
    ) {
        Text("Checked in at ${response.baseName}", style = MaterialTheme.typography.titleLarge)
        if (isOffline) {
            Spacer(Modifier.height(8.dp))
            Text("Offline: data will sync when online.", color = Color(0xFFE08A00))
        }
        Spacer(Modifier.height(12.dp))
        val challenge = response.challenge
        if (challenge != null) {
            Text(challenge.title, style = MaterialTheme.typography.titleMedium)
            Spacer(Modifier.height(8.dp))
            Text(challenge.description)
            Spacer(Modifier.height(12.dp))
            Button(onClick = { onSolve(response.baseId, challenge.id) }) {
                Text("Solve challenge")
            }
        } else {
            Text("No challenge assigned.")
        }
    }
}

@Composable
fun SolveScreen(
    answer: String,
    onAnswerChange: (String) -> Unit,
    isPhotoMode: Boolean,
    presenceRequired: Boolean,
    presenceVerified: Boolean,
    onVerifyPresence: () -> Unit,
    onPickPhoto: () -> Unit,
    onCapturePhoto: () -> Unit,
    onSubmit: () -> Unit,
    isOnline: Boolean,
    errorMessage: String?,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(16.dp),
    ) {
        Text("Solve challenge", style = MaterialTheme.typography.titleLarge)
        Spacer(Modifier.height(12.dp))

        if (presenceRequired) {
            Text("Presence verification required.")
            Spacer(Modifier.height(8.dp))
            Button(onClick = onVerifyPresence, enabled = !presenceVerified) {
                Text(if (presenceVerified) "Presence verified" else "Verify with NFC")
            }
            Spacer(Modifier.height(12.dp))
        }

        if (isPhotoMode) {
            Text("Photo answer mode")
            Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = onPickPhoto) { Text("Choose Photo") }
                Button(onClick = onCapturePhoto) { Text("Take Photo") }
            }
            Spacer(Modifier.height(8.dp))
            if (!isOnline) {
                Text("Photo submissions require internet.", color = MaterialTheme.colorScheme.error)
            }
        } else {
            OutlinedTextField(
                value = answer,
                onValueChange = onAnswerChange,
                modifier = Modifier.fillMaxWidth(),
                minLines = 5,
                label = { Text("Answer") },
            )
        }

        if (!errorMessage.isNullOrBlank()) {
            Spacer(Modifier.height(8.dp))
            Text(errorMessage, color = MaterialTheme.colorScheme.error)
        }

        Spacer(Modifier.height(12.dp))
        Button(
            onClick = onSubmit,
            enabled = (!isPhotoMode || isOnline) && (!presenceRequired || presenceVerified),
        ) {
            Text("Submit")
        }
    }
}

@Composable
fun SubmissionResultScreen(
    submission: SubmissionResponse,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(Icons.Default.CheckCircle, contentDescription = null, modifier = Modifier.size(72.dp))
        Spacer(Modifier.height(12.dp))
        Text("Submission status: ${submission.status}", style = MaterialTheme.typography.titleLarge)
        if (!submission.feedback.isNullOrBlank()) {
            Spacer(Modifier.height(8.dp))
            Text(submission.feedback)
        }
        Spacer(Modifier.height(16.dp))
        Button(onClick = onBack) {
            Text("Back to map")
        }
    }
}

@Composable
fun PlayerSettingsScreen(
    gameName: String?,
    teamName: String?,
    displayName: String?,
    deviceId: String,
    pendingActionsCount: Int,
    currentLanguage: String,
    onLanguageChanged: (String) -> Unit,
    onLogout: () -> Unit,
    modifier: Modifier = Modifier,
) {
    LazyColumn(
        modifier = modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item { Text("Settings", style = MaterialTheme.typography.titleLarge) }
        item { Text("Game: ${gameName ?: "-"}") }
        item { Text("Team: ${teamName ?: "-"}") }
        item { Text("Player: ${displayName ?: "-"}") }
        item { Text("Pending actions: $pendingActionsCount") }
        item { Text("Device ID: ${deviceId.take(12)}") }
        item {
            Text("Language", style = MaterialTheme.typography.titleMedium)
            Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf("en", "pt", "de").forEach { lang ->
                    TextButton(onClick = { onLanguageChanged(lang) }) {
                        Text(
                            text = lang.uppercase(),
                            fontWeight = if (lang == currentLanguage) FontWeight.Bold else FontWeight.Normal,
                        )
                    }
                }
            }
        }
        item {
            Button(onClick = onLogout, modifier = Modifier.fillMaxWidth()) {
                Text("Leave Game")
            }
        }
    }
}
