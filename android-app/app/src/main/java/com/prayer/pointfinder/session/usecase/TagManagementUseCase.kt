package com.prayer.pointfinder.session.usecase

import com.prayer.pointfinder.core.data.repo.OperatorRepository
import com.prayer.pointfinder.core.model.CreateTagRequest
import com.prayer.pointfinder.core.model.GameTag
import com.prayer.pointfinder.core.model.UpdateTagRequest
import javax.inject.Inject

class TagManagementUseCase @Inject constructor(
    private val operatorRepository: OperatorRepository,
) {
    suspend fun listTags(gameId: String): List<GameTag> =
        operatorRepository.listTags(gameId)

    suspend fun createTag(gameId: String, request: CreateTagRequest): GameTag =
        operatorRepository.createTag(gameId, request)

    suspend fun updateTag(gameId: String, tagId: String, request: UpdateTagRequest): GameTag =
        operatorRepository.updateTag(gameId, tagId, request)

    suspend fun deleteTag(gameId: String, tagId: String) =
        operatorRepository.deleteTag(gameId, tagId)
}
