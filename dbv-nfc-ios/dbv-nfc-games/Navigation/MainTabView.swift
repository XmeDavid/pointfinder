import SwiftUI

struct MainTabView: View {
    @Environment(AppState.self) private var appState

    var body: some View {
        VStack(spacing: 0) {
            // Offline banner
            if !appState.isOnline {
                OfflineBanner()
            }

            TabView {
                GameMapView()
                    .tabItem {
                        Label("Map", systemImage: "map.fill")
                    }

                CheckInTabView()
                    .tabItem {
                        Label("Check In", systemImage: "mappin.and.ellipse")
                    }

                SettingsView()
                    .tabItem {
                        Label("Settings", systemImage: "gearshape.fill")
                    }
            }
        }
    }
}

// MARK: - Offline Banner

struct OfflineBanner: View {
    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "wifi.slash")
                .font(.subheadline)
            Text("You're offline. Changes will sync when connected.")
                .font(.caption)
            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .background(Color.orange)
        .foregroundStyle(.white)
    }
}

#Preview {
    MainTabView()
        .environment(AppState())
}
