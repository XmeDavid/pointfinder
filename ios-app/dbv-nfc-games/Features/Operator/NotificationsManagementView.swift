import SwiftUI

struct NotificationsManagementView: View {
    @Environment(AppState.self) private var appState
    @Environment(LocaleManager.self) private var locale

    let game: Game

    @State private var message = ""
    @State private var selectedTeamId: UUID?
    @State private var teams: [Team] = []
    @State private var notifications: [OperatorNotificationResponse] = []
    @State private var isLoading = true
    @State private var isSending = false
    @State private var errorMessage: String?

    private var token: String? {
        if case .userOperator(let token, _, _) = appState.authType {
            return token
        }
        return nil
    }

    var body: some View {
        List {
            // Send section
            Section(locale.t("operator.sendNotification")) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(locale.t("operator.notificationMessage"))
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    TextEditor(text: $message)
                        .frame(minHeight: 80)
                        .accessibilityIdentifier("notification-message-input")
                }

                Picker(locale.t("operator.targetTeam"), selection: $selectedTeamId) {
                    Text(locale.t("operator.allTeams")).tag(nil as UUID?)
                    ForEach(teams) { team in
                        Text(team.name).tag(team.id as UUID?)
                    }
                }

                Button {
                    Task { await sendNotification() }
                } label: {
                    Text(isSending ? locale.t("common.saving") : locale.t("operator.send"))
                        .fontWeight(.semibold)
                        .frame(maxWidth: .infinity)
                }
                .disabled(message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isSending)
                .accessibilityIdentifier("notification-send-btn")

                if let errorMessage {
                    Text(errorMessage)
                        .foregroundStyle(PFColorToken.contentDanger)
                        .font(.caption)
                }
            }

            // History section
            Section(locale.t("operator.notificationHistory")) {
                if isLoading {
                    ProgressView(locale.t("operator.loading"))
                } else if notifications.isEmpty {
                    Text(locale.t("operator.noNotifications"))
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(notifications) { notification in
                        ManagementNotificationRow(
                            message: notification.message,
                            targetLabel: notification.targetTeamId.flatMap { id in teams.first(where: { $0.id == id })?.name } ?? (notification.targetTeamId == nil ? locale.t("operator.allTeams") : locale.t("operator.unknownTeam")),
                            time: DateFormatting.parseISO8601(notification.sentAt)
                        )
                    }
                }
            }
        }
        .navigationTitle(locale.t("operator.notifications"))
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await loadData()
        }
    }

    // MARK: - Data Loading

    private func loadData() async {
        guard let token else { return }
        do {
            async let teamsResult = appState.apiClient.getTeams(gameId: game.id, token: token)
            async let notificationsResult = appState.apiClient.getNotifications(gameId: game.id, token: token)
            let (t, n) = try await (teamsResult, notificationsResult)
            teams = t
            notifications = n
        } catch is CancellationError {
            // Task cancelled during navigation
        } catch {
            appState.setError(error.localizedDescription)
        }
        isLoading = false
    }

    // MARK: - Actions

    private func sendNotification() async {
        guard let token else { return }
        let trimmed = message.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        isSending = true
        errorMessage = nil
        do {
            let newNotification = try await appState.apiClient.sendNotification(
                gameId: game.id,
                request: SendNotificationRequest(message: trimmed, targetTeamId: selectedTeamId),
                token: token
            )
            notifications.insert(newNotification, at: 0)
            message = ""
            selectedTeamId = nil
        } catch {
            errorMessage = error.localizedDescription
        }
        isSending = false
    }
}
