import Foundation

// MARK: - Game Requests
struct CreateGameRequest: Encodable {
    let name: String
    let description: String
}

struct UpdateGameRequest: Encodable {
    let name: String
    let description: String
    let startDate: String?
    let endDate: String?
    let uniformAssignment: Bool
    let broadcastEnabled: Bool
    let tileSource: String?
}

struct UpdateGameStatusRequest: Encodable {
    let status: String
}

// MARK: - Base Requests
struct CreateBaseRequest: Encodable {
    let name: String
    let description: String
    let lat: Double
    let lng: Double
    let fixedChallengeId: UUID?
    let hidden: Bool
}

struct UpdateBaseRequest: Encodable {
    let name: String
    let description: String
    let lat: Double
    let lng: Double
    let fixedChallengeId: UUID?
    let hidden: Bool
}

// MARK: - Challenge Requests
struct CreateChallengeRequest: Encodable {
    let title: String
    let description: String
    let content: String
    let completionContent: String
    let answerType: String
    let autoValidate: Bool
    let correctAnswer: [String]
    let points: Int
    let locationBound: Bool
    let fixedBaseId: UUID?
    let unlocksBaseId: UUID?
    let requirePresenceToSubmit: Bool
}

struct UpdateChallengeRequest: Encodable {
    let title: String
    let description: String
    let content: String
    let completionContent: String
    let answerType: String
    let autoValidate: Bool
    let correctAnswer: [String]
    let points: Int
    let locationBound: Bool
    let fixedBaseId: UUID?
    let unlocksBaseId: UUID?
    let requirePresenceToSubmit: Bool
}

// MARK: - Team Requests
struct CreateTeamRequest: Encodable {
    let name: String
}

struct UpdateTeamRequest: Encodable {
    let name: String
    let color: String?
}

// MARK: - Team Variables
struct TeamVariable: Codable, Equatable {
    let key: String
    let teamValues: [String: String]
}

struct TeamVariablesRequest: Codable {
    let variables: [TeamVariable]
}

struct TeamVariablesResponse: Codable {
    let variables: [TeamVariable]
}

struct VariableCompletenessResponse: Codable {
    let complete: Bool
    let errors: [String]
}

// MARK: - Notifications
struct OperatorNotificationResponse: Codable, Identifiable {
    let id: UUID
    let gameId: UUID
    let message: String
    let targetTeamId: UUID?
    let sentAt: String
    let sentBy: UUID
}

struct SendNotificationRequest: Encodable {
    let message: String
    let targetTeamId: UUID?
}

// MARK: - Players
struct PlayerResponse: Codable, Identifiable {
    let id: UUID
    let teamId: UUID
    let deviceId: String
    let displayName: String
}

// MARK: - Operators & Invites
struct OperatorUserResponse: Codable, Identifiable {
    let id: UUID
    let email: String
    let name: String
    let role: String
}

struct InviteRequest: Encodable {
    let email: String
    let gameId: UUID?
}

struct InviteResponse: Codable, Identifiable {
    let id: UUID
    let gameId: UUID?
    let gameName: String?
    let email: String
    let status: String
    let invitedBy: UUID
    let inviterName: String
    let createdAt: String
}

// MARK: - Monitoring
struct LeaderboardEntry: Codable, Identifiable {
    let teamId: UUID
    let teamName: String
    let color: String
    let points: Int
    let completedChallenges: Int

    var id: UUID { teamId }
}

struct ActivityEvent: Codable, Identifiable {
    let id: UUID
    let gameId: UUID
    let type: String
    let teamId: UUID?
    let baseId: UUID?
    let challengeId: UUID?
    let message: String
    let timestamp: String
}

// MARK: - Export/Import
struct GameExportDto: Codable {
    let exportVersion: String
    let exportedAt: String
    var game: GameExportGame
    let bases: [GameExportBase]
    let challenges: [GameExportChallenge]
    let assignments: [GameExportAssignment]
    let teams: [GameExportTeam]
}

struct GameExportGame: Codable {
    var name: String
    let description: String
    let startDate: String?
    let endDate: String?
    let uniformAssignment: Bool?
    let tileSource: String?
}

struct GameExportBase: Codable {
    let tempId: String
    let name: String
    let description: String
    let lat: Double
    let lng: Double
    let hidden: Bool
    let fixedChallengeTempId: String?
}

struct GameExportChallenge: Codable {
    let tempId: String
    let title: String
    let description: String
    let content: String
    let completionContent: String?
    let answerType: String
    let points: Int
    let fixedBaseTempId: String?
    let unlocksBaseTempId: String?
}

struct GameExportAssignment: Codable {
    let baseTempId: String
    let challengeTempId: String
    let teamTempId: String?
}

struct GameExportTeam: Codable {
    let tempId: String
    let name: String
    let color: String
}

struct ImportGameRequest: Encodable {
    let gameData: GameExportDto
}
