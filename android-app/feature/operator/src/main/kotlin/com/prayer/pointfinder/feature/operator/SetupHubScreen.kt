package com.prayer.pointfinder.feature.operator

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.FormatListNumbered
import androidx.compose.material.icons.filled.Group
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.Tag
import androidx.compose.material3.AlertDialog
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
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.prayer.pointfinder.core.designsystem.PFSpacingToken
import com.prayer.pointfinder.core.i18n.R
import com.prayer.pointfinder.core.model.Assignment
import com.prayer.pointfinder.core.model.Base
import com.prayer.pointfinder.core.model.Challenge
import com.prayer.pointfinder.core.model.Game
import com.prayer.pointfinder.core.model.GameStatus
import com.prayer.pointfinder.core.model.Team

@Composable
fun SetupHubScreen(
    game: Game,
    bases: List<Base>,
    challenges: List<Challenge>,
    teams: List<Team>,
    assignments: List<Assignment>,
    teamVariablesIncomplete: Boolean = false,
    onNavigateToMap: () -> Unit = {},
    onNavigateToBases: () -> Unit,
    onNavigateToChallenges: () -> Unit,
    onNavigateToTeams: () -> Unit,
    onNavigateToStages: () -> Unit = {},
    onNavigateToTags: () -> Unit = {},
    onGoLive: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val warnings = buildWarnings(bases, challenges, teams, assignments, teamVariablesIncomplete)
    val readinessItems = buildReadinessItems(bases, challenges, teams, assignments, teamVariablesIncomplete)
    val readyCount = readinessItems.count { it.ready }
    val linkedNfc = bases.count { it.nfcLinked }
    var showGoLiveDialog by remember { mutableStateOf(false) }

    Column(
        modifier = modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp, vertical = 16.dp),
        verticalArrangement = Arrangement.spacedBy(PFSpacingToken.Space4),
    ) {
        SetupGameHeader(game)

        SetupSpatialSummary(
            title = stringResource(R.string.setup_spatial_plan),
            description = stringResource(R.string.setup_spatial_plan_description),
            basesLabel = stringResource(R.string.setup_bases_count, bases.size),
            nfcLabel = stringResource(R.string.setup_nfc_count, linkedNfc, bases.size),
            assignmentsLabel = stringResource(R.string.setup_assignments_count, assignments.size),
            openMapLabel = stringResource(R.string.setup_open_map),
            onOpenMap = onNavigateToMap,
        )

        SetupReadinessPanel(
            title = stringResource(R.string.setup_launch_readiness),
            readyLabel = stringResource(R.string.setup_ready_count, readyCount, readinessItems.size),
            items = readinessItems,
        )

        Text(
            stringResource(R.string.label_manage).uppercase(),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Column(verticalArrangement = Arrangement.spacedBy(PFSpacingToken.Space2)) {
            SetupResourceRow(Icons.Default.LocationOn, stringResource(R.string.label_bases), bases.size.toString(), if (bases.isEmpty()) OperatorTone.PENDING else OperatorTone.INFO, onNavigateToBases)
            SetupResourceRow(Icons.Default.Star, stringResource(R.string.label_challenges), challenges.size.toString(), if (challenges.isEmpty()) OperatorTone.PENDING else OperatorTone.INFO, onNavigateToChallenges)
            SetupResourceRow(Icons.Default.Group, stringResource(R.string.label_teams), teams.size.toString(), if (teams.isEmpty()) OperatorTone.PENDING else OperatorTone.INFO, onNavigateToTeams, Modifier.testTag("nav-teams"))
            SetupResourceRow(Icons.Default.FormatListNumbered, stringResource(R.string.label_stages), stringResource(R.string.setup_configure), OperatorTone.MUTED, onNavigateToStages)
            SetupResourceRow(Icons.Default.Tag, stringResource(R.string.tags_manage), stringResource(R.string.setup_configure), OperatorTone.MUTED, onNavigateToTags)
        }

        SetupLaunchButton(stringResource(R.string.label_go_live), warnings.isEmpty(), { showGoLiveDialog = true })
        Spacer(Modifier.height(PFSpacingToken.Space2))
    }

    if (showGoLiveDialog) {
        AlertDialog(
            onDismissRequest = { showGoLiveDialog = false },
            title = { Text(stringResource(R.string.label_go_live_confirm_title)) },
            text = { Text(stringResource(R.string.label_go_live_confirm_message)) },
            confirmButton = {
                TextButton(onClick = { showGoLiveDialog = false; onGoLive() }) { Text(stringResource(R.string.label_go_live)) }
            },
            dismissButton = { TextButton(onClick = { showGoLiveDialog = false }) { Text(stringResource(R.string.action_cancel)) } },
        )
    }
}

@Composable
private fun SetupGameHeader(game: Game) {
    Surface(modifier = Modifier.fillMaxWidth(), shape = MaterialTheme.shapes.large, color = MaterialTheme.colorScheme.surface) {
        Row(modifier = Modifier.padding(PFSpacingToken.Space4), verticalAlignment = Alignment.CenterVertically) {
            Column(modifier = Modifier.weight(1f)) {
                Text(game.name, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                Text(
                    when (game.status) {
                        GameStatus.SETUP -> stringResource(R.string.game_status_setup)
                        GameStatus.LIVE -> stringResource(R.string.game_status_live)
                        GameStatus.ENDED -> stringResource(R.string.game_status_ended)
                    }.uppercase(),
                    style = MaterialTheme.typography.labelSmall,
                    color = operatorToneColor(if (game.status == GameStatus.SETUP) OperatorTone.INFO else OperatorTone.SUCCESS),
                    modifier = Modifier.testTag("game-status-label"),
                )
            }
            OperatorStatusBadge(stringResource(R.string.setup_field_plan), OperatorTone.INFO)
        }
    }
}

@Composable
private fun buildReadinessItems(
    bases: List<Base>,
    challenges: List<Challenge>,
    teams: List<Team>,
    assignments: List<Assignment>,
    teamVariablesIncomplete: Boolean,
): List<SetupReadinessItem> {
    val fixedChallengeIds = bases.mapNotNull { it.fixedChallengeId }.toSet()
    val assignedChallengeIds = assignments.map { it.challengeId }.toSet()
    val unassignedLocationBound = challenges.count { it.locationBound && it.id !in fixedChallengeIds && it.id !in assignedChallengeIds }
    val challengeReady = challenges.isNotEmpty() && (bases.isEmpty() || challenges.size >= bases.size) && unassignedLocationBound == 0
    val nfcMissing = bases.count { !it.nfcLinked }
    return listOf(
        SetupReadinessItem(stringResource(R.string.label_bases), if (bases.isEmpty()) stringResource(R.string.label_no_bases) else stringResource(R.string.setup_bases_count, bases.size), bases.isNotEmpty()),
        SetupReadinessItem(stringResource(R.string.setup_nfc), if (nfcMissing > 0) stringResource(R.string.label_nfc_missing, nfcMissing) else stringResource(R.string.setup_nfc_ready), bases.isNotEmpty() && nfcMissing == 0),
        SetupReadinessItem(stringResource(R.string.label_challenges), if (challengeReady) stringResource(R.string.setup_challenges_ready, challenges.size) else challengeReadinessDetail(challenges, bases, unassignedLocationBound), challengeReady),
        SetupReadinessItem(stringResource(R.string.label_teams), if (teams.isEmpty()) stringResource(R.string.label_no_teams) else stringResource(R.string.setup_teams_ready, teams.size), teams.isNotEmpty()),
        SetupReadinessItem(stringResource(R.string.setup_team_variables), if (teamVariablesIncomplete) stringResource(R.string.warning_team_variables_incomplete) else stringResource(R.string.setup_team_variables_ready), !teamVariablesIncomplete),
    )
}

@Composable
private fun challengeReadinessDetail(challenges: List<Challenge>, bases: List<Base>, unassignedLocationBound: Int): String = when {
    challenges.isEmpty() -> stringResource(R.string.label_no_challenges)
    unassignedLocationBound > 0 -> stringResource(R.string.label_location_bound_unassigned, unassignedLocationBound)
    challenges.size < bases.size -> stringResource(R.string.label_not_enough_challenges)
    else -> stringResource(R.string.setup_challenges_ready, challenges.size)
}

@Composable
private fun buildWarnings(
    bases: List<Base>,
    challenges: List<Challenge>,
    teams: List<Team>,
    assignments: List<Assignment>,
    teamVariablesIncomplete: Boolean,
): List<String> {
    val warnings = mutableListOf<String>()
    if (bases.isEmpty()) warnings += stringResource(R.string.label_no_bases)
    val unlinkedNfc = bases.count { !it.nfcLinked }
    if (unlinkedNfc > 0) warnings += stringResource(R.string.label_nfc_missing, unlinkedNfc)
    if (challenges.isEmpty()) warnings += stringResource(R.string.label_no_challenges)
    if (teams.isEmpty()) warnings += stringResource(R.string.label_no_teams)
    val fixedChallengeIds = bases.mapNotNull { it.fixedChallengeId }.toSet()
    val assignedChallengeIds = assignments.map { it.challengeId }.toSet()
    val unassignedLocationBound = challenges.count { it.locationBound && it.id !in fixedChallengeIds && it.id !in assignedChallengeIds }
    if (unassignedLocationBound > 0) warnings += stringResource(R.string.label_location_bound_unassigned, unassignedLocationBound)
    if (challenges.isNotEmpty() && bases.isNotEmpty() && challenges.size < bases.size) warnings += stringResource(R.string.label_not_enough_challenges)
    if (teamVariablesIncomplete) warnings += stringResource(R.string.warning_team_variables_incomplete)
    return warnings
}
