package com.prayer.pointfinder.session.usecase

import com.prayer.pointfinder.core.data.repo.OperatorRepository
import com.prayer.pointfinder.core.model.Challenge
import com.prayer.pointfinder.core.model.CreateChallengeRequest
import com.prayer.pointfinder.core.model.UpdateChallengeRequest
import javax.inject.Inject

class ChallengeManagementUseCase @Inject constructor(
    private val operatorRepository: OperatorRepository,
) {
    suspend fun createChallenge(gameId: String, request: CreateChallengeRequest): Challenge =
        operatorRepository.createChallenge(gameId, request)

    suspend fun updateChallenge(
        gameId: String,
        challengeId: String,
        request: UpdateChallengeRequest,
    ): Challenge = operatorRepository.updateChallenge(gameId, challengeId, request)

    suspend fun deleteChallenge(gameId: String, challengeId: String) =
        operatorRepository.deleteChallengeUnit(gameId, challengeId)
}
