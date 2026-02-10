import Foundation

/// Persistent queue for actions that need to be synced when connectivity is restored.
/// Stores pending check-ins and submissions as JSON on disk.
actor OfflineQueue {

    static let shared = OfflineQueue()

    private let fileURL: URL
    private var pendingActions: [PendingAction] = []
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    var pendingCount: Int {
        pendingActions.count
    }

    private init() {
        let documentsPath = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        fileURL = documentsPath.appendingPathComponent("pending_actions.json")
        loadFromDisk()
    }

    // MARK: - Queue Operations

    /// Add an action to the pending queue
    func enqueue(_ action: PendingAction) {
        pendingActions.append(action)
        saveToDisk()
    }

    /// Remove an action from the queue (after successful sync)
    func dequeue(_ id: UUID) {
        pendingActions.removeAll { $0.id == id }
        saveToDisk()
    }

    /// Get all pending actions (FIFO order)
    func allPending() -> [PendingAction] {
        pendingActions.sorted { $0.createdAt < $1.createdAt }
    }

    /// Get pending actions for a specific game
    func pendingForGame(_ gameId: UUID) -> [PendingAction] {
        allPending().filter { $0.gameId == gameId }
    }

    /// Increment retry count for an action
    func incrementRetryCount(_ id: UUID) {
        if let index = pendingActions.firstIndex(where: { $0.id == id }) {
            pendingActions[index].retryCount += 1
            saveToDisk()
        }
    }

    /// Check if an action exists in the queue
    func contains(_ id: UUID) -> Bool {
        pendingActions.contains { $0.id == id }
    }

    /// Check if there's a pending check-in for a base in a specific game.
    func hasPendingCheckIn(gameId: UUID, baseId: UUID) -> Bool {
        pendingActions.contains { $0.type == .checkIn && $0.gameId == gameId && $0.baseId == baseId }
    }

    /// Check if there's a pending submission for a challenge at a base
    func hasPendingSubmission(baseId: UUID, challengeId: UUID) -> Bool {
        pendingActions.contains {
            $0.type == .submission && $0.baseId == baseId && $0.challengeId == challengeId
        }
    }

    /// Clear all pending actions
    func clearAll() {
        pendingActions.removeAll()
        saveToDisk()
    }

    /// Clear pending actions for a specific game
    func clearGame(_ gameId: UUID) {
        pendingActions.removeAll { $0.gameId == gameId }
        saveToDisk()
    }

    // MARK: - Convenience Methods

    /// Create and enqueue a check-in action
    func enqueueCheckIn(gameId: UUID, baseId: UUID) {
        let action = PendingAction(type: .checkIn, gameId: gameId, baseId: baseId)
        enqueue(action)
    }

    /// Create and enqueue a submission action
    func enqueueSubmission(gameId: UUID, baseId: UUID, challengeId: UUID, answer: String) -> UUID {
        let action = PendingAction(
            type: .submission,
            gameId: gameId,
            baseId: baseId,
            challengeId: challengeId,
            answer: answer
        )
        enqueue(action)
        return action.id  // Return the idempotency key
    }

    // MARK: - Persistence

    private func loadFromDisk() {
        guard FileManager.default.fileExists(atPath: fileURL.path) else { return }
        do {
            let data = try Data(contentsOf: fileURL)
            pendingActions = try decoder.decode([PendingAction].self, from: data)
        } catch {
            print("[OfflineQueue] Failed to load from disk: \(error.localizedDescription)")
            pendingActions = []
        }
    }

    private func saveToDisk() {
        do {
            let data = try encoder.encode(pendingActions)
            try data.write(to: fileURL, options: .atomic)
        } catch {
            print("[OfflineQueue] Failed to save to disk: \(error.localizedDescription)")
        }
    }
}
