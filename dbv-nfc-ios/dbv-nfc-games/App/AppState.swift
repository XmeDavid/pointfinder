import Foundation
import SwiftUI

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

    // MARK: - API Client

    let apiClient = APIClient()
    let locationService = LocationService()

    // MARK: - Init

    init() {
        restoreSession()
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

    func loadProgress() async {
        guard case .player(let token, _, _, let gameId) = authType else { return }
        isLoadingProgress = true
        do {
            baseProgress = try await apiClient.getProgress(gameId: gameId, token: token)
        } catch {
            setError(error.localizedDescription)
        }
        isLoadingProgress = false
    }

    func checkIn(baseId: UUID) async -> CheckInResponse? {
        guard case .player(let token, _, _, let gameId) = authType else { return nil }
        do {
            let response = try await apiClient.checkIn(gameId: gameId, baseId: baseId, token: token)

            // Cache the challenge
            if let challenge = response.challenge {
                await CacheManager.shared.cacheChallenge(challenge, forBaseId: baseId)
            }

            // Refresh progress
            await loadProgress()

            return response
        } catch {
            setError(error.localizedDescription)
            return nil
        }
    }

    func submitAnswer(baseId: UUID, challengeId: UUID, answer: String) async -> SubmissionResponse? {
        guard case .player(let token, _, _, let gameId) = authType else { return nil }
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

            // Refresh progress
            await loadProgress()

            return response
        } catch {
            setError(error.localizedDescription)
            return nil
        }
    }

    func getCachedChallenge(forBaseId baseId: UUID) async -> CheckInResponse.ChallengeInfo? {
        return await CacheManager.shared.getCachedChallenge(forBaseId: baseId)
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

        Task {
            await apiClient.clearAuth()
            await CacheManager.shared.clearAll()
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
