import Foundation
import os

/// Thrown when [OfflineQueue.enqueue] is called while the queue has
/// reached [OfflineQueue.maxPendingActions]. Parity with Android
/// `OfflineQueueFullException`.
enum OfflineQueueError: Error {
    case queueFull
}

/// Persistent queue for actions that need to be synced when connectivity is restored.
/// Stores pending check-ins and submissions as JSON on disk.
actor OfflineQueue {

    static let shared = OfflineQueue()

    /// Hard cap on queue size. Mirrors Android's
    /// `PlayerRepository.MAX_PENDING_ACTIONS`. Once hit, `enqueue`
    /// throws `OfflineQueueError.queueFull` so callers can surface the
    /// `errors.offlineQueueFull` banner instead of silently losing work.
    static let maxPendingActions = 1000

    private let fileURL: URL
    private var pendingActions: [PendingAction] = []
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    /// Set to true when a disk write failed (e.g. storage full, sandbox
    /// permission issue). Callers can inspect this to decide whether to
    /// show the `errors.offlineQueuePersistFailed` banner. Cleared on the
    /// next successful save.
    private(set) var persistFailed: Bool = false

    var pendingCount: Int {
        pendingActions.filter { !$0.permanentlyFailed }.count
    }

    /// Callback invoked whenever the queue changes (enqueue/dequeue/clear).
    /// Set by AppState to reactively update `pendingActionsCount`.
    private var onCountChanged: (@Sendable (Int) -> Void)?

    /// Callback invoked after a disk write failure so AppState can show a
    /// banner. Debounced to fire only on transitions (not on every save).
    private var onPersistFailed: (@Sendable () -> Void)?

    /// Set the callback for queue count changes (actor-safe setter).
    func setOnCountChanged(_ callback: @escaping @Sendable (Int) -> Void) {
        onCountChanged = callback
    }

    /// Set the callback invoked when saving to disk fails. Used by
    /// AppState to surface `errors.offlineQueuePersistFailed` (audit
    /// Wave D item 8).
    func setOnPersistFailed(_ callback: @escaping @Sendable () -> Void) {
        onPersistFailed = callback
    }

    private func notifyCountChanged() {
        onCountChanged?(pendingCount)
    }

    private init() {
        let documentsPath = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        fileURL = documentsPath.appendingPathComponent("pending_actions.json")
        // Inline load (calling actor-isolated methods from init is not allowed)
        if FileManager.default.fileExists(atPath: fileURL.path) {
            do {
                let data = try Data(contentsOf: fileURL)
                pendingActions = try decoder.decode([PendingAction].self, from: data)
            } catch {
                Logger(subsystem: "com.prayer.pointfinder", category: "OfflineQueue").warning(" Failed to load from disk: \(error.localizedDescription)")
                pendingActions = []
            }
        }
    }

    /// Testable initializer that uses a custom file URL for isolation.
    init(fileURL: URL) {
        self.fileURL = fileURL
        if FileManager.default.fileExists(atPath: fileURL.path) {
            do {
                let data = try Data(contentsOf: fileURL)
                pendingActions = try decoder.decode([PendingAction].self, from: data)
            } catch {
                Logger(subsystem: "com.prayer.pointfinder", category: "OfflineQueue").warning(" Failed to load from disk: \(error.localizedDescription)")
                pendingActions = []
            }
        }
    }

    // MARK: - Queue Operations

    /// Add an action to the pending queue.
    ///
    /// Throws `OfflineQueueError.queueFull` if the queue already contains
    /// [maxPendingActions] items (iOS parity with Android). Callers should
    /// surface `errors.offlineQueueFull` to the user.
    func enqueue(_ action: PendingAction) throws {
        if pendingCount >= Self.maxPendingActions {
            throw OfflineQueueError.queueFull
        }
        // If the last save failed, retry persistence before enqueueing so
        // the new item has a chance to survive a restart (audit Wave D
        // item 8 — "Also run a retry on next enqueue").
        if persistFailed {
            saveToDisk()
        }
        pendingActions.append(action)
        saveToDisk()
        notifyCountChanged()
    }

    /// Remove an action from the queue (after successful sync)
    func dequeue(_ id: UUID) {
        if let action = pendingActions.first(where: { $0.id == id }) {
            deleteLocalMediaCopyIfNeeded(for: action)
        }
        pendingActions.removeAll { $0.id == id }
        saveToDisk()
        notifyCountChanged()
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

    /// Get a specific action from the queue.
    func pendingAction(id: UUID) -> PendingAction? {
        pendingActions.first { $0.id == id }
    }

    /// Replace an existing action in the queue.
    func update(_ action: PendingAction) {
        guard let index = pendingActions.firstIndex(where: { $0.id == action.id }) else { return }
        pendingActions[index] = action
        saveToDisk()
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
        for action in pendingActions {
            deleteLocalMediaCopyIfNeeded(for: action)
        }
        pendingActions.removeAll()
        saveToDisk()
        notifyCountChanged()
    }

    /// Clear pending actions for a specific game
    func clearGame(_ gameId: UUID) {
        for action in pendingActions where action.gameId == gameId {
            deleteLocalMediaCopyIfNeeded(for: action)
        }
        pendingActions.removeAll { $0.gameId == gameId }
        saveToDisk()
        notifyCountChanged()
    }

    // MARK: - Convenience Methods

    /// Create and enqueue a check-in action.
    /// Throws [OfflineQueueError.queueFull] when the queue is at cap.
    func enqueueCheckIn(gameId: UUID, baseId: UUID, nfcToken: String? = nil) throws {
        let action = PendingAction(type: .checkIn, gameId: gameId, baseId: baseId, nfcToken: nfcToken)
        try enqueue(action)
    }

    /// Create and enqueue a submission action.
    /// Throws [OfflineQueueError.queueFull] when the queue is at cap.
    func enqueueSubmission(gameId: UUID, baseId: UUID, challengeId: UUID, answer: String) throws -> UUID {
        let action = PendingAction(
            type: .submission,
            gameId: gameId,
            baseId: baseId,
            challengeId: challengeId,
            answer: answer
        )
        try enqueue(action)
        return action.id  // Return the idempotency key
    }

    /// Create and enqueue a media submission action.
    /// Throws [OfflineQueueError.queueFull] when the queue is at cap.
    func enqueueMediaSubmission(
        gameId: UUID,
        baseId: UUID,
        challengeId: UUID,
        answer: String,
        contentType: String,
        sizeBytes: Int64,
        localFilePath: String?,
        sourcePath: String?,
        fileName: String?
    ) throws -> UUID {
        var action = PendingAction(
            type: .mediaSubmission,
            gameId: gameId,
            baseId: baseId,
            challengeId: challengeId,
            answer: answer
        )
        action.mediaContentType = contentType
        action.mediaSizeBytes = sizeBytes
        action.mediaLocalFilePath = localFilePath
        action.mediaSourcePath = sourcePath
        action.mediaFileName = fileName
        action.uploadChunkIndex = 0
        action.needsReselect = false
        try enqueue(action)
        return action.id
    }

    /// Create and enqueue a multi-media submission action with multiple media items.
    /// Throws [OfflineQueueError.queueFull] when the queue is at cap.
    func enqueueMultiMediaSubmission(
        gameId: UUID,
        baseId: UUID,
        challengeId: UUID,
        answer: String,
        mediaItems: [PendingMediaItem]
    ) throws -> UUID {
        var action = PendingAction(
            type: .mediaSubmission,
            gameId: gameId,
            baseId: baseId,
            challengeId: challengeId,
            answer: answer
        )
        action.mediaItems = mediaItems
        // Set legacy single-file fields from first item for backward compat
        if let first = mediaItems.first {
            action.mediaContentType = first.contentType
            action.mediaSizeBytes = first.sizeBytes
            action.mediaLocalFilePath = first.localFilePath
            action.mediaFileName = first.fileName
        }
        action.uploadChunkIndex = 0
        action.needsReselect = false
        try enqueue(action)
        return action.id
    }

    /// Update upload checkpoint details for a media action.
    func updateUploadProgress(
        id: UUID,
        uploadSessionId: UUID?,
        uploadedChunkIndex: Int?,
        totalChunks: Int?,
        lastError: String?
    ) {
        guard let index = pendingActions.firstIndex(where: { $0.id == id }) else { return }
        pendingActions[index].uploadSessionId = uploadSessionId
        pendingActions[index].uploadChunkIndex = uploadedChunkIndex
        pendingActions[index].uploadTotalChunks = totalChunks
        pendingActions[index].lastError = lastError
        saveToDisk()
    }

    /// Mark an action as permanently failed (will not be retried).
    func markFailed(_ id: UUID, reason: String) {
        if let index = pendingActions.firstIndex(where: { $0.id == id }) {
            pendingActions[index].permanentlyFailed = true
            pendingActions[index].failureReason = reason
            saveToDisk()
        }
    }

    /// Get all permanently failed actions.
    var failedActions: [PendingAction] {
        pendingActions.filter { $0.permanentlyFailed }
    }

    /// Count of permanently failed actions.
    var failedCount: Int {
        pendingActions.filter { $0.permanentlyFailed }.count
    }

    /// Mark a media action as requiring user re-selection (source unavailable).
    func markNeedsReselect(id: UUID, message: String) {
        guard let index = pendingActions.firstIndex(where: { $0.id == id }) else { return }
        pendingActions[index].needsReselect = true
        pendingActions[index].lastError = message
        saveToDisk()
    }

    // MARK: - Persistence

    private func loadFromDisk() {
        guard FileManager.default.fileExists(atPath: fileURL.path) else { return }
        do {
            let data = try Data(contentsOf: fileURL)
            pendingActions = try decoder.decode([PendingAction].self, from: data)
        } catch {
            Logger(subsystem: "com.prayer.pointfinder", category: "OfflineQueue").warning(" Failed to load from disk: \(error.localizedDescription)")
            pendingActions = []
        }
    }

    private func saveToDisk() {
        do {
            let data = try encoder.encode(pendingActions)
            try data.write(to: fileURL, options: .atomic)
            // Successful write — clear the failed flag. Also do NOT fire
            // the callback on recovery; AppState only cares about the
            // failure→failure transition so it doesn't spam the user.
            persistFailed = false
        } catch {
            Logger(subsystem: "com.prayer.pointfinder", category: "OfflineQueue").warning(" Failed to save to disk: \(error.localizedDescription)")
            // Surface via AppState so the user sees the
            // `errors.offlineQueuePersistFailed` banner instead of
            // assuming their work is safely queued (audit Wave D item 8).
            let wasFailed = persistFailed
            persistFailed = true
            if !wasFailed {
                onPersistFailed?()
            }
        }
    }

    private func deleteLocalMediaCopyIfNeeded(for action: PendingAction) {
        if let localPath = action.mediaLocalFilePath {
            try? FileManager.default.removeItem(atPath: localPath)
        }
        // Also clean up any multi-media item local copies
        if let items = action.mediaItems {
            for item in items {
                if let localPath = item.localFilePath {
                    try? FileManager.default.removeItem(atPath: localPath)
                }
            }
        }
    }
}
