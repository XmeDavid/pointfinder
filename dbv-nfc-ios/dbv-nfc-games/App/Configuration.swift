import Foundation

enum AppConfiguration {
    #if DEBUG
    static let apiBaseURL = "https://dbvnfc-api.davidsbatista.com"
    #else
    static let apiBaseURL = "https://dbvnfc-api.davidsbatista.com"
    #endif

    static let appName = "Scout Mission"

    // Keychain keys
    static let playerTokenKey = "com.dbvnfc.playerToken"
    static let operatorTokenKey = "com.dbvnfc.operatorToken"
    static let operatorRefreshTokenKey = "com.dbvnfc.operatorRefreshToken"

    // UserDefaults keys
    static let deviceIdKey = "com.dbvnfc.deviceId"
    static let playerIdKey = "com.dbvnfc.playerId"
    static let teamIdKey = "com.dbvnfc.teamId"
    static let gameIdKey = "com.dbvnfc.gameId"
    static let authTypeKey = "com.dbvnfc.authType"

    static var deviceId: String {
        if let existing = UserDefaults.standard.string(forKey: deviceIdKey) {
            return existing
        }
        let newId = UUID().uuidString
        UserDefaults.standard.set(newId, forKey: deviceIdKey)
        return newId
    }
}
