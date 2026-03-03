import SwiftUI

@main
struct PointFinderApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    @State private var appState = AppState()
    @State private var localeManager = LocaleManager()
    @State private var appearanceManager = AppearanceManager()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(appState)
                .environment(localeManager)
                .environment(appearanceManager)
                .preferredColorScheme(appearanceManager.resolvedColorScheme)
        }
    }
}
