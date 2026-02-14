import SwiftUI

struct MainTabView: View {
    @Environment(AppState.self) private var appState
    @Environment(LocaleManager.self) private var locale
    @AppStorage("com.prayer.pointfinder.permissionDisclosureSeen") private var disclosureSeen = false
    @State private var showDisclosure = false

    var body: some View {
        VStack(spacing: 0) {
            // Offline banner
            if !appState.isOnline {
                OfflineBanner()
            }

            TabView {
                GameMapView()
                    .tabItem {
                        Label(locale.t("tabs.map"), systemImage: "map.fill")
                    }

                CheckInTabView()
                    .tabItem {
                        Label(locale.t("tabs.checkIn"), systemImage: "mappin.and.ellipse")
                    }

                SettingsView()
                    .tabItem {
                        Label(locale.t("tabs.settings"), systemImage: "gearshape.fill")
                    }
            }
        }
        .onAppear {
            if !disclosureSeen {
                showDisclosure = true
            }
        }
        .sheet(isPresented: $showDisclosure) {
            PermissionDisclosureView {
                disclosureSeen = true
                showDisclosure = false
                appState.requestPermissionsAfterDisclosure()
            }
        }
    }
}

// MARK: - Offline Banner

struct OfflineBanner: View {
    @Environment(LocaleManager.self) private var locale

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "wifi.slash")
                .font(.subheadline)
            Text(locale.t("offline.banner"))
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
        .environment(LocaleManager())
}
