package com.prayer.pointfinder.core.data.repo

import com.prayer.pointfinder.core.model.Assignment
import com.prayer.pointfinder.core.model.AuthType
import com.prayer.pointfinder.core.model.Base
import com.prayer.pointfinder.core.model.Challenge
import com.prayer.pointfinder.core.model.Game
import com.prayer.pointfinder.core.model.Team
import com.prayer.pointfinder.core.model.TeamBaseProgressResponse
import com.prayer.pointfinder.core.model.TeamLocationResponse
import com.prayer.pointfinder.core.network.CompanionApi
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
