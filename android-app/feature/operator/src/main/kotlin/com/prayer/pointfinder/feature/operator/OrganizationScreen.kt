package com.prayer.pointfinder.feature.operator

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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.rememberModalBottomSheetState
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.prayer.pointfinder.core.model.EntityId
import com.prayer.pointfinder.core.model.OrgMemberResponse
import com.prayer.pointfinder.core.model.OrgPermission
import com.prayer.pointfinder.core.model.OrgWorkspace
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun OrganizationScreen(
    org: OrgWorkspace,
    onBack: () -> Unit,
    loadMembers: suspend () -> List<OrgMemberResponse>,
    inviteMember: suspend (String) -> OrgMemberResponse,
    removeMember: suspend (EntityId) -> Unit,
    updatePermissions: suspend (EntityId, Int) -> OrgMemberResponse,
    modifier: Modifier = Modifier,
) {
    val scope = rememberCoroutineScope()
    val members = remember { mutableStateListOf<OrgMemberResponse>() }
    var isLoading by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }

    // Invite dialog state
    var showInviteDialog by remember { mutableStateOf(false) }
    var inviteEmail by remember { mutableStateOf("") }
    var isInviting by remember { mutableStateOf(false) }

    // Permissions edit dialog state
    var editingMember by remember { mutableStateOf<OrgMemberResponse?>(null) }
    var editingPermMask by remember { mutableStateOf(0) }

    // Remove confirm dialog state
    var removingMember by remember { mutableStateOf<OrgMemberResponse?>(null) }

    fun refresh() {
        scope.launch {
            isLoading = true
            errorMessage = null
            try {
                val result = loadMembers()
                members.clear()
                members.addAll(result)
            } catch (e: Exception) {
                errorMessage = e.message ?: "Failed to load members"
            } finally {
                isLoading = false
            }
        }
    }

    LaunchedEffect(org.id) { refresh() }

    val canInvite = OrgPermission.has(org.permissions, OrgPermission.INVITE_MEMBERS)
    val canManagePerms = OrgPermission.has(org.permissions, OrgPermission.MANAGE_PERMS)

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(org.name) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    if (canInvite) {
                        IconButton(onClick = { showInviteDialog = true }) {
                            Icon(Icons.Default.PersonAdd, contentDescription = "Invite member")
                        }
                    }
                },
            )
        },
        modifier = modifier,
    ) { padding ->
        PullToRefreshBox(
            isRefreshing = isLoading,
            onRefresh = ::refresh,
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
        ) {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                verticalArrangement = Arrangement.spacedBy(0.dp),
            ) {
                // Org header card
                item {
                    Surface(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 12.dp),
                        tonalElevation = 2.dp,
                        shape = MaterialTheme.shapes.medium,
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                Text(
                                    org.name,
                                    style = MaterialTheme.typography.titleLarge,
                                    fontWeight = FontWeight.Bold,
                                )
                                Surface(
                                    color = MaterialTheme.colorScheme.secondaryContainer,
                                    shape = MaterialTheme.shapes.small,
                                ) {
                                    Text(
                                        org.tier.uppercase(),
                                        style = MaterialTheme.typography.labelSmall,
                                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                                        color = MaterialTheme.colorScheme.onSecondaryContainer,
                                    )
                                }
                            }
                            Spacer(Modifier.height(4.dp))
                            Text(
                                "@${org.slug}",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            Spacer(Modifier.height(8.dp))
                            Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                    Text(
                                        org.memberCount.toString(),
                                        style = MaterialTheme.typography.titleMedium,
                                        fontWeight = FontWeight.SemiBold,
                                    )
                                    Text(
                                        "Members",
                                        style = MaterialTheme.typography.labelSmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                    Text(
                                        org.liveGames.toString(),
                                        style = MaterialTheme.typography.titleMedium,
                                        fontWeight = FontWeight.SemiBold,
                                    )
                                    Text(
                                        "Live Games",
                                        style = MaterialTheme.typography.labelSmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                            }
                        }
                    }
                }

                // Error message
                if (errorMessage != null) {
                    item {
                        Text(
                            errorMessage!!,
                            color = MaterialTheme.colorScheme.error,
                            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                            style = MaterialTheme.typography.bodyMedium,
                        )
                    }
                }

                // Members section header
                item {
                    Text(
                        "Members",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }

                if (isLoading && members.isEmpty()) {
                    item {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(32.dp),
                            contentAlignment = Alignment.Center,
                        ) {
                            CircularProgressIndicator(modifier = Modifier.size(32.dp))
                        }
                    }
                } else if (members.isEmpty()) {
                    item {
                        Text(
                            "No members yet.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                        )
                    }
                } else {
                    items(members, key = { it.id }) { member ->
                        MemberRow(
                            member = member,
                            canManagePerms = canManagePerms,
                            canRemove = canInvite,
                            onEditPerms = {
                                editingMember = member
                                editingPermMask = member.permissions
                            },
                            onRemove = { removingMember = member },
                        )
                    }
                }

                item { Spacer(Modifier.height(24.dp)) }
            }
        }
    }

    // Invite dialog
    if (showInviteDialog) {
        AlertDialog(
            onDismissRequest = {
                if (!isInviting) {
                    showInviteDialog = false
                    inviteEmail = ""
                }
            },
            title = { Text("Invite Member") },
            text = {
                OutlinedTextField(
                    value = inviteEmail,
                    onValueChange = { inviteEmail = it },
                    label = { Text("Email address") },
                    singleLine = true,
                    enabled = !isInviting,
                    modifier = Modifier.fillMaxWidth(),
                )
            },
            confirmButton = {
                Button(
                    onClick = {
                        val email = inviteEmail.trim()
                        if (email.isBlank()) return@Button
                        scope.launch {
                            isInviting = true
                            try {
                                val newMember = inviteMember(email)
                                members.add(newMember)
                                showInviteDialog = false
                                inviteEmail = ""
                            } catch (e: Exception) {
                                errorMessage = e.message ?: "Invite failed"
                            } finally {
                                isInviting = false
                            }
                        }
                    },
                    enabled = !isInviting && inviteEmail.isNotBlank(),
                ) {
                    if (isInviting) {
                        CircularProgressIndicator(modifier = Modifier.size(16.dp))
                    } else {
                        Text("Invite")
                    }
                }
            },
            dismissButton = {
                TextButton(
                    onClick = {
                        showInviteDialog = false
                        inviteEmail = ""
                    },
                    enabled = !isInviting,
                ) { Text("Cancel") }
            },
        )
    }

    // Permission edit bottom sheet
    val memberBeingEdited = editingMember
    if (memberBeingEdited != null) {
        val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
        ModalBottomSheet(
            onDismissRequest = { editingMember = null },
            sheetState = sheetState,
        ) {
            Column(modifier = Modifier.fillMaxWidth()) {
                // Header
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    TextButton(onClick = { editingMember = null }) {
                        Text("Cancel")
                    }
                    Text(
                        text = "Permissions for ${memberBeingEdited.name}",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.weight(1f),
                        textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                    )
                    Button(
                        onClick = {
                            val targetMember = memberBeingEdited
                            val newMask = editingPermMask
                            editingMember = null
                            scope.launch {
                                try {
                                    val updated = updatePermissions(targetMember.userId, newMask)
                                    val idx = members.indexOfFirst { it.id == updated.id }
                                    if (idx >= 0) members[idx] = updated
                                } catch (e: Exception) {
                                    errorMessage = e.message ?: "Failed to update permissions"
                                }
                            }
                        },
                    ) { Text("Save") }
                }
                HorizontalDivider()
                // Permission toggles
                OrgPermission.ALL.forEach { perm ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            text = OrgPermission.label(perm),
                            style = MaterialTheme.typography.bodyLarge,
                            modifier = Modifier.weight(1f),
                        )
                        Switch(
                            checked = OrgPermission.has(editingPermMask, perm),
                            onCheckedChange = { checked ->
                                editingPermMask = if (checked) {
                                    editingPermMask or perm
                                } else {
                                    editingPermMask and perm.inv()
                                }
                            },
                        )
                    }
                    HorizontalDivider(modifier = Modifier.padding(horizontal = 16.dp))
                }
                Spacer(Modifier.height(32.dp))
            }
        }
    }

    // Remove confirm dialog
    val memberToRemove = removingMember
    if (memberToRemove != null) {
        AlertDialog(
            onDismissRequest = { removingMember = null },
            title = { Text("Remove Member") },
            text = { Text("Remove ${memberToRemove.name} from ${org.name}?") },
            confirmButton = {
                Button(
                    onClick = {
                        removingMember = null
                        scope.launch {
                            try {
                                removeMember(memberToRemove.userId)
                                members.removeIf { it.id == memberToRemove.id }
                            } catch (e: Exception) {
                                errorMessage = e.message ?: "Failed to remove member"
                            }
                        }
                    },
                    colors = androidx.compose.material3.ButtonDefaults.buttonColors(
                        containerColor = MaterialTheme.colorScheme.error,
                    ),
                ) { Text("Remove") }
            },
            dismissButton = {
                TextButton(onClick = { removingMember = null }) { Text("Cancel") }
            },
        )
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun MemberRow(
    member: OrgMemberResponse,
    canManagePerms: Boolean,
    canRemove: Boolean,
    onEditPerms: () -> Unit,
    onRemove: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 4.dp),
        tonalElevation = 1.dp,
        shape = MaterialTheme.shapes.small,
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(member.name, fontWeight = FontWeight.Medium)
                Text(
                    member.email,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(6.dp))
                FlowRow(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    OrgPermission.ALL.forEach { perm ->
                        if (OrgPermission.has(member.permissions, perm)) {
                            Surface(
                                color = MaterialTheme.colorScheme.primaryContainer,
                                shape = MaterialTheme.shapes.extraSmall,
                            ) {
                                Text(
                                    OrgPermission.label(perm),
                                    style = MaterialTheme.typography.labelSmall,
                                    modifier = Modifier.padding(horizontal = 6.dp, vertical = 3.dp),
                                    color = MaterialTheme.colorScheme.onPrimaryContainer,
                                )
                            }
                        }
                    }
                    if (member.permissions == 0) {
                        Text(
                            "No permissions",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }

            if (canManagePerms) {
                TextButton(onClick = onEditPerms) { Text("Perms") }
            }
            if (canRemove) {
                IconButton(onClick = onRemove) {
                    Icon(
                        Icons.Default.Delete,
                        contentDescription = "Remove member",
                        tint = MaterialTheme.colorScheme.error,
                        modifier = Modifier.size(20.dp),
                    )
                }
            }
        }
    }
}
