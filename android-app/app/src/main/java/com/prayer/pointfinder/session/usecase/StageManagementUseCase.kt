package com.prayer.pointfinder.session.usecase

import com.prayer.pointfinder.core.data.repo.OperatorRepository
import com.prayer.pointfinder.core.model.CreateStageRequest
import com.prayer.pointfinder.core.model.Stage
import com.prayer.pointfinder.core.model.UpdateStageRequest
import javax.inject.Inject

class StageManagementUseCase @Inject constructor(
    private val operatorRepository: OperatorRepository,
) {
    suspend fun getStages(gameId: String): List<Stage> =
        operatorRepository.getStages(gameId)

    suspend fun createStage(gameId: String, request: CreateStageRequest): Stage =
        operatorRepository.createStage(gameId, request)

    suspend fun updateStage(gameId: String, stageId: String, request: UpdateStageRequest): Stage =
        operatorRepository.updateStage(gameId, stageId, request)

    suspend fun deleteStage(gameId: String, stageId: String) =
        operatorRepository.deleteStage(gameId, stageId)
}
