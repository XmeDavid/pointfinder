import Foundation

struct PlayerSubmissionRequest: Codable {
    let baseId: UUID
    let challengeId: UUID
    let answer: String
}

struct SubmissionResponse: Codable, Identifiable {
    let id: UUID
    let teamId: UUID
    let challengeId: UUID
    let baseId: UUID
    let answer: String
    let status: String
    let submittedAt: String
    let reviewedBy: UUID?
    let feedback: String?
}
