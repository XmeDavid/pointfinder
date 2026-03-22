package com.prayer.pointfinder.session.usecase

import com.prayer.pointfinder.core.data.repo.OperatorRepository
import com.prayer.pointfinder.core.model.CreateGameRequest
import com.prayer.pointfinder.core.model.Game
import com.prayer.pointfinder.core.model.GameExportDto
import com.prayer.pointfinder.core.model.ImportGameRequest
import com.prayer.pointfinder.core.model.UpdateGameRequest
import com.prayer.pointfinder.core.model.UpdateGameStatusRequest
import javax.inject.Inject

class GameCrudUseCase @Inject constructor(
    private val operatorRepository: OperatorRepository,
) {
    suspend fun loadGames(): List<Game> = operatorRepository.games()

    suspend fun createGame(name: String, description: String): Game =
        operatorRepository.createGame(CreateGameRequest(name = name, description = description))

    suspend fun importGame(name: String, exportData: GameExportDto): Game =
        operatorRepository.importGame(
            ImportGameRequest(
                gameData = exportData.copy(game = exportData.game.copy(name = name)),
            ),
        )

    suspend fun updateGame(gameId: String, request: UpdateGameRequest): Game =
        operatorRepository.updateGame(gameId, request)

    suspend fun updateGameStatus(gameId: String, status: String): Game =
        operatorRepository.updateGameStatus(gameId, UpdateGameStatusRequest(status = status))

    suspend fun deleteGame(gameId: String) =
        operatorRepository.deleteGame(gameId)

    suspend fun exportGame(gameId: String): GameExportDto =
        operatorRepository.exportGame(gameId)

    fun invalidateConfigCache(entity: String, gameId: String) =
        operatorRepository.invalidateConfigCache(entity, gameId)
}
