package com.prayer.pointfinder.core.model

import kotlinx.serialization.Serializable

@Serializable
data class WorkspaceResponse(
    val personal: PersonalWorkspace,
    val organizations: List<OrgWorkspace>,
)

@Serializable
data class PersonalWorkspace(
    val tier: String,
    val status: String,
    val activeGames: Int,
)

@Serializable
data class OrgWorkspace(
    val id: EntityId,
    val name: String,
    val slug: String,
    val tier: String,
    val status: String,
    val memberCount: Int,
    val liveGames: Int,
    val permissions: Int,
)

@Serializable
data class OrgMemberResponse(
    val id: EntityId,
    val userId: EntityId,
    val name: String,
    val email: String,
    val permissions: Int,
)

@Serializable
data class CreateOrgRequest(val name: String)

@Serializable
data class InviteOrgMemberRequest(val email: String)

@Serializable
data class UpdatePermissionsRequest(val permissions: Int)

object OrgPermission {
    const val OPERATE_GAMES = 1
    const val CREATE_GAMES = 2
    const val DELETE_GAMES = 4
    const val INVITE_MEMBERS = 8
    const val MANAGE_PERMS = 16
    const val MANAGE_BILLING = 32

    fun has(mask: Int, perm: Int) = mask and perm != 0

    fun label(perm: Int): String = when (perm) {
        OPERATE_GAMES -> "Operate Games"
        CREATE_GAMES -> "Create Games"
        DELETE_GAMES -> "Delete Games"
        INVITE_MEMBERS -> "Invite Members"
        MANAGE_PERMS -> "Manage Permissions"
        MANAGE_BILLING -> "Manage Billing"
        else -> "Unknown"
    }

    val ALL = listOf(OPERATE_GAMES, CREATE_GAMES, DELETE_GAMES, INVITE_MEMBERS, MANAGE_PERMS, MANAGE_BILLING)
}
