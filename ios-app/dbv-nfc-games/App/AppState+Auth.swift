import Foundation
import os

// MARK: - Authentication & Session Management

extension AppState {

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
            realtimeClient.connect(gameId: response.game.id, token: response.token)
            currentGame = response.game
            currentTeam = response.team
            currentPlayer = response.player

            // Configure push service (but don't request permission yet)
            PushNotificationService.shared.configureForPlayer(apiClient: apiClient, playerToken: response.token)

            // Only start location tracking and request push permission if
            // the user has already seen the permission disclosure sheet.
            // Otherwise, MainTabView will show the disclosure first and
            // call requestPermissionsAfterDisclosure() when the user taps Continue.
            let disclosureSeen = UserDefaults.standard.bool(forKey: "com.prayer.pointfinder.permissionDisclosureSeen")
            if disclosureSeen {
                locationService.startTracking(apiClient: apiClient, gameId: response.game.id, token: response.token)
                PushNotificationService.shared.requestPermissionAndRegister()
            }

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
            UserDefaults.standard.set(response.user.id.uuidString, forKey: AppConfiguration.operatorUserIdKey)

            authType = .userOperator(
                accessToken: response.accessToken,
                refreshToken: response.refreshToken,
                userId: response.user.id
            )
            realtimeClient.disconnect()
            PushNotificationService.shared.configureForOperator(apiClient: apiClient, operatorToken: response.accessToken)
            PushNotificationService.shared.requestPermissionAndRegister()

            // Enable automatic token refresh on the API client
            await configureApiClientAuth(refreshToken: response.refreshToken)
        } catch {
            setError(error.localizedDescription)
        }
    }

    // MARK: - Logout

    func logout() {
        locationService.stopTracking()
        PushNotificationService.shared.reset()
        realtimeClient.disconnect()

        KeychainService.deleteAll()
        let defaults = UserDefaults.standard
        defaults.removeObject(forKey: AppConfiguration.playerIdKey)
        defaults.removeObject(forKey: AppConfiguration.teamIdKey)
        defaults.removeObject(forKey: AppConfiguration.gameIdKey)
        defaults.removeObject(forKey: AppConfiguration.operatorUserIdKey)
        defaults.removeObject(forKey: AppConfiguration.authTypeKey)

        authType = .none
        currentGame = nil
        currentTeam = nil
        currentPlayer = nil
        baseProgress = []
        solvingBaseId = nil
        solvingChallengeId = nil
        pendingActionsCount = 0
        notifications = []
        unseenNotificationCount = 0
        lastNotificationsSeenAt = nil
        pendingCountTask?.cancel()
        pendingCountTask = nil
        progressLoadTask?.cancel()
        progressLoadTask = nil

        Task { [weak self] in
            guard let self else { return }
            await self.apiClient.clearAuth()
            await GameDataCache.shared.clearAll()
            await OfflineQueue.shared.clearAll()
        }
    }

    // MARK: - Account Deletion

    func deletePlayerAccount() async {
        guard case .player(let token, _, _, _) = authType else {
            return
        }

        do {
            try await apiClient.deletePlayerAccount(token: token)
            logout()
        } catch {
            setError(error.localizedDescription)
        }
    }

    // MARK: - Session Restore

    func restoreSession() {
        #if DEBUG
        // Check for player auth from environment (UI testing)
        let env = ProcessInfo.processInfo.environment
        if let token = env["POINTFINDER_PLAYER_TOKEN"],
           let playerIdStr = env["POINTFINDER_PLAYER_ID"],
           let teamIdStr = env["POINTFINDER_TEAM_ID"],
           let gameIdStr = env["POINTFINDER_GAME_ID"],
           let playerId = UUID(uuidString: playerIdStr),
           let teamId = UUID(uuidString: teamIdStr),
           let gameId = UUID(uuidString: gameIdStr) {

            authType = .player(token: token, playerId: playerId, teamId: teamId, gameId: gameId)
            realtimeClient.connect(gameId: gameId, token: token)
            UserDefaults.standard.set(true, forKey: "com.prayer.pointfinder.permissionDisclosureSeen")
            locationService.startTracking(apiClient: apiClient, gameId: gameId, token: token)
            progressLoadTask = Task { await loadProgress() }
            return
        }
        #endif

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
            realtimeClient.connect(gameId: gameId, token: token)

            // Configure push service (but don't request permission yet)
            PushNotificationService.shared.configureForPlayer(apiClient: apiClient, playerToken: token)

            // Only resume location tracking and push if the user has already
            // seen the permission disclosure sheet.
            let disclosureSeen = UserDefaults.standard.bool(forKey: "com.prayer.pointfinder.permissionDisclosureSeen")
            if disclosureSeen {
                locationService.startTracking(apiClient: apiClient, gameId: gameId, token: token)
                PushNotificationService.shared.requestPermissionAndRegister()
            }

            // Restore game/team info will happen when progress loads
            progressLoadTask = Task { await loadProgress() }

        } else if savedType == "operator",
                  let token = KeychainService.load(key: AppConfiguration.operatorTokenKey),
                  let refreshToken = KeychainService.load(key: AppConfiguration.operatorRefreshTokenKey) {

            if let userIdString = defaults.string(forKey: AppConfiguration.operatorUserIdKey),
               let userId = UUID(uuidString: userIdString) {
                authType = .userOperator(accessToken: token, refreshToken: refreshToken, userId: userId)
            } else {
                // Backward compatibility for sessions saved before operator user ID persistence.
                authType = .userOperator(accessToken: token, refreshToken: refreshToken, userId: UUID())
                Task { [weak self] in
                    guard let self else { return }
                    if let user = try? await self.apiClient.getCurrentUser(token: token) {
                        guard case .userOperator(let accessToken, let currentRefreshToken, _) = self.authType else { return }
                        UserDefaults.standard.set(user.id.uuidString, forKey: AppConfiguration.operatorUserIdKey)
                        self.authType = .userOperator(
                            accessToken: accessToken,
                            refreshToken: currentRefreshToken,
                            userId: user.id
                        )
                    }
                }
            }

            Task { await configureApiClientAuth(refreshToken: refreshToken) }
            realtimeClient.disconnect()
            PushNotificationService.shared.configureForOperator(apiClient: apiClient, operatorToken: token)
            PushNotificationService.shared.requestPermissionAndRegister()
        }
    }

    // MARK: - Realtime

    func connectRealtime(gameId: UUID, token: String) {
        realtimeClient.connect(gameId: gameId, token: token)
    }

    func disconnectRealtime() {
        realtimeClient.disconnect()
    }

    // MARK: - API Client Auth

    /// Wire up automatic token refresh on the API client for operator sessions.
    func configureApiClientAuth(refreshToken: String) async {
        await apiClient.configureOperatorAuth(
            refreshToken: refreshToken,
            onTokensRefreshed: { [weak self] accessToken, refreshToken, userId in
                await MainActor.run { [weak self] in
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
                    UserDefaults.standard.set(userId.uuidString, forKey: AppConfiguration.operatorUserIdKey)
                    PushNotificationService.shared.configureForOperator(apiClient: self.apiClient, operatorToken: accessToken)
                }
            }
        )
    }

    // MARK: - Permission Disclosure

    /// Called by MainTabView after the user dismisses the permission disclosure sheet.
    /// Starts location tracking and requests push notification permission.
    func requestPermissionsAfterDisclosure() {
        guard case .player(let token, _, _, let gameId) = authType else { return }
        locationService.startTracking(apiClient: apiClient, gameId: gameId, token: token)
        PushNotificationService.shared.requestPermissionAndRegister()
    }
}
