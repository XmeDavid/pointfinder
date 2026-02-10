import Foundation
import SwiftUI
import UIKit

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

    // MARK: - Error Handling

    var errorMessage: String?
    var showError = false

    // MARK: - Network Status

    let networkMonitor = NetworkMonitor.shared

    /// Whether the device currently has network connectivity
    var isOnline: Bool { networkMonitor.isOnline }

    /// Number of pending offline actions waiting to be synced
    var pendingActionsCount: Int = 0

    // MARK: - API Client

    let apiClient = APIClient()
    let locationService = LocationService()
    let syncEngine = SyncEngine.shared

    // MARK: - Init

    init() {
        restoreSession()
        configureSyncEngine()
    }

    private func configureSyncEngine() {
        // Wire up sync engine to refresh progress after sync completes
        syncEngine.onSyncComplete = { [weak self] in
            await self?.loadProgress()
        }

        // Start periodic pending count updates
        Task {
            while true {
                pendingActionsCount = await OfflineQueue.shared.pendingCount
                try? await Task.sleep(nanoseconds: 2_000_000_000) // 2 seconds
            }
        }
    }

    // MARK: - Player Auth

    func playerJoin(joinCode: String, displayName: String) async {
        do {
            let request = PlayerJoinRequest(
                joinCode: joinCode,
                displayName: displayName,
                deviceId: AppConfiguration.deviceId
            )
            let response = try await apiClient.playerJoin(request: request)

            // Save to keychain
            KeychainService.save(key: AppConfiguration.playerTokenKey, value: response.token)

            // Save context to UserDefaults
            let defaults = UserDefaults.standard
            defaults.set(response.player.id.uuidString, forKey: AppConfiguration.playerIdKey)
            defaults.set(response.team.id.uuidString, forKey: AppConfiguration.teamIdKey)
            defaults.set(response.game.id.uuidString, forKey: AppConfiguration.gameIdKey)
            defaults.set("player", forKey: AppConfiguration.authTypeKey)

            // Update state
            authType = .player(
                token: response.token,
                playerId: response.player.id,
                teamId: response.team.id,
                gameId: response.game.id
            )
            currentGame = response.game
            currentTeam = response.team
            currentPlayer = response.player

            // Start location tracking
            locationService.startTracking(apiClient: apiClient, gameId: response.game.id, token: response.token)

            // Register for push notifications
            PushNotificationService.shared.configure(apiClient: apiClient, playerToken: response.token)
            PushNotificationService.shared.requestPermissionAndRegister()

            // Load initial progress
            await loadProgress()
        } catch {
            setError(error.localizedDescription)
        }
    }

    // MARK: - Operator Auth

    func operatorLogin(email: String, password: String) async {
        do {
            let request = OperatorLoginRequest(email: email, password: password)
            let response = try await apiClient.operatorLogin(request: request)

            KeychainService.save(key: AppConfiguration.operatorTokenKey, value: response.accessToken)
            KeychainService.save(key: AppConfiguration.operatorRefreshTokenKey, value: response.refreshToken)
            UserDefaults.standard.set("operator", forKey: AppConfiguration.authTypeKey)

            authType = .userOperator(
                accessToken: response.accessToken,
                refreshToken: response.refreshToken,
                userId: response.user.id
            )

            // Enable automatic token refresh on the API client
            await configureApiClientAuth(refreshToken: response.refreshToken)
        } catch {
            setError(error.localizedDescription)
        }
    }

    // MARK: - Player Game Actions

    /// Load game progress. If online, fetches from server and caches.
    /// If offline, loads from cache.
    func loadProgress() async {
        guard case .player(let token, _, let teamId, let gameId) = authType else { return }
        isLoadingProgress = true

        if isOnline {
            do {
                // Fetch complete game data and cache it
                let gameData = try await apiClient.getGameData(gameId: gameId, token: token)
                await GameDataCache.shared.cacheGameData(gameData, gameId: gameId)
                baseProgress = gameData.progress
            } catch {
                // Fall back to cache on network error
                if let cached = await GameDataCache.shared.getCachedProgress(gameId: gameId) {
                    baseProgress = cached
                } else {
                    setError(error.localizedDescription)
                }
            }
        } else {
            // Offline: load from cache
            if let cached = await GameDataCache.shared.getCachedProgress(gameId: gameId) {
                baseProgress = cached
            }
        }

        // Update pending count
        pendingActionsCount = await OfflineQueue.shared.pendingCount

        isLoadingProgress = false
    }

    /// Check in at a base. If online, calls API directly.
    /// If offline, queues the action and returns a locally-constructed response.
    func checkIn(baseId: UUID) async -> CheckInResponse? {
        guard case .player(let token, _, let teamId, let gameId) = authType else { return nil }

        if isOnline {
            do {
                let response = try await apiClient.checkIn(gameId: gameId, baseId: baseId, token: token)

                // Cache the challenge
                if let challenge = response.challenge {
                    await GameDataCache.shared.cacheChallenge(challenge, forBaseId: baseId)
                }

                // Send location immediately so operators see the team near the base
                await locationService.sendLocationNow()

                // Refresh progress
                await loadProgress()

                return response
            } catch {
                // If network error, fall through to offline handling
                if !isNetworkError(error) {
                    setError(error.localizedDescription)
                    return nil
                }
            }
        }

        // Offline path: enqueue action and return local response
        await OfflineQueue.shared.enqueueCheckIn(gameId: gameId, baseId: baseId)

        // Update local cache
        await GameDataCache.shared.updateBaseStatus(baseId: baseId, status: "checked_in", gameId: gameId)

        // Update local progress state
        updateLocalBaseStatus(baseId: baseId, status: .checkedIn)

        // Get cached challenge info
        let challenge = await GameDataCache.shared.getCachedChallenge(forBaseId: baseId, teamId: teamId, gameId: gameId)

        pendingActionsCount = await OfflineQueue.shared.pendingCount

        // Construct local response
        let baseName = baseProgress.first { $0.baseId == baseId }?.baseName ?? Translations.string("base.defaultName")
        return CheckInResponse(
            checkInId: UUID(), // Temporary local ID
            baseId: baseId,
            baseName: baseName,
            checkedInAt: ISO8601DateFormatter().string(from: Date()),
            challenge: challenge
        )
    }

    /// Submit an answer. If online, calls API directly.
    /// If offline, queues the action and returns a locally-constructed response.
    func submitAnswer(baseId: UUID, challengeId: UUID, answer: String) async -> SubmissionResponse? {
        guard case .player(let token, _, let teamId, let gameId) = authType else { return nil }

        if isOnline {
            do {
                let request = PlayerSubmissionRequest(
                    baseId: baseId,
                    challengeId: challengeId,
                    answer: answer
                )
                let response = try await apiClient.submitAnswer(
                    gameId: gameId,
                    request: request,
                    token: token
                )

                // Send location immediately so operators see the update
                await locationService.sendLocationNow()

                // Refresh progress
                await loadProgress()

                return response
            } catch {
                // If network error, fall through to offline handling
                if !isNetworkError(error) {
                    setError(error.localizedDescription)
                    return nil
                }
            }
        }

        // Offline path: enqueue action with idempotency key
        let idempotencyKey = await OfflineQueue.shared.enqueueSubmission(
            gameId: gameId,
            baseId: baseId,
            challengeId: challengeId,
            answer: answer
        )

        // Update local cache
        await GameDataCache.shared.updateBaseStatus(baseId: baseId, status: "submitted", gameId: gameId)

        // Update local progress state
        updateLocalBaseStatus(baseId: baseId, status: .submitted)

        pendingActionsCount = await OfflineQueue.shared.pendingCount

        // Construct local response
        return SubmissionResponse(
            id: idempotencyKey,
            teamId: teamId,
            challengeId: challengeId,
            baseId: baseId,
            answer: answer,
            fileUrl: nil,
            status: "pending",
            submittedAt: ISO8601DateFormatter().string(from: Date()),
            reviewedBy: nil,
            feedback: nil
        )
    }

    /// Submit a photo answer. Requires online connectivity (no offline support for photos).
    func submitAnswerWithPhoto(baseId: UUID, challengeId: UUID, image: UIImage, notes: String) async -> SubmissionResponse? {
        guard case .player(let token, _, _, let gameId) = authType else { return nil }

        guard isOnline else {
            setError(Translations.string("error.photoOffline"))
            return nil
        }

        // Compress to JPEG at 0.7 quality
        guard let imageData = image.jpegData(compressionQuality: 0.7) else {
            setError(Translations.string("error.photoProcessing"))
            return nil
        }

        do {
            let response = try await apiClient.submitAnswerWithFile(
                gameId: gameId,
                baseId: baseId,
                challengeId: challengeId,
                imageData: imageData,
                notes: notes,
                token: token
            )

            // Send location immediately so operators see the update
            await locationService.sendLocationNow()

            // Refresh progress
            await loadProgress()

            return response
        } catch {
            setError(error.localizedDescription)
            return nil
        }
    }

    func getCachedChallenge(forBaseId baseId: UUID) async -> CheckInResponse.ChallengeInfo? {
        guard case .player(_, _, let teamId, let gameId) = authType else {
            return await GameDataCache.shared.getCachedChallenge(forBaseId: baseId)
        }
        // Try the new cache method first, fall back to legacy
        if let challenge = await GameDataCache.shared.getCachedChallenge(forBaseId: baseId, teamId: teamId, gameId: gameId) {
            return challenge
        }
        return await GameDataCache.shared.getCachedChallenge(forBaseId: baseId)
    }

    // MARK: - Offline Helpers

    private func isNetworkError(_ error: Error) -> Bool {
        if let apiError = error as? APIError {
            switch apiError {
            case .networkError:
                return true
            default:
                return false
            }
        }
        let nsError = error as NSError
        return nsError.domain == NSURLErrorDomain
    }

    private func updateLocalBaseStatus(baseId: UUID, status: BaseStatus) {
        if let index = baseProgress.firstIndex(where: { $0.baseId == baseId }) {
            let old = baseProgress[index]
            baseProgress[index] = BaseProgress(
                baseId: old.baseId,
                baseName: old.baseName,
                lat: old.lat,
                lng: old.lng,
                nfcLinked: old.nfcLinked,
                requirePresenceToSubmit: old.requirePresenceToSubmit,
                status: status.rawValue,
                checkedInAt: status == .checkedIn ? ISO8601DateFormatter().string(from: Date()) : old.checkedInAt,
                challengeId: old.challengeId,
                submissionStatus: status == .submitted ? "pending" : old.submissionStatus
            )
        }
    }

    // MARK: - Solve Session

    func startSolving(baseId: UUID, challengeId: UUID) {
        solvingBaseId = baseId
        solvingChallengeId = challengeId
    }

    func clearSolveSession() {
        solvingBaseId = nil
        solvingChallengeId = nil
    }

    // MARK: - Status Helpers

    func statusForBase(_ baseId: UUID) -> BaseStatus {
        baseProgress.first(where: { $0.baseId == baseId })?.baseStatus ?? .notVisited
    }

    func progressForBase(_ baseId: UUID) -> BaseProgress? {
        baseProgress.first(where: { $0.baseId == baseId })
    }

    // MARK: - Logout

    func logout() {
        locationService.stopTracking()
        PushNotificationService.shared.reset()

        KeychainService.deleteAll()
        let defaults = UserDefaults.standard
        defaults.removeObject(forKey: AppConfiguration.playerIdKey)
        defaults.removeObject(forKey: AppConfiguration.teamIdKey)
        defaults.removeObject(forKey: AppConfiguration.gameIdKey)
        defaults.removeObject(forKey: AppConfiguration.authTypeKey)

        authType = .none
        currentGame = nil
        currentTeam = nil
        currentPlayer = nil
        baseProgress = []
        solvingBaseId = nil
        solvingChallengeId = nil
        pendingActionsCount = 0

        Task {
            await apiClient.clearAuth()
            await GameDataCache.shared.clearAll()
            await OfflineQueue.shared.clearAll()
        }
    }

    // MARK: - Session Restore

    private func restoreSession() {
        let defaults = UserDefaults.standard
        let savedType = defaults.string(forKey: AppConfiguration.authTypeKey)

        if savedType == "player",
           let token = KeychainService.load(key: AppConfiguration.playerTokenKey),
           let playerIdStr = defaults.string(forKey: AppConfiguration.playerIdKey),
           let teamIdStr = defaults.string(forKey: AppConfiguration.teamIdKey),
           let gameIdStr = defaults.string(forKey: AppConfiguration.gameIdKey),
           let playerId = UUID(uuidString: playerIdStr),
           let teamId = UUID(uuidString: teamIdStr),
           let gameId = UUID(uuidString: gameIdStr) {

            authType = .player(token: token, playerId: playerId, teamId: teamId, gameId: gameId)

            // Resume location tracking
            locationService.startTracking(apiClient: apiClient, gameId: gameId, token: token)

            // Re-register for push notifications (token may have changed)
            PushNotificationService.shared.configure(apiClient: apiClient, playerToken: token)
            PushNotificationService.shared.requestPermissionAndRegister()

            // Restore game/team info will happen when progress loads
            Task { await loadProgress() }

        } else if savedType == "operator",
                  let token = KeychainService.load(key: AppConfiguration.operatorTokenKey),
                  let refreshToken = KeychainService.load(key: AppConfiguration.operatorRefreshTokenKey) {

            // We don't persist userId for operators; they can re-fetch from /me
            authType = .userOperator(accessToken: token, refreshToken: refreshToken, userId: UUID())

            Task { await configureApiClientAuth(refreshToken: refreshToken) }
        }
    }

    // MARK: - API Client Auth

    /// Wire up automatic token refresh on the API client for operator sessions.
    private func configureApiClientAuth(refreshToken: String) async {
        await apiClient.configureOperatorAuth(
            refreshToken: refreshToken,
            onTokensRefreshed: { [weak self] accessToken, refreshToken, userId in
                await MainActor.run {
                    guard let self else { return }
                    // Update in-memory auth state with fresh tokens
                    self.authType = .userOperator(
                        accessToken: accessToken,
                        refreshToken: refreshToken,
                        userId: userId
                    )
                    // Persist to keychain
                    KeychainService.save(key: AppConfiguration.operatorTokenKey, value: accessToken)
                    KeychainService.save(key: AppConfiguration.operatorRefreshTokenKey, value: refreshToken)
                }
            },
            onAuthFailure: { [weak self] in
                await MainActor.run {
                    self?.logout()
                }
            }
        )
    }

    // MARK: - Error

    func setError(_ message: String) {
        errorMessage = message
        showError = true
    }
}
