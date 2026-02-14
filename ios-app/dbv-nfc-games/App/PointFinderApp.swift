import SwiftUI

@main
struct PointFinderApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    @State private var appState = AppState()
    @State private var localeManager = LocaleManager()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(appState)
                .environment(localeManager)
        }
    }
}
