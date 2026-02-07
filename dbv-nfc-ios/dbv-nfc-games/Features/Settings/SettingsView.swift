import SwiftUI

struct SettingsView: View {
    @Environment(AppState.self) private var appState

    var body: some View {
        NavigationStack {
            List {
                // Team info section
                if let team = appState.currentTeam, let game = appState.currentGame {
                    Section("Current Game") {
                        HStack {
                            Text("Game")
                            Spacer()
                            Text(game.name)
                                .foregroundStyle(.secondary)
                        }
                        HStack {
                            Text("Status")
                            Spacer()
                            Text(game.status.capitalized)
                                .foregroundStyle(.secondary)
                        }
                    }

                    Section("Your Team") {
                        HStack {
                            Text("Team")
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
                    Section("Your Profile") {
                        HStack {
                            Text("Name")
                            Spacer()
                            Text(player.displayName)
                                .foregroundStyle(.secondary)
                        }
                    }
                }

                // Progress summary
                if !appState.baseProgress.isEmpty {
                    Section("Progress") {
                        let total = appState.baseProgress.count
                        let completed = appState.baseProgress.filter { $0.baseStatus == .completed }.count
                        let checkedIn = appState.baseProgress.filter { $0.baseStatus == .checkedIn }.count
                        let submitted = appState.baseProgress.filter { $0.baseStatus == .submitted }.count

                        HStack {
                            Text("Total Bases")
                            Spacer()
                            Text("\(total)")
                                .foregroundStyle(.secondary)
                        }
                        HStack {
                            Text("Completed")
                            Spacer()
                            Text("\(completed)")
                                .foregroundStyle(.green)
                        }
                        HStack {
                            Text("Checked In")
                            Spacer()
                            Text("\(checkedIn)")
                                .foregroundStyle(.blue)
                        }
                        HStack {
                            Text("Pending Review")
                            Spacer()
                            Text("\(submitted)")
                                .foregroundStyle(.orange)
                        }
                    }
                }

                // Device info
                Section("Device") {
                    HStack {
                        Text("Device ID")
                        Spacer()
                        Text(AppConfiguration.deviceId.prefix(8) + "...")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }

                // Logout
                Section {
                    Button(role: .destructive) {
                        appState.logout()
                    } label: {
                        HStack {
                            Spacer()
                            Text("Leave Game")
                            Spacer()
                        }
                    }
                }
            }
            .navigationTitle("Settings")
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
}
