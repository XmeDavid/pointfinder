import Foundation

/// Manages offline caching of game data.
/// Stores bases, challenges, assignments, and progress per game.
actor GameDataCache {

    static let shared = GameDataCache()

    private let cacheDirectory: URL
    private var memoryCache: [String: Data] = [:]
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    private init() {
        let paths = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)
        cacheDirectory = paths[0].appendingPathComponent("ScoutMission", isDirectory: true)
        try? FileManager.default.createDirectory(at: cacheDirectory, withIntermediateDirectories: true)
    }

    // MARK: - Game Data Cache

    /// Cache complete game data (bases, challenges, assignments, progress)
    func cacheGameData(_ data: GameDataResponse, gameId: UUID) {
        cacheValue(data.bases, key: "bases_\(gameId)")
        cacheValue(data.challenges, key: "challenges_\(gameId)")
        cacheValue(data.assignments, key: "assignments_\(gameId)")
        cacheValue(data.progress, key: "progress_\(gameId)")
    }

    /// Get cached bases for a game
    func getCachedBases(gameId: UUID) -> [Base]? {
        getValue(key: "bases_\(gameId)")
    }

    /// Get cached challenges for a game
    func getCachedChallenges(gameId: UUID) -> [Challenge]? {
        getValue(key: "challenges_\(gameId)")
    }

    /// Get cached assignments for a game
    func getCachedAssignments(gameId: UUID) -> [Assignment]? {
        getValue(key: "assignments_\(gameId)")
    }

    /// Get cached progress for a game
    func getCachedProgress(gameId: UUID) -> [BaseProgress]? {
        getValue(key: "progress_\(gameId)")
    }

    /// Update cached progress (for optimistic updates)
    func updateCachedProgress(_ progress: [BaseProgress], gameId: UUID) {
        cacheValue(progress, key: "progress_\(gameId)")
    }

    // MARK: - Challenge Lookup

    /// Get a specific challenge by ID from cache
    func getCachedChallenge(challengeId: UUID, gameId: UUID) -> Challenge? {
        guard let challenges: [Challenge] = getValue(key: "challenges_\(gameId)") else {
            return nil
        }
        return challenges.first { $0.id == challengeId }
    }

    /// Get the challenge assigned to a specific base for a team
    func getCachedChallenge(forBaseId baseId: UUID, teamId: UUID, gameId: UUID) -> CheckInResponse.ChallengeInfo? {
        guard let assignments: [Assignment] = getValue(key: "assignments_\(gameId)"),
              let challenges: [Challenge] = getValue(key: "challenges_\(gameId)"),
              let bases: [Base] = getValue(key: "bases_\(gameId)") else {
            return nil
        }

        // Find assignment for this base (team-specific or global)
        let assignment = assignments.first { a in
            a.baseId == baseId && (a.teamId == nil || a.teamId == teamId)
        }

        // Use assignment's challenge or fall back to fixed challenge
        var challengeId: UUID?
        if let assignment = assignment {
            challengeId = assignment.challengeId
        } else if let base = bases.first(where: { $0.id == baseId }) {
            challengeId = base.fixedChallengeId
        }

        guard let cId = challengeId,
              let challenge = challenges.first(where: { $0.id == cId }) else {
            return nil
        }

        return CheckInResponse.ChallengeInfo(
            id: challenge.id,
            title: challenge.title,
            description: challenge.description,
            content: challenge.content,
            answerType: challenge.answerType,
            points: challenge.points
        )
    }

    // MARK: - Legacy Support (for existing code)

    /// Cache a single challenge (legacy method for backward compatibility)
    func cacheChallenge(_ challenge: CheckInResponse.ChallengeInfo, forBaseId baseId: UUID) {
        cacheValue(challenge, key: "challenge_\(baseId)")
    }

    /// Get cached challenge for a base (legacy method)
    func getCachedChallenge(forBaseId baseId: UUID) -> CheckInResponse.ChallengeInfo? {
        getValue(key: "challenge_\(baseId)")
    }

    func hasCachedChallenge(forBaseId baseId: UUID) -> Bool {
        let key = "challenge_\(baseId)"
        if memoryCache[key] != nil { return true }
        let fileURL = cacheDirectory.appendingPathComponent(key)
        return FileManager.default.fileExists(atPath: fileURL.path)
    }

    // MARK: - Progress Update Helpers

    /// Update the status of a specific base in the cached progress
    func updateBaseStatus(baseId: UUID, status: String, gameId: UUID) {
        guard var progress: [BaseProgress] = getValue(key: "progress_\(gameId)") else { return }

        if let index = progress.firstIndex(where: { $0.baseId == baseId }) {
            let old = progress[index]
            progress[index] = BaseProgress(
                baseId: old.baseId,
                baseName: old.baseName,
                lat: old.lat,
                lng: old.lng,
                nfcLinked: old.nfcLinked,
                requirePresenceToSubmit: old.requirePresenceToSubmit,
                status: status,
                checkedInAt: status == "checked_in" ? ISO8601DateFormatter().string(from: Date()) : old.checkedInAt,
                challengeId: old.challengeId,
                submissionStatus: status == "submitted" ? "pending" : old.submissionStatus
            )
            cacheValue(progress, key: "progress_\(gameId)")
        }
    }

    // MARK: - Clear

    func clearAll() {
        memoryCache.removeAll()
        try? FileManager.default.removeItem(at: cacheDirectory)
        try? FileManager.default.createDirectory(at: cacheDirectory, withIntermediateDirectories: true)
    }

    func clearGame(_ gameId: UUID) {
        let keys = ["bases_\(gameId)", "challenges_\(gameId)", "assignments_\(gameId)", "progress_\(gameId)"]
        for key in keys {
            memoryCache.removeValue(forKey: key)
            let fileURL = cacheDirectory.appendingPathComponent(key)
            try? FileManager.default.removeItem(at: fileURL)
        }
    }

    // MARK: - Private Helpers

    private func cacheValue<T: Encodable>(_ value: T, key: String) {
        guard let data = try? encoder.encode(value) else { return }
        memoryCache[key] = data
        let fileURL = cacheDirectory.appendingPathComponent(key)
        try? data.write(to: fileURL)
    }

    private func getValue<T: Decodable>(key: String) -> T? {
        // Check memory cache first
        if let data = memoryCache[key] {
            return try? decoder.decode(T.self, from: data)
        }

        // Check disk cache
        let fileURL = cacheDirectory.appendingPathComponent(key)
        guard let data = try? Data(contentsOf: fileURL) else { return nil }
        memoryCache[key] = data
        return try? decoder.decode(T.self, from: data)
    }
}

// MARK: - Backwards Compatibility Alias

typealias CacheManager = GameDataCache
