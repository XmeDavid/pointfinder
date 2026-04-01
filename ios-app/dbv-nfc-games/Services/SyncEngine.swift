import Foundation
import os

protocol SyncAPIClient: AnyObject {
    func checkIn(gameId: UUID, baseId: UUID, nfcToken: String?, token: String) async throws -> CheckInResponse
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

    let maxRetries: Int
    private let baseBackoffSeconds: TimeInterval

    private var apiClient: SyncAPIClient?
    let offlineQueue: OfflineQueue
    private let connectivityCheck: () -> Bool
    private let tokenProvider: () -> String?

    /// Callback to refresh progress after sync (injected by AppState)
    var onSyncComplete: (() async -> Void)?

    /// Callback to get current game state (injected by AppState)
    /// Returns true if game is still active, false if game has ended
    var gameStateProvider: (() -> Bool)? = nil

    private init() {
        self.maxRetries = 5
        self.baseBackoffSeconds = 2
        self.offlineQueue = .shared
        self.connectivityCheck = { NetworkMonitor.shared.isOnline }
        self.tokenProvider = { KeychainService.load(key: AppConfiguration.playerTokenKey) }
        // Listen for network reconnection events
        NetworkMonitor.shared.onReconnect = { [weak self] in
            Task { @MainActor in
                await self?.syncPendingActions()
            }
        }
    }

    /// Testable initializer with injectable dependencies.
    init(
        offlineQueue: OfflineQueue,
        connectivityCheck: @escaping () -> Bool,
        tokenProvider: @escaping () -> String?,
        maxRetries: Int = 5,
        baseBackoffSeconds: TimeInterval = 0
    ) {
        self.offlineQueue = offlineQueue
        self.connectivityCheck = connectivityCheck
        self.tokenProvider = tokenProvider
        self.maxRetries = maxRetries
        self.baseBackoffSeconds = baseBackoffSeconds
    }

    func configure(apiClient: SyncAPIClient) {
        self.apiClient = apiClient
    }

    /// Number of pending actions in the queue
    var pendingCount: Int {
        get async {
            await offlineQueue.pendingCount
        }
    }

    /// Manually trigger a sync (can be called from UI)
    func syncPendingActions() async {
        guard !isSyncing else { return }
        guard connectivityCheck() else { return }

        // Check if game is still active before syncing
        let gameIsActive = gameStateProvider?() ?? true
        if !gameIsActive {
            lastSyncError = LocaleManager.shared.t("sync.gameEnded", "Game has ended. Pending actions cannot be synced.")
            return
        }

        isSyncing = true
        lastSyncError = nil
        defer { isSyncing = false }

        let actions = await offlineQueue.allPending()

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

        // Refresh progress from server after sync
        await onSyncComplete?()
    }

    private func processAction(_ action: PendingAction) async {
        // Skip permanently failed actions
        guard !action.permanentlyFailed else { return }

        // Mark as permanently failed if at max retries
        if action.retryCount >= self.maxRetries {
            await offlineQueue.markFailed(action.id, reason: LocaleManager.shared.t("sync.failedAfterRetries", "\(self.maxRetries)"))
            Logger(subsystem: "com.prayer.pointfinder", category: "SyncEngine").info(" Marked action \(action.id) as permanently failed after \(self.maxRetries) retries")
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
            await offlineQueue.dequeue(action.id)
            Logger(subsystem: "com.prayer.pointfinder", category: "SyncEngine").info(" Synced action: \(action.type.rawValue) for base \(action.baseId)")

        } catch {
            if let syncError = error as? SyncError, syncError == .needsReselect {
                self.lastSyncError = syncError.localizedDescription
                return
            }
            // Check if this is a network error (retry) vs a server error (don't retry)
            if NetworkErrorHelper.isNetworkError(error) {
                await offlineQueue.incrementRetryCount(action.id)
                self.lastSyncError = LocaleManager.shared.t("sync.networkRetry")
                Logger(subsystem: "com.prayer.pointfinder", category: "SyncEngine").info(" Network error for \(action.id), will retry: \(error.localizedDescription)")
            } else {
                // Server returned an error - remove the action to avoid infinite retries
                await offlineQueue.dequeue(action.id)
                self.lastSyncError = error.localizedDescription
                Logger(subsystem: "com.prayer.pointfinder", category: "SyncEngine").info(" Server error for \(action.id), removing: \(error.localizedDescription)")
            }
        }
    }

    private func syncCheckIn(_ action: PendingAction) async throws {
        // Get auth token from AppState
        guard let token = tokenProvider() else {
            throw SyncError.noAuth
        }
        guard let apiClient else {
            throw SyncError.noAPIClient
        }
        _ = try await apiClient.checkIn(gameId: action.gameId, baseId: action.baseId, nfcToken: action.nfcToken, token: token)
    }

    private func syncSubmission(_ action: PendingAction) async throws {
        guard let token = tokenProvider() else {
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
        guard let token = tokenProvider() else {
            throw SyncError.noAuth
        }
        guard let apiClient else {
            throw SyncError.noAPIClient
        }
        guard let challengeId = action.challengeId else {
            throw SyncError.invalidAction
        }

        // Multi-media path: upload each media item and collect URLs
        if let mediaItems = action.mediaItems, !mediaItems.isEmpty {
            try await syncMultiMediaSubmission(action: action, mediaItems: mediaItems, challengeId: challengeId, apiClient: apiClient, token: token)
            return
        }

        // Single-media path (legacy)
        guard let contentType = action.mediaContentType else {
            throw SyncError.invalidAction
        }

        guard let mediaURL = resolveMediaURL(for: action) else {
            await offlineQueue.markNeedsReselect(
                id: action.id,
                message: "Media source unavailable. Please reselect."
            )
            throw SyncError.needsReselect
        }
        let totalSize = action.mediaSizeBytes ?? fileSize(url: mediaURL)
        guard totalSize > 0 else {
            throw SyncError.invalidAction
        }

        let fileUrl = try await uploadSingleFile(
            action: action,
            gameId: action.gameId,
            mediaURL: mediaURL,
            contentType: contentType,
            totalSize: totalSize,
            apiClient: apiClient,
            token: token
        )

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

    /// Upload multiple media items and submit with fileUrls array.
    private func syncMultiMediaSubmission(
        action: PendingAction,
        mediaItems: [PendingMediaItem],
        challengeId: UUID,
        apiClient: SyncAPIClient,
        token: String
    ) async throws {
        var fileUrls: [String] = []

        for item in mediaItems {
            guard let localPath = item.localFilePath else {
                throw SyncError.invalidAction
            }
            let mediaURL = URL(fileURLWithPath: localPath)
            guard FileManager.default.fileExists(atPath: mediaURL.path) else {
                await offlineQueue.markNeedsReselect(
                    id: action.id,
                    message: LocaleManager.shared.t("sync.mediaUnavailable")
                )
                throw SyncError.needsReselect
            }

            let totalSize = item.sizeBytes > 0 ? item.sizeBytes : fileSize(url: mediaURL)
            guard totalSize > 0 else { continue }

            let url = try await uploadSingleFileWithoutAction(
                gameId: action.gameId,
                mediaURL: mediaURL,
                contentType: item.contentType,
                totalSize: totalSize,
                fileName: item.fileName,
                apiClient: apiClient,
                token: token
            )
            fileUrls.append(url)
        }

        guard !fileUrls.isEmpty else {
            throw SyncError.invalidAction
        }

        let request = PlayerSubmissionRequest(
            baseId: action.baseId,
            challengeId: challengeId,
            answer: action.answer ?? "",
            fileUrls: fileUrls,
            idempotencyKey: action.id
        )
        _ = try await apiClient.submitAnswer(gameId: action.gameId, request: request, token: token)

        // Clean up all local media copies
        for item in mediaItems {
            if let localPath = item.localFilePath {
                try? FileManager.default.removeItem(atPath: localPath)
            }
        }
    }

    /// Upload a single file using chunked upload, tracking progress on the PendingAction.
    private func uploadSingleFile(
        action: PendingAction,
        gameId: UUID,
        mediaURL: URL,
        contentType: String,
        totalSize: Int64,
        apiClient: SyncAPIClient,
        token: String
    ) async throws -> String {
        var session = try await ensureUploadSession(
            action: action,
            gameId: gameId,
            contentType: contentType,
            totalSize: totalSize,
            apiClient: apiClient,
            token: token
        )

        if session.status == "completed", let completedUrl = session.fileUrl {
            return completedUrl
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

            if uploadedSet.contains(chunkIndex) { continue }
            // Seek to the correct position for this chunk before reading
            try fileHandle.seek(toOffset: UInt64(chunkIndex) * UInt64(session.chunkSizeBytes))
            let chunkData = try fileHandle.read(upToCount: expectedSize) ?? Data()
            guard chunkData.count == expectedSize else {
                throw SyncError.invalidAction
            }
            session = try await apiClient.uploadSessionChunk(
                gameId: gameId,
                sessionId: session.sessionId,
                chunkIndex: chunkIndex,
                chunkData: chunkData,
                token: token
            )
            await offlineQueue.updateUploadProgress(
                id: action.id,
                uploadSessionId: session.sessionId,
                uploadedChunkIndex: chunkIndex + 1,
                totalChunks: session.totalChunks,
                lastError: nil
            )
        }

        let completed = try await apiClient.completeUploadSession(
            gameId: gameId,
            sessionId: session.sessionId,
            token: token
        )
        guard let fileUrl = completed.fileUrl else {
            throw SyncError.invalidAction
        }
        return fileUrl
    }

    /// Upload a single file using chunked upload without PendingAction progress tracking.
    /// Used for individual files in a multi-media submission.
    private func uploadSingleFileWithoutAction(
        gameId: UUID,
        mediaURL: URL,
        contentType: String,
        totalSize: Int64,
        fileName: String?,
        apiClient: SyncAPIClient,
        token: String
    ) async throws -> String {
        var session = try await apiClient.createUploadSession(
            gameId: gameId,
            request: UploadSessionInitRequest(
                originalFileName: fileName,
                contentType: contentType,
                totalSizeBytes: totalSize,
                chunkSizeBytes: defaultChunkSizeBytes
            ),
            token: token
        )

        if session.status == "completed", let completedUrl = session.fileUrl {
            return completedUrl
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

            if uploadedSet.contains(chunkIndex) { continue }
            // Seek to the correct position for this chunk before reading
            try fileHandle.seek(toOffset: UInt64(chunkIndex) * UInt64(session.chunkSizeBytes))
            let chunkData = try fileHandle.read(upToCount: expectedSize) ?? Data()
            guard chunkData.count == expectedSize else {
                throw SyncError.invalidAction
            }
            session = try await apiClient.uploadSessionChunk(
                gameId: gameId,
                sessionId: session.sessionId,
                chunkIndex: chunkIndex,
                chunkData: chunkData,
                token: token
            )
        }

        let completed = try await apiClient.completeUploadSession(
            gameId: gameId,
            sessionId: session.sessionId,
            token: token
        )
        guard let fileUrl = completed.fileUrl else {
            throw SyncError.invalidAction
        }
        return fileUrl
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
                chunkSizeBytes: defaultChunkSizeBytes
            ),
            token: token
        )
        await offlineQueue.updateUploadProgress(
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
            return Translations.string("sync.errorNoAuth")
        case .noAPIClient:
            return Translations.string("sync.errorNoClient")
        case .invalidAction:
            return Translations.string("sync.errorInvalidAction")
        case .needsReselect:
            return Translations.string("sync.mediaUnavailable")
        }
    }
}

private let defaultChunkSizeBytes = 8 * 1024 * 1024
