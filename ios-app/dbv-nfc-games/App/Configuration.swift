import Foundation

enum AppConfiguration {
    #if DEBUG
    static let apiBaseURL = "https://pointfinder.pt"
    #else
    static let apiBaseURL = "https://pointfinder.pt"
    #endif

    static let appName = "PointFinder"
    static let privacyPolicyURL = "https://pointfinder.pt/privacy/"
    static let mobileRealtimeEnabled = true

    // Keychain keys
    static let playerTokenKey = "com.prayer.pointfinder.playerToken"
    static let operatorTokenKey = "com.prayer.pointfinder.operatorToken"
    static let operatorRefreshTokenKey = "com.prayer.pointfinder.operatorRefreshToken"

    // UserDefaults keys
    static let deviceIdKey = "com.prayer.pointfinder.deviceId"
    static let playerIdKey = "com.prayer.pointfinder.playerId"
    static let teamIdKey = "com.prayer.pointfinder.teamId"
    static let gameIdKey = "com.prayer.pointfinder.gameId"
    static let operatorUserIdKey = "com.prayer.pointfinder.operatorUserId"
    static let authTypeKey = "com.prayer.pointfinder.authType"

    static var deviceId: String {
        if let existing = UserDefaults.standard.string(forKey: deviceIdKey) {
            return existing
        }
        let newId = UUID().uuidString
        UserDefaults.standard.set(newId, forKey: deviceIdKey)
        return newId
    }
}
