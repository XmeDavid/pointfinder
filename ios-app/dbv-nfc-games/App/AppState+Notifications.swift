import Foundation
import os

// MARK: - Notifications

extension AppState {

    func loadUnseenNotificationCount() async {
        guard case .player(let token, _, _, _) = authType, isOnline else { return }
        do {
            let response = try await apiClient.getUnseenNotificationCount(token: token)
            unseenNotificationCount = response.count
        } catch {
            logger.debug("Failed to load unseen notification count: \(error.localizedDescription, privacy: .public)")
        }
    }

    func loadNotifications() async {
        guard case .player(let token, _, _, _) = authType else { return }
        isLoadingNotifications = true
        do {
            notifications = try await apiClient.getPlayerNotifications(token: token)
        } catch {
            logger.error("Failed to load notifications: \(error.localizedDescription, privacy: .public)")
        }
        isLoadingNotifications = false

        do {
            try await apiClient.markNotificationsSeen(token: token)
            unseenNotificationCount = 0
            lastNotificationsSeenAt = DateFormatting.iso8601String()
        } catch {
            logger.debug("Failed to mark notifications seen: \(error.localizedDescription, privacy: .public)")
        }
    }
}
