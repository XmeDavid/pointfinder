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
import com.prayer.pointfinder.core.i18n.R
import com.prayer.pointfinder.core.model.Assignment
import com.prayer.pointfinder.core.model.Base
import com.prayer.pointfinder.core.model.Challenge
import com.prayer.pointfinder.core.model.GameTag

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChallengesListScreen(
    challenges: List<Challenge>,
    bases: List<Base>,
    assignments: List<Assignment>,
    gameTags: List<GameTag> = emptyList(),
    onSelectChallenge: (Challenge) -> Unit,
    onCreateChallenge: () -> Unit,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var selectedTagIds by remember { mutableStateOf(emptySet<String>()) }
    val filteredChallenges = remember(challenges, selectedTagIds) {
        if (selectedTagIds.isEmpty()) challenges
        else challenges.filter { ch ->
            selectedTagIds.all { tagId -> ch.tagIds?.contains(tagId) == true }
        }
    }

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
            Column(
                modifier = modifier
                    .fillMaxSize()
                    .padding(padding),
            ) {
                if (gameTags.isNotEmpty()) {
                    TagFilterRow(
                        tags = gameTags,
                        selectedTagIds = selectedTagIds,
                        onToggleTag = { tagId ->
                            selectedTagIds = if (selectedTagIds.contains(tagId)) {
                                selectedTagIds - tagId
                            } else {
                                selectedTagIds + tagId
                            }
                        },
                        onClearFilters = { selectedTagIds = emptySet() },
                        clearLabel = stringResource(R.string.label_clear_filters),
                    )
                }
                if (filteredChallenges.isEmpty()) {
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            text = stringResource(R.string.label_no_challenges_filtered),
                            style = MaterialTheme.typography.bodyLarge,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                } else {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        verticalArrangement = Arrangement.spacedBy(10.dp),
                        contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 16.dp, vertical = 12.dp),
                    ) {
                        items(filteredChallenges, key = { it.id }) { challenge ->
                            val fixedBaseAssignment = assignments.firstOrNull {
                                it.challengeId == challenge.id && it.teamId == null
                            }
                            val linkedBaseName = fixedBaseAssignment?.let { assignment ->
                                bases.firstOrNull { it.id == assignment.baseId }?.name
                            } ?: bases.firstOrNull { it.fixedChallengeId == challenge.id }?.name
                            val answerTypeBadge = when (challenge.answerType) {
                                "file" -> stringResource(R.string.label_file_upload)
                                "none" -> stringResource(R.string.label_check_in_only)
                                else -> stringResource(R.string.label_text_input)
                            }

                            Surface(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .testTag("challenge-edit-btn")
                                    .clickable { onSelectChallenge(challenge) },
                                tonalElevation = 1.dp,
                                shadowElevation = 2.dp,
                                shape = androidx.compose.foundation.shape.RoundedCornerShape(14.dp),
                            ) {
                                Column(modifier = Modifier.padding(14.dp)) {
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically,
                                    ) {
                                        Text(
                                            text = challenge.title,
                                            fontWeight = FontWeight.Bold,
                                            style = MaterialTheme.typography.titleSmall,
                                            modifier = Modifier.weight(1f).padding(end = 8.dp),
                                        )
                                        Text(
                                            text = stringResource(R.string.label_pts, challenge.points),
                                            style = MaterialTheme.typography.labelLarge,
                                            color = StarGold,
                                            fontWeight = FontWeight.Bold,
                                        )
                                    }
                                    Spacer(Modifier.height(6.dp))
                                    Row(
                                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                    ) {
                                        Text(
                                            text = linkedBaseName ?: stringResource(R.string.label_no_base),
                                            style = MaterialTheme.typography.bodySmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                            modifier = Modifier.weight(1f, fill = false),
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
    }
}
