import SwiftUI

struct ContentView: View {
    @Environment(AppState.self) private var appState

    var body: some View {
        Group {
            switch appState.authType {
            case .player:
                MainTabView()

            case .userOperator:
                OperatorHomeView()

            case .none:
                WelcomeView()
            }
        }
        .animation(.easeInOut, value: appState.isAuthenticated)
    }
}

#Preview {
    ContentView()
        .environment(AppState())
        .environment(LocaleManager())
}
