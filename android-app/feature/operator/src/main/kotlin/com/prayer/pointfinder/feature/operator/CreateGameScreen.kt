package com.prayer.pointfinder.feature.operator

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import com.prayer.pointfinder.core.i18n.R
import com.prayer.pointfinder.core.model.Game
import com.prayer.pointfinder.core.model.GameExportDto
import kotlinx.serialization.json.Json

private enum class StartFrom { EMPTY, IMPORT }

private val lenientJson = Json { ignoreUnknownKeys = true }

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CreateGameScreen(
    onBack: () -> Unit,
    onGameCreated: (Game) -> Unit,
    createGame: (name: String, description: String, onSuccess: (Game) -> Unit) -> Unit,
    importGame: (name: String, exportData: GameExportDto, onSuccess: (Game) -> Unit) -> Unit,
    isLoading: Boolean,
    errorMessage: String?,
    onClearError: () -> Unit,
) {
    val context = LocalContext.current
    val snackbarHostState = remember { SnackbarHostState() }

    var name by remember { mutableStateOf("") }
    var description by remember { mutableStateOf("") }
    var startFrom by remember { mutableStateOf(StartFrom.EMPTY) }
    var importData by remember { mutableStateOf<GameExportDto?>(null) }
    var fileLoaded by remember { mutableStateOf(false) }
    var parseError by remember { mutableStateOf<String?>(null) }
    var isCreating by remember { mutableStateOf(false) }

    val filePickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetContent(),
    ) { uri: Uri? ->
        if (uri != null) {
            try {
                val content = context.contentResolver.openInputStream(uri)?.bufferedReader()?.readText()
                if (content != null) {
                    importData = lenientJson.decodeFromString<GameExportDto>(content)
                    fileLoaded = true
                    parseError = null
                } else {
                    parseError = context.getString(R.string.error_generic)
                    fileLoaded = false
                    importData = null
                }
            } catch (e: Exception) {
                parseError = e.message ?: context.getString(R.string.error_generic)
                fileLoaded = false
                importData = null
            }
        }
    }

    LaunchedEffect(errorMessage) {
        if (!errorMessage.isNullOrBlank()) {
            snackbarHostState.showSnackbar(errorMessage)
            onClearError()
        }
    }

    LaunchedEffect(parseError) {
        if (!parseError.isNullOrBlank()) {
            snackbarHostState.showSnackbar(parseError!!)
            parseError = null
        }
    }

    // Sync isCreating with isLoading -- reset when loading finishes
    LaunchedEffect(isLoading) {
        if (!isLoading) {
            isCreating = false
        }
    }

    val canCreate = name.isNotBlank() &&
        !isCreating &&
        (startFrom == StartFrom.EMPTY || (startFrom == StartFrom.IMPORT && importData != null))

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.label_create_game)) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(
                            Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = stringResource(R.string.action_back),
                        )
                    }
                },
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 16.dp)
                .verticalScroll(rememberScrollState()),
        ) {
            Spacer(Modifier.height(8.dp))

            OutlinedTextField(
                value = name,
                onValueChange = { name = it },
                label = { Text(stringResource(R.string.label_game_name)) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth().testTag("game-name-input"),
            )

            Spacer(Modifier.height(12.dp))

            OutlinedTextField(
                value = description,
                onValueChange = { description = it },
                label = { Text(stringResource(R.string.label_description)) },
                minLines = 3,
                maxLines = 5,
                modifier = Modifier.fillMaxWidth(),
            )

            Spacer(Modifier.height(20.dp))

            Text(
                text = stringResource(R.string.label_start_from),
                style = MaterialTheme.typography.titleSmall,
            )

            Spacer(Modifier.height(8.dp))

            Column(Modifier.selectableGroup()) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .selectable(
                            selected = startFrom == StartFrom.EMPTY,
                            onClick = {
                                startFrom = StartFrom.EMPTY
                                importData = null
                                fileLoaded = false
                            },
                            role = Role.RadioButton,
                        )
                        .padding(vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    RadioButton(
                        selected = startFrom == StartFrom.EMPTY,
                        onClick = null,
                    )
                    Spacer(Modifier.width(8.dp))
                    Text(stringResource(R.string.label_empty_game))
                }

                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .selectable(
                            selected = startFrom == StartFrom.IMPORT,
                            onClick = { startFrom = StartFrom.IMPORT },
                            role = Role.RadioButton,
                        )
                        .padding(vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    RadioButton(
                        selected = startFrom == StartFrom.IMPORT,
                        onClick = null,
                    )
                    Spacer(Modifier.width(8.dp))
                    Text(stringResource(R.string.label_import_from_file))
                }
            }

            if (startFrom == StartFrom.IMPORT) {
                Spacer(Modifier.height(8.dp))

                if (fileLoaded) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            Icons.Default.CheckCircle,
                            contentDescription = null,
                            tint = Color(0xFF2E7D32),
                            modifier = Modifier.size(20.dp),
                        )
                        Spacer(Modifier.width(6.dp))
                        Text(
                            text = stringResource(R.string.label_file_loaded),
                            color = Color(0xFF2E7D32),
                            style = MaterialTheme.typography.bodyMedium,
                        )
                        Spacer(Modifier.width(12.dp))
                        OutlinedButton(onClick = { filePickerLauncher.launch("application/json") }) {
                            Text(stringResource(R.string.label_select_file))
                        }
                    }
                } else {
                    OutlinedButton(onClick = { filePickerLauncher.launch("application/json") }) {
                        Text(stringResource(R.string.label_select_file))
                    }
                }
            }

            Spacer(Modifier.height(24.dp))

            Button(
                onClick = {
                    isCreating = true
                    if (startFrom == StartFrom.IMPORT && importData != null) {
                        importGame(name, importData!!, onGameCreated)
                    } else {
                        createGame(name, description, onGameCreated)
                    }
                },
                enabled = canCreate,
                modifier = Modifier.fillMaxWidth().testTag("game-save-btn"),
            ) {
                if (isCreating) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(20.dp),
                        strokeWidth = 2.dp,
                        color = MaterialTheme.colorScheme.onPrimary,
                    )
                    Spacer(Modifier.width(8.dp))
                    Text(stringResource(R.string.label_creating))
                } else {
                    Text(stringResource(R.string.action_create))
                }
            }

            Spacer(Modifier.height(16.dp))
        }
    }
}
