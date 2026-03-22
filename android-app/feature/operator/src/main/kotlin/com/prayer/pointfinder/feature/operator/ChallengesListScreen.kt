package com.prayer.pointfinder.feature.operator

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
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.prayer.pointfinder.core.i18n.R
import com.prayer.pointfinder.core.model.Assignment
import com.prayer.pointfinder.core.model.Base
import com.prayer.pointfinder.core.model.Challenge

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChallengesListScreen(
    challenges: List<Challenge>,
    bases: List<Base>,
    assignments: List<Assignment>,
    onSelectChallenge: (Challenge) -> Unit,
    onCreateChallenge: () -> Unit,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.label_challenges)) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = stringResource(R.string.action_back))
                    }
                },
            )
        },
        floatingActionButton = {
            FloatingActionButton(onClick = onCreateChallenge, modifier = Modifier.testTag("create-challenge-btn")) {
                Icon(Icons.Default.Add, contentDescription = stringResource(R.string.label_new_challenge))
            }
        },
    ) { padding ->
        if (challenges.isEmpty()) {
            Box(
                modifier = modifier
                    .fillMaxSize()
                    .padding(padding),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = stringResource(R.string.label_no_challenges),
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        } else {
            LazyColumn(
                modifier = modifier
                    .fillMaxSize()
                    .padding(padding)
                    .padding(12.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                items(challenges, key = { it.id }) { challenge ->
                    val fixedBaseAssignment = assignments.firstOrNull {
                        it.challengeId == challenge.id && it.teamId == null
                    }
                    val linkedBaseName = fixedBaseAssignment?.let { assignment ->
                        bases.firstOrNull { it.id == assignment.baseId }?.name
                    } ?: bases.firstOrNull { it.fixedChallengeId == challenge.id }?.name
                    val answerTypeBadge = if (challenge.answerType == "file") {
                        stringResource(R.string.label_file_upload)
                    } else {
                        stringResource(R.string.label_text_input)
                    }

                    Surface(
                        modifier = Modifier
                            .fillMaxWidth()
                            .testTag("challenge-edit-btn")
                            .clickable { onSelectChallenge(challenge) },
                        tonalElevation = 2.dp,
                        shape = MaterialTheme.shapes.medium,
                    ) {
                        Column(modifier = Modifier.padding(12.dp)) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Text(
                                    text = challenge.title,
                                    fontWeight = FontWeight.SemiBold,
                                    modifier = Modifier.weight(1f),
                                )
                                Text(
                                    text = stringResource(R.string.label_pts, challenge.points),
                                    style = MaterialTheme.typography.labelMedium,
                                    color = StarGold,
                                    fontWeight = FontWeight.SemiBold,
                                )
                            }
                            Spacer(Modifier.height(4.dp))
                            Row(
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Text(
                                    text = linkedBaseName ?: stringResource(R.string.label_no_base),
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                                CapsuleBadge(
                                    label = answerTypeBadge,
                                    color = BadgeIndigo,
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}
