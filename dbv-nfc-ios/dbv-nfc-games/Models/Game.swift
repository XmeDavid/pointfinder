import Foundation

struct Game: Codable, Identifiable {
    let id: UUID
    let name: String
    let description: String
    let status: String

    var isActive: Bool {
        status == "live" || status == "setup"
    }
}

struct Base: Codable, Identifiable {
    let id: UUID
    let gameId: UUID?
    let name: String
    let description: String
    let lat: Double
    let lng: Double
    let nfcLinked: Bool
    let fixedChallengeId: UUID?
}

struct Challenge: Codable, Identifiable {
    let id: UUID
    let title: String
    let description: String
    let content: String
    let answerType: String
    let points: Int
}

struct Assignment: Codable, Identifiable {
    let id: UUID
    let baseId: UUID
    let challengeId: UUID
    let teamId: UUID?
}
