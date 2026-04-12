import SwiftUI

struct SettingsView: View {
    @Environment(AppState.self) private var appState
    @Environment(LocaleManager.self) private var locale
    @Environment(AppearanceManager.self) private var appearance
    @State private var showDeleteAccountConfirm = false
    @State private var isDeletingAccount = false
    @State private var showLeaveGameConfirm = false

    private func statusColor(for status: String) -> Color {
        switch status {
        case "live": return .pfCompleted
        case "setup": return .pfPending
        default: return .pfTextMuted
        }
    }

    var body: some View {
        NavigationStack {
            List {
                preferenceSections
                gameInfoSections
                progressSection
                deviceSection
                actionSections
            }
            .navigationTitle(locale.t("common.settings"))
            .alert(locale.t("settings.leaveGameTitle"), isPresented: $showLeaveGameConfirm) {
                Button(locale.t("settings.leaveGame"), role: .destructive) {
                    Task { await appState.logout() }
                }
                Button(locale.t("common.cancel"), role: .cancel) {
                    showLeaveGameConfirm = false
                }
            } message: {
                Text(locale.t("settings.leaveGameMessage"))
            }
            .alert(locale.t("common.deleteAccount"), isPresented: $showDeleteAccountConfirm) {
                Button(locale.t("settings.deleteAccountConfirm"), role: .destructive) {
                    Task {
                        isDeletingAccount = true
                        await appState.deletePlayerAccount()
                        isDeletingAccount = false
                    }
                }
                Button(locale.t("common.cancel"), role: .cancel) {
                    showDeleteAccountConfirm = false
                }
            } message: {
                Text(locale.t("settings.deleteAccountMessage"))
            }
            .alert(locale.t("settings.leaveGameUnsyncedTitle"), isPresented: Binding(
                get: { appState.showLogoutUnsyncedAlert },
                set: { if !$0 { appState.showLogoutUnsyncedAlert = false } }
            )) {
                Button(locale.t("settings.leaveGame"), role: .destructive) {
                    Task { await appState.confirmLogout() }
                }
                Button(locale.t("common.cancel"), role: .cancel) {
                    appState.showLogoutUnsyncedAlert = false
                }
            } message: {
                Text(locale.t("settings.leaveGameUnsyncedMessage", appState.pendingLogoutCount))
            }
        }
    }

    @ViewBuilder
    private var preferenceSections: some View {
        // Language picker
        Section(locale.t("settings.language")) {
            Picker(locale.t("settings.language"), selection: Binding(
                get: { locale.currentLanguage },
                set: { locale.setLanguage($0) }
            )) {
                Text("English").tag("en")
                Text("Português").tag("pt")
                Text("Deutsch").tag("de")
            }
        }

        // Theme picker
        Section(locale.t("settings.theme")) {
            @Bindable var appearance = appearance
            Picker(locale.t("settings.theme"), selection: $appearance.preferredTheme) {
                Text(locale.t("settings.themeSystem")).tag("system")
                Text(locale.t("settings.themeLight")).tag("light")
                Text(locale.t("settings.themeDark")).tag("dark")
            }
        }
    }

    @ViewBuilder
    private var gameInfoSections: some View {
        if let team = appState.currentTeam, let game = appState.currentGame {
            Section(locale.t("settings.currentGame")) {
                HStack {
                    Text(locale.t("settings.game"))
                    Spacer()
                    Text(game.name)
                        .foregroundStyle(.pfTextMuted)
                }
                HStack {
                    Text(locale.t("common.status"))
                    Spacer()
                    Text(locale.t("game.status.\(game.status)"))
                        .foregroundStyle(statusColor(for: game.status))
                }
            }

            Section(locale.t("settings.yourTeam")) {
                HStack {
                    Text(locale.t("common.team"))
                    Spacer()
                    HStack(spacing: 6) {
                        Circle()
                            .fill(Color(hex: team.color) ?? .blue)
                            .frame(width: 12, height: 12)
                        Text(team.name)
                            .foregroundStyle(.pfTextMuted)
                    }
                }
            }
        }

        if let player = appState.currentPlayer {
            Section(locale.t("settings.yourProfile")) {
                HStack {
                    Text(locale.t("settings.name"))
                    Spacer()
                    Text(player.displayName)
                        .foregroundStyle(.pfTextMuted)
                }
            }
        }
    }

    @ViewBuilder
    private var progressSection: some View {
        if !appState.baseProgress.isEmpty {
            Section(locale.t("settings.progress")) {
                let total = appState.baseProgress.count
                let completed = appState.baseProgress.filter { $0.baseStatus == .completed }.count
                let checkedIn = appState.baseProgress.filter { $0.baseStatus == .checkedIn }.count
                let submitted = appState.baseProgress.filter { $0.baseStatus == .submitted }.count

                HStack {
                    Text(locale.t("settings.totalBases"))
                    Spacer()
                    Text("\(total)")
                        .foregroundStyle(.pfTextMuted)
                }
                HStack {
                    Text(locale.t("settings.completed"))
                    Spacer()
                    Text("\(completed)")
                        .foregroundStyle(Color.pfCompleted)
                }
                HStack {
                    Text(locale.t("settings.checkedIn"))
                    Spacer()
                    Text("\(checkedIn)")
                        .foregroundStyle(Color.pfCheckedIn)
                }
                HStack {
                    Text(locale.t("settings.pendingReview"))
                    Spacer()
                    Text("\(submitted)")
                        .foregroundStyle(Color.pfPending)
                }
            }
        }
    }

    @ViewBuilder
    private var deviceSection: some View {
        Section(locale.t("settings.device")) {
            HStack {
                Text(locale.t("settings.deviceId"))
                Spacer()
                Text(AppConfiguration.deviceId.prefix(8) + "...")
                    .font(.caption)
                    .foregroundStyle(.pfTextMuted)
            }
            HStack {
                Text(locale.t("settings.pendingActions"))
                Spacer()
                Text("\(appState.pendingActionsCount)")
                    .foregroundStyle(.pfTextMuted)
            }
        }

        // Privacy
        Section(locale.t("settings.privacy")) {
            Link(destination: AppConfiguration.privacyPolicyLink) {
                HStack {
                    Spacer()
                    Text(locale.t("settings.privacyPolicy"))
                    Spacer()
                }
            }
        }
    }

    @ViewBuilder
    private var actionSections: some View {
        // Player account deletion
        if appState.isPlayer {
            Section {
                Button(role: .destructive) {
                    showDeleteAccountConfirm = true
                } label: {
                    HStack {
                        Spacer()
                        Text(isDeletingAccount ? locale.t("settings.deletingAccount") : locale.t("common.deleteAccount"))
                        Spacer()
                    }
                }
                .disabled(isDeletingAccount)
            }
        }

        // Logout
        Section {
            Button(role: .destructive) {
                showLeaveGameConfirm = true
            } label: {
                HStack {
                    Spacer()
                    Text(locale.t("settings.leaveGame"))
                    Spacer()
                }
            }
        }
    }
}

// MARK: - Color Hex Extension

extension Color {
    init?(hex: String) {
        var hexSanitized = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        hexSanitized = hexSanitized.replacingOccurrences(of: "#", with: "")

        guard hexSanitized.count == 6 else { return nil }

        var rgb: UInt64 = 0
        Scanner(string: hexSanitized).scanHexInt64(&rgb)

        let r = Double((rgb & 0xFF0000) >> 16) / 255.0
        let g = Double((rgb & 0x00FF00) >> 8) / 255.0
        let b = Double(rgb & 0x0000FF) / 255.0

        self.init(red: r, green: g, blue: b)
    }
}

#Preview {
    SettingsView()
        .environment(AppState())
        .environment(LocaleManager())
        .environment(AppearanceManager())
}
