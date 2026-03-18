import Foundation
import XCTest
@testable import dbv_nfc_games

final class OfflineQueueTests: XCTestCase {

    private var queue: OfflineQueue!
    private var tempFileURL: URL!

    override func setUp() {
        super.setUp()
        tempFileURL = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("test_offline_queue_\(UUID().uuidString).json")
        queue = OfflineQueue(fileURL: tempFileURL)
    }

    override func tearDown() {
        try? FileManager.default.removeItem(at: tempFileURL)
        queue = nil
        tempFileURL = nil
        super.tearDown()
    }

    // MARK: - enqueue + allPending

    func testEnqueueAndAllPending() async {
        let gameId = UUID()
        let baseId = UUID()
        let action = PendingAction(type: .checkIn, gameId: gameId, baseId: baseId)

        await queue.enqueue(action)
        let pending = await queue.allPending()

        XCTAssertEqual(pending.count, 1)
        XCTAssertEqual(pending[0].id, action.id)
        XCTAssertEqual(pending[0].gameId, gameId)
        XCTAssertEqual(pending[0].baseId, baseId)
        XCTAssertEqual(pending[0].type, .checkIn)
    }

    // MARK: - dequeue

    func testDequeueRemovesById() async {
        let action1 = PendingAction(type: .checkIn, gameId: UUID(), baseId: UUID())
        let action2 = PendingAction(type: .checkIn, gameId: UUID(), baseId: UUID())

        await queue.enqueue(action1)
        await queue.enqueue(action2)
        await queue.dequeue(action1.id)

        let pending = await queue.allPending()
        XCTAssertEqual(pending.count, 1)
        XCTAssertEqual(pending[0].id, action2.id)
    }

    // MARK: - allPending ordering (FIFO by createdAt)

    func testAllPendingOrderingFIFO() async {
        let action1 = PendingAction(type: .checkIn, gameId: UUID(), baseId: UUID())
        // Small delay to ensure different createdAt timestamps
        try? await Task.sleep(nanoseconds: 10_000_000) // 10ms
        let action2 = PendingAction(type: .checkIn, gameId: UUID(), baseId: UUID())

        await queue.enqueue(action2)
        await queue.enqueue(action1)

        let pending = await queue.allPending()
        XCTAssertEqual(pending.count, 2)
        // action1 was created first, so should come first in FIFO ordering
        XCTAssertEqual(pending[0].id, action1.id)
        XCTAssertEqual(pending[1].id, action2.id)
    }

    // MARK: - pendingForGame

    func testPendingForGameFiltersCorrectly() async {
        let gameA = UUID()
        let gameB = UUID()
        let actionA = PendingAction(type: .checkIn, gameId: gameA, baseId: UUID())
        let actionB = PendingAction(type: .checkIn, gameId: gameB, baseId: UUID())

        await queue.enqueue(actionA)
        await queue.enqueue(actionB)

        let forGameA = await queue.pendingForGame(gameA)
        XCTAssertEqual(forGameA.count, 1)
        XCTAssertEqual(forGameA[0].gameId, gameA)
    }

    // MARK: - hasPendingCheckIn

    func testHasPendingCheckInDetectsExistingCheckIn() async {
        let gameId = UUID()
        let baseId = UUID()
        await queue.enqueueCheckIn(gameId: gameId, baseId: baseId)

        let has = await queue.hasPendingCheckIn(gameId: gameId, baseId: baseId)
        XCTAssertTrue(has)

        let hasOtherBase = await queue.hasPendingCheckIn(gameId: gameId, baseId: UUID())
        XCTAssertFalse(hasOtherBase)
    }

    // MARK: - hasPendingSubmission

    func testHasPendingSubmissionDetectsExisting() async {
        let baseId = UUID()
        let challengeId = UUID()
        _ = await queue.enqueueSubmission(
            gameId: UUID(),
            baseId: baseId,
            challengeId: challengeId,
            answer: "test"
        )

        let has = await queue.hasPendingSubmission(baseId: baseId, challengeId: challengeId)
        XCTAssertTrue(has)

        let hasOther = await queue.hasPendingSubmission(baseId: baseId, challengeId: UUID())
        XCTAssertFalse(hasOther)
    }

    // MARK: - incrementRetryCount

    func testIncrementRetryCount() async {
        let action = PendingAction(type: .checkIn, gameId: UUID(), baseId: UUID())
        await queue.enqueue(action)

        await queue.incrementRetryCount(action.id)
        await queue.incrementRetryCount(action.id)

        let pending = await queue.allPending()
        XCTAssertEqual(pending[0].retryCount, 2)
    }

    // MARK: - markFailed

    func testMarkFailedSetsPermanentlyFailedAndExcludesFromPendingCount() async {
        let action = PendingAction(type: .checkIn, gameId: UUID(), baseId: UUID())
        await queue.enqueue(action)

        await queue.markFailed(action.id, reason: "too many retries")

        let count = await queue.pendingCount
        XCTAssertEqual(count, 0, "Permanently failed actions should not count in pendingCount")

        let failed = await queue.failedActions
        XCTAssertEqual(failed.count, 1)
        XCTAssertTrue(failed[0].permanentlyFailed)
        XCTAssertEqual(failed[0].failureReason, "too many retries")
    }

    // MARK: - clearGame

    func testClearGameRemovesOnlyThatGamesActions() async {
        let gameA = UUID()
        let gameB = UUID()
        await queue.enqueueCheckIn(gameId: gameA, baseId: UUID())
        await queue.enqueueCheckIn(gameId: gameB, baseId: UUID())

        await queue.clearGame(gameA)

        let pending = await queue.allPending()
        XCTAssertEqual(pending.count, 1)
        XCTAssertEqual(pending[0].gameId, gameB)
    }

    // MARK: - enqueueCheckIn

    func testEnqueueCheckInCreatesCorrectActionType() async {
        let gameId = UUID()
        let baseId = UUID()
        await queue.enqueueCheckIn(gameId: gameId, baseId: baseId)

        let pending = await queue.allPending()
        XCTAssertEqual(pending.count, 1)
        XCTAssertEqual(pending[0].type, .checkIn)
        XCTAssertEqual(pending[0].gameId, gameId)
        XCTAssertEqual(pending[0].baseId, baseId)
    }

    // MARK: - enqueueSubmission

    func testEnqueueSubmissionReturnsIdempotencyKey() async {
        let gameId = UUID()
        let baseId = UUID()
        let challengeId = UUID()

        let actionId = await queue.enqueueSubmission(
            gameId: gameId,
            baseId: baseId,
            challengeId: challengeId,
            answer: "my answer"
        )

        let pending = await queue.allPending()
        XCTAssertEqual(pending.count, 1)
        XCTAssertEqual(pending[0].id, actionId)
        XCTAssertEqual(pending[0].type, .submission)
        XCTAssertEqual(pending[0].answer, "my answer")
        XCTAssertEqual(pending[0].challengeId, challengeId)
    }

    // MARK: - enqueueMediaSubmission

    func testEnqueueMediaSubmissionSetsMediaFields() async {
        let gameId = UUID()
        let baseId = UUID()
        let challengeId = UUID()

        let actionId = await queue.enqueueMediaSubmission(
            gameId: gameId,
            baseId: baseId,
            challengeId: challengeId,
            answer: "photo answer",
            contentType: "image/jpeg",
            sizeBytes: 1024,
            localFilePath: "/tmp/photo.jpg",
            sourcePath: "/photos/original.jpg",
            fileName: "photo.jpg"
        )

        let pending = await queue.allPending()
        XCTAssertEqual(pending.count, 1)
        let action = pending[0]
        XCTAssertEqual(action.id, actionId)
        XCTAssertEqual(action.type, .mediaSubmission)
        XCTAssertEqual(action.mediaContentType, "image/jpeg")
        XCTAssertEqual(action.mediaSizeBytes, 1024)
        XCTAssertEqual(action.mediaLocalFilePath, "/tmp/photo.jpg")
        XCTAssertEqual(action.mediaSourcePath, "/photos/original.jpg")
        XCTAssertEqual(action.mediaFileName, "photo.jpg")
        XCTAssertEqual(action.uploadChunkIndex, 0)
        XCTAssertEqual(action.needsReselect, false)
    }

    // MARK: - enqueueMultiMediaSubmission

    func testEnqueueMultiMediaSubmissionSetsLegacyFieldsFromFirstItem() async {
        let items = [
            PendingMediaItem(localFilePath: "/tmp/a.jpg", contentType: "image/jpeg", sizeBytes: 500, fileName: "a.jpg"),
            PendingMediaItem(localFilePath: "/tmp/b.png", contentType: "image/png", sizeBytes: 800, fileName: "b.png"),
        ]

        let actionId = await queue.enqueueMultiMediaSubmission(
            gameId: UUID(),
            baseId: UUID(),
            challengeId: UUID(),
            answer: "multi",
            mediaItems: items
        )

        let pending = await queue.allPending()
        XCTAssertEqual(pending.count, 1)
        let action = pending[0]
        XCTAssertEqual(action.id, actionId)
        XCTAssertEqual(action.type, .mediaSubmission)
        XCTAssertEqual(action.mediaItems?.count, 2)
        // Legacy fields from first item
        XCTAssertEqual(action.mediaContentType, "image/jpeg")
        XCTAssertEqual(action.mediaSizeBytes, 500)
        XCTAssertEqual(action.mediaLocalFilePath, "/tmp/a.jpg")
        XCTAssertEqual(action.mediaFileName, "a.jpg")
    }

    // MARK: - updateUploadProgress

    func testUpdateUploadProgressUpdatesCheckpointFields() async {
        let action = PendingAction(type: .mediaSubmission, gameId: UUID(), baseId: UUID(), challengeId: UUID())
        await queue.enqueue(action)

        let sessionId = UUID()
        await queue.updateUploadProgress(
            id: action.id,
            uploadSessionId: sessionId,
            uploadedChunkIndex: 3,
            totalChunks: 10,
            lastError: nil
        )

        let pending = await queue.allPending()
        XCTAssertEqual(pending[0].uploadSessionId, sessionId)
        XCTAssertEqual(pending[0].uploadChunkIndex, 3)
        XCTAssertEqual(pending[0].uploadTotalChunks, 10)
        XCTAssertNil(pending[0].lastError)
    }

    // MARK: - Disk persistence

    func testDiskPersistenceActionsSurviveReInit() async {
        let gameId = UUID()
        let baseId = UUID()
        await queue.enqueueCheckIn(gameId: gameId, baseId: baseId)

        // Create a new queue from the same file URL
        let queue2 = OfflineQueue(fileURL: tempFileURL)
        let pending = await queue2.allPending()

        XCTAssertEqual(pending.count, 1)
        XCTAssertEqual(pending[0].gameId, gameId)
        XCTAssertEqual(pending[0].baseId, baseId)
        XCTAssertEqual(pending[0].type, .checkIn)
    }
}
