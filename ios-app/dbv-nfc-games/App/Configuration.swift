import Foundation

enum AppConfiguration {
    static var apiBaseURL: String {
        if let override = ProcessInfo.processInfo.environment["POINTFINDER_API_URL"] {
            return override
        }
        #if DEBUG
        // return "http://localhost:8080"
        return "https://pointfinder.pt"
        #else
        return "https://pointfinder.pt"
        #endif
    }

    static let appName = "PointFinder"
    static let privacyPolicyURL = "https://pointfinder.pt/privacy/"
    // Safe: privacyPolicyURL is a compile-time constant known-valid URL.
    static let privacyPolicyLink = URL(string: privacyPolicyURL)!
    static let mobileRealtimeEnabled = true
    static var chunkedMediaUploadEnabled: Bool {
        if UserDefaults.standard.object(forKey: "feature.chunkedMediaUploadEnabled") != nil {
            return UserDefaults.standard.bool(forKey: "feature.chunkedMediaUploadEnabled")
        }
        return true
    }

    // Keychain keys
    static let playerTokenKey = "com.prayer.pointfinder.playerToken"
    static let operatorTokenKey = "com.prayer.pointfinder.operatorToken"
    static let operatorRefreshTokenKey = "com.prayer.pointfinder.operatorRefreshToken"

    // Keychain keys (continued)
    static let deviceIdKey = "com.prayer.pointfinder.deviceId"

    // UserDefaults keys
    static let playerIdKey = "com.prayer.pointfinder.playerId"
    static let teamIdKey = "com.prayer.pointfinder.teamId"
    static let gameIdKey = "com.prayer.pointfinder.gameId"
    static let operatorUserIdKey = "com.prayer.pointfinder.operatorUserId"
    static let authTypeKey = "com.prayer.pointfinder.authType"

    static var deviceId: String {
        // 1. Try Keychain first (survives reinstalls)
        if let existing = KeychainService.load(key: deviceIdKey) {
            return existing
        }
        // 2. Migrate from UserDefaults if present
        if let migrated = UserDefaults.standard.string(forKey: deviceIdKey) {
            KeychainService.save(key: deviceIdKey, value: migrated)
            UserDefaults.standard.removeObject(forKey: deviceIdKey)
            return migrated
        }
        // 3. Generate new ID and persist in Keychain
        let newId = UUID().uuidString
        KeychainService.save(key: deviceIdKey, value: newId)
        return newId
    }
}
