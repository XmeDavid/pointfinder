import Foundation

struct Team: Codable, Identifiable {
    let id: UUID
    let gameId: UUID?
    let name: String
    let joinCode: String?
    let color: String
    
    init(id: UUID, gameId: UUID? = nil, name: String, joinCode: String? = nil, color: String) {
        self.id = id
        self.gameId = gameId
        self.name = name
        self.joinCode = joinCode
        self.color = color
    }
}

struct Player: Codable, Identifiable {
    let id: UUID
    let displayName: String
    let deviceId: String
}
