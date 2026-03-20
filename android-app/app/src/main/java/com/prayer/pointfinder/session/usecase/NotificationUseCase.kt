package com.prayer.pointfinder.session.usecase

import com.prayer.pointfinder.core.data.repo.OperatorRepository
import com.prayer.pointfinder.core.model.NotificationResponse
import com.prayer.pointfinder.core.model.OperatorNotificationSettingsResponse
import com.prayer.pointfinder.core.model.SendNotificationRequest
import com.prayer.pointfinder.core.model.UpdateOperatorNotificationSettingsRequest
import javax.inject.Inject

class NotificationUseCase @Inject constructor(
    private val operatorRepository: OperatorRepository,
) {
    suspend fun loadNotifications(gameId: String): List<NotificationResponse> =
        operatorRepository.getNotifications(gameId)

    suspend fun sendNotification(
        gameId: String,
        message: String,
        targetTeamId: String?,
    ): NotificationResponse = operatorRepository.sendNotification(
        gameId,
        SendNotificationRequest(message = message, targetTeamId = targetTeamId),
    )

    suspend fun loadNotificationSettings(gameId: String): OperatorNotificationSettingsResponse =
        operatorRepository.getOperatorNotificationSettings(gameId)

    suspend fun updateNotificationSettings(
        gameId: String,
        notifyPendingSubmissions: Boolean,
        notifyAllSubmissions: Boolean,
        notifyCheckIns: Boolean,
    ): OperatorNotificationSettingsResponse = operatorRepository.updateOperatorNotificationSettings(
        gameId,
        UpdateOperatorNotificationSettingsRequest(
            notifyPendingSubmissions = notifyPendingSubmissions,
            notifyAllSubmissions = notifyAllSubmissions,
            notifyCheckIns = notifyCheckIns,
        ),
    )
}
