package com.prayer.pointfinder.feature.operator

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
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
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MenuAnchorType
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import com.prayer.pointfinder.core.model.Base
import com.prayer.pointfinder.core.model.CreateStageRequest
import com.prayer.pointfinder.core.model.Stage
import com.prayer.pointfinder.core.model.UpdateStageRequest

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StageEditScreen(
    stage: Stage?,
    bases: List<Base>,
    onSave: (Any) -> Unit,
    onDelete: (() -> Unit)?,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val isEditMode = stage != null

    // Form state
    var name by remember { mutableStateOf(stage?.name ?: "") }
    var description by remember { mutableStateOf(stage?.description ?: "") }
    var transitionType by remember { mutableStateOf(stage?.transitionType ?: "manual") }
    var scheduledAt by remember { mutableStateOf(stage?.scheduledAt ?: "") }
    var triggerBaseId by remember { mutableStateOf<String?>(stage?.triggerBaseId) }

    // Menu state
    var showOverflowMenu by remember { mutableStateOf(false) }
    var showDeleteDialog by remember { mutableStateOf(false) }

    // Trigger base dropdown state
    var triggerBaseExpanded by remember { mutableStateOf(false) }

    val canSave = name.isNotBlank()
    val title = if (isEditMode) stage!!.name else stringResource(R.string.label_new_stage)

    // Transition type options
    val transitionOptions = listOf("manual", "scheduled", "trigger")
    val transitionLabels = listOf(
        stringResource(R.string.label_transition_manual),
        stringResource(R.string.label_transition_scheduled),
        stringResource(R.string.label_transition_trigger),
    )

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(title) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(
                            Icons.Default.ArrowBack,
                            contentDescription = stringResource(R.string.action_back),
                        )
                    }
                },
                actions = {
                    if (isEditMode && onDelete != null) {
                        Box {
                            IconButton(
                                onClick = { showOverflowMenu = true },
                                modifier = Modifier.testTag("stage-overflow-btn"),
                            ) {
                                Icon(
                                    Icons.Default.MoreVert,
                                    contentDescription = stringResource(R.string.action_more_options),
                                )
                            }
                            DropdownMenu(
                                expanded = showOverflowMenu,
                                onDismissRequest = { showOverflowMenu = false },
                            ) {
                                DropdownMenuItem(
                                    text = {
                                        Text(
                                            stringResource(R.string.label_delete_stage),
                                            color = MaterialTheme.colorScheme.error,
                                        )
                                    },
                                    leadingIcon = {
                                        Icon(
                                            Icons.Default.Delete,
                                            contentDescription = null,
                                            tint = MaterialTheme.colorScheme.error,
                                        )
                                    },
                                    onClick = {
                                        showOverflowMenu = false
                                        showDeleteDialog = true
                                    },
                                    modifier = Modifier.testTag("stage-delete-btn"),
                                )
                            }
                        }
                    }
                },
            )
        },
    ) { padding ->
        Column(
            modifier = modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp),
        ) {
            Spacer(Modifier.height(8.dp))

            // Name field
            OutlinedTextField(
                value = name,
                onValueChange = { name = it },
                label = { Text(stringResource(R.string.label_stage_name)) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth().testTag("stage-name-input"),
            )

            Spacer(Modifier.height(12.dp))

            // Description field
            OutlinedTextField(
                value = description,
                onValueChange = { description = it },
                label = { Text(stringResource(R.string.label_description)) },
                minLines = 3,
                maxLines = 5,
                modifier = Modifier.fillMaxWidth(),
            )

            Spacer(Modifier.height(16.dp))

            // Transition type selector
            Text(
                text = stringResource(R.string.label_transition_type),
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(6.dp))
            SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
                transitionOptions.forEachIndexed { index, option ->
                    SegmentedButton(
                        selected = transitionType == option,
                        onClick = { transitionType = option },
                        shape = SegmentedButtonDefaults.itemShape(index = index, count = transitionOptions.size),
                    ) {
                        Text(transitionLabels[index])
                    }
                }
            }

            // Scheduled at field (only when transition type is "scheduled")
            if (transitionType == "scheduled") {
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = scheduledAt,
                    onValueChange = { scheduledAt = it },
                    label = { Text(stringResource(R.string.label_scheduled_at)) },
                    placeholder = { Text("e.g. 2026-06-01T10:00:00") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
            }

            // Trigger base dropdown (only when transition type is "trigger")
            if (transitionType == "trigger") {
                Spacer(Modifier.height(12.dp))
                val selectedBaseName = triggerBaseId?.let { id ->
                    bases.firstOrNull { it.id == id }?.name
                } ?: stringResource(R.string.label_none_trigger_base)

                ExposedDropdownMenuBox(
                    expanded = triggerBaseExpanded,
                    onExpandedChange = { triggerBaseExpanded = it },
                ) {
                    OutlinedTextField(
                        value = selectedBaseName,
                        onValueChange = {},
                        readOnly = true,
                        label = { Text(stringResource(R.string.label_trigger_base)) },
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = triggerBaseExpanded) },
                        modifier = Modifier
                            .menuAnchor(MenuAnchorType.PrimaryNotEditable)
                            .fillMaxWidth(),
                    )
                    ExposedDropdownMenu(
                        expanded = triggerBaseExpanded,
                        onDismissRequest = { triggerBaseExpanded = false },
                    ) {
                        DropdownMenuItem(
                            text = { Text(stringResource(R.string.label_none_trigger_base)) },
                            onClick = {
                                triggerBaseId = null
                                triggerBaseExpanded = false
                            },
                        )
                        bases.forEach { base ->
                            DropdownMenuItem(
                                text = { Text(base.name) },
                                onClick = {
                                    triggerBaseId = base.id
                                    triggerBaseExpanded = false
                                },
                            )
                        }
                    }
                }
            }

            // Assigned bases (read-only, edit mode only)
            if (isEditMode && !stage!!.baseIds.isNullOrEmpty()) {
                Spacer(Modifier.height(24.dp))
                Text(
                    text = stringResource(R.string.label_assigned_bases, stage.baseIds!!.size),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                )
                Spacer(Modifier.height(8.dp))
                stage.baseIds!!.forEach { baseId ->
                    val baseName = bases.firstOrNull { it.id == baseId }?.name ?: baseId
                    Text(
                        text = "• $baseName",
                        style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 2.dp),
                    )
                }
            }

            Spacer(Modifier.height(24.dp))

            // Save button
            Button(
                onClick = {
                    val resolvedTriggerBaseId = if (transitionType == "trigger") triggerBaseId else null
                    val resolvedScheduledAt = if (transitionType == "scheduled" && scheduledAt.isNotBlank()) scheduledAt else null
                    if (isEditMode) {
                        onSave(
                            UpdateStageRequest(
                                name = name,
                                description = description.ifBlank { null },
                                transitionType = transitionType,
                                scheduledAt = resolvedScheduledAt,
                                triggerBaseId = resolvedTriggerBaseId,
                            ),
                        )
                    } else {
                        onSave(
                            CreateStageRequest(
                                name = name,
                                description = description.ifBlank { null },
                                transitionType = transitionType,
                                scheduledAt = resolvedScheduledAt,
                                triggerBaseId = resolvedTriggerBaseId,
                            ),
                        )
                    }
                },
                enabled = canSave,
                modifier = Modifier.fillMaxWidth().testTag("stage-save-btn"),
            ) {
                Text(stringResource(R.string.action_save))
            }

            Spacer(Modifier.height(24.dp))
        }
    }

    // Delete confirmation dialog
    if (showDeleteDialog && onDelete != null) {
        AlertDialog(
            onDismissRequest = { showDeleteDialog = false },
            title = { Text(stringResource(R.string.label_delete_stage)) },
            text = { Text(stringResource(R.string.label_delete_stage_confirm)) },
            confirmButton = {
                TextButton(onClick = {
                    showDeleteDialog = false
                    onDelete()
                }) {
                    Text(
                        stringResource(R.string.label_delete_stage),
                        color = MaterialTheme.colorScheme.error,
                    )
                }
            },
            dismissButton = {
                TextButton(onClick = { showDeleteDialog = false }) {
                    Text(stringResource(R.string.action_cancel))
                }
            },
        )
    }
}
