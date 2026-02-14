import Foundation

@MainActor
@Observable
final class LocaleManager {

    static let shared = LocaleManager()

    private static let languageKey = "com.prayer.pointfinder.preferredLanguage"
    static let supportedLanguages = ["en", "pt", "de"]

    var currentLanguage: String = "en"

    init() {
        // 1. Check UserDefaults for saved preference
        if let saved = UserDefaults.standard.string(forKey: Self.languageKey),
           Self.supportedLanguages.contains(saved) {
            currentLanguage = saved
        } else {
            // 2. Check device language
            let preferred = Locale.preferredLanguages.first ?? "en"
            let lang = String(preferred.prefix(2))
            currentLanguage = Self.supportedLanguages.contains(lang) ? lang : "en"
        }
    }

    /// Set the language and persist to UserDefaults.
    func setLanguage(_ code: String) {
        guard Self.supportedLanguages.contains(code) else { return }
        currentLanguage = code
        UserDefaults.standard.set(code, forKey: Self.languageKey)
    }

    /// Localized string lookup (reactive for SwiftUI).
    func t(_ key: String) -> String {
        Translations.string(key, language: currentLanguage)
    }

    /// Localized string with format arguments.
    func t(_ key: String, _ args: CVarArg...) -> String {
        let template = Translations.string(key, language: currentLanguage)
        return String(format: template, arguments: args)
    }
}
