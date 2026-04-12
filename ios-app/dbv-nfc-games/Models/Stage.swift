import Foundation

struct Stage: Codable, Identifiable, Hashable {
    let id: UUID
    let gameId: UUID?
    let name: String
    let description: String
    let orderIndex: Int
    let transitionType: String  // "manual", "scheduled", "trigger"
    let scheduledAt: String?
    let triggerBaseId: UUID?
    let isActive: Bool
    let baseIds: [UUID]?
    let createdAt: String?
    let updatedAt: String?
}

struct CreateStageRequest: Encodable {
    let name: String
    let description: String?
    let transitionType: String
    let scheduledAt: String?
    let triggerBaseId: UUID?
}

struct UpdateStageRequest: Encodable {
    let name: String
    let description: String?
    let transitionType: String
    let scheduledAt: String?
    let triggerBaseId: UUID?
}

struct ReorderStagesRequest: Encodable {
    let ids: [UUID]
}
