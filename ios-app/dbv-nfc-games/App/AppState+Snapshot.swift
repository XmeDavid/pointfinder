import Foundation
import os

// MARK: - Snapshot Refresh (P0 Track 2 Slice 2)
//
// Calls the canonical state snapshot endpoint (`GET /api/games/{id}/snapshot`)
// and replaces local cached state with the server's authoritative answer.
// This is the recovery call wired to:
//   1. App foreground (`scenePhase == .active` in `MainTabView` /
//      `OperatorGameView`).
//   2. Realtime reconnect (`MobileRealtimeClient.onReconnect` in
//      `AppState.configureRealtimeClient()`).
//   3. Network restoration (`NetworkMonitor.shared.onReconnect`).
//
// Why we need this in addition to `MobileRealtimeClient.ensureConnected()`:
// a healthy socket is NOT the same as fresh state. A player can be connected
// to the realtime channel with a valid JWT, miss the `game_status` broadcast
// (app backgrounded, network blip, STOMP reconnect race), and still see
// `gameStatus = setup` indefinitely. `ensureConnected()` pings the socket;
// `refreshFromSnapshot()` asks the server "what is the actual state right
// now?". Both are called on foreground for defense-in-depth.
//
// Failure tolerance: the call is a recovery mechanism. It MUST NOT crash or
// block the UI. Auth errors (401/403) are already handled by the APIClient's
// `onAuthFailure` handler (which triggers a forced logout). Network errors,
// decode errors, and "wrong game" 403s are logged and swallowed — the next
// trigger will try again.

extension AppState {

    /// Fetches the canonical state snapshot for the current game and
    /// reconciles local cached state (game status, team, progress, etc.)
    /// with the server answer. Routes to the player or operator shape based
    /// on `authType`. A no-op when logged out.
    func refreshFromSnapshot() async {
        switch authType {
        case .player(let token, _, _, let gameId):
            await refreshPlayerSnapshot(gameId: gameId, token: token)
        case .userOperator(let accessToken, _, _):
            await refreshOperatorSnapshot(token: accessToken)
        case .none:
            return
        }
    }

    private func refreshPlayerSnapshot(gameId: UUID, token: String) async {
        do {
            let snapshot = try await apiClient.getPlayerSnapshot(gameId: gameId, token: token)
            applyPlayerSnapshot(snapshot)
            logger.info("Player snapshot applied: gameStatus=\(snapshot.game.status, privacy: .public) stateVersion=\(snapshot.stateVersion, privacy: .public)")
            NotificationCenter.default.post(
                name: .snapshotRefreshed,
                object: nil,
                userInfo: [
                    "gameId": gameId.uuidString,
                    "stateVersion": snapshot.stateVersion,
                    "status": snapshot.game.status,
                ]
            )
        } catch APIError.authExpired {
            // APIClient already triggered the auth-failure handler → logout
            // path. Nothing more for us to do here.
            logger.info("Player snapshot auth expired; handled by APIClient")
        } catch {
            // Recovery call, never block UI — log and carry on.
            logger.warning("Player snapshot refresh failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    private func refreshOperatorSnapshot(token: String) async {
        // Operators have no single "current game" on AppState — they browse
        // the games list. The operator snapshot is driven by
        // `OperatorGameView` which knows its own `game.id`. We post a
        // notification with a nil gameId; the view re-runs its own
        // snapshot fetch when it sees `scenePhase == .active`, so this
        // path is effectively a marker for "operator is foregrounded" and
        // does NOT itself call the endpoint (operator games are not
        // tracked on AppState). See `OperatorGameView.onChange(of: scenePhase)`.
        logger.debug("Operator refreshFromSnapshot: delegating to active game view")
        NotificationCenter.default.post(
            name: .snapshotRefreshed,
            object: nil,
            userInfo: ["role": "operator"]
        )
    }

    /// Fetches the operator snapshot for a specific game. Used by
    /// `OperatorGameView` which holds the active game id. Failure-tolerant.
    func refreshOperatorSnapshot(gameId: UUID) async {
        guard case .userOperator(let accessToken, _, _) = authType else { return }
        do {
            let snapshot = try await apiClient.getOperatorSnapshot(gameId: gameId, token: accessToken)
            logger.info("Operator snapshot applied: gameStatus=\(snapshot.game.status, privacy: .public) stateVersion=\(snapshot.stateVersion, privacy: .public) pending=\(snapshot.pendingReviews, privacy: .public)")
            NotificationCenter.default.post(
                name: .snapshotRefreshed,
                object: nil,
                userInfo: [
                    "role": "operator",
                    "gameId": gameId.uuidString,
                    "stateVersion": snapshot.stateVersion,
                    "status": snapshot.game.status,
                    "pendingReviews": snapshot.pendingReviews,
                    "activeUploads": snapshot.activeUploads,
                    "needsAttention": snapshot.needsAttention,
                ]
            )
        } catch APIError.authExpired {
            logger.info("Operator snapshot auth expired; handled by APIClient")
        } catch {
            logger.warning("Operator snapshot refresh failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    /// Merges a player snapshot into the live `AppState`. Updates are applied
    /// in a conservative order: game status first (unblocks the gameplay
    /// guard), then team info (covers name/color changes), then progress.
    /// Existing local challenge cache is left alone — the snapshot endpoint
    /// does not carry assignments/challenges (those come from the heavier
    /// `getGameData` call on initial load).
    private func applyPlayerSnapshot(_ snapshot: PlayerSnapshotResponse) {
        // Update currentGame with fresh status.
        if let existingGame = currentGame {
            currentGame = PlayerAuthResponse.GameInfo(
                id: existingGame.id,
                name: snapshot.game.name,
                description: snapshot.game.description ?? existingGame.description,
                status: snapshot.game.status,
                tileSource: snapshot.game.tileSource ?? existingGame.tileSource
            )
        } else {
            currentGame = PlayerAuthResponse.GameInfo(
                id: snapshot.game.id,
                name: snapshot.game.name,
                description: snapshot.game.description ?? "",
                status: snapshot.game.status,
                tileSource: snapshot.game.tileSource
            )
        }

        // Update currentTeam with fresh name/color. Ignore memberCount —
        // PlayerAuthResponse.TeamInfo does not carry it and it is not shown
        // in the player UI.
        if let existingTeam = currentTeam {
            currentTeam = PlayerAuthResponse.TeamInfo(
                id: existingTeam.id,
                name: snapshot.team.name,
                color: snapshot.team.color ?? existingTeam.color
            )
        }

        // Replace the progress list with snapshot.progress. The snapshot is
        // authoritative; if the server says base X is completed, it is.
        // Preserve any locally-revealed hidden bases that are missing from
        // the snapshot (these are optimistic unlocks from offline check-ins
        // that will reconcile on the next loadProgress / server sync).
        let serverProgressIds = Set(snapshot.progress.map { $0.baseId })
        let locallyOptimisticEntries = baseProgress.filter { !serverProgressIds.contains($0.baseId) }
        baseProgress = snapshot.progress + locallyOptimisticEntries
    }
}
