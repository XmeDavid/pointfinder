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
                ManagementEmptyState(stringResource(R.string.label_no_stages))
            }
        } else {
            LazyColumn(
                modifier = modifier
                    .fillMaxSize()
                    .padding(padding)
                    .padding(12.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                item { ManagementListSummary(stringResource(R.string.label_stages), sortedStages.size) }
                items(sortedStages, key = { it.id }) { stage ->
                    val transitionLabel = when (stage.transitionType) {
                        "scheduled" -> stringResource(R.string.label_transition_scheduled)
                        "trigger" -> stringResource(R.string.label_transition_trigger)
                        else -> stringResource(R.string.label_transition_manual)
                    }
                    ManagementResourceRow(
                        title = stage.name,
                        subtitle = stage.description,
                        metadata = listOf(
                            ManagementMetadata(transitionLabel, OperatorTone.INFO),
                            ManagementMetadata(stringResource(R.string.label_bases_count, stage.baseIds?.size ?: 0), OperatorTone.MUTED),
                            ManagementMetadata(if (stage.isActive) stringResource(R.string.label_stage_active) else stringResource(R.string.label_stage_inactive), if (stage.isActive) OperatorTone.SUCCESS else OperatorTone.MUTED),
                        ),
                        onClick = { onSelectStage(stage) },
                        modifier = Modifier.testTag("stage-item"),
                        leadingIcon = Icons.Default.FormatListNumbered,
                    )
                }
            }
        }
    }
}
