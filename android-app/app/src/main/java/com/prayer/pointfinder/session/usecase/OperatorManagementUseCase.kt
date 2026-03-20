package com.prayer.pointfinder.session.usecase

import com.prayer.pointfinder.core.data.repo.OperatorRepository
import com.prayer.pointfinder.core.model.InviteRequest
import com.prayer.pointfinder.core.model.InviteResponse
import com.prayer.pointfinder.core.model.OperatorUserResponse
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
}
