import SwiftUI

struct OperatorMoreView: View {
    @Environment(AppState.self) private var appState
    @Environment(LocaleManager.self) private var locale
    @Environment(AppearanceManager.self) private var appearance

    let game: Game
    let onBack: () -> Void

    @State private var isExporting = false
    @State private var exportError: String?
    @State private var exportedFileURL: URL?
    @State private var showShareSheet = false

    // Notification preference state
    @State private var notifyPendingSubmissions = true
    @State private var notifyAllSubmissions = false
    @State private var notifyCheckIns = false
    @State private var isLoadingNotificationSettings = false
    @State private var isSavingNotificationSettings = false
    @State private var notificationSettingsError: String?
    @State private var hasLoadedNotificationSettings = false

    private var token: String? {
        if case .userOperator(let token, _, _) = appState.authType {
            return token
        }
        return nil
    }

    var body: some View {
        NavigationStack {
            List {
                // Game Management section
                Section {
                    NavigationLink {
                        GameSettingsView(game: game)
                    } label: {
                        Label(locale.t("operator.gameSettings"), systemImage: "gear")
                    }

                    NavigationLink {
                        NotificationsManagementView(game: game)
                    } label: {
                        Label(locale.t("operator.notifications"), systemImage: "bell.badge")
                    }

                    NavigationLink {
                        OperatorsManagementView(game: game)
                    } label: {
                        Label(locale.t("operator.operators"), systemImage: "person.2")
                    }

                    Button {
                        Task { await exportGame() }
                    } label: {
                        Label {
                            Text(isExporting ? locale.t("operator.exporting") : locale.t("operator.exportGame"))
                        } icon: {
                            if isExporting {
                                ProgressView()
                            } else {
                                Image(systemName: "square.and.arrow.up")
                            }
                        }
                    }
                    .disabled(isExporting)
                    .accessibilityIdentifier("game-export-btn")

                    if let exportError {
                        Text(exportError)
                            .foregroundStyle(.red)
                            .font(.caption)
                    }
                }

                // App Settings section
                Section(locale.t("operator.appSettings")) {
                    // Language picker
                    Picker(locale.t("settings.language"), selection: Binding(
                        get: { locale.currentLanguage },
                        set: { locale.setLanguage($0) }
                    )) {
                        Text("English").tag("en")
                        Text("Portugu\u{00EA}s").tag("pt")
                        Text("Deutsch").tag("de")
                    }

                    // Theme picker
                    @Bindable var appearance = appearance
                    Picker(locale.t("settings.theme"), selection: $appearance.preferredTheme) {
                        Text(locale.t("settings.themeSystem")).tag("system")
                        Text(locale.t("settings.themeLight")).tag("light")
                        Text(locale.t("settings.themeDark")).tag("dark")
                    }
                }

                // Notification preferences
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

                // Account section
                Section(locale.t("operator.account")) {
                    Link(destination: AppConfiguration.privacyPolicyLink) {
                        Label(locale.t("settings.privacyPolicy"), systemImage: "hand.raised")
                    }

                    Button {
                        onBack()
                    } label: {
                        Label(locale.t("operator.switchGame"), systemImage: "arrow.left.circle")
                    }

                    Button(role: .destructive) {
                        Task { await appState.logout() }
                    } label: {
                        Label(locale.t("operator.logout"), systemImage: "rectangle.portrait.and.arrow.right")
                    }
                }
            }
            .navigationTitle(locale.t("operator.more"))
            .navigationBarTitleDisplayMode(.inline)
            .task {
                await loadNotificationSettings()
            }
            .sheet(isPresented: $showShareSheet) {
                if let url = exportedFileURL {
                    ShareSheet(activityItems: [url])
                }
            }
        }
    }

    // MARK: - Export

    private func exportGame() async {
        guard let token else { return }
        isExporting = true
        exportError = nil
        do {
            let exportDto = try await appState.apiClient.exportGame(gameId: game.id, token: token)
            let encoder = JSONEncoder()
            encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
            let jsonData = try encoder.encode(exportDto)

            let fileName = "\(game.name.replacingOccurrences(of: " ", with: "_"))_export.json"
            let tempURL = FileManager.default.temporaryDirectory.appendingPathComponent(fileName)
            try jsonData.write(to: tempURL)
            exportedFileURL = tempURL
            showShareSheet = true
        } catch {
            exportError = "\(locale.t("operator.exportError")): \(error.localizedDescription)"
        }
        isExporting = false
    }

    // MARK: - Notification Settings

    private func loadNotificationSettings() async {
        guard let token else { return }
        isLoadingNotificationSettings = true
        notificationSettingsError = nil
        defer {
            isLoadingNotificationSettings = false
            hasLoadedNotificationSettings = true
        }

        do {
            let settings = try await appState.apiClient.getOperatorNotificationSettings(
                gameId: game.id,
                token: token
            )
            notifyPendingSubmissions = settings.notifyPendingSubmissions
            notifyAllSubmissions = settings.notifyAllSubmissions
            notifyCheckIns = settings.notifyCheckIns
        } catch {
            notificationSettingsError = error.localizedDescription
        }
    }

    private func saveNotificationSettings() {
        guard let token else { return }
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
                    token: token
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

// MARK: - Share Sheet

private struct ShareSheet: UIViewControllerRepresentable {
    let activityItems: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: activityItems, applicationActivities: nil)
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}
