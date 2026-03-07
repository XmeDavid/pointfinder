package com.prayer.pointfinder.feature.operator

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.prayer.pointfinder.core.i18n.R
import com.prayer.pointfinder.core.model.Assignment
import com.prayer.pointfinder.core.model.Base
import com.prayer.pointfinder.core.model.Challenge
import com.prayer.pointfinder.core.model.Game
import com.prayer.pointfinder.core.model.GameStatus
import com.prayer.pointfinder.core.model.Team

private val WarningAmber = Color(0xFFE08A00)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SetupHubScreen(
    game: Game,
    bases: List<Base>,
    challenges: List<Challenge>,
    teams: List<Team>,
    assignments: List<Assignment>,
    onNavigateToBases: () -> Unit,
    onNavigateToChallenges: () -> Unit,
    onNavigateToTeams: () -> Unit,
    onGoLive: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val warnings = buildWarnings(bases, challenges, teams, assignments)
    val hasWarnings = warnings.isNotEmpty()
    var showGoLiveDialog by remember { mutableStateOf(false) }

    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 20.dp, vertical = 24.dp),
    ) {
        // Game name
        Text(
            text = game.name,
            style = MaterialTheme.typography.headlineMedium,
            fontWeight = FontWeight.Bold,
        )
        Spacer(Modifier.height(8.dp))

        // Status badge
        val statusColor = when (game.status) {
            GameStatus.LIVE -> StatusCompleted
            GameStatus.SETUP -> StatusSubmitted
            GameStatus.ENDED -> Color(0xFFD32F2F)
        }
        Text(
            text = "${stringResource(R.string.label_status)}: ${game.status.name.uppercase()}",
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.Medium,
            color = statusColor,
            modifier = Modifier.testTag("game-status-label"),
        )

        Spacer(Modifier.height(24.dp))

        // Needs Attention section
        if (hasWarnings) {
            SectionHeader(
                text = stringResource(R.string.label_needs_attention),
                color = WarningAmber,
            )
            Spacer(Modifier.height(8.dp))
            warnings.forEach { warning ->
                WarningRow(
                    text = warning.text,
                    onClick = warning.onClick,
                )
            }
            Spacer(Modifier.height(24.dp))
        }

        // Manage section
        SectionHeader(
            text = stringResource(R.string.label_manage),
            color = MaterialTheme.colorScheme.onSurface,
        )
        Spacer(Modifier.height(8.dp))
        ManageRow(
            label = stringResource(R.string.label_bases),
            count = bases.size,
            onClick = onNavigateToBases,
        )
        ManageRow(
            label = stringResource(R.string.label_challenges),
            count = challenges.size,
            onClick = onNavigateToChallenges,
        )
        ManageRow(
            label = stringResource(R.string.label_teams),
            count = teams.size,
            onClick = onNavigateToTeams,
        )

        Spacer(Modifier.height(32.dp))

        // Go Live button
        Button(
            onClick = { showGoLiveDialog = true },
            enabled = !hasWarnings,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(stringResource(R.string.label_go_live))
        }
    }

    if (showGoLiveDialog) {
        AlertDialog(
            onDismissRequest = { showGoLiveDialog = false },
            title = { Text(stringResource(R.string.label_go_live_confirm_title)) },
            text = { Text(stringResource(R.string.label_go_live_confirm_message)) },
            confirmButton = {
                TextButton(onClick = {
                    showGoLiveDialog = false
                    onGoLive()
                }) {
                    Text(stringResource(R.string.label_go_live))
                }
            },
            dismissButton = {
                TextButton(onClick = { showGoLiveDialog = false }) {
                    Text(stringResource(R.string.action_cancel))
                }
            },
        )
    }
}

@Composable
private fun SectionHeader(text: String, color: Color) {
    Text(
        text = text,
        style = MaterialTheme.typography.titleSmall,
        fontWeight = FontWeight.SemiBold,
        color = color,
    )
}

@Composable
private fun WarningRow(text: String, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = Icons.Default.Warning,
            contentDescription = null,
            tint = WarningAmber,
            modifier = Modifier.size(20.dp),
        )
        Text(
            text = text,
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier
                .weight(1f)
                .padding(horizontal = 12.dp),
        )
        Icon(
            imageVector = Icons.AutoMirrored.Filled.KeyboardArrowRight,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.size(20.dp),
        )
    }
}

@Composable
private fun ManageRow(label: String, count: Int, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyLarge,
        )
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = "($count)",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Icon(
                imageVector = Icons.AutoMirrored.Filled.KeyboardArrowRight,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier
                    .padding(start = 4.dp)
                    .size(20.dp),
            )
        }
    }
}

private data class SetupWarning(
    val text: String,
    val onClick: () -> Unit,
)

@Composable
private fun buildWarnings(
    bases: List<Base>,
    challenges: List<Challenge>,
    teams: List<Team>,
    assignments: List<Assignment>,
): List<SetupWarning> {
    val warnings = mutableListOf<SetupWarning>()

    if (bases.isEmpty()) {
        warnings += SetupWarning(
            text = stringResource(R.string.label_no_bases),
            onClick = {},
        )
    }

    val unlinkedNfc = bases.count { !it.nfcLinked }
    if (unlinkedNfc > 0) {
        warnings += SetupWarning(
            text = stringResource(R.string.label_nfc_missing, unlinkedNfc),
            onClick = {},
        )
    }

    if (challenges.isEmpty()) {
        warnings += SetupWarning(
            text = stringResource(R.string.label_no_challenges),
            onClick = {},
        )
    }

    if (teams.isEmpty()) {
        warnings += SetupWarning(
            text = stringResource(R.string.label_no_teams),
            onClick = {},
        )
    }

    val assignedChallengeIds = assignments.map { it.challengeId }.toSet()
    val unassignedLocationBound = challenges.count { it.locationBound && it.id !in assignedChallengeIds }
    if (unassignedLocationBound > 0) {
        warnings += SetupWarning(
            text = stringResource(R.string.label_location_bound_unassigned, unassignedLocationBound),
            onClick = {},
        )
    }

    if (challenges.isNotEmpty() && bases.isNotEmpty() && challenges.size < bases.size) {
        warnings += SetupWarning(
            text = stringResource(R.string.label_not_enough_challenges),
            onClick = {},
        )
    }

    return warnings
}
