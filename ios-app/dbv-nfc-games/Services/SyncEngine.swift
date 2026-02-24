import Foundation
import os

protocol SyncAPIClient: AnyObject {
    func checkIn(gameId: UUID, baseId: UUID, token: String) async throws -> CheckInResponse
    func submitAnswer(gameId: UUID, request: PlayerSubmissionRequest, token: String) async throws -> SubmissionResponse
    func createUploadSession(gameId: UUID, request: UploadSessionInitRequest, token: String) async throws -> UploadSessionResponse
    func uploadSessionChunk(
        gameId: UUID,
        sessionId: UUID,
        chunkIndex: Int,
        chunkData: Data,
        token: String
    ) async throws -> UploadSessionResponse
    func getUploadSession(gameId: UUID, sessionId: UUID, token: String) async throws -> UploadSessionResponse
    func completeUploadSession(gameId: UUID, sessionId: UUID, token: String) async throws -> UploadSessionResponse
    func cancelUploadSession(gameId: UUID, sessionId: UUID, token: String) async throws
}

extension APIClient: SyncAPIClient {}

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

    private var apiClient: SyncAPIClient?

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

    func configure(apiClient: SyncAPIClient) {
        self.apiClient = apiClient
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
        let mediaSubmissions = actions.filter { $0.type == .mediaSubmission }

        for action in checkIns {
            await processAction(action)
        }

        for action in submissions {
            await processAction(action)
        }

        for action in mediaSubmissions {
            await processAction(action)
        }

        isSyncing = false

        // Refresh progress from server after sync
        await onSyncComplete?()
    }

    private func processAction(_ action: PendingAction) async {
        // Skip if already at max retries
        if action.retryCount >= self.maxRetries {
            // Remove failed action after max retries
            await OfflineQueue.shared.dequeue(action.id)
            if let localPath = action.mediaLocalFilePath {
                try? FileManager.default.removeItem(atPath: localPath)
            }
            Logger(subsystem: "com.prayer.pointfinder", category: "SyncEngine").info(" Removed action \(action.id) after \(self.maxRetries) retries")
            return
        }

        // Exponential backoff if this is a retry
        if action.retryCount > 0 {
            let delay = self.baseBackoffSeconds * pow(2.0, Double(action.retryCount - 1))
            try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
        }

        do {
            switch action.type {
            case .checkIn:
                try await syncCheckIn(action)
            case .submission:
                try await syncSubmission(action)
            case .mediaSubmission:
                try await syncMediaSubmission(action)
            }

            // Success - remove from queue
            await OfflineQueue.shared.dequeue(action.id)
            Logger(subsystem: "com.prayer.pointfinder", category: "SyncEngine").info(" Synced action: \(action.type.rawValue) for base \(action.baseId)")

        } catch {
            if let syncError = error as? SyncError, syncError == .needsReselect {
                self.lastSyncError = syncError.localizedDescription
                return
            }
            // Check if this is a network error (retry) vs a server error (don't retry)
            if isNetworkError(error) {
                await OfflineQueue.shared.incrementRetryCount(action.id)
                self.lastSyncError = "Network error, will retry"
                Logger(subsystem: "com.prayer.pointfinder", category: "SyncEngine").info(" Network error for \(action.id), will retry: \(error.localizedDescription)")
            } else {
                // Server returned an error - remove the action to avoid infinite retries
                await OfflineQueue.shared.dequeue(action.id)
                self.lastSyncError = error.localizedDescription
                Logger(subsystem: "com.prayer.pointfinder", category: "SyncEngine").info(" Server error for \(action.id), removing: \(error.localizedDescription)")
            }
        }
    }

    private func syncCheckIn(_ action: PendingAction) async throws {
        // Get auth token from AppState
        guard let token = getPlayerToken() else {
            throw SyncError.noAuth
        }
        guard let apiClient else {
            throw SyncError.noAPIClient
        }
        _ = try await apiClient.checkIn(gameId: action.gameId, baseId: action.baseId, token: token)
    }

    private func syncSubmission(_ action: PendingAction) async throws {
        guard let token = getPlayerToken() else {
            throw SyncError.noAuth
        }
        guard let apiClient else {
            throw SyncError.noAPIClient
        }
        guard let challengeId = action.challengeId,
              let answer = action.answer else {
            throw SyncError.invalidAction
        }
        let request = PlayerSubmissionRequest(
            baseId: action.baseId,
            challengeId: challengeId,
            answer: answer,
            idempotencyKey: action.id  // Use the action ID as idempotency key
        )
        _ = try await apiClient.submitAnswer(gameId: action.gameId, request: request, token: token)
    }

    private func syncMediaSubmission(_ action: PendingAction) async throws {
        if action.needsReselect {
            throw SyncError.needsReselect
        }
        guard let token = getPlayerToken() else {
            throw SyncError.noAuth
        }
        guard let apiClient else {
            throw SyncError.noAPIClient
        }
        guard let challengeId = action.challengeId,
              let contentType = action.mediaContentType else {
            throw SyncError.invalidAction
        }

        guard let mediaURL = resolveMediaURL(for: action) else {
            await OfflineQueue.shared.markNeedsReselect(
                id: action.id,
                message: "Media source unavailable. Please reselect."
            )
            throw SyncError.needsReselect
        }
        let totalSize = action.mediaSizeBytes ?? fileSize(url: mediaURL)
        guard totalSize > 0 else {
            throw SyncError.invalidAction
        }

        var session = try await ensureUploadSession(
            action: action,
            gameId: action.gameId,
            contentType: contentType,
            totalSize: totalSize,
            apiClient: apiClient,
            token: token
        )

        if session.status == "completed", let completedUrl = session.fileUrl {
            let request = PlayerSubmissionRequest(
                baseId: action.baseId,
                challengeId: challengeId,
                answer: action.answer ?? "",
                fileUrl: completedUrl,
                idempotencyKey: action.id
            )
            _ = try await apiClient.submitAnswer(gameId: action.gameId, request: request, token: token)
            cleanupLocalCopyIfNeeded(action: action)
            return
        }

        let uploadedSet = Set(session.uploadedChunks)
        let fileHandle = try FileHandle(forReadingFrom: mediaURL)
        defer { try? fileHandle.close() }

        for chunkIndex in 0..<session.totalChunks {
            let expectedSize = expectedChunkSize(
                totalSizeBytes: totalSize,
                chunkSizeBytes: session.chunkSizeBytes,
                totalChunks: session.totalChunks,
                chunkIndex: chunkIndex
            )
            let chunkData = try fileHandle.read(upToCount: expectedSize) ?? Data()
            guard chunkData.count == expectedSize else {
                throw SyncError.invalidAction
            }
            if uploadedSet.contains(chunkIndex) {
                continue
            }
            session = try await apiClient.uploadSessionChunk(
                gameId: action.gameId,
                sessionId: session.sessionId,
                chunkIndex: chunkIndex,
                chunkData: chunkData,
                token: token
            )
            await OfflineQueue.shared.updateUploadProgress(
                id: action.id,
                uploadSessionId: session.sessionId,
                uploadedChunkIndex: chunkIndex + 1,
                totalChunks: session.totalChunks,
                lastError: nil
            )
        }

        let completed = try await apiClient.completeUploadSession(
            gameId: action.gameId,
            sessionId: session.sessionId,
            token: token
        )
        guard let fileUrl = completed.fileUrl else {
            throw SyncError.invalidAction
        }
        let request = PlayerSubmissionRequest(
            baseId: action.baseId,
            challengeId: challengeId,
            answer: action.answer ?? "",
            fileUrl: fileUrl,
            idempotencyKey: action.id
        )
        _ = try await apiClient.submitAnswer(gameId: action.gameId, request: request, token: token)
        cleanupLocalCopyIfNeeded(action: action)
    }

    private func ensureUploadSession(
        action: PendingAction,
        gameId: UUID,
        contentType: String,
        totalSize: Int64,
        apiClient: SyncAPIClient,
        token: String
    ) async throws -> UploadSessionResponse {
        if let existingSessionId = action.uploadSessionId {
            if let existing = try? await apiClient.getUploadSession(gameId: gameId, sessionId: existingSessionId, token: token) {
                return existing
            }
        }
        let created = try await apiClient.createUploadSession(
            gameId: gameId,
            request: UploadSessionInitRequest(
                originalFileName: action.mediaFileName,
                contentType: contentType,
                totalSizeBytes: totalSize,
                chunkSizeBytes: DEFAULT_CHUNK_SIZE_BYTES
            ),
            token: token
        )
        await OfflineQueue.shared.updateUploadProgress(
            id: action.id,
            uploadSessionId: created.sessionId,
            uploadedChunkIndex: 0,
            totalChunks: created.totalChunks,
            lastError: nil
        )
        return created
    }

    private func resolveMediaURL(for action: PendingAction) -> URL? {
        if let localPath = action.mediaLocalFilePath {
            let localURL = URL(fileURLWithPath: localPath)
            return FileManager.default.fileExists(atPath: localURL.path) ? localURL : nil
        }
        if let sourcePath = action.mediaSourcePath {
            let sourceURL = URL(fileURLWithPath: sourcePath)
            return FileManager.default.fileExists(atPath: sourceURL.path) ? sourceURL : nil
        }
        return nil
    }

    private func fileSize(url: URL) -> Int64 {
        let attrs = try? FileManager.default.attributesOfItem(atPath: url.path)
        return (attrs?[.size] as? NSNumber)?.int64Value ?? 0
    }

    private func expectedChunkSize(totalSizeBytes: Int64, chunkSizeBytes: Int, totalChunks: Int, chunkIndex: Int) -> Int {
        if chunkIndex < totalChunks - 1 {
            return chunkSizeBytes
        }
        let consumed = Int64(chunkSizeBytes) * Int64(totalChunks - 1)
        return Int(totalSizeBytes - consumed)
    }

    private func cleanupLocalCopyIfNeeded(action: PendingAction) {
        guard let localPath = action.mediaLocalFilePath else { return }
        try? FileManager.default.removeItem(atPath: localPath)
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
        guard nsError.domain == NSURLErrorDomain else { return false }
        let transientNetworkCodes: Set<Int> = [
            NSURLErrorNotConnectedToInternet,
            NSURLErrorNetworkConnectionLost,
            NSURLErrorTimedOut,
            NSURLErrorCannotFindHost,
            NSURLErrorCannotConnectToHost,
            NSURLErrorDNSLookupFailed,
            NSURLErrorInternationalRoamingOff,
            NSURLErrorCallIsActive,
            NSURLErrorDataNotAllowed
        ]
        return transientNetworkCodes.contains(nsError.code)
    }
}

// MARK: - Errors

enum SyncError: LocalizedError {
    case noAuth
    case noAPIClient
    case invalidAction
    case needsReselect

    var errorDescription: String? {
        switch self {
        case .noAuth:
            return "No authentication token available"
        case .noAPIClient:
            return "API client is not configured"
        case .invalidAction:
            return "Invalid action data"
        case .needsReselect:
            return "Media source unavailable, user must reselect"
        }
    }
}

private let DEFAULT_CHUNK_SIZE_BYTES = 8 * 1024 * 1024
