import Foundation

// MARK: - Snapshot DTOs
//
// iOS-side mirror of `PlayerSnapshotResponse` / `OperatorSnapshotResponse` as
// defined in backend/src/main/java/com/prayer/pointfinder/dto/response.
//
// The snapshot endpoint (`GET /api/games/{gameId}/snapshot`) is the canonical
// recovery call for any client that suspects its local cache is stale after a
// missed event, reconnect, foreground, or network return. See
// `docs/realtime-and-mobile.md` §7 "State Snapshot Contract" for the full
// product rationale.
//
// IMPORTANT: `PlayerSnapshotResponse` is structurally score-free — it has NO
// `score`, `points`, `leaderboard`, or `rank` fields at any nesting depth.
// Players in PointFinder do not see scores anywhere in the player app, and
// the backend locks this against drift with a recursive test. Do not add
// any scoring field here.

// MARK: - Player Snapshot

struct PlayerSnapshotResponse: Codable {
    let stateVersion: Int64
    let serverTime: String
    let game: GameInfo
    let team: TeamInfo
    let progress: [BaseProgress]
    let submissions: [PlayerSubmissionSummary]?
    let uploadSessions: [UploadSessionResponse]?

    struct GameInfo: Codable {
        let id: UUID
        let name: String
        let description: String?
        /// Canonical game status: `setup`, `live`, or `ended`. The backend
        /// serialises this as an uppercase enum name (`SETUP`/`LIVE`/`ENDED`)
        /// via `Game.Status.name()`, so we lowercase on decode for parity
        /// with the rest of the iOS app which uses lowercase.
        let status: String
        let unlockTrigger: String?
        let tileSource: String?
        let startDate: String?
        let endDate: String?

        private enum CodingKeys: String, CodingKey {
            case id, name, description, status, unlockTrigger, tileSource, startDate, endDate
        }

        init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            id = try container.decode(UUID.self, forKey: .id)
            name = try container.decode(String.self, forKey: .name)
            description = try container.decodeIfPresent(String.self, forKey: .description)
            let rawStatus = try container.decode(String.self, forKey: .status)
            status = rawStatus.lowercased()
            unlockTrigger = try container.decodeIfPresent(String.self, forKey: .unlockTrigger)
            tileSource = try container.decodeIfPresent(String.self, forKey: .tileSource)
            startDate = try container.decodeIfPresent(String.self, forKey: .startDate)
            endDate = try container.decodeIfPresent(String.self, forKey: .endDate)
        }
    }

    struct TeamInfo: Codable {
        let id: UUID
        let name: String
        let color: String?
        let memberCount: Int?
        // NO score field. Players do not see scores.
    }

    /// Player-facing submission summary. No points. Status is one of
    /// `pending`, `approved`, `rejected`, `correct`, `incorrect`.
    struct PlayerSubmissionSummary: Codable {
        let id: UUID
        let baseId: UUID?
        let challengeId: UUID?
        let status: String?
        let submittedAt: String?
        let fileUrl: String?
        let fileUrls: [String]?
    }
}

// MARK: - Operator Snapshot

struct OperatorSnapshotResponse: Codable {
    let stateVersion: Int64
    let serverTime: String
    let game: GameInfo
    let teams: [TeamInfo]
    let leaderboard: [LeaderboardEntry]
    let pendingReviews: Int
    let activeUploads: Int
    let needsAttention: Int

    struct GameInfo: Codable {
        let id: UUID
        let name: String
        let description: String?
        /// Lowercased game status (`setup`/`live`/`ended`) — backend emits
        /// uppercase enum names.
        let status: String
        let unlockTrigger: String?
        let tileSource: String?
        let startDate: String?
        let endDate: String?
        let uniformAssignment: Bool?
        let broadcastEnabled: Bool?
        let broadcastCode: String?

        private enum CodingKeys: String, CodingKey {
            case id, name, description, status, unlockTrigger, tileSource
            case startDate, endDate, uniformAssignment, broadcastEnabled, broadcastCode
        }

        init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            id = try container.decode(UUID.self, forKey: .id)
            name = try container.decode(String.self, forKey: .name)
            description = try container.decodeIfPresent(String.self, forKey: .description)
            let rawStatus = try container.decode(String.self, forKey: .status)
            status = rawStatus.lowercased()
            unlockTrigger = try container.decodeIfPresent(String.self, forKey: .unlockTrigger)
            tileSource = try container.decodeIfPresent(String.self, forKey: .tileSource)
            startDate = try container.decodeIfPresent(String.self, forKey: .startDate)
            endDate = try container.decodeIfPresent(String.self, forKey: .endDate)
            uniformAssignment = try container.decodeIfPresent(Bool.self, forKey: .uniformAssignment)
            broadcastEnabled = try container.decodeIfPresent(Bool.self, forKey: .broadcastEnabled)
            broadcastCode = try container.decodeIfPresent(String.self, forKey: .broadcastCode)
        }
    }

    struct TeamInfo: Codable {
        let id: UUID
        let name: String
        let color: String?
        let score: Int64
        let memberCount: Int?
    }
}

extension Notification.Name {
    /// Posted after a successful `AppState.refreshFromSnapshot()` call so any
    /// screen that holds its own local state (e.g. `OperatorGameView`) can
    /// reconcile without having to observe `AppState` directly.
    static let snapshotRefreshed = Notification.Name("snapshotRefreshed")
}
