import Foundation

// MARK: - Player Auth

struct PlayerJoinRequest: Codable {
    let joinCode: String
    let displayName: String
    let deviceId: String
}

struct PlayerAuthResponse: Codable {
    let token: String
    let player: PlayerInfo
    let team: TeamInfo
    let game: GameInfo

    struct PlayerInfo: Codable {
        let id: UUID
        let displayName: String
        let deviceId: String
    }

    struct TeamInfo: Codable {
        let id: UUID
        let name: String
        let color: String
    }

    struct GameInfo: Codable {
        let id: UUID
        let name: String
        let description: String
        let status: String
    }
}

// MARK: - Operator Auth

struct OperatorLoginRequest: Codable {
    let email: String
    let password: String
}

struct OperatorAuthResponse: Codable {
    let accessToken: String
    let refreshToken: String
    let user: UserResponse
}

struct UserResponse: Codable {
    let id: UUID
    let name: String
    let email: String
    let role: String
}

// MARK: - Auth State

enum AuthType {
    case player(token: String, playerId: UUID, teamId: UUID, gameId: UUID)
    case userOperator(accessToken: String, refreshToken: String, userId: UUID)
    case none
}
