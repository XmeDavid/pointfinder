import Foundation
import UserNotifications
import UIKit
import os

@MainActor
final class PushNotificationService {

    static let shared = PushNotificationService()

    private var currentToken: String?
    private var apiClient: APIClient?
    private var playerToken: String?

    private init() {}

    // MARK: - Configuration

    /// Configure the service with the API client and player auth token.
    /// Call this after the player joins a game.
    func configure(apiClient: APIClient, playerToken: String) {
        self.apiClient = apiClient
        self.playerToken = playerToken
    }

    /// Clear configuration on logout.
    func reset() {
        apiClient = nil
        playerToken = nil
        currentToken = nil
    }

    // MARK: - Permission & Registration

    /// Request notification permission and register for remote notifications.
    func requestPermissionAndRegister() {
        Task {
            let center = UNUserNotificationCenter.current()

            do {
                let granted = try await center.requestAuthorization(options: [.alert, .sound, .badge])

                if granted {
                    UIApplication.shared.registerForRemoteNotifications()
                } else {
                    Logger(subsystem: "com.prayer.pointfinder", category: "Push").info("Push notification permission denied")
                }
            } catch {
                Logger(subsystem: "com.prayer.pointfinder", category: "Push").error("Push authorization error: \(error.localizedDescription, privacy: .public)")
            }
        }
    }

    // MARK: - Token Handling

    /// Called by AppDelegate when a device token is received from APNs.
    func didReceiveToken(_ token: String) async {
        currentToken = token
        await sendTokenToBackend()
    }

    /// Send the current token to the backend.
    /// Called on every app launch / token refresh to keep it up to date.
    private func sendTokenToBackend() async {
        guard let token = currentToken,
              let apiClient = apiClient,
              let playerToken = playerToken else {
            return
        }

        do {
            try await apiClient.registerPushToken(token, token: playerToken)
        } catch {
            Logger(subsystem: "com.prayer.pointfinder", category: "Push").error("Failed to register push token: \(error.localizedDescription, privacy: .public)")
        }
    }
}
