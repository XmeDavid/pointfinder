package com.prayer.pointfinder.feature.operator

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
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
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.unit.dp
import com.prayer.pointfinder.core.i18n.R
import com.prayer.pointfinder.core.model.CreateTagRequest
import com.prayer.pointfinder.core.model.GameTag
import com.prayer.pointfinder.core.model.OperatorError
import com.prayer.pointfinder.core.model.UpdateTagRequest
import kotlinx.coroutines.launch

// MARK: - Palette (16 WCAG-safe hues, matches web-admin colorPalette.ts)

private val TAG_COLOR_PALETTE = listOf(
    "#3b82f6", // blue
    "#ef4444", // red
    "#22c55e", // green
    "#f59e0b", // amber
    "#a855f7", // purple
    "#ec4899", // pink
    "#14b8a6", // teal
    "#f97316", // orange
    "#6366f1", // indigo
    "#84cc16", // lime
    "#06b6d4", // cyan
    "#e11d48", // rose
    "#8b5cf6", // violet
    "#10b981", // emerald
    "#f43f5e", // fuchsia-red
    "#0ea5e9", // sky
)

private fun nextPaletteColor(usedColors: List<String>): String {
    val usedSet = usedColors.map { it.lowercase() }.toSet()
    for (color in TAG_COLOR_PALETTE) {
        if (color.lowercase() !in usedSet) return color
    }
    return TAG_COLOR_PALETTE[usedColors.size % TAG_COLOR_PALETTE.size]
}

private fun parseHexColor(hex: String): Color {
    return try {
        val cleaned = hex.trimStart('#')
        val value = cleaned.toLong(16)
        Color(
            red = ((value shr 16) and 0xFF) / 255f,
            green = ((value shr 8) and 0xFF) / 255f,
            blue = (value and 0xFF) / 255f,
        )
    } catch (_: Exception) {
        Color(0xFF3b82f6)
    }
}

/** Compute white or black foreground for WCAG contrast on the given hex background. */
private fun contrastingTextColor(hex: String): Color {
    return try {
        val cleaned = hex.trimStart('#')
        val value = cleaned.toLong(16)
        val r = ((value shr 16) and 0xFF) / 255.0
        val g = ((value shr 8) and 0xFF) / 255.0
        val b = (value and 0xFF) / 255.0
        fun lin(c: Double) = if (c <= 0.04045) c / 12.92 else Math.pow((c + 0.055) / 1.055, 2.4)
        val luminance = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
        if (luminance > 0.179) Color.Black else Color.White
    } catch (_: Exception) {
        Color.White
    }
}

private fun friendlyTagError(e: Exception, strings: ManageTagStrings): String {
    val msg = e.message ?: ""
    return when {
        e is OperatorError.Conflict || msg.contains("duplicate_label", ignoreCase = true)
            || msg.contains("TAG_LABEL_DUPLICATE", ignoreCase = true) -> strings.duplicateLabel
        msg.contains("TAG_CAP_EXCEEDED", ignoreCase = true)
            || msg.contains("max_per_game", ignoreCase = true) -> strings.atCap
        msg.contains("TAG_IN_USE", ignoreCase = true) -> strings.inUse
        else -> msg
    }
}

data class ManageTagStrings(
    val duplicateLabel: String,
    val atCap: String,
    val inUse: String,
)

// MARK: - ManageTagsScreen

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun ManageTagsScreen(
    gameId: String,
    onBack: () -> Unit,
    loadTags: suspend () -> List<GameTag>,
    createTag: suspend (CreateTagRequest) -> GameTag,
    updateTag: suspend (tagId: String, UpdateTagRequest) -> GameTag,
    deleteTag: suspend (tagId: String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val scope = rememberCoroutineScope()
    val haptic = LocalHapticFeedback.current
    val tags = remember { mutableStateListOf<GameTag>() }
    var isLoading by remember { mutableStateOf(true) }
    var errorMessage by remember { mutableStateOf<String?>(null) }

    // New tag
    var newLabel by remember { mutableStateOf("") }
    var isCreating by remember { mutableStateOf(false) }
    var createError by remember { mutableStateOf<String?>(null) }

    // Edit state
    var editingTag by remember { mutableStateOf<GameTag?>(null) }
    var editLabel by remember { mutableStateOf("") }
    var editColor by remember { mutableStateOf("") }
    var isSaving by remember { mutableStateOf(false) }
    var saveError by remember { mutableStateOf<String?>(null) }

    // Delete confirmation
    var tagToDelete by remember { mutableStateOf<GameTag?>(null) }

    val strings = ManageTagStrings(
        duplicateLabel = stringResource(R.string.tags_duplicate_label_error),
        atCap = stringResource(R.string.tags_at_cap_error),
        inUse = stringResource(R.string.tags_in_use_error),
    )

    LaunchedEffect(gameId) {
        try {
            val result = loadTags()
            tags.clear()
            tags.addAll(result)
        } catch (e: Exception) {
            errorMessage = e.message
        } finally {
            isLoading = false
        }
    }

    // Delete confirmation dialog
    tagToDelete?.let { tag ->
        AlertDialog(
            onDismissRequest = { tagToDelete = null },
            title = { Text(stringResource(R.string.tags_delete_confirm_title)) },
            text = { Text(stringResource(R.string.tags_delete_confirm_message, tag.label)) },
            confirmButton = {
                TextButton(onClick = {
                    val t = tagToDelete ?: return@TextButton
                    tagToDelete = null
                    haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                    scope.launch {
                        try {
                            deleteTag(t.id)
                            tags.removeAll { it.id == t.id }
                        } catch (e: Exception) {
                            errorMessage = friendlyTagError(e, strings)
                        }
                    }
                }) {
                    Text(stringResource(R.string.action_delete), color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = {
                TextButton(onClick = { tagToDelete = null }) {
                    Text(stringResource(R.string.action_cancel))
                }
            },
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.tags_manage_title)) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = stringResource(R.string.action_back))
                    }
                },
            )
        },
        modifier = modifier,
    ) { padding ->
        if (isLoading) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
                contentAlignment = Alignment.Center,
            ) { CircularProgressIndicator() }
        } else {
            LazyColumn(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .padding(horizontal = 16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                // Error banner
                if (errorMessage != null) {
                    item {
                        Text(
                            text = errorMessage!!,
                            color = MaterialTheme.colorScheme.error,
                            style = MaterialTheme.typography.bodySmall,
                            modifier = Modifier.padding(vertical = 4.dp),
                        )
                    }
                }

                // Usage count
                item {
                    Spacer(Modifier.height(8.dp))
                    Text(
                        text = stringResource(R.string.tags_usage_count, tags.size, 50),
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }

                // Empty state
                if (tags.isEmpty()) {
                    item {
                        Text(
                            text = stringResource(R.string.tags_no_tags_yet),
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(vertical = 16.dp),
                        )
                    }
                }

                // Tag rows
                items(tags, key = { it.id }) { tag ->
                    if (editingTag?.id == tag.id) {
                        // Edit mode card
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .background(
                                    MaterialTheme.colorScheme.surfaceVariant,
                                    MaterialTheme.shapes.medium,
                                )
                                .padding(12.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            OutlinedTextField(
                                value = editLabel,
                                onValueChange = { editLabel = it },
                                label = { Text(stringResource(R.string.tags_label_placeholder)) },
                                modifier = Modifier.fillMaxWidth(),
                                singleLine = true,
                            )

                            // Color palette grid
                            FlowRow(
                                horizontalArrangement = Arrangement.spacedBy(6.dp),
                                verticalArrangement = Arrangement.spacedBy(6.dp),
                            ) {
                                TAG_COLOR_PALETTE.forEach { color ->
                                    val selected = editColor.lowercase() == color.lowercase()
                                    Box(
                                        modifier = Modifier
                                            .size(32.dp)
                                            .clip(CircleShape)
                                            .background(parseHexColor(color))
                                            .border(
                                                width = if (selected) 2.dp else 0.dp,
                                                color = MaterialTheme.colorScheme.onSurface,
                                                shape = CircleShape,
                                            )
                                            .clickable { editColor = color },
                                        contentAlignment = Alignment.Center,
                                    ) {
                                        if (selected) {
                                            Icon(
                                                Icons.Default.Check,
                                                contentDescription = null,
                                                tint = contrastingTextColor(color),
                                                modifier = Modifier.size(16.dp),
                                            )
                                        }
                                    }
                                }
                            }

                            if (saveError != null) {
                                Text(
                                    text = saveError!!,
                                    color = MaterialTheme.colorScheme.error,
                                    style = MaterialTheme.typography.bodySmall,
                                )
                            }

                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.End,
                            ) {
                                TextButton(onClick = {
                                    editingTag = null
                                    saveError = null
                                }) {
                                    Text(stringResource(R.string.action_cancel))
                                }
                                Spacer(Modifier.width(8.dp))
                                Button(
                                    onClick = {
                                        val t = editingTag ?: return@Button
                                        haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                                        scope.launch {
                                            isSaving = true
                                            saveError = null
                                            try {
                                                val updated = updateTag(
                                                    t.id,
                                                    UpdateTagRequest(
                                                        label = editLabel.trim().ifEmpty { null },
                                                        color = editColor.ifEmpty { null },
                                                    ),
                                                )
                                                val idx = tags.indexOfFirst { it.id == t.id }
                                                if (idx >= 0) tags[idx] = updated
                                                editingTag = null
                                            } catch (e: Exception) {
                                                saveError = friendlyTagError(e, strings)
                                            } finally {
                                                isSaving = false
                                            }
                                        }
                                    },
                                    enabled = editLabel.trim().isNotEmpty() && !isSaving,
                                ) {
                                    Text(stringResource(R.string.operator_save))
                                }
                            }
                        }
                    } else {
                        // View mode row
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 4.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(10.dp),
                                modifier = Modifier.weight(1f),
                            ) {
                                Box(
                                    modifier = Modifier
                                        .size(22.dp)
                                        .clip(CircleShape)
                                        .background(parseHexColor(tag.color))
                                        .border(0.5.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.3f), CircleShape),
                                )
                                Text(
                                    text = tag.label,
                                    style = MaterialTheme.typography.bodyLarge,
                                    fontWeight = FontWeight.Medium,
                                )
                            }
                            Row {
                                IconButton(onClick = {
                                    editingTag = tag
                                    editLabel = tag.label
                                    editColor = tag.color
                                    saveError = null
                                }) {
                                    Icon(
                                        Icons.Default.Edit,
                                        contentDescription = stringResource(R.string.action_edit),
                                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                                IconButton(onClick = { tagToDelete = tag }) {
                                    Icon(
                                        Icons.Default.Delete,
                                        contentDescription = stringResource(R.string.action_delete),
                                        tint = MaterialTheme.colorScheme.error,
                                    )
                                }
                            }
                        }
                    }
                }

                // Create new tag row (only when under cap)
                if (tags.size < 50) {
                    item {
                        Spacer(Modifier.height(8.dp))
                        Text(
                            stringResource(R.string.tags_add_tag),
                            style = MaterialTheme.typography.labelLarge,
                            fontWeight = FontWeight.SemiBold,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Spacer(Modifier.height(4.dp))
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            OutlinedTextField(
                                value = newLabel,
                                onValueChange = { newLabel = it },
                                placeholder = { Text(stringResource(R.string.tags_new_tag_placeholder)) },
                                modifier = Modifier.weight(1f),
                                singleLine = true,
                            )
                            IconButton(
                                onClick = {
                                    val label = newLabel.trim()
                                    if (label.isEmpty() || isCreating) return@IconButton
                                    haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                                    scope.launch {
                                        isCreating = true
                                        createError = null
                                        try {
                                            val color = nextPaletteColor(tags.map { it.color })
                                            val created = createTag(
                                                CreateTagRequest(label = label, color = color)
                                            )
                                            tags.add(created)
                                            newLabel = ""
                                        } catch (e: Exception) {
                                            createError = friendlyTagError(e, strings)
                                        } finally {
                                            isCreating = false
                                        }
                                    }
                                },
                                enabled = newLabel.trim().isNotEmpty() && !isCreating,
                            ) {
                                if (isCreating) {
                                    CircularProgressIndicator(modifier = Modifier.size(20.dp))
                                } else {
                                    Icon(
                                        Icons.Default.Add,
                                        contentDescription = stringResource(R.string.tags_add_tag),
                                        tint = if (newLabel.trim().isNotEmpty())
                                            MaterialTheme.colorScheme.primary
                                        else
                                            MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                            }
                        }
                        if (createError != null) {
                            Text(
                                text = createError!!,
                                color = MaterialTheme.colorScheme.error,
                                style = MaterialTheme.typography.bodySmall,
                            )
                        }
                        Spacer(Modifier.height(16.dp))
                    }
                }
            }
        }
    }
}
