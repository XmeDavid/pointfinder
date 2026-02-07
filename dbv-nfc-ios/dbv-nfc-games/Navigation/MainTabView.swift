import SwiftUI

struct MainTabView: View {
    @Environment(AppState.self) private var appState

    var body: some View {
        TabView {
            GameMapView()
                .tabItem {
                    Label("Map", systemImage: "map.fill")
                }

            ScanTabView()
                .tabItem {
                    Label("Scan", systemImage: "sensor.tag.radiowaves.forward")
                }

            SettingsView()
                .tabItem {
                    Label("Settings", systemImage: "gearshape.fill")
                }
        }
    }
}

#Preview {
    MainTabView()
        .environment(AppState())
}
