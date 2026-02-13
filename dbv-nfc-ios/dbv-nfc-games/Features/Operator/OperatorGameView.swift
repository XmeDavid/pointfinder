import SwiftUI

struct OperatorGameView: View {
    @Environment(AppState.self) private var appState
    @Environment(LocaleManager.self) private var locale

    let game: Game
    let onBack: () -> Void

    @State private var bases: [Base] = []
    @State private var isLoading = true

    private var token: String? {
        if case .userOperator(let token, _, _) = appState.authType {
            return token
        }
        return nil
    }

    var body: some View {
        Group {
            if isLoading {
                VStack {
                    ProgressView(locale.t("operator.loading"))
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if bases.isEmpty {
                ContentUnavailableView(
                    locale.t("operator.noBases"),
                    systemImage: "mappin.slash",
                    description: Text(locale.t("operator.noBasesDesc"))
                )
            } else {
                TabView {
                    // Live Map tab
                    if let token = token {
                        OperatorMapView(gameId: game.id, token: token, bases: $bases)
                            .tabItem {
                                Label(locale.t("operator.liveMap"), systemImage: "map.fill")
                            }
                    }

                    // Bases / NFC Setup tab
                    NavigationStack {
                        BasesListView(game: game, bases: $bases)
                            .navigationTitle(locale.t("operator.bases"))
                            .navigationBarTitleDisplayMode(.inline)
                    }
                    .tabItem {
                        Label(locale.t("operator.bases"), systemImage: "mappin.and.ellipse")
                    }

                    // Settings tab (back to game list, logout)
                    OperatorSettingsView(game: game, onBack: onBack)
                        .tabItem {
                            Label(locale.t("tabs.settings"), systemImage: "gearshape.fill")
                        }
                }
            }
        }
        .task {
            await loadBases()
        }
    }

    private func loadBases() async {
        guard let token = token else { return }
        isLoading = true
        do {
            bases = try await appState.apiClient.getGameBases(gameId: game.id, token: token)
        } catch {
            appState.setError(error.localizedDescription)
        }
        isLoading = false
    }
}

// MARK: - Operator Settings View

struct OperatorSettingsView: View {
    @Environment(AppState.self) private var appState
    @Environment(LocaleManager.self) private var locale

    let game: Game
    let onBack: () -> Void

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

                Section {
                    HStack {
                        Label(locale.t("settings.game"), systemImage: "gamecontroller")
                        Spacer()
                        Text(game.name)
                            .foregroundStyle(.secondary)
                    }

                    HStack {
                        Label(locale.t("settings.status"), systemImage: "circle.fill")
                        Spacer()
                        Text(game.status.capitalized)
                            .foregroundStyle(.secondary)
                    }
                } header: {
                    Text(locale.t("settings.currentGame"))
                }

                Section(locale.t("settings.privacy")) {
                    Link(destination: URL(string: AppConfiguration.privacyPolicyURL)!) {
                        Label(locale.t("settings.privacyPolicy"), systemImage: "hand.raised")
                    }
                }

                Section {
                    Button {
                        onBack()
                    } label: {
                        Label(locale.t("operator.switchGame"), systemImage: "arrow.left.circle")
                    }

                    Button(role: .destructive) {
                        appState.logout()
                    } label: {
                        Label(locale.t("operator.logout"), systemImage: "rectangle.portrait.and.arrow.right")
                    }
                }
            }
            .navigationTitle(locale.t("settings.title"))
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}

// MARK: - Bases List View (NFC Setup)

struct BasesListView: View {
    @Environment(LocaleManager.self) private var locale

    let game: Game
    @Binding var bases: [Base]

    var body: some View {
        List($bases) { $base in
            NavigationLink {
                BaseDetailView(game: game, base: $base)
            } label: {
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(base.name)
                            .font(.headline)
                        Text(base.description)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                        Text("(\(String(format: "%.4f", base.lat)), \(String(format: "%.4f", base.lng)))")
                            .font(.caption2)
                            .foregroundStyle(.tertiary)
                    }

                    Spacer()

                    if base.nfcLinked {
                        Label(locale.t("operator.linked"), systemImage: "checkmark.circle.fill")
                            .font(.caption)
                            .foregroundStyle(.green)
                    } else {
                        Label(locale.t("operator.notLinked"), systemImage: "circle.dashed")
                            .font(.caption)
                            .foregroundStyle(.orange)
                    }
                }
            }
        }
        .listStyle(.plain)
    }
}
