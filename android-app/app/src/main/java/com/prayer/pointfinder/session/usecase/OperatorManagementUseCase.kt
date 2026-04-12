package com.prayer.pointfinder.session.usecase

import com.prayer.pointfinder.core.data.repo.OperatorRepository
import com.prayer.pointfinder.core.model.EntityId
import com.prayer.pointfinder.core.model.InviteRequest
import com.prayer.pointfinder.core.model.InviteResponse
import com.prayer.pointfinder.core.model.OrgMemberResponse
import com.prayer.pointfinder.core.model.OrgWorkspace
import com.prayer.pointfinder.core.model.OperatorUserResponse
import com.prayer.pointfinder.core.model.WorkspaceResponse
import javax.inject.Inject

class OperatorManagementUseCase @Inject constructor(
    private val operatorRepository: OperatorRepository,
) {
    suspend fun loadOperators(gameId: String): Pair<List<OperatorUserResponse>, List<InviteResponse>> {
        val ops = operatorRepository.getGameOperators(gameId)
        val inv = operatorRepository.getGameInvites(gameId)
        return ops to inv
    }

    suspend fun removeOperator(gameId: String, userId: String) =
        operatorRepository.removeGameOperator(gameId, userId)

    suspend fun inviteOperator(email: String, gameId: String): InviteResponse =
        operatorRepository.createInvite(InviteRequest(email = email, gameId = gameId))

    suspend fun revokeInvite(inviteId: String) =
        operatorRepository.deleteInvite(inviteId)

    suspend fun getMyInvites(): List<InviteResponse> =
        operatorRepository.getMyInvites()

    suspend fun acceptInvite(inviteId: String) =
        operatorRepository.acceptInvite(inviteId)

    suspend fun getWorkspaces(): WorkspaceResponse =
        operatorRepository.getWorkspaces()

    suspend fun getOrgMembers(orgId: EntityId): List<OrgMemberResponse> =
        operatorRepository.getOrgMembers(orgId)

    suspend fun inviteOrgMember(orgId: EntityId, email: String): OrgMemberResponse =
        operatorRepository.inviteOrgMember(orgId, email)

    suspend fun removeOrgMember(orgId: EntityId, userId: EntityId) =
        operatorRepository.removeOrgMember(orgId, userId)

    suspend fun updateMemberPermissions(orgId: EntityId, userId: EntityId, permissions: Int): OrgMemberResponse =
        operatorRepository.updateMemberPermissions(orgId, userId, permissions)
}
