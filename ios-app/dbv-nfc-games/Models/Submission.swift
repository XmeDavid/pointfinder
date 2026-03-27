import Foundation

struct PlayerSubmissionRequest: Codable {
    let baseId: UUID
    let challengeId: UUID
    let answer: String
    let fileUrl: String?
    let fileUrls: [String]?
    let idempotencyKey: UUID?

    init(baseId: UUID, challengeId: UUID, answer: String, fileUrl: String? = nil, fileUrls: [String]? = nil, idempotencyKey: UUID? = nil) {
        self.baseId = baseId
        self.challengeId = challengeId
        self.answer = answer
        self.fileUrl = fileUrl
        self.fileUrls = fileUrls
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
    let fileUrls: [String]?
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
    let count: Int64
}

// MARK: - Pending Media Item

struct PendingMediaItem: Codable {
    var localFilePath: String?
    var contentType: String
    var sizeBytes: Int64
    var fileName: String?
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
    let nfcToken: String?
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
    var mediaItems: [PendingMediaItem]?
    var needsReselect: Bool
    var lastError: String?
    var permanentlyFailed: Bool
    var failureReason: String?

    init(type: PendingActionType, gameId: UUID, baseId: UUID, challengeId: UUID? = nil, answer: String? = nil, nfcToken: String? = nil) {
        self.id = UUID()
        self.type = type
        self.gameId = gameId
        self.baseId = baseId
        self.challengeId = challengeId
        self.answer = answer
        self.nfcToken = nfcToken
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
        self.mediaItems = nil
        self.needsReselect = false
        self.lastError = nil
        self.permanentlyFailed = false
        self.failureReason = nil
    }

    // Backward-compatible decoding for existing JSON on user devices
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(UUID.self, forKey: .id)
        type = try container.decode(PendingActionType.self, forKey: .type)
        gameId = try container.decode(UUID.self, forKey: .gameId)
        baseId = try container.decode(UUID.self, forKey: .baseId)
        challengeId = try container.decodeIfPresent(UUID.self, forKey: .challengeId)
        answer = try container.decodeIfPresent(String.self, forKey: .answer)
        nfcToken = try container.decodeIfPresent(String.self, forKey: .nfcToken)
        createdAt = try container.decode(Date.self, forKey: .createdAt)
        retryCount = try container.decode(Int.self, forKey: .retryCount)
        mediaContentType = try container.decodeIfPresent(String.self, forKey: .mediaContentType)
        mediaLocalFilePath = try container.decodeIfPresent(String.self, forKey: .mediaLocalFilePath)
        mediaSourcePath = try container.decodeIfPresent(String.self, forKey: .mediaSourcePath)
        mediaSizeBytes = try container.decodeIfPresent(Int64.self, forKey: .mediaSizeBytes)
        mediaFileName = try container.decodeIfPresent(String.self, forKey: .mediaFileName)
        uploadSessionId = try container.decodeIfPresent(UUID.self, forKey: .uploadSessionId)
        uploadChunkIndex = try container.decodeIfPresent(Int.self, forKey: .uploadChunkIndex)
        uploadTotalChunks = try container.decodeIfPresent(Int.self, forKey: .uploadTotalChunks)
        mediaItems = try container.decodeIfPresent([PendingMediaItem].self, forKey: .mediaItems)
        needsReselect = try container.decodeIfPresent(Bool.self, forKey: .needsReselect) ?? false
        lastError = try container.decodeIfPresent(String.self, forKey: .lastError)
        permanentlyFailed = try container.decodeIfPresent(Bool.self, forKey: .permanentlyFailed) ?? false
        failureReason = try container.decodeIfPresent(String.self, forKey: .failureReason)
    }
}
