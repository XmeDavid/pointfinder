import Foundation
import SwiftUI
import UIKit
import os

@MainActor
@Observable
final class AppState {

    // MARK: - Auth State

    var authType: AuthType = .none
    var isAuthenticated: Bool { if case .none = authType { return false } else { return true } }
    var isPlayer: Bool { if case .player = authType { return true } else { return false } }
    var isOperator: Bool { if case .userOperator = authType { return true } else { return false } }

    // MARK: - Player Context

    var currentGame: PlayerAuthResponse.GameInfo?
    var currentTeam: PlayerAuthResponse.TeamInfo?
    var currentPlayer: PlayerAuthResponse.PlayerInfo?

    // MARK: - Game Data

    var baseProgress: [BaseProgress] = []
    var isLoadingProgress = false

    // MARK: - Active Solve Session

    var solvingBaseId: UUID?
    var solvingChallengeId: UUID?

    // MARK: - Deep Link

    var pendingDeepLinkBaseId: UUID?

    // MARK: - Notifications

    var notifications: [PlayerNotificationResponse] = []
    var unseenNotificationCount: Int = 0
    var isLoadingNotifications = false
    var lastNotificationsSeenAt: String?

    // MARK: - Error Handling

    var errorMessage: String?
    var showError = false

    // MARK: - Logout Confirmation (unsynced data guard)

    /// Number of pending offline actions at the time the user triggered logout.
    var pendingLogoutCount = 0
    /// Set to true when logout is requested but there are unsynced offline actions.
    var showLogoutUnsyncedAlert = false

    // MARK: - Network Status

    let networkMonitor = NetworkMonitor.shared

    /// Whether the device currently has network connectivity
    var isOnline: Bool { networkMonitor.isOnline }

    /// Number of pending offline actions waiting to be synced
    var pendingActionsCount: Int = 0

    // MARK: - Services

    let apiClient = APIClient()
    let locationService = LocationService()
    let syncEngine = SyncEngine.shared
    let realtimeClient = MobileRealtimeClient()
    let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.prayer.pointfinder",
        category: "AppState"
    )
    var progressLoadTask: Task<Void, Never>?
    var realtimeConnected = false

    // MARK: - Init

    init() {
        Task { [weak self] in
            guard let self else { return }
            await self.apiClient.setAuthFailureHandler { [weak self] in
                await MainActor.run { [weak self] in
                    self?.forceLogout()
                }
            }
        }
        configureRealtimeClient()
        restoreSession()
        configureSyncEngine()
    }

    // MARK: - Realtime Configuration

    private func configureRealtimeClient() {
        realtimeClient.onConnectionStateChange = { [weak self] state in
            guard let self else { return }
            self.realtimeConnected = (state == .connected)
            self.logger.debug("Mobile realtime connection state: \(String(describing: state), privacy: .public)")
        }
        realtimeClient.onEvent = { [weak self] payload in
            guard let self else { return }
            self.handleRealtimeEvent(payload)
        }
    }

    private func handleRealtimeEvent(_ payload: [String: Any]) {
        if let type = payload["type"] as? String {
            logger.debug("Received mobile realtime event: \(type, privacy: .public)")
        }
        NotificationCenter.default.post(name: .mobileRealtimeEvent, object: nil, userInfo: payload)

        guard case .player(_, _, _, let currentGameId) = authType else { return }
        if let rawGameId = payload["gameId"] as? String,
           let eventGameId = UUID(uuidString: rawGameId),
           eventGameId != currentGameId {
            return
        }

        guard let type = payload["type"] as? String else { return }
        switch type {
        case "game_status":
            if let data = payload["data"] as? [String: Any],
               let status = data["status"] as? String,
               var game = currentGame {
                game = PlayerAuthResponse.GameInfo(
                    id: game.id,
                    name: game.name,
                    description: game.description,
                    status: status,
                    tileSource: game.tileSource
                )
                currentGame = game
            }
            progressLoadTask?.cancel()
            progressLoadTask = Task { await loadProgress() }
        case "submission_status", "activity":
            progressLoadTask?.cancel()
            progressLoadTask = Task { await loadProgress() }
        case "notification":
            unseenNotificationCount += 1
        default:
            break
        }
    }

    // MARK: - Sync Engine Configuration

    private func configureSyncEngine() {
        syncEngine.configure(apiClient: apiClient)

        // Wire up sync engine to refresh progress after sync completes
        syncEngine.onSyncComplete = { [weak self] in
            await self?.loadProgress()
        }

        // Reactively update pending count when OfflineQueue changes
        Task {
            await OfflineQueue.shared.setOnCountChanged { [weak self] count in
                Task { @MainActor [weak self] in
                    self?.pendingActionsCount = count
                }
            }
            // Set initial value
            self.pendingActionsCount = await OfflineQueue.shared.pendingCount
        }
    }

    // MARK: - Error

    func setError(_ message: String) {
        errorMessage = message
        showError = true
    }
}
