import Foundation
import XCTest
@testable import dbv_nfc_games

@MainActor
final class SyncEngineTests: XCTestCase {

    private var tempFileURL: URL!
    private var offlineQueue: OfflineQueue!
    private var syncEngine: SyncEngine!
    private var mockAPI: MockSyncAPIClient!
    private var isOnline: Bool = true
    private let testToken = "test-player-token"

    override func setUp() {
        super.setUp()
        tempFileURL = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("test_sync_engine_\(UUID().uuidString).json")
        offlineQueue = OfflineQueue(fileURL: tempFileURL)
        isOnline = true
        mockAPI = MockSyncAPIClient()
        syncEngine = SyncEngine(
            offlineQueue: offlineQueue,
            connectivityCheck: { [unowned self] in self.isOnline },
            tokenProvider: { [unowned self] in self.testToken },
            maxRetries: 3,
            baseBackoffSeconds: 0
        )
        syncEngine.configure(apiClient: mockAPI)
    }

    override func tearDown() {
        try? FileManager.default.removeItem(at: tempFileURL)
        syncEngine = nil
        offlineQueue = nil
        mockAPI = nil
        tempFileURL = nil
        super.tearDown()
    }

    // MARK: - syncPendingActions processes check-ins before submissions

    func testSyncProcessesCheckInsBeforeSubmissions() async {
        let gameId = UUID()
        let baseId = UUID()
        let challengeId = UUID()

        // Enqueue a submission first, then a check-in
        _ = await offlineQueue.enqueueSubmission(
            gameId: gameId, baseId: baseId, challengeId: challengeId, answer: "answer"
        )
        await offlineQueue.enqueueCheckIn(gameId: gameId, baseId: baseId)

        await syncEngine.syncPendingActions()

        // Check-in should be processed first regardless of enqueue order
        XCTAssertEqual(mockAPI.callLog.count, 2)
        XCTAssertEqual(mockAPI.callLog[0], "checkIn")
        XCTAssertEqual(mockAPI.callLog[1], "submitAnswer")
    }

    // MARK: - Already syncing guard

    func testAlreadySyncingGuardSkipsWhenInProgress() async {
        // Start a sync that will block
        mockAPI.checkInDelay = 0.2
        let gameId = UUID()
        await offlineQueue.enqueueCheckIn(gameId: gameId, baseId: UUID())

        // Start first sync (will be slow)
        let task = Task { @MainActor in
            await self.syncEngine.syncPendingActions()
        }

        // Give the first sync time to start
        try? await Task.sleep(nanoseconds: 50_000_000) // 50ms

        // Second sync should be skipped because isSyncing is true
        XCTAssertTrue(syncEngine.isSyncing)

        await task.value
        XCTAssertFalse(syncEngine.isSyncing)
    }

    // MARK: - Offline guard

    func testOfflineGuardSkipsWhenNoConnectivity() async {
        isOnline = false
        await offlineQueue.enqueueCheckIn(gameId: UUID(), baseId: UUID())

        await syncEngine.syncPendingActions()

        XCTAssertTrue(mockAPI.callLog.isEmpty, "Should not call API when offline")
        let pending = await offlineQueue.allPending()
        XCTAssertEqual(pending.count, 1, "Action should remain in queue")
    }

    // MARK: - Successful sync dequeues from OfflineQueue

    func testSuccessfulSyncDequeuesAction() async {
        let gameId = UUID()
        let baseId = UUID()
        await offlineQueue.enqueueCheckIn(gameId: gameId, baseId: baseId)

        await syncEngine.syncPendingActions()

        let pending = await offlineQueue.allPending()
        XCTAssertEqual(pending.count, 0)
        XCTAssertEqual(mockAPI.callLog, ["checkIn"])
    }

    // MARK: - Failed sync (network error) increments retry count

    func testNetworkErrorIncrementsRetryCount() async {
        let gameId = UUID()
        let baseId = UUID()
        await offlineQueue.enqueueCheckIn(gameId: gameId, baseId: baseId)

        mockAPI.checkInError = APIError.networkError(URLError(.notConnectedToInternet))

        await syncEngine.syncPendingActions()

        let pending = await offlineQueue.allPending()
        XCTAssertEqual(pending.count, 1, "Action should remain in queue for retry")
        XCTAssertEqual(pending[0].retryCount, 1)
    }

    // MARK: - Media submission sync calls chunked upload flow

    func testMediaSubmissionSyncCallsUploadFlowThenSubmit() async {
        let gameId = UUID()
        let baseId = UUID()
        let challengeId = UUID()

        // Create a small temp file to act as the media
        let mediaURL = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("test_media_\(UUID().uuidString).dat")
        let mediaData = Data(repeating: 0xAB, count: 1024)
        try! mediaData.write(to: mediaURL)
        defer { try? FileManager.default.removeItem(at: mediaURL) }

        _ = await offlineQueue.enqueueMediaSubmission(
            gameId: gameId,
            baseId: baseId,
            challengeId: challengeId,
            answer: "media answer",
            contentType: "image/jpeg",
            sizeBytes: Int64(mediaData.count),
            localFilePath: mediaURL.path,
            sourcePath: nil,
            fileName: "photo.jpg"
        )

        await syncEngine.syncPendingActions()

        // Media submission should: createUploadSession -> uploadSessionChunk -> completeUploadSession -> submitAnswer
        XCTAssertTrue(mockAPI.callLog.contains("createUploadSession"), "Should create upload session")
        XCTAssertTrue(mockAPI.callLog.contains("uploadSessionChunk"), "Should upload chunk")
        XCTAssertTrue(mockAPI.callLog.contains("completeUploadSession"), "Should complete upload session")
        XCTAssertTrue(mockAPI.callLog.contains("submitAnswer"), "Should submit answer after upload")

        // Verify ordering: createUploadSession comes before submitAnswer
        let createIdx = mockAPI.callLog.firstIndex(of: "createUploadSession")!
        let submitIdx = mockAPI.callLog.firstIndex(of: "submitAnswer")!
        XCTAssertTrue(createIdx < submitIdx, "Upload session should be created before submitting answer")

        // Queue should be empty after successful sync
        let pending = await offlineQueue.allPending()
        XCTAssertEqual(pending.count, 0)
    }

    // MARK: - Max retries exceeded marks permanently failed

    func testMaxRetriesExceededMarksPermanentlyFailed() async {
        let gameId = UUID()
        let baseId = UUID()

        // Enqueue and manually set retry count to maxRetries
        var action = PendingAction(type: .checkIn, gameId: gameId, baseId: baseId)
        await offlineQueue.enqueue(action)
        // Increment retry count to maxRetries (3)
        for _ in 0..<3 {
            await offlineQueue.incrementRetryCount(action.id)
        }

        await syncEngine.syncPendingActions()

        let failed = await offlineQueue.failedActions
        XCTAssertEqual(failed.count, 1)
        XCTAssertTrue(failed[0].permanentlyFailed)
        // Should not have called the API since it was marked failed before processing
        XCTAssertTrue(mockAPI.callLog.isEmpty)
    }
}

// MARK: - Mock SyncAPIClient

@MainActor
private final class MockSyncAPIClient: SyncAPIClient {
    var callLog: [String] = []
    var checkInError: Error?
    var submitError: Error?
    var checkInDelay: TimeInterval = 0

    func checkIn(gameId: UUID, baseId: UUID, token: String) async throws -> CheckInResponse {
        if checkInDelay > 0 {
            try? await Task.sleep(nanoseconds: UInt64(checkInDelay * 1_000_000_000))
        }
        callLog.append("checkIn")
        if let error = checkInError { throw error }
        return CheckInResponse(
            checkInId: UUID(),
            baseId: baseId,
            baseName: "Test Base",
            checkedInAt: "2026-01-01T00:00:00Z",
            challenge: nil
        )
    }

    func submitAnswer(gameId: UUID, request: PlayerSubmissionRequest, token: String) async throws -> SubmissionResponse {
        callLog.append("submitAnswer")
        if let error = submitError { throw error }
        return SubmissionResponse(
            id: UUID(),
            teamId: UUID(),
            challengeId: request.challengeId,
            baseId: request.baseId,
            answer: request.answer,
            fileUrl: nil,
            fileUrls: nil,
            status: "pending",
            submittedAt: "2026-01-01T00:00:00Z",
            reviewedBy: nil,
            feedback: nil,
            points: nil,
            completionContent: nil
        )
    }

    func createUploadSession(gameId: UUID, request: UploadSessionInitRequest, token: String) async throws -> UploadSessionResponse {
        callLog.append("createUploadSession")
        return UploadSessionResponse(
            sessionId: UUID(), gameId: gameId, contentType: request.contentType,
            totalSizeBytes: request.totalSizeBytes, chunkSizeBytes: request.chunkSizeBytes ?? 8_000_000,
            totalChunks: 1, uploadedChunks: [], status: "active", fileUrl: nil, expiresAt: "2026-01-02T00:00:00Z"
        )
    }

    func uploadSessionChunk(gameId: UUID, sessionId: UUID, chunkIndex: Int, chunkData: Data, token: String) async throws -> UploadSessionResponse {
        callLog.append("uploadSessionChunk")
        return UploadSessionResponse(
            sessionId: sessionId, gameId: gameId, contentType: "application/octet-stream",
            totalSizeBytes: Int64(chunkData.count), chunkSizeBytes: chunkData.count,
            totalChunks: 1, uploadedChunks: [chunkIndex], status: "active", fileUrl: nil, expiresAt: "2026-01-02T00:00:00Z"
        )
    }

    func getUploadSession(gameId: UUID, sessionId: UUID, token: String) async throws -> UploadSessionResponse {
        callLog.append("getUploadSession")
        return UploadSessionResponse(
            sessionId: sessionId, gameId: gameId, contentType: "application/octet-stream",
            totalSizeBytes: 0, chunkSizeBytes: 8_000_000,
            totalChunks: 0, uploadedChunks: [], status: "active", fileUrl: nil, expiresAt: "2026-01-02T00:00:00Z"
        )
    }

    func completeUploadSession(gameId: UUID, sessionId: UUID, token: String) async throws -> UploadSessionResponse {
        callLog.append("completeUploadSession")
        return UploadSessionResponse(
            sessionId: sessionId, gameId: gameId, contentType: "application/octet-stream",
            totalSizeBytes: 0, chunkSizeBytes: 8_000_000,
            totalChunks: 0, uploadedChunks: [], status: "completed", fileUrl: "/uploads/test.jpg", expiresAt: "2026-01-02T00:00:00Z"
        )
    }

    func cancelUploadSession(gameId: UUID, sessionId: UUID, token: String) async throws {
        callLog.append("cancelUploadSession")
    }
}
