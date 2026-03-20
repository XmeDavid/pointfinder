package com.prayer.pointfinder.session.usecase

import com.prayer.pointfinder.core.data.repo.OperatorRepository
import com.prayer.pointfinder.core.model.SubmissionResponse
import com.prayer.pointfinder.core.model.SubmissionStatus
import javax.inject.Inject

class SubmissionUseCase @Inject constructor(
    private val operatorRepository: OperatorRepository,
) {
    suspend fun reviewSubmission(
        gameId: String,
        submissionId: String,
        status: SubmissionStatus,
        feedback: String?,
        points: Int? = null,
    ): SubmissionResponse = operatorRepository.reviewSubmission(
        gameId = gameId,
        submissionId = submissionId,
        status = status,
        feedback = feedback,
        points = points,
    )
}
