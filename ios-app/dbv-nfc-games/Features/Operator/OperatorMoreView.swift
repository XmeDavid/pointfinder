import SwiftUI

struct OperatorMoreView: View {
    @Environment(AppState.self) private var appState
    @Environment(LocaleManager.self) private var locale
    @Environment(AppearanceManager.self) private var appearance

    let game: Game
    let onBack: () -> Void
    var selectedOrg: OrgWorkspace? = nil

    @State private var isExporting = false
    @State private var exportError: String?
    @State private var exportedFileURL: URL?
    @State private var showShareSheet = false

    @State private var showBases = false
    @State private var showChallenges = false
    @State private var showTeams = false
    @State private var showStages = false
    @State private var showAssignments = false
    @State private var showManageTags = false
    @State private var showActivity = false

    @State private var showDeleteAccountAlert = false
    @State private var isDeletingAccount = false
    @State private var deleteAccountError: String?

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
            ScrollView {
                VStack(spacing: 20) {
                    gameSection
                    managementSection
                    preferencesSection
                    notificationsSection
                    accountSection
                }
                .padding(.horizontal, PFSpacing.screenPadding)
                .padding(.vertical, 12)
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
            .fullScreenCover(isPresented: $showBases) {
                BasesManagementView(game: game, onDismiss: { showBases = false })
            }
            .fullScreenCover(isPresented: $showChallenges) {
                ChallengesManagementView(game: game, onDismiss: { showChallenges = false })
            }
            .fullScreenCover(isPresented: $showTeams) {
                TeamsManagementView(game: game, onDismiss: { showTeams = false })
            }
            .fullScreenCover(isPresented: $showStages) {
                StagesManagementView(game: game, onDismiss: { showStages = false })
            }
            .fullScreenCover(isPresented: $showAssignments) {
                AssignmentsView(game: game, onDismiss: { showAssignments = false })
            }
            .fullScreenCover(isPresented: $showActivity) {
                ActivityLogView(game: game, onDismiss: { showActivity = false })
            }
            .fullScreenCover(isPresented: $showManageTags) {
                ManageTagsView(game: game, onDismiss: { showManageTags = false })
            }
            .alert(locale.t("settings.deleteAccountConfirmTitle"), isPresented: $showDeleteAccountAlert) {
                Button(locale.t("settings.deleteAccountConfirm"), role: .destructive) {
                    Task { await deleteOperatorAccount() }
                }
                Button(locale.t("common.cancel"), role: .cancel) {}
            } message: {
                Text(locale.t("settings.deleteAccountConfirmMessage"))
            }
        }
    }

    // MARK: - Sections

    private var gameSection: some View {
        MoreSection(title: "GAME") {
            NavigationLink {
                GameSettingsView(game: game, onGameDeleted: onBack)
            } label: {
                MoreRowContent(icon: "gearshape", label: locale.t("operator.gameSettings"))
            }
            .buttonStyle(.plain)

            MoreDivider()

            NavigationLink {
                NotificationsManagementView(game: game)
            } label: {
                MoreRowContent(icon: "bell.badge", label: locale.t("operator.notifications"))
            }
            .buttonStyle(.plain)

            MoreDivider()

            NavigationLink {
                OperatorsManagementView(game: game)
            } label: {
                MoreRowContent(icon: "person.2", label: locale.t("operator.operators"))
            }
            .buttonStyle(.plain)

            if let org = selectedOrg {
                MoreDivider()

                NavigationLink {
                    OrganizationView(org: org)
                } label: {
                    MoreRowContent(icon: "building.2", label: "Organization: \(org.name)")
                }
                .buttonStyle(.plain)
            }
        }
    }

    private var managementSection: some View {
        MoreSection(title: locale.t("operator.manage").uppercased()) {
            MoreRow(icon: "mappin.and.ellipse", label: locale.t("operator.bases")) {
                showBases = true
            }

            MoreDivider()

            MoreRow(icon: "puzzlepiece", label: locale.t("operator.challenges")) {
                showChallenges = true
            }

            MoreDivider()

            MoreRow(icon: "person.3", label: locale.t("operator.teams")) {
                showTeams = true
            }

            MoreDivider()

            MoreRow(icon: "list.number", label: "Stages") {
                showStages = true
            }

            MoreDivider()

            MoreRow(icon: "link", label: locale.t("operator.assignments")) {
                showAssignments = true
            }
            .accessibilityIdentifier("nav-assignments-btn")

            MoreDivider()

            MoreRow(icon: "clock.arrow.circlepath", label: locale.t("operator.activity.title")) {
                showActivity = true
            }

            MoreDivider()

            MoreRow(icon: "tag", label: locale.t("tags.manage")) {
                showManageTags = true
            }

            MoreDivider()

            MoreRow(
                icon: isExporting ? "arrow.clockwise" : "square.and.arrow.up",
                label: isExporting ? locale.t("operator.exporting") : locale.t("operator.exportGame"),
                isLoading: isExporting
            ) {
                Task { await exportGame() }
            }
            .disabled(isExporting)
            .accessibilityIdentifier("game-export-btn")

            if let exportError {
                Text(exportError)
                    .foregroundStyle(.red)
                    .font(.caption)
                    .padding(.horizontal, 12)
                    .padding(.bottom, 8)
            }
        }
    }

    private var preferencesSection: some View {
        MoreSection(title: locale.t("operator.appSettings").uppercased()) {
            HStack(spacing: 12) {
                Image(systemName: "globe")
                    .font(.body)
                    .foregroundStyle(Color.pfPrimary)
                    .frame(width: 32, height: 32)
                    .background(Color.pfPrimary.opacity(0.1))
                    .clipShape(RoundedRectangle(cornerRadius: 8))

                Text(locale.t("settings.language"))
                    .font(.subheadline)
                    .foregroundStyle(.pfText)

                Spacer()

                Picker("", selection: Binding(
                    get: { locale.currentLanguage },
                    set: { locale.setLanguage($0) }
                )) {
                    Text("English").tag("en")
                    Text("Portugu\u{00EA}s").tag("pt")
                    Text("Deutsch").tag("de")
                }
                .labelsHidden()
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)

            MoreDivider()

            HStack(spacing: 12) {
                Image(systemName: "moon.circle")
                    .font(.body)
                    .foregroundStyle(Color.pfPrimary)
                    .frame(width: 32, height: 32)
                    .background(Color.pfPrimary.opacity(0.1))
                    .clipShape(RoundedRectangle(cornerRadius: 8))

                Text(locale.t("settings.theme"))
                    .font(.subheadline)
                    .foregroundStyle(.pfText)

                Spacer()

                @Bindable var appearance = appearance
                Picker("", selection: $appearance.preferredTheme) {
                    Text(locale.t("settings.themeSystem")).tag("system")
                    Text(locale.t("settings.themeLight")).tag("light")
                    Text(locale.t("settings.themeDark")).tag("dark")
                }
                .labelsHidden()
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
        }
    }

    private var notificationsSection: some View {
        MoreSection(title: locale.t("operator.notificationSettings").uppercased()) {
            if isLoadingNotificationSettings && !hasLoadedNotificationSettings {
                HStack {
                    ProgressView(locale.t("operator.loading"))
                        .font(.subheadline)
                    Spacer()
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 10)
            } else {
                MoreToggleRow(
                    icon: "bell.badge",
                    label: locale.t("operator.notifyPendingSubmissions"),
                    isOn: Binding(
                        get: { notifyPendingSubmissions },
                        set: { newValue in
                            notifyPendingSubmissions = newValue
                            saveNotificationSettings()
                        }
                    )
                )
                .disabled(isSavingNotificationSettings)

                MoreDivider()

                MoreToggleRow(
                    icon: "bell",
                    label: locale.t("operator.notifyAllSubmissions"),
                    isOn: Binding(
                        get: { notifyAllSubmissions },
                        set: { newValue in
                            notifyAllSubmissions = newValue
                            saveNotificationSettings()
                        }
                    )
                )
                .disabled(isSavingNotificationSettings)

                MoreDivider()

                MoreToggleRow(
                    icon: "figure.walk",
                    label: locale.t("operator.notifyCheckIns"),
                    isOn: Binding(
                        get: { notifyCheckIns },
                        set: { newValue in
                            notifyCheckIns = newValue
                            saveNotificationSettings()
                        }
                    )
                )
                .disabled(isSavingNotificationSettings)

                if isSavingNotificationSettings {
                    HStack {
                        ProgressView()
                            .scaleEffect(0.8)
                        Text(locale.t("common.saving"))
                            .font(.caption)
                            .foregroundStyle(.pfTextMuted)
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                }

                if let notificationSettingsError {
                    Text(notificationSettingsError)
                        .font(.caption)
                        .foregroundStyle(.red)
                        .padding(.horizontal, 12)
                        .padding(.bottom, 8)
                }
            }
        }
    }

    private var accountSection: some View {
        MoreSection(title: locale.t("operator.account").uppercased()) {
            Link(destination: AppConfiguration.privacyPolicyLink) {
                MoreRowContent(icon: "hand.raised", label: locale.t("settings.privacyPolicy"))
            }
            .foregroundStyle(.primary)

            MoreDivider()

            MoreRow(icon: "arrow.left.circle", label: locale.t("operator.switchGame")) {
                onBack()
            }

            MoreDivider()

            MoreRow(icon: "rectangle.portrait.and.arrow.right", label: locale.t("operator.logout"), role: .destructive) {
                Task { await appState.logout() }
            }

            MoreDivider()

            MoreRow(
                icon: isDeletingAccount ? "arrow.clockwise" : "person.crop.circle.badge.minus",
                label: isDeletingAccount ? locale.t("settings.deletingAccount") : locale.t("settings.deleteAccount"),
                role: .destructive,
                isLoading: isDeletingAccount
            ) {
                showDeleteAccountAlert = true
            }
            .disabled(isDeletingAccount)

            if let deleteAccountError {
                Text(deleteAccountError)
                    .foregroundStyle(.red)
                    .font(.caption)
                    .padding(.horizontal, 12)
                    .padding(.bottom, 8)
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

    // MARK: - Delete Account

    private func deleteOperatorAccount() async {
        guard let token else { return }
        isDeletingAccount = true
        deleteAccountError = nil
        do {
            try await appState.apiClient.deleteOperatorAccount(token: token)
            await appState.logout()
        } catch {
            deleteAccountError = error.localizedDescription
            isDeletingAccount = false
        }
    }
}

// MARK: - Section Container

private struct MoreSection<Content: View>: View {
    let title: String
    @ViewBuilder let content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.caption)
                .fontWeight(.semibold)
                .foregroundStyle(.pfTextMuted)
                .padding(.leading, 4)

            VStack(spacing: 0) {
                content()
            }
            .background(Color.pfCard)
            .clipShape(RoundedRectangle(cornerRadius: PFRadius.card))
            .shadow(color: .black.opacity(0.03), radius: 4, y: 1)
        }
    }
}

// MARK: - Row Helpers

private struct MoreRow: View {
    let icon: String
    let label: String
    var role: ButtonRole? = nil
    var isLoading: Bool = false
    let action: () -> Void

    var body: some View {
        Button(role: role, action: action) {
            MoreRowContent(icon: icon, label: label, role: role, isLoading: isLoading)
        }
    }
}

private struct MoreRowContent: View {
    let icon: String
    let label: String
    var role: ButtonRole? = nil
    var isLoading: Bool = false

    private var labelColor: Color {
        role == .destructive ? Color.pfRejected : Color.pfText
    }

    private var iconColor: Color {
        role == .destructive ? Color.pfRejected : Color.pfPrimary
    }

    private var iconBgColor: Color {
        role == .destructive ? Color.pfRejected.opacity(0.1) : Color.pfPrimary.opacity(0.1)
    }

    var body: some View {
        HStack(spacing: 12) {
            if isLoading {
                ProgressView()
                    .frame(width: 32, height: 32)
                    .background(iconBgColor)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
            } else {
                Image(systemName: icon)
                    .font(.body)
                    .foregroundStyle(iconColor)
                    .frame(width: 32, height: 32)
                    .background(iconBgColor)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
            }
            Text(label)
                .font(.subheadline)
                .foregroundStyle(labelColor)
            Spacer()
            Image(systemName: "chevron.right")
                .font(.caption)
                .foregroundStyle(.pfTextMuted)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
    }
}

private struct MoreToggleRow: View {
    let icon: String
    let label: String
    @Binding var isOn: Bool

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.body)
                .foregroundStyle(Color.pfPrimary)
                .frame(width: 32, height: 32)
                .background(Color.pfPrimary.opacity(0.1))
                .clipShape(RoundedRectangle(cornerRadius: 8))

            Toggle(label, isOn: $isOn)
                .font(.subheadline)
                .foregroundStyle(.pfText)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
    }
}

private struct MoreDivider: View {
    var body: some View {
        Divider()
            .padding(.leading, 52)
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
