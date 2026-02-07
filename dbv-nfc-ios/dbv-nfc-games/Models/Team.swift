import Foundation

struct Team: Codable, Identifiable {
    let id: UUID
    let name: String
    let color: String
}

struct Player: Codable, Identifiable {
    let id: UUID
    let displayName: String
    let deviceId: String
}
