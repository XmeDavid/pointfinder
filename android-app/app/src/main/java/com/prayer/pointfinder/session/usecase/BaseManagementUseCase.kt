package com.prayer.pointfinder.session.usecase

import com.prayer.pointfinder.core.data.repo.OperatorRepository
import com.prayer.pointfinder.core.model.Assignment
import com.prayer.pointfinder.core.model.Base
import com.prayer.pointfinder.core.model.CheckInResponse
import com.prayer.pointfinder.core.model.CreateBaseRequest
import com.prayer.pointfinder.core.model.UpdateBaseRequest
import javax.inject.Inject

class BaseManagementUseCase @Inject constructor(
    private val operatorRepository: OperatorRepository,
) {
    suspend fun createBase(gameId: String, request: CreateBaseRequest): Base =
        operatorRepository.createBase(gameId, request)

    suspend fun updateBase(gameId: String, baseId: String, request: UpdateBaseRequest): Base =
        operatorRepository.updateBase(gameId, baseId, request)

    suspend fun deleteBase(gameId: String, baseId: String) =
        operatorRepository.deleteBase(gameId, baseId)

    suspend fun loadAssignments(gameId: String): List<Assignment> =
        operatorRepository.gameAssignments(gameId)

    suspend fun linkBaseNfc(gameId: String, baseId: String): Base =
        operatorRepository.linkBaseNfc(gameId, baseId)

    suspend fun manualCheckIn(gameId: String, teamId: String, baseId: String): CheckInResponse =
        operatorRepository.manualCheckIn(gameId, teamId, baseId)
}
