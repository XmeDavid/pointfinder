package com.dbv.companion.core.data.repo

import com.dbv.companion.core.model.Assignment
import com.dbv.companion.core.model.AuthType
import com.dbv.companion.core.model.Base
import com.dbv.companion.core.model.Challenge
import com.dbv.companion.core.model.Game
import com.dbv.companion.core.model.Team
import com.dbv.companion.core.model.TeamBaseProgressResponse
import com.dbv.companion.core.model.TeamLocationResponse
import com.dbv.companion.core.network.CompanionApi
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class OperatorRepository @Inject constructor(
    private val api: CompanionApi,
) {
    suspend fun games(): List<Game> = api.getGames()

    suspend fun gameBases(gameId: String): List<Base> = api.getGameBases(gameId)

    suspend fun gameChallenges(gameId: String): List<Challenge> = api.getChallenges(gameId)

    suspend fun gameAssignments(gameId: String): List<Assignment> = api.getAssignments(gameId)

    suspend fun gameTeams(gameId: String): List<Team> = api.getTeams(gameId)

    suspend fun teamLocations(gameId: String): List<TeamLocationResponse> = api.getTeamLocations(gameId)

    suspend fun teamProgress(gameId: String): List<TeamBaseProgressResponse> = api.getTeamProgress(gameId)

    suspend fun linkBaseNfc(gameId: String, baseId: String): Base = api.linkBaseNfc(gameId, baseId)
}
