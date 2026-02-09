import Foundation

/// Synchronizes pending offline actions when connectivity is restored.
/// Processes the OfflineQueue in FIFO order with retry and backoff.
@MainActor
@Observable
final class SyncEngine {

    static let shared = SyncEngine()

    private(set) var isSyncing = false
    private(set) var lastSyncError: String?

    private let maxRetries = 5
    private let baseBackoffSeconds: TimeInterval = 2

    /// Callback to refresh progress after sync (injected by AppState)
    var onSyncComplete: (() async -> Void)?

    private init() {
        // Listen for network reconnection events
        NetworkMonitor.shared.onReconnect = { [weak self] in
            Task { @MainActor in
                await self?.syncPendingActions()
            }
        }
    }

    /// Number of pending actions in the queue
    var pendingCount: Int {
        get async {
            await OfflineQueue.shared.pendingCount
        }
    }

    /// Manually trigger a sync (can be called from UI)
    func syncPendingActions() async {
        guard !isSyncing else { return }
        guard NetworkMonitor.shared.isOnline else { return }

        isSyncing = true
        lastSyncError = nil

        let actions = await OfflineQueue.shared.allPending()

        // Process check-ins first, then submissions (submissions may depend on check-ins)
        let checkIns = actions.filter { $0.type == .checkIn }
        let submissions = actions.filter { $0.type == .submission }

        for action in checkIns {
            await processAction(action)
        }

        for action in submissions {
            await processAction(action)
        }

        isSyncing = false

        // Refresh progress from server after sync
        await onSyncComplete?()
    }

    private func processAction(_ action: PendingAction) async {
        // Skip if already at max retries
        if action.retryCount >= maxRetries {
            // Remove failed action after max retries
            await OfflineQueue.shared.dequeue(action.id)
            print("[SyncEngine] Removed action \(action.id) after \(maxRetries) retries")
            return
        }

        // Exponential backoff if this is a retry
        if action.retryCount > 0 {
            let delay = baseBackoffSeconds * pow(2.0, Double(action.retryCount - 1))
            try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
        }

        do {
            switch action.type {
            case .checkIn:
                try await syncCheckIn(action)
            case .submission:
                try await syncSubmission(action)
            }

            // Success - remove from queue
            await OfflineQueue.shared.dequeue(action.id)
            print("[SyncEngine] Synced action: \(action.type.rawValue) for base \(action.baseId)")

        } catch {
            // Check if this is a network error (retry) vs a server error (don't retry)
            if isNetworkError(error) {
                await OfflineQueue.shared.incrementRetryCount(action.id)
                lastSyncError = "Network error, will retry"
                print("[SyncEngine] Network error for \(action.id), will retry: \(error.localizedDescription)")
            } else {
                // Server returned an error - remove the action to avoid infinite retries
                await OfflineQueue.shared.dequeue(action.id)
                lastSyncError = error.localizedDescription
                print("[SyncEngine] Server error for \(action.id), removing: \(error.localizedDescription)")
            }
        }
    }

    private func syncCheckIn(_ action: PendingAction) async throws {
        // Get auth token from AppState
        guard let token = getPlayerToken() else {
            throw SyncError.noAuth
        }

        let apiClient = APIClient()
        _ = try await apiClient.checkIn(gameId: action.gameId, baseId: action.baseId, token: token)
    }

    private func syncSubmission(_ action: PendingAction) async throws {
        guard let token = getPlayerToken(),
              let challengeId = action.challengeId,
              let answer = action.answer else {
            throw SyncError.invalidAction
        }

        let apiClient = APIClient()
        let request = PlayerSubmissionRequest(
            baseId: action.baseId,
            challengeId: challengeId,
            answer: answer,
            idempotencyKey: action.id  // Use the action ID as idempotency key
        )
        _ = try await apiClient.submitAnswer(gameId: action.gameId, request: request, token: token)
    }

    private func getPlayerToken() -> String? {
        // Load from keychain
        KeychainService.load(key: AppConfiguration.playerTokenKey)
    }

    private func isNetworkError(_ error: Error) -> Bool {
        if let apiError = error as? APIError {
            switch apiError {
            case .networkError:
                return true
            default:
                return false
            }
        }
        // URLSession network errors
        let nsError = error as NSError
        return nsError.domain == NSURLErrorDomain
    }
}

// MARK: - Errors

enum SyncError: LocalizedError {
    case noAuth
    case invalidAction

    var errorDescription: String? {
        switch self {
        case .noAuth:
            return "No authentication token available"
        case .invalidAction:
            return "Invalid action data"
        }
    }
}
