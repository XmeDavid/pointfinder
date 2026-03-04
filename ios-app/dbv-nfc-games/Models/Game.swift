import Foundation

struct Game: Codable, Identifiable {
    let id: UUID
    let name: String
    let description: String
    let status: String
    let tileSource: String

    var isActive: Bool {
        status == "live"
    }

    init(id: UUID, name: String, description: String, status: String, tileSource: String = "osm") {
        self.id = id
        self.name = name
        self.description = description
        self.status = status
        self.tileSource = tileSource
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(UUID.self, forKey: .id)
        name = try container.decode(String.self, forKey: .name)
        description = try container.decode(String.self, forKey: .description)
        status = try container.decode(String.self, forKey: .status)
        tileSource = try container.decodeIfPresent(String.self, forKey: .tileSource) ?? "osm"
    }
}

struct Base: Codable, Identifiable {
    let id: UUID
    let gameId: UUID?
    let name: String
    let description: String
    let lat: Double
    let lng: Double
    var nfcLinked: Bool
    let requirePresenceToSubmit: Bool
    let hidden: Bool
    let fixedChallengeId: UUID?

    init(
        id: UUID,
        gameId: UUID? = nil,
        name: String,
        description: String,
        lat: Double,
        lng: Double,
        nfcLinked: Bool,
        requirePresenceToSubmit: Bool,
        hidden: Bool = false,
        fixedChallengeId: UUID? = nil
    ) {
        self.id = id
        self.gameId = gameId
        self.name = name
        self.description = description
        self.lat = lat
        self.lng = lng
        self.nfcLinked = nfcLinked
        self.requirePresenceToSubmit = requirePresenceToSubmit
        self.hidden = hidden
        self.fixedChallengeId = fixedChallengeId
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(UUID.self, forKey: .id)
        gameId = try container.decodeIfPresent(UUID.self, forKey: .gameId)
        name = try container.decode(String.self, forKey: .name)
        description = try container.decode(String.self, forKey: .description)
        lat = try container.decode(Double.self, forKey: .lat)
        lng = try container.decode(Double.self, forKey: .lng)
        nfcLinked = try container.decode(Bool.self, forKey: .nfcLinked)
        requirePresenceToSubmit = try container.decode(Bool.self, forKey: .requirePresenceToSubmit)
        hidden = try container.decodeIfPresent(Bool.self, forKey: .hidden) ?? false
        fixedChallengeId = try container.decodeIfPresent(UUID.self, forKey: .fixedChallengeId)
    }
}

struct Challenge: Codable, Identifiable {
    let id: UUID
    let gameId: UUID?
    let title: String
    let description: String
    let content: String
    let completionContent: String?
    let answerType: String
    let points: Int
    let unlocksBaseId: UUID?

    init(
        id: UUID,
        gameId: UUID? = nil,
        title: String,
        description: String,
        content: String,
        completionContent: String? = nil,
        answerType: String,
        points: Int,
        unlocksBaseId: UUID? = nil
    ) {
        self.id = id
        self.gameId = gameId
        self.title = title
        self.description = description
        self.content = content
        self.completionContent = completionContent
        self.answerType = answerType
        self.points = points
        self.unlocksBaseId = unlocksBaseId
    }
}

struct Assignment: Codable, Identifiable {
    let id: UUID
    let gameId: UUID?
    let baseId: UUID
    let challengeId: UUID
    let teamId: UUID?
    
    init(id: UUID, gameId: UUID? = nil, baseId: UUID, challengeId: UUID, teamId: UUID? = nil) {
        self.id = id
        self.gameId = gameId
        self.baseId = baseId
        self.challengeId = challengeId
        self.teamId = teamId
    }
}

/// Complete game data response for offline caching
struct GameDataResponse: Codable {
    let gameStatus: String?
    let bases: [Base]
    let challenges: [Challenge]
    let assignments: [Assignment]
    let progress: [BaseProgress]
}
