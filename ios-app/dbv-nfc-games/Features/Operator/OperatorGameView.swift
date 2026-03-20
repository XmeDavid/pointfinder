import SwiftUI

struct OperatorGameView: View {
    @Environment(AppState.self) private var appState
    @Environment(LocaleManager.self) private var locale

    let game: Game
    let onBack: () -> Void

    @State private var bases: [Base] = []
    @State private var isLoading = true
    @State private var selectedTab = 0
    @State private var gameStatus: String

    init(game: Game, onBack: @escaping () -> Void) {
        self.game = game
        self.onBack = onBack
        self._gameStatus = State(initialValue: game.status)
    }

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
            } else {
                TabView(selection: $selectedTab) {
                    // Tab 0: Map (always)
                    if let token = token {
                        OperatorMapView(game: game, token: token, bases: $bases)
                            .tabItem {
                                Label(locale.t("operator.liveMap"), systemImage: "map.fill")
                            }
                            .tag(0)
                            .accessibilityIdentifier("nav-games")
                    }

                    // Tab 1: Setup (in setup) or Live (in live/ended)
                    if gameStatus == "setup" {
                        OperatorSetupHubView(game: game)
                            .tabItem {
                                Label(locale.t("operator.setup"), systemImage: "checklist")
                            }
                            .tag(1)
                    } else {
                        OperatorLiveView(game: game)
                            .tabItem {
                                Label(locale.t("operator.live"), systemImage: "chart.bar")
                            }
                            .tag(1)
                            .accessibilityIdentifier("monitoring-tab")
                    }

                    // Tab 2: Submissions (live/ended only)
                    if gameStatus != "setup", let token = token {
                        OperatorSubmissionsView(gameId: game.id, token: token)
                            .tabItem {
                                Label(locale.t("operator.submissions"), systemImage: "doc.text")
                            }
                            .tag(2)
                    }

                    // Tab 3: More
                    OperatorMoreView(game: game, onBack: onBack)
                        .tabItem {
                            Label(locale.t("operator.more"), systemImage: "ellipsis")
                        }
                        .tag(3)
                }
            }
        }
        .task {
            await loadBases()
            if let token = token {
                appState.connectRealtime(gameId: game.id, token: token)
            }
        }
        .onDisappear {
            appState.disconnectRealtime()
        }
        .onReceive(NotificationCenter.default.publisher(for: UIApplication.willEnterForegroundNotification)) { _ in
            appState.realtimeClient.ensureConnected()
        }
        .onReceive(NotificationCenter.default.publisher(for: .mobileRealtimeEvent)) { notification in
            guard let rawGameId = notification.userInfo?["gameId"] as? String,
                  UUID(uuidString: rawGameId) == game.id,
                  let type = notification.userInfo?["type"] as? String,
                  type == "game_status",
                  let data = notification.userInfo?["data"] as? [String: Any],
                  let newStatus = data["status"] as? String else { return }
            gameStatus = newStatus
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
    @Environment(AppearanceManager.self) private var appearance

    let game: Game
    let onBack: () -> Void

    @State private var notifyPendingSubmissions = true
    @State private var notifyAllSubmissions = false
    @State private var notifyCheckIns = false
    @State private var isLoadingNotificationSettings = false
    @State private var isSavingNotificationSettings = false
    @State private var notificationSettingsError: String?
    @State private var hasLoadedNotificationSettings = false

    private var operatorToken: String? {
        if case .userOperator(let accessToken, _, _) = appState.authType {
            return accessToken
        }
        return nil
    }

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

                // Theme picker
                Section(locale.t("settings.theme")) {
                    @Bindable var appearance = appearance
                    Picker(locale.t("settings.theme"), selection: $appearance.preferredTheme) {
                        Text(locale.t("settings.themeSystem")).tag("system")
                        Text(locale.t("settings.themeLight")).tag("light")
                        Text(locale.t("settings.themeDark")).tag("dark")
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
                        Label(locale.t("common.status"), systemImage: "circle.fill")
                        Spacer()
                        Text(locale.t("game.status.\(game.status)"))
                            .foregroundStyle(.secondary)
                    }
                } header: {
                    Text(locale.t("settings.currentGame"))
                }

                Section(locale.t("operator.notificationSettings")) {
                    if isLoadingNotificationSettings && !hasLoadedNotificationSettings {
                        ProgressView(locale.t("operator.loading"))
                    } else {
                        Toggle(locale.t("operator.notifyPendingSubmissions"), isOn: Binding(
                            get: { notifyPendingSubmissions },
                            set: { newValue in
                                notifyPendingSubmissions = newValue
                                saveNotificationSettings()
                            }
                        ))
                        .disabled(isSavingNotificationSettings)
                        Toggle(locale.t("operator.notifyAllSubmissions"), isOn: Binding(
                            get: { notifyAllSubmissions },
                            set: { newValue in
                                notifyAllSubmissions = newValue
                                saveNotificationSettings()
                            }
                        ))
                        .disabled(isSavingNotificationSettings)
                        Toggle(locale.t("operator.notifyCheckIns"), isOn: Binding(
                            get: { notifyCheckIns },
                            set: { newValue in
                                notifyCheckIns = newValue
                                saveNotificationSettings()
                            }
                        ))
                        .disabled(isSavingNotificationSettings)

                        if isSavingNotificationSettings {
                            ProgressView(locale.t("common.saving"))
                                .font(.caption)
                        }

                        if let notificationSettingsError {
                            Text(notificationSettingsError)
                                .font(.caption)
                                .foregroundStyle(.red)
                        }
                    }
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
            .navigationTitle(locale.t("common.settings"))
            .navigationBarTitleDisplayMode(.inline)
            .task {
                await loadNotificationSettings()
            }
        }
    }

    private func loadNotificationSettings() async {
        guard let operatorToken else { return }
        isLoadingNotificationSettings = true
        notificationSettingsError = nil
        defer {
            isLoadingNotificationSettings = false
            hasLoadedNotificationSettings = true
        }

        do {
            let settings = try await appState.apiClient.getOperatorNotificationSettings(
                gameId: game.id,
                token: operatorToken
            )
            notifyPendingSubmissions = settings.notifyPendingSubmissions
            notifyAllSubmissions = settings.notifyAllSubmissions
            notifyCheckIns = settings.notifyCheckIns
        } catch {
            notificationSettingsError = error.localizedDescription
        }
    }

    private func saveNotificationSettings() {
        guard let operatorToken else { return }
        isSavingNotificationSettings = true
        notificationSettingsError = nil

        let request = UpdateOperatorNotificationSettingsRequest(
            notifyPendingSubmissions: notifyPendingSubmissions,
            notifyAllSubmissions: notifyAllSubmissions,
            notifyCheckIns: notifyCheckIns
        )

        Task {
            do {
                let savedSettings = try await appState.apiClient.updateOperatorNotificationSettings(
                    gameId: game.id,
                    request: request,
                    token: operatorToken
                )
                notifyPendingSubmissions = savedSettings.notifyPendingSubmissions
                notifyAllSubmissions = savedSettings.notifyAllSubmissions
                notifyCheckIns = savedSettings.notifyCheckIns
            } catch {
                notificationSettingsError = error.localizedDescription
            }
            isSavingNotificationSettings = false
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
