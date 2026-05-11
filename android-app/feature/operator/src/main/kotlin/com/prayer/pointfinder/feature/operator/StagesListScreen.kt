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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.FormatListNumbered
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.prayer.pointfinder.core.i18n.R
import com.prayer.pointfinder.core.model.Base
import com.prayer.pointfinder.core.model.Stage

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StagesListScreen(
    stages: List<Stage>,
    onSelectStage: (Stage) -> Unit,
    onCreateStage: () -> Unit,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val sortedStages = stages.sortedBy { it.orderIndex }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.label_stages)) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(
                            Icons.Default.ArrowBack,
                            contentDescription = stringResource(R.string.action_back),
                        )
                    }
                },
            )
        },
        floatingActionButton = {
            FloatingActionButton(
                onClick = onCreateStage,
                modifier = Modifier.testTag("create-stage-btn"),
            ) {
                Icon(Icons.Default.Add, contentDescription = stringResource(R.string.label_new_stage))
            }
        },
    ) { padding ->
        if (stages.isEmpty()) {
            Box(
                modifier = modifier
                    .fillMaxSize()
                    .padding(padding),
                contentAlignment = Alignment.Center,
            ) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Icon(
                        Icons.Default.FormatListNumbered,
                        contentDescription = stringResource(R.string.cd_no_stages),
                        modifier = Modifier.size(48.dp),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Text(
                        text = stringResource(R.string.label_no_stages),
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        } else {
            LazyColumn(
                modifier = modifier
                    .fillMaxSize()
                    .padding(padding)
                    .padding(12.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                items(sortedStages, key = { it.id }) { stage ->
                    Surface(
                        modifier = Modifier
                            .fillMaxWidth()
                            .testTag("stage-item")
                            .clickable { onSelectStage(stage) },
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
                                    text = stage.name,
                                    style = MaterialTheme.typography.bodyLarge,
                                    fontWeight = FontWeight.SemiBold,
                                    modifier = Modifier.weight(1f),
                                )
                                // Active status dot
                                val dotColor = if (stage.isActive) StatusCompleted else MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.4f)
                                Box(
                                    modifier = Modifier
                                        .size(10.dp)
                                        .clip(CircleShape)
                                        .then(
                                            Modifier.padding(0.dp)
                                        ),
                                    contentAlignment = Alignment.Center,
                                ) {
                                    androidx.compose.foundation.Canvas(modifier = Modifier.size(10.dp)) {
                                        drawCircle(color = dotColor)
                                    }
                                }
                            }

                            if (stage.description.isNotBlank()) {
                                Spacer(Modifier.height(4.dp))
                                Text(
                                    text = stage.description,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    maxLines = 1,
                                )
                            }

                            Spacer(Modifier.height(8.dp))

                            Row(
                                horizontalArrangement = Arrangement.spacedBy(6.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                // Transition type badge
                                val transitionLabel = when (stage.transitionType) {
                                    "scheduled" -> stringResource(R.string.label_transition_scheduled)
                                    "trigger" -> stringResource(R.string.label_transition_trigger)
                                    else -> stringResource(R.string.label_transition_manual)
                                }
                                CapsuleBadge(
                                    label = transitionLabel,
                                    color = MaterialTheme.colorScheme.primary,
                                )

                                // Base count badge
                                val baseCount = stage.baseIds?.size ?: 0
                                CapsuleBadge(
                                    label = stringResource(R.string.label_bases_count, baseCount),
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )

                                Spacer(Modifier.width(4.dp))

                                // Active label
                                val activeLabel = if (stage.isActive) {
                                    stringResource(R.string.label_stage_active)
                                } else {
                                    stringResource(R.string.label_stage_inactive)
                                }
                                val activeColor = if (stage.isActive) StatusCompleted else MaterialTheme.colorScheme.onSurfaceVariant
                                Text(
                                    text = activeLabel,
                                    style = MaterialTheme.typography.labelSmall,
                                    color = activeColor,
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}
