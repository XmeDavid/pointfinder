package com.prayer.pointfinder.core.data.repo

import com.prayer.pointfinder.core.model.Assignment
import com.prayer.pointfinder.core.model.AuthType
import com.prayer.pointfinder.core.model.Base
import com.prayer.pointfinder.core.model.Challenge
import com.prayer.pointfinder.core.model.Game
import com.prayer.pointfinder.core.model.OperatorNotificationSettingsResponse
import com.prayer.pointfinder.core.model.ReviewSubmissionRequest
import com.prayer.pointfinder.core.model.SubmissionResponse
import com.prayer.pointfinder.core.model.Team
import com.prayer.pointfinder.core.model.TeamBaseProgressResponse
import com.prayer.pointfinder.core.model.TeamLocationResponse
import com.prayer.pointfinder.core.model.UpdateOperatorNotificationSettingsRequest
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

    suspend fun gameSubmissions(gameId: String): List<SubmissionResponse> = api.getSubmissions(gameId)

    suspend fun reviewSubmission(
        gameId: String,
        submissionId: String,
        status: String,
        feedback: String?,
        points: Int? = null,
    ): SubmissionResponse = api.reviewSubmission(
        gameId = gameId,
        submissionId = submissionId,
        request = ReviewSubmissionRequest(status = status, feedback = feedback, points = points),
    )

    suspend fun getOperatorNotificationSettings(gameId: String): OperatorNotificationSettingsResponse =
        api.getOperatorNotificationSettings(gameId)

    suspend fun updateOperatorNotificationSettings(
        gameId: String,
        request: UpdateOperatorNotificationSettingsRequest,
    ): OperatorNotificationSettingsResponse = api.updateOperatorNotificationSettings(gameId, request)

    suspend fun linkBaseNfc(gameId: String, baseId: String): Base = api.linkBaseNfc(gameId, baseId)
}
