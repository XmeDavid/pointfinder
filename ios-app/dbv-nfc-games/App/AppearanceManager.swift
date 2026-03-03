import SwiftUI

@MainActor
@Observable
final class AppearanceManager {

    private static let themeKey = "com.prayer.pointfinder.preferredTheme"

    var preferredTheme: String = "system" {
        didSet {
            UserDefaults.standard.set(preferredTheme, forKey: Self.themeKey)
        }
    }

    var resolvedColorScheme: ColorScheme? {
        switch preferredTheme {
        case "light": return .light
        case "dark": return .dark
        default: return nil // system
        }
    }

    init() {
        if let saved = UserDefaults.standard.string(forKey: Self.themeKey) {
            preferredTheme = saved
        }
    }
}
