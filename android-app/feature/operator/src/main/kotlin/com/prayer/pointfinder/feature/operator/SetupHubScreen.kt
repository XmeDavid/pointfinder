package com.prayer.pointfinder.feature.operator

import androidx.compose.foundation.Canvas
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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.FormatListNumbered
import androidx.compose.material.icons.filled.Group
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.Tag
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
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
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
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
    teamVariablesIncomplete: Boolean = false,
    onNavigateToBases: () -> Unit,
    onNavigateToChallenges: () -> Unit,
    onNavigateToTeams: () -> Unit,
    onNavigateToStages: () -> Unit = {},
    onNavigateToTags: () -> Unit = {},
    onGoLive: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val warnings = buildWarnings(bases, challenges, teams, assignments, teamVariablesIncomplete)
    val hasWarnings = warnings.isNotEmpty()
    var showGoLiveDialog by remember { mutableStateOf(false) }

    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 20.dp, vertical = 16.dp),
        verticalArrangement = Arrangement.spacedBy(20.dp),
    ) {
        // Game header card
        GameHeaderCard(game = game, warnings = warnings)

        // Warnings section
        if (hasWarnings) {
            WarningsSection(warnings = warnings)
        }

        // Manage section
        ManageSection(
            bases = bases,
            challenges = challenges,
            teams = teams,
            onNavigateToBases = onNavigateToBases,
            onNavigateToChallenges = onNavigateToChallenges,
            onNavigateToTeams = onNavigateToTeams,
            onNavigateToStages = onNavigateToStages,
            onNavigateToTags = onNavigateToTags,
        )

        // Go Live button
        GoLiveButton(
            enabled = !hasWarnings,
            onClick = { showGoLiveDialog = true },
        )

        Spacer(Modifier.height(8.dp))
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

// ─────────────────────────────────────────────────────────────────────────────
// Game header card
// ─────────────────────────────────────────────────────────────────────────────

@Composable
private fun GameHeaderCard(game: Game, warnings: List<SetupWarning>) {
    Surface(
        shape = RoundedCornerShape(14.dp),
        color = MaterialTheme.colorScheme.surface,
        tonalElevation = 1.dp,
        shadowElevation = 2.dp,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = game.name,
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                )
                Spacer(Modifier.height(4.dp))
                val statusColor = when (game.status) {
                    GameStatus.LIVE  -> StatusCompleted
                    GameStatus.SETUP -> StatusSubmitted
                    GameStatus.ENDED -> StatusRejected
                }
                Surface(
                    shape = RoundedCornerShape(50),
                    color = statusColor.copy(alpha = 0.15f),
                ) {
                    Text(
                        text = when (game.status) {
                            GameStatus.SETUP -> stringResource(R.string.game_status_setup)
                            GameStatus.LIVE -> stringResource(R.string.game_status_live)
                            GameStatus.ENDED -> stringResource(R.string.game_status_ended)
                        }.uppercase(),
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.SemiBold,
                        color = statusColor,
                        modifier = Modifier
                            .padding(horizontal = 10.dp, vertical = 4.dp)
                            .testTag("game-status-label"),
                    )
                }
            }

            Spacer(Modifier.width(12.dp))

            // Readiness ring
            ReadinessRing(warnings = warnings)
        }
    }
}

@Composable
private fun ReadinessRing(warnings: List<SetupWarning>) {
    val total = 5
    val passing = (total - warnings.size).coerceAtLeast(0)
    val progress = if (warnings.isEmpty()) 1f else passing.toFloat() / total.toFloat()
    val ringColor = if (warnings.isEmpty()) StatusCompleted else StatusSubmitted
    val trackColor = MaterialTheme.colorScheme.outlineVariant

    Box(contentAlignment = Alignment.Center, modifier = Modifier.size(44.dp)) {
        Canvas(modifier = Modifier.size(44.dp)) {
            val strokeWidth = 3.dp.toPx()
            val inset = strokeWidth / 2f
            val sweepAngle = progress * 360f

            // Track arc
            drawArc(
                color = trackColor,
                startAngle = -90f,
                sweepAngle = 360f,
                useCenter = false,
                style = Stroke(width = strokeWidth, cap = StrokeCap.Round),
            )
            // Progress arc
            drawArc(
                color = ringColor,
                startAngle = -90f,
                sweepAngle = sweepAngle,
                useCenter = false,
                style = Stroke(width = strokeWidth, cap = StrokeCap.Round),
            )
        }
        Text(
            text = if (warnings.isEmpty()) "✓" else "$passing/$total",
            style = MaterialTheme.typography.labelSmall.copy(
                fontSize = 10.sp,
                fontWeight = FontWeight.Bold,
            ),
            color = ringColor,
        )
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Warnings section
// ─────────────────────────────────────────────────────────────────────────────

@Composable
private fun WarningsSection(warnings: List<SetupWarning>) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            text = stringResource(R.string.label_needs_attention).uppercase(),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(start = 4.dp),
        )
        warnings.forEach { warning ->
            Surface(
                shape = RoundedCornerShape(10.dp),
                color = WarningAmber.copy(alpha = 0.08f),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(
                        imageVector = Icons.Default.Warning,
                        contentDescription = stringResource(R.string.cd_warning),
                        tint = WarningAmber,
                        modifier = Modifier.size(20.dp),
                    )
                    Spacer(Modifier.width(10.dp))
                    Text(
                        text = warning.text,
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.weight(1f),
                    )
                }
            }
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Manage section
// ─────────────────────────────────────────────────────────────────────────────

@Composable
private fun ManageSection(
    bases: List<Base>,
    challenges: List<Challenge>,
    teams: List<Team>,
    onNavigateToBases: () -> Unit,
    onNavigateToChallenges: () -> Unit,
    onNavigateToTeams: () -> Unit,
    onNavigateToStages: () -> Unit,
    onNavigateToTags: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            text = stringResource(R.string.label_manage).uppercase(),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(start = 4.dp),
        )
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            ManageCard(
                icon = Icons.Default.Tag,
                label = stringResource(R.string.tags_manage),
                count = null,
                onClick = onNavigateToTags,
            )
            ManageCard(
                icon = Icons.Default.LocationOn,
                label = stringResource(R.string.label_bases),
                count = bases.size,
                onClick = onNavigateToBases,
            )
            ManageCard(
                icon = Icons.Default.Star,
                label = stringResource(R.string.label_challenges),
                count = challenges.size,
                onClick = onNavigateToChallenges,
            )
            ManageCard(
                icon = Icons.Default.Group,
                label = stringResource(R.string.label_teams),
                count = teams.size,
                onClick = onNavigateToTeams,
                modifier = Modifier.testTag("nav-teams"),
            )
            ManageCard(
                icon = Icons.Default.FormatListNumbered,
                label = stringResource(R.string.label_stages),
                count = null,
                onClick = onNavigateToStages,
            )
        }
    }
}

@Composable
private fun ManageCard(
    icon: ImageVector,
    label: String,
    count: Int?,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        shape = RoundedCornerShape(14.dp),
        color = MaterialTheme.colorScheme.surface,
        tonalElevation = 1.dp,
        shadowElevation = 2.dp,
        modifier = modifier.fillMaxWidth(),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable(onClick = onClick)
                .padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            // Icon badge
            Surface(
                shape = RoundedCornerShape(8.dp),
                color = StatusCompleted.copy(alpha = 0.1f),
                modifier = Modifier.size(32.dp),
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(
                        imageVector = icon,
                        contentDescription = null,
                        tint = StatusCompleted,
                        modifier = Modifier.size(18.dp),
                    )
                }
            }

            Spacer(Modifier.width(12.dp))

            Text(
                text = label,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Medium,
                modifier = Modifier.weight(1f),
            )

            if (count != null) {
                Text(
                    text = "$count",
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.width(4.dp))
            }

            Icon(
                imageVector = Icons.AutoMirrored.Filled.KeyboardArrowRight,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(18.dp),
            )
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Go Live button
// ─────────────────────────────────────────────────────────────────────────────

@Composable
private fun GoLiveButton(enabled: Boolean, onClick: () -> Unit) {
    FilledTonalButton(
        onClick = onClick,
        enabled = enabled,
        shape = RoundedCornerShape(12.dp),
        colors = ButtonDefaults.filledTonalButtonColors(
            containerColor = StatusCompleted,
            contentColor = Color.White,
            disabledContainerColor = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.12f),
            disabledContentColor = MaterialTheme.colorScheme.onSurfaceVariant,
        ),
        modifier = Modifier
            .fillMaxWidth()
            .height(52.dp)
            .testTag("game-activate-btn"),
    ) {
        Icon(
            imageVector = Icons.Default.PlayArrow,
            contentDescription = null,
            modifier = Modifier.size(18.dp),
        )
        Spacer(Modifier.width(8.dp))
        Text(
            text = stringResource(R.string.label_go_live),
            style = MaterialTheme.typography.bodyLarge,
            fontWeight = FontWeight.Bold,
        )
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Warning model + builder
// ─────────────────────────────────────────────────────────────────────────────

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
    teamVariablesIncomplete: Boolean,
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

    val fixedChallengeIds = bases.mapNotNull { it.fixedChallengeId }.toSet()
    val assignedChallengeIds = assignments.map { it.challengeId }.toSet()
    val unassignedLocationBound = challenges.count {
        it.locationBound && it.id !in fixedChallengeIds && it.id !in assignedChallengeIds
    }
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

    if (teamVariablesIncomplete) {
        warnings += SetupWarning(
            text = stringResource(R.string.warning_team_variables_incomplete),
            onClick = {},
        )
    }

    return warnings
}
