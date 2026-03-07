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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.rememberDatePickerState
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
import com.prayer.pointfinder.core.model.Game
import com.prayer.pointfinder.core.model.GameStatus
import com.prayer.pointfinder.core.model.UpdateGameRequest
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GameSettingsScreen(
    game: Game,
    onSave: (UpdateGameRequest) -> Unit,
    onUpdateStatus: (String) -> Unit,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var name by remember(game.id) { mutableStateOf(game.name) }
    var description by remember(game.id) { mutableStateOf(game.description) }
    var startDate by remember(game.id) { mutableStateOf(game.startDate ?: "") }
    var endDate by remember(game.id) { mutableStateOf(game.endDate ?: "") }
    var uniformAssignment by remember(game.id) { mutableStateOf(game.uniformAssignment) }
    var broadcastEnabled by remember(game.id) { mutableStateOf(game.broadcastEnabled) }
    var tileSource by remember(game.id) { mutableStateOf(game.tileSource) }
    var tileSourceExpanded by remember { mutableStateOf(false) }
    var showStartDatePicker by remember { mutableStateOf(false) }
    var showEndDatePicker by remember { mutableStateOf(false) }
    var showGoLiveConfirm by remember { mutableStateOf(false) }
    var showEndGameConfirm by remember { mutableStateOf(false) }

    val tileSourceOptions = listOf(
        "osm" to "OpenStreetMap",
        "osm-classic" to "OpenStreetMap Classic",
        "voyager" to "CartoDB Voyager",
        "positron" to "CartoDB Positron",
        "swisstopo" to "SwissTopo",
        "swisstopo-sat" to "SwissTopo Satellite",
    )

    Column(modifier = modifier.fillMaxSize()) {
        TopAppBar(
            title = { Text(stringResource(R.string.label_game_settings)) },
            navigationIcon = {
                IconButton(onClick = onBack) {
                    Icon(Icons.Default.ArrowBack, contentDescription = stringResource(R.string.action_back))
                }
            },
        )

        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            item {
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text(stringResource(R.string.label_game_name)) },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )
            }

            item {
                OutlinedTextField(
                    value = description,
                    onValueChange = { description = it },
                    label = { Text(stringResource(R.string.label_description)) },
                    modifier = Modifier.fillMaxWidth(),
                    minLines = 2,
                    maxLines = 4,
                )
            }

            item {
                Box(modifier = Modifier.fillMaxWidth()) {
                    OutlinedTextField(
                        value = startDate,
                        onValueChange = {},
                        label = { Text(stringResource(R.string.label_start_date)) },
                        modifier = Modifier.fillMaxWidth(),
                        readOnly = true,
                    )
                    Box(
                        modifier = Modifier
                            .matchParentSize()
                            .clickable { showStartDatePicker = true },
                    )
                }
            }

            item {
                Box(modifier = Modifier.fillMaxWidth()) {
                    OutlinedTextField(
                        value = endDate,
                        onValueChange = {},
                        label = { Text(stringResource(R.string.label_end_date)) },
                        modifier = Modifier.fillMaxWidth(),
                        readOnly = true,
                    )
                    Box(
                        modifier = Modifier
                            .matchParentSize()
                            .clickable { showEndDatePicker = true },
                    )
                }
            }

            item {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        stringResource(R.string.label_uniform_assignment),
                        style = MaterialTheme.typography.bodyMedium,
                    )
                    Switch(
                        checked = uniformAssignment,
                        onCheckedChange = { uniformAssignment = it },
                    )
                }
            }

            item {
                Box {
                    OutlinedTextField(
                        value = tileSourceOptions.firstOrNull { it.first == tileSource }?.second ?: tileSource,
                        onValueChange = {},
                        label = { Text(stringResource(R.string.label_tile_source)) },
                        modifier = Modifier.fillMaxWidth(),
                        readOnly = true,
                    )
                    Box(
                        modifier = Modifier
                            .matchParentSize()
                            .clickable { tileSourceExpanded = true },
                    )
                    DropdownMenu(
                        expanded = tileSourceExpanded,
                        onDismissRequest = { tileSourceExpanded = false },
                    ) {
                        tileSourceOptions.forEach { (key, label) ->
                            DropdownMenuItem(
                                text = { Text(label) },
                                onClick = {
                                    tileSource = key
                                    tileSourceExpanded = false
                                },
                            )
                        }
                    }
                }
            }

            item {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        stringResource(R.string.label_broadcast),
                        style = MaterialTheme.typography.bodyMedium,
                    )
                    Switch(
                        checked = broadcastEnabled,
                        onCheckedChange = { broadcastEnabled = it },
                    )
                }
                val broadcastCode = game.broadcastCode
                if (broadcastEnabled && broadcastCode != null) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 4.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Text(
                            stringResource(R.string.label_broadcast_code),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Text(
                            broadcastCode,
                            style = MaterialTheme.typography.bodySmall,
                            fontWeight = FontWeight.Medium,
                        )
                    }
                }
            }

            item {
                Button(
                    onClick = {
                        onSave(
                            UpdateGameRequest(
                                name = name,
                                description = description,
                                startDate = startDate.ifBlank { null },
                                endDate = endDate.ifBlank { null },
                                uniformAssignment = uniformAssignment,
                                broadcastEnabled = broadcastEnabled,
                                tileSource = tileSource,
                            ),
                        )
                    },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(stringResource(R.string.action_save))
                }
            }

            // Status section
            item {
                Spacer(Modifier.height(8.dp))
                when (game.status) {
                    GameStatus.SETUP -> {
                        Button(
                            onClick = { showGoLiveConfirm = true },
                            modifier = Modifier.fillMaxWidth().testTag("game-activate-btn"),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = MaterialTheme.colorScheme.primary,
                            ),
                        ) {
                            Text(stringResource(R.string.label_go_live))
                        }
                    }
                    GameStatus.LIVE -> {
                        Button(
                            onClick = { showEndGameConfirm = true },
                            modifier = Modifier.fillMaxWidth(),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = MaterialTheme.colorScheme.error,
                            ),
                        ) {
                            Text(stringResource(R.string.label_end_game))
                        }
                    }
                    else -> {}
                }
            }

            item { Spacer(Modifier.height(16.dp)) }
        }
    }

    if (showStartDatePicker) {
        val datePickerState = rememberDatePickerState(
            initialSelectedDateMillis = parseIsoDateToMillis(startDate),
        )
        DatePickerDialog(
            onDismissRequest = { showStartDatePicker = false },
            confirmButton = {
                TextButton(onClick = {
                    datePickerState.selectedDateMillis?.let { millis ->
                        startDate = millisToIsoDate(millis)
                    }
                    showStartDatePicker = false
                }) {
                    Text(stringResource(R.string.action_save))
                }
            },
            dismissButton = {
                TextButton(onClick = { showStartDatePicker = false }) {
                    Text(stringResource(R.string.action_cancel))
                }
            },
        ) {
            DatePicker(state = datePickerState)
        }
    }

    if (showEndDatePicker) {
        val datePickerState = rememberDatePickerState(
            initialSelectedDateMillis = parseIsoDateToMillis(endDate),
        )
        DatePickerDialog(
            onDismissRequest = { showEndDatePicker = false },
            confirmButton = {
                TextButton(onClick = {
                    datePickerState.selectedDateMillis?.let { millis ->
                        endDate = millisToIsoDate(millis)
                    }
                    showEndDatePicker = false
                }) {
                    Text(stringResource(R.string.action_save))
                }
            },
            dismissButton = {
                TextButton(onClick = { showEndDatePicker = false }) {
                    Text(stringResource(R.string.action_cancel))
                }
            },
        ) {
            DatePicker(state = datePickerState)
        }
    }

    if (showGoLiveConfirm) {
        AlertDialog(
            onDismissRequest = { showGoLiveConfirm = false },
            title = { Text(stringResource(R.string.label_go_live_confirm_title)) },
            text = { Text(stringResource(R.string.label_go_live_confirm_message)) },
            confirmButton = {
                Button(onClick = {
                    showGoLiveConfirm = false
                    onUpdateStatus("live")
                }) {
                    Text(stringResource(R.string.label_go_live))
                }
            },
            dismissButton = {
                TextButton(onClick = { showGoLiveConfirm = false }) {
                    Text(stringResource(R.string.action_cancel))
                }
            },
        )
    }

    if (showEndGameConfirm) {
        AlertDialog(
            onDismissRequest = { showEndGameConfirm = false },
            title = { Text(stringResource(R.string.label_end_game_confirm_title)) },
            text = { Text(stringResource(R.string.label_end_game_confirm_message)) },
            confirmButton = {
                Button(
                    onClick = {
                        showEndGameConfirm = false
                        onUpdateStatus("ended")
                    },
                    colors = ButtonDefaults.buttonColors(
                        containerColor = MaterialTheme.colorScheme.error,
                    ),
                ) {
                    Text(stringResource(R.string.label_end_game))
                }
            },
            dismissButton = {
                TextButton(onClick = { showEndGameConfirm = false }) {
                    Text(stringResource(R.string.action_cancel))
                }
            },
        )
    }
}

private fun parseIsoDateToMillis(isoDate: String): Long? {
    if (isoDate.isBlank()) return null
    return runCatching {
        LocalDate.parse(isoDate.take(10), DateTimeFormatter.ISO_LOCAL_DATE)
            .atStartOfDay(ZoneOffset.UTC)
            .toInstant()
            .toEpochMilli()
    }.getOrNull()
}

private fun millisToIsoDate(millis: Long): String {
    return Instant.ofEpochMilli(millis)
        .atZone(ZoneOffset.UTC)
        .toLocalDate()
        .format(DateTimeFormatter.ISO_LOCAL_DATE)
}
