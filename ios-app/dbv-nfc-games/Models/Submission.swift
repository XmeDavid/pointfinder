import Foundation

struct PlayerSubmissionRequest: Codable {
    let baseId: UUID
    let challengeId: UUID
    let answer: String
    let idempotencyKey: UUID?

    init(baseId: UUID, challengeId: UUID, answer: String, idempotencyKey: UUID? = nil) {
        self.baseId = baseId
        self.challengeId = challengeId
        self.answer = answer
        self.idempotencyKey = idempotencyKey
    }
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

    init(type: PendingActionType, gameId: UUID, baseId: UUID, challengeId: UUID? = nil, answer: String? = nil) {
        self.id = UUID()
        self.type = type
        self.gameId = gameId
        self.baseId = baseId
        self.challengeId = challengeId
        self.answer = answer
        self.createdAt = Date()
        self.retryCount = 0
    }
}
