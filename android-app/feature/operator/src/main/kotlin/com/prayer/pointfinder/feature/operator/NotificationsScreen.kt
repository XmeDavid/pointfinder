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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Send
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
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
import com.prayer.pointfinder.core.model.NotificationResponse
import com.prayer.pointfinder.core.model.Team

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NotificationsScreen(
    notifications: List<NotificationResponse>,
    teams: List<Team>,
    onSend: (String, String?) -> Unit,
    onRefresh: () -> Unit,
    isRefreshing: Boolean,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var message by remember { mutableStateOf("") }
    var selectedTeamId by remember { mutableStateOf<String?>(null) }
    var teamDropdownExpanded by remember { mutableStateOf(false) }

    val selectedTeamName = if (selectedTeamId == null) {
        stringResource(R.string.label_all_teams)
    } else {
        teams.firstOrNull { it.id == selectedTeamId }?.name ?: stringResource(R.string.label_all_teams)
    }

    Column(modifier = modifier.fillMaxSize()) {
        TopAppBar(
            title = { Text(stringResource(R.string.label_send_notifications)) },
            navigationIcon = {
                IconButton(onClick = onBack) {
                    Icon(Icons.Default.ArrowBack, contentDescription = stringResource(R.string.action_back))
                }
            },
        )

        PullToRefreshBox(
            isRefreshing = isRefreshing,
            onRefresh = onRefresh,
            modifier = Modifier.fillMaxSize(),
        ) {
            LazyColumn(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                // Send notification section
                item {
                    Surface(
                        shape = MaterialTheme.shapes.medium,
                        tonalElevation = 1.dp,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Column(
                            modifier = Modifier.padding(14.dp),
                            verticalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            OutlinedTextField(
                                value = message,
                                onValueChange = { message = it },
                                label = { Text(stringResource(R.string.label_message)) },
                                modifier = Modifier.fillMaxWidth().testTag("notification-message-input"),
                                minLines = 2,
                                maxLines = 4,
                            )

                            Box {
                                TextButton(onClick = { teamDropdownExpanded = true }) {
                                    Text(selectedTeamName)
                                }
                                DropdownMenu(
                                    expanded = teamDropdownExpanded,
                                    onDismissRequest = { teamDropdownExpanded = false },
                                ) {
                                    DropdownMenuItem(
                                        text = { Text(stringResource(R.string.label_all_teams)) },
                                        onClick = {
                                            selectedTeamId = null
                                            teamDropdownExpanded = false
                                        },
                                    )
                                    teams.forEach { team ->
                                        DropdownMenuItem(
                                            text = { Text(team.name) },
                                            onClick = {
                                                selectedTeamId = team.id
                                                teamDropdownExpanded = false
                                            },
                                        )
                                    }
                                }
                            }

                            Button(
                                onClick = {
                                    if (message.isNotBlank()) {
                                        onSend(message.trim(), selectedTeamId)
                                        message = ""
                                    }
                                },
                                modifier = Modifier.fillMaxWidth().testTag("notification-send-btn"),
                                enabled = message.isNotBlank(),
                            ) {
                                Icon(Icons.Default.Send, contentDescription = stringResource(R.string.cd_send), modifier = Modifier.size(18.dp))
                                Spacer(Modifier.size(8.dp))
                                Text(stringResource(R.string.action_send))
                            }
                        }
                    }
                }

                // History header
                item {
                    Spacer(Modifier.height(4.dp))
                    Text(
                        stringResource(R.string.label_notifications),
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                    )
                }

                if (notifications.isEmpty()) {
                    item {
                        Text(
                            stringResource(R.string.label_no_notifications),
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }

                items(notifications, key = { it.id }) { notification ->
                    NotificationHistoryRow(
                        notification = notification,
                        teams = teams,
                    )
                }

                item { Spacer(Modifier.height(16.dp)) }
            }
        }
    }
}

@Composable
private fun NotificationHistoryRow(
    notification: NotificationResponse,
    teams: List<Team>,
) {
    val targetName = if (notification.targetTeamId == null) {
        stringResource(R.string.label_all_teams)
    } else {
        teams.firstOrNull { it.id == notification.targetTeamId }?.name
            ?: stringResource(R.string.label_unknown_team)
    }

    Surface(
        shape = MaterialTheme.shapes.small,
        tonalElevation = 0.5.dp,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(
            modifier = Modifier.padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Text(
                notification.message,
                style = MaterialTheme.typography.bodyMedium,
            )
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text(
                    stringResource(R.string.label_sent_to, targetName),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    formatTimestamp(notification.sentAt),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.outline,
                )
            }
        }
    }
}
