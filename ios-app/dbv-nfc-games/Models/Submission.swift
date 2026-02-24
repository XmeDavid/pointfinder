import Foundation

struct PlayerSubmissionRequest: Codable {
    let baseId: UUID
    let challengeId: UUID
    let answer: String
    let fileUrl: String?
    let idempotencyKey: UUID?

    init(baseId: UUID, challengeId: UUID, answer: String, fileUrl: String? = nil, idempotencyKey: UUID? = nil) {
        self.baseId = baseId
        self.challengeId = challengeId
        self.answer = answer
        self.fileUrl = fileUrl
        self.idempotencyKey = idempotencyKey
    }
}

struct UploadSessionInitRequest: Codable {
    let originalFileName: String?
    let contentType: String
    let totalSizeBytes: Int64
    let chunkSizeBytes: Int?
}

struct UploadSessionResponse: Codable {
    let sessionId: UUID
    let gameId: UUID
    let contentType: String
    let totalSizeBytes: Int64
    let chunkSizeBytes: Int
    let totalChunks: Int
    let uploadedChunks: [Int]
    let status: String
    let fileUrl: String?
    let expiresAt: String
}

struct SubmissionResponse: Codable, Identifiable {
    let id: UUID
    let teamId: UUID
    let challengeId: UUID
    let baseId: UUID
    let answer: String
    let fileUrl: String?
    let status: String
    let submittedAt: String
    let reviewedBy: UUID?
    let feedback: String?
    let points: Int?
    let completionContent: String?
}

struct UpdateOperatorNotificationSettingsRequest: Codable {
    let notifyPendingSubmissions: Bool
    let notifyAllSubmissions: Bool
    let notifyCheckIns: Bool
}

struct OperatorNotificationSettingsResponse: Codable {
    let gameId: UUID
    let userId: UUID
    let notifyPendingSubmissions: Bool
    let notifyAllSubmissions: Bool
    let notifyCheckIns: Bool
}

// MARK: - Player Notifications

struct PlayerNotificationResponse: Codable, Identifiable {
    let id: UUID
    let gameId: UUID
    let message: String
    let targetTeamId: UUID?
    let sentAt: String
    let sentBy: UUID
}

struct UnseenCountResponse: Codable {
    let count: Int
}

// MARK: - Pending Actions (for offline queue)

enum PendingActionType: String, Codable {
    case checkIn = "check_in"
    case submission = "submission"
    case mediaSubmission = "media_submission"
}

struct PendingAction: Codable, Identifiable {
    let id: UUID  // Acts as idempotency key for submissions
    let type: PendingActionType
    let gameId: UUID
    let baseId: UUID
    let challengeId: UUID?
    let answer: String?
    let createdAt: Date
    var retryCount: Int
    var mediaContentType: String?
    var mediaLocalFilePath: String?
    var mediaSourcePath: String?
    var mediaSizeBytes: Int64?
    var mediaFileName: String?
    var uploadSessionId: UUID?
    var uploadChunkIndex: Int?
    var uploadTotalChunks: Int?
    var needsReselect: Bool
    var lastError: String?

    init(type: PendingActionType, gameId: UUID, baseId: UUID, challengeId: UUID? = nil, answer: String? = nil) {
        self.id = UUID()
        self.type = type
        self.gameId = gameId
        self.baseId = baseId
        self.challengeId = challengeId
        self.answer = answer
        self.createdAt = Date()
        self.retryCount = 0
        self.mediaContentType = nil
        self.mediaLocalFilePath = nil
        self.mediaSourcePath = nil
        self.mediaSizeBytes = nil
        self.mediaFileName = nil
        self.uploadSessionId = nil
        self.uploadChunkIndex = nil
        self.uploadTotalChunks = nil
        self.needsReselect = false
        self.lastError = nil
    }
}
