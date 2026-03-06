package com.prayer.pointfinder.feature.operator

import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.prayer.pointfinder.core.i18n.R
import com.prayer.pointfinder.core.model.InviteResponse
import com.prayer.pointfinder.core.model.OperatorUserResponse

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OperatorsScreen(
    operators: List<OperatorUserResponse>,
    invites: List<InviteResponse>,
    onInvite: (String) -> Unit,
    onRefresh: () -> Unit,
    isRefreshing: Boolean,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var showInviteDialog by remember { mutableStateOf(false) }

    Column(modifier = modifier.fillMaxSize()) {
        TopAppBar(
            title = { Text(stringResource(R.string.label_manage_operators)) },
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
                // Operators section header
                item {
                    Text(
                        stringResource(R.string.label_manage_operators),
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                    )
                }

                if (operators.isEmpty()) {
                    item {
                        Text(
                            stringResource(R.string.label_no_operators),
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }

                items(operators, key = { it.id }) { operator ->
                    OperatorRow(operator = operator)
                }

                // Invite button
                item {
                    Button(
                        onClick = { showInviteDialog = true },
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Icon(Icons.Default.PersonAdd, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.size(8.dp))
                        Text(stringResource(R.string.label_invite_operator))
                    }
                }

                // Pending invites section
                item {
                    Spacer(Modifier.height(8.dp))
                    Text(
                        stringResource(R.string.label_invites),
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                    )
                }

                if (invites.isEmpty()) {
                    item {
                        Text(
                            stringResource(R.string.label_no_invites),
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }

                items(invites, key = { it.id }) { invite ->
                    InviteRow(invite = invite)
                }

                item { Spacer(Modifier.height(16.dp)) }
            }
        }
    }

    if (showInviteDialog) {
        InviteOperatorDialog(
            onDismiss = { showInviteDialog = false },
            onInvite = { email ->
                onInvite(email)
                showInviteDialog = false
            },
        )
    }
}

@Composable
private fun OperatorRow(operator: OperatorUserResponse) {
    Surface(
        shape = MaterialTheme.shapes.small,
        tonalElevation = 1.dp,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column {
                Text(
                    operator.name,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium,
                )
                Text(
                    operator.email,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Surface(
                shape = MaterialTheme.shapes.small,
                color = BadgeIndigo.copy(alpha = 0.15f),
            ) {
                Text(
                    operator.role,
                    style = MaterialTheme.typography.labelSmall,
                    color = BadgeIndigo,
                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                )
            }
        }
    }
}

@Composable
private fun InviteRow(invite: InviteResponse) {
    val statusColor = when (invite.status.lowercase()) {
        "accepted" -> StatusCompleted
        "declined" -> StatusRejected
        else -> StatusSubmitted  // pending and others
    }
    Surface(
        shape = MaterialTheme.shapes.small,
        tonalElevation = 0.5.dp,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column {
                Text(
                    invite.email,
                    style = MaterialTheme.typography.bodyMedium,
                )
                Text(
                    formatTimestamp(invite.createdAt),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.outline,
                )
            }
            Surface(
                shape = MaterialTheme.shapes.small,
                color = statusColor.copy(alpha = 0.15f),
            ) {
                Text(
                    invite.status.replaceFirstChar { it.uppercase() },
                    style = MaterialTheme.typography.labelSmall,
                    color = statusColor,
                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                )
            }
        }
    }
}

@Composable
private fun InviteOperatorDialog(
    onDismiss: () -> Unit,
    onInvite: (String) -> Unit,
) {
    var email by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.label_invite_operator)) },
        text = {
            OutlinedTextField(
                value = email,
                onValueChange = { email = it },
                label = { Text(stringResource(R.string.label_operator_email)) },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
            )
        },
        confirmButton = {
            Button(
                onClick = { if (email.isNotBlank()) onInvite(email.trim()) },
                enabled = email.isNotBlank(),
            ) {
                Text(stringResource(R.string.action_invite))
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text(stringResource(R.string.action_cancel))
            }
        },
    )
}
