package com.prayer.pointfinder.feature.operator

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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextOverflow
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
fun BasesListScreen(
    bases: List<Base>,
    challenges: List<Challenge>,
    assignments: List<Assignment>,
    gameTags: List<GameTag> = emptyList(),
    onSelectBase: (Base) -> Unit,
    onCreateBase: () -> Unit,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var selectedTagIds by remember { mutableStateOf(emptySet<String>()) }
    val filteredBases = remember(bases, selectedTagIds) {
        if (selectedTagIds.isEmpty()) bases
        else bases.filter { base ->
            selectedTagIds.all { tagId -> base.tagIds?.contains(tagId) == true }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.label_bases)) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = stringResource(R.string.action_back))
                    }
                },
            )
        },
        floatingActionButton = {
            FloatingActionButton(onClick = onCreateBase, modifier = Modifier.testTag("create-base-btn")) {
                Icon(Icons.Default.Add, contentDescription = stringResource(R.string.label_new_base))
            }
        },
    ) { padding ->
        if (bases.isEmpty()) {
            Box(
                modifier = modifier
                    .fillMaxSize()
                    .padding(padding),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = stringResource(R.string.label_no_bases),
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
                if (filteredBases.isEmpty()) {
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            text = stringResource(R.string.label_no_bases_filtered),
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
                        items(filteredBases, key = { it.id }) { base ->
                            val baseAssignments = assignments.filter { it.baseId == base.id }
                            val perTeamCount = baseAssignments.count { it.teamId != null }
                            val globalAssignment = baseAssignments.firstOrNull { it.teamId == null }
                            val challengeSubtitle = when {
                                perTeamCount >= 2 -> stringResource(R.string.label_custom_assignment)
                                perTeamCount == 1 && globalAssignment == null -> stringResource(R.string.label_custom_assignment)
                                globalAssignment != null -> {
                                    challenges.firstOrNull { it.id == globalAssignment.challengeId }?.title
                                        ?: stringResource(R.string.label_no_challenge)
                                }
                                base.fixedChallengeId != null -> {
                                    challenges.firstOrNull { it.id == base.fixedChallengeId }?.title
                                        ?: stringResource(R.string.label_no_challenge)
                                }
                                else -> stringResource(R.string.label_no_challenge)
                            }
                            val nfcColor = if (base.nfcLinked) StatusCompleted else StatusSubmitted
                            val nfcLabel = if (base.nfcLinked) {
                                stringResource(R.string.label_nfc_linked)
                            } else {
                                stringResource(R.string.label_nfc_not_linked)
                            }
                            Surface(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .testTag("base-edit-btn")
                                    .clickable { onSelectBase(base) },
                                tonalElevation = 1.dp,
                                shadowElevation = 2.dp,
                                shape = androidx.compose.foundation.shape.RoundedCornerShape(14.dp),
                            ) {
                                Row(
                                    modifier = Modifier.padding(14.dp),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Column(modifier = Modifier.weight(1f).padding(end = 8.dp)) {
                                        Text(
                                            text = base.name,
                                            fontWeight = FontWeight.Bold,
                                            style = MaterialTheme.typography.titleSmall,
                                        )
                                        if (base.description.isNotBlank()) {
                                            Spacer(Modifier.height(2.dp))
                                            Text(
                                                text = base.description,
                                                style = MaterialTheme.typography.bodySmall,
                                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                                maxLines = 1,
                                                overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
                                            )
                                        }
                                        Spacer(Modifier.height(4.dp))
                                        Text(
                                            text = challengeSubtitle,
                                            style = MaterialTheme.typography.bodySmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        )
                                    }
                                    Row(
                                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                    ) {
                                        if (base.hidden) {
                                            CapsuleBadge(
                                                label = stringResource(R.string.label_hidden_base),
                                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                            )
                                        }
                                        // NFC dot + label badge matching iOS style
                                        Surface(
                                            shape = androidx.compose.foundation.shape.RoundedCornerShape(50),
                                            color = nfcColor.copy(alpha = 0.15f),
                                        ) {
                                            Row(
                                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                                                verticalAlignment = Alignment.CenterVertically,
                                                horizontalArrangement = Arrangement.spacedBy(4.dp),
                                            ) {
                                                androidx.compose.foundation.layout.Box(
                                                    modifier = Modifier
                                                        .size(7.dp)
                                                        .clip(androidx.compose.foundation.shape.CircleShape)
                                                        .background(nfcColor),
                                                )
                                                Text(
                                                    text = nfcLabel,
                                                    style = MaterialTheme.typography.labelSmall,
                                                    color = nfcColor,
                                                    fontWeight = FontWeight.SemiBold,
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
    }
}
