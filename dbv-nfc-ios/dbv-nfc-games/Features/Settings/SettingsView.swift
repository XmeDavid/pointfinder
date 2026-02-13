import SwiftUI

struct SettingsView: View {
    @Environment(AppState.self) private var appState
    @Environment(LocaleManager.self) private var locale
    @State private var showDeleteAccountConfirm = false
    @State private var isDeletingAccount = false

    var body: some View {
        NavigationStack {
            List {
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

                // Team info section
                if let team = appState.currentTeam, let game = appState.currentGame {
                    Section(locale.t("settings.currentGame")) {
                        HStack {
                            Text(locale.t("settings.game"))
                            Spacer()
                            Text(game.name)
                                .foregroundStyle(.secondary)
                        }
                        HStack {
                            Text(locale.t("settings.status"))
                            Spacer()
                            Text(game.status.capitalized)
                                .foregroundStyle(.secondary)
                        }
                    }

                    Section(locale.t("settings.yourTeam")) {
                        HStack {
                            Text(locale.t("settings.team"))
                            Spacer()
                            HStack(spacing: 6) {
                                Circle()
                                    .fill(Color(hex: team.color) ?? .blue)
                                    .frame(width: 12, height: 12)
                                Text(team.name)
                                    .foregroundStyle(.secondary)
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
                                .foregroundStyle(.secondary)
                        }
                    }
                }

                // Progress summary
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
                                .foregroundStyle(.secondary)
                        }
                        HStack {
                            Text(locale.t("settings.completed"))
                            Spacer()
                            Text("\(completed)")
                                .foregroundStyle(.green)
                        }
                        HStack {
                            Text(locale.t("settings.checkedIn"))
                            Spacer()
                            Text("\(checkedIn)")
                                .foregroundStyle(.blue)
                        }
                        HStack {
                            Text(locale.t("settings.pendingReview"))
                            Spacer()
                            Text("\(submitted)")
                                .foregroundStyle(.orange)
                        }
                    }
                }

                // Device info
                Section(locale.t("settings.device")) {
                    HStack {
                        Text(locale.t("settings.deviceId"))
                        Spacer()
                        Text(AppConfiguration.deviceId.prefix(8) + "...")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    HStack {
                        Text(locale.t("settings.pendingActions"))
                        Spacer()
                        Text("\(appState.pendingActionsCount)")
                            .foregroundStyle(.secondary)
                    }
                }

                // Privacy
                Section(locale.t("settings.privacy")) {
                    Link(destination: URL(string: AppConfiguration.privacyPolicyURL)!) {
                        HStack {
                            Spacer()
                            Text(locale.t("settings.privacyPolicy"))
                            Spacer()
                        }
                    }
                }

                // Player account deletion
                if appState.isPlayer {
                    Section {
                        Button(role: .destructive) {
                            showDeleteAccountConfirm = true
                        } label: {
                            HStack {
                                Spacer()
                                Text(isDeletingAccount ? locale.t("settings.deletingAccount") : locale.t("settings.deleteAccount"))
                                Spacer()
                            }
                        }
                        .disabled(isDeletingAccount)
                    }
                }

                // Logout
                Section {
                    Button(role: .destructive) {
                        appState.logout()
                    } label: {
                        HStack {
                            Spacer()
                            Text(locale.t("settings.leaveGame"))
                            Spacer()
                        }
                    }
                }
            }
            .navigationTitle(locale.t("settings.title"))
            .alert(locale.t("settings.deleteAccountTitle"), isPresented: $showDeleteAccountConfirm) {
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
}
