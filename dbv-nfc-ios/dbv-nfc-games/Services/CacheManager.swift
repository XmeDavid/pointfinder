import Foundation

actor CacheManager {

    static let shared = CacheManager()

    private let cacheDirectory: URL
    private var memoryCache: [String: Data] = [:]

    private init() {
        let paths = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)
        cacheDirectory = paths[0].appendingPathComponent("ScoutMission", isDirectory: true)
        try? FileManager.default.createDirectory(at: cacheDirectory, withIntermediateDirectories: true)
    }

    // MARK: - Challenge Cache

    func cacheChallenge(_ challenge: CheckInResponse.ChallengeInfo, forBaseId baseId: UUID) {
        let key = "challenge_\(baseId.uuidString)"
        guard let data = try? JSONEncoder().encode(challenge) else { return }
        memoryCache[key] = data
        let fileURL = cacheDirectory.appendingPathComponent(key)
        try? data.write(to: fileURL)
    }

    func getCachedChallenge(forBaseId baseId: UUID) -> CheckInResponse.ChallengeInfo? {
        let key = "challenge_\(baseId.uuidString)"

        // Check memory cache first
        if let data = memoryCache[key] {
            return try? JSONDecoder().decode(CheckInResponse.ChallengeInfo.self, from: data)
        }

        // Check disk cache
        let fileURL = cacheDirectory.appendingPathComponent(key)
        guard let data = try? Data(contentsOf: fileURL) else { return nil }
        memoryCache[key] = data
        return try? JSONDecoder().decode(CheckInResponse.ChallengeInfo.self, from: data)
    }

    func hasCachedChallenge(forBaseId baseId: UUID) -> Bool {
        let key = "challenge_\(baseId.uuidString)"
        if memoryCache[key] != nil { return true }
        let fileURL = cacheDirectory.appendingPathComponent(key)
        return FileManager.default.fileExists(atPath: fileURL.path)
    }

    // MARK: - Clear

    func clearAll() {
        memoryCache.removeAll()
        try? FileManager.default.removeItem(at: cacheDirectory)
        try? FileManager.default.createDirectory(at: cacheDirectory, withIntermediateDirectories: true)
    }
}
