import Foundation

struct Game: Codable, Identifiable {
    let id: UUID
    let name: String
    let description: String
    let status: String
    let tileSource: String
    let startDate: String?
    let endDate: String?
    let createdBy: UUID?
    let operatorIds: [UUID]?
    let uniformAssignment: Bool
    let broadcastEnabled: Bool
    let broadcastCode: String?

    var isActive: Bool {
        status == "live"
    }

    init(
        id: UUID,
        name: String,
        description: String,
        status: String,
        tileSource: String = "osm-classic",
        startDate: String? = nil,
        endDate: String? = nil,
        createdBy: UUID? = nil,
        operatorIds: [UUID]? = nil,
        uniformAssignment: Bool = false,
        broadcastEnabled: Bool = false,
        broadcastCode: String? = nil
    ) {
        self.id = id
        self.name = name
        self.description = description
        self.status = status
        self.tileSource = tileSource
        self.startDate = startDate
        self.endDate = endDate
        self.createdBy = createdBy
        self.operatorIds = operatorIds
        self.uniformAssignment = uniformAssignment
        self.broadcastEnabled = broadcastEnabled
        self.broadcastCode = broadcastCode
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(UUID.self, forKey: .id)
        name = try container.decode(String.self, forKey: .name)
        description = try container.decode(String.self, forKey: .description)
        status = try container.decode(String.self, forKey: .status)
        tileSource = try container.decodeIfPresent(String.self, forKey: .tileSource) ?? "osm-classic"
        startDate = try container.decodeIfPresent(String.self, forKey: .startDate)
        endDate = try container.decodeIfPresent(String.self, forKey: .endDate)
        createdBy = try container.decodeIfPresent(UUID.self, forKey: .createdBy)
        operatorIds = try container.decodeIfPresent([UUID].self, forKey: .operatorIds)
        uniformAssignment = try container.decodeIfPresent(Bool.self, forKey: .uniformAssignment) ?? false
        broadcastEnabled = try container.decodeIfPresent(Bool.self, forKey: .broadcastEnabled) ?? false
        broadcastCode = try container.decodeIfPresent(String.self, forKey: .broadcastCode)
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
    let hidden: Bool
    let fixedChallengeId: UUID?
    let nfcToken: String?

    init(
        id: UUID,
        gameId: UUID? = nil,
        name: String,
        description: String,
        lat: Double,
        lng: Double,
        nfcLinked: Bool,
        hidden: Bool = false,
        fixedChallengeId: UUID? = nil,
        nfcToken: String? = nil
    ) {
        self.id = id
        self.gameId = gameId
        self.name = name
        self.description = description
        self.lat = lat
        self.lng = lng
        self.nfcLinked = nfcLinked
        self.hidden = hidden
        self.fixedChallengeId = fixedChallengeId
        self.nfcToken = nfcToken
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
        hidden = try container.decodeIfPresent(Bool.self, forKey: .hidden) ?? false
        fixedChallengeId = try container.decodeIfPresent(UUID.self, forKey: .fixedChallengeId)
        nfcToken = try container.decodeIfPresent(String.self, forKey: .nfcToken)
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
    let unlocksBaseIds: [UUID]?
    let autoValidate: Bool
    let correctAnswer: [String]?
    let locationBound: Bool
    let fixedBaseId: UUID?
    let requirePresenceToSubmit: Bool

    init(
        id: UUID,
        gameId: UUID? = nil,
        title: String,
        description: String,
        content: String,
        completionContent: String? = nil,
        answerType: String,
        points: Int,
        unlocksBaseIds: [UUID]? = nil,
        autoValidate: Bool = false,
        correctAnswer: [String]? = nil,
        locationBound: Bool = false,
        fixedBaseId: UUID? = nil,
        requirePresenceToSubmit: Bool = false
    ) {
        self.id = id
        self.gameId = gameId
        self.title = title
        self.description = description
        self.content = content
        self.completionContent = completionContent
        self.answerType = answerType
        self.points = points
        self.unlocksBaseIds = unlocksBaseIds
        self.autoValidate = autoValidate
        self.correctAnswer = correctAnswer
        self.locationBound = locationBound
        self.fixedBaseId = fixedBaseId
        self.requirePresenceToSubmit = requirePresenceToSubmit
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(UUID.self, forKey: .id)
        gameId = try container.decodeIfPresent(UUID.self, forKey: .gameId)
        title = try container.decode(String.self, forKey: .title)
        description = try container.decode(String.self, forKey: .description)
        content = try container.decode(String.self, forKey: .content)
        completionContent = try container.decodeIfPresent(String.self, forKey: .completionContent)
        answerType = try container.decode(String.self, forKey: .answerType)
        points = try container.decode(Int.self, forKey: .points)
        unlocksBaseIds = try container.decodeIfPresent([UUID].self, forKey: .unlocksBaseIds)
        autoValidate = try container.decodeIfPresent(Bool.self, forKey: .autoValidate) ?? false
        correctAnswer = try container.decodeIfPresent([String].self, forKey: .correctAnswer)
        locationBound = try container.decodeIfPresent(Bool.self, forKey: .locationBound) ?? false
        fixedBaseId = try container.decodeIfPresent(UUID.self, forKey: .fixedBaseId)
        requirePresenceToSubmit = try container.decodeIfPresent(Bool.self, forKey: .requirePresenceToSubmit) ?? false
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
