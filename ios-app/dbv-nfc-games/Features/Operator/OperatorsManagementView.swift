import SwiftUI

struct OperatorsManagementView: View {
    @Environment(AppState.self) private var appState
    @Environment(LocaleManager.self) private var locale

    let game: Game

    @State private var operators: [OperatorUserResponse] = []
    @State private var invites: [InviteResponse] = []
    @State private var isLoading = true
    @State private var showInviteAlert = false
    @State private var inviteEmail = ""
    @State private var isSendingInvite = false
    @State private var errorMessage: String?

    private var token: String? {
        if case .userOperator(let token, _, _) = appState.authType {
            return token
        }
        return nil
    }

    var body: some View {
        List {
            // Current operators
            Section(locale.t("operator.currentOperators")) {
                if isLoading {
                    ProgressView(locale.t("operator.loading"))
                } else if operators.isEmpty {
                    Text(locale.t("operator.noOperators"))
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(operators) { op in
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(op.name)
                                    .font(.body)
                                Text(op.email)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer()
                            Text(op.role.capitalized)
                                .font(.caption)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 3)
                                .background(op.role == "admin" ? Color.blue.opacity(0.15) : Color(.systemGray5))
                                .foregroundStyle(op.role == "admin" ? .blue : .secondary)
                                .clipShape(Capsule())
                        }
                    }
                }
            }

            // Invites
            Section(locale.t("operator.invites")) {
                if isLoading {
                    ProgressView(locale.t("operator.loading"))
                } else if invites.isEmpty {
                    Text(locale.t("operator.noInvites"))
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(invites) { invite in
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(invite.email)
                                    .font(.body)
                                if let date = DateFormatting.parseISO8601(invite.createdAt) {
                                    Text(date, style: .relative)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                            Spacer()
                            Text(invite.status.capitalized)
                                .font(.caption)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 3)
                                .background(statusColor(invite.status).opacity(0.15))
                                .foregroundStyle(statusColor(invite.status))
                                .clipShape(Capsule())
                        }
                    }
                }
            }

            if let errorMessage {
                Section {
                    Text(errorMessage)
                        .foregroundStyle(.red)
                        .font(.caption)
                }
            }
        }
        .navigationTitle(locale.t("operator.operators"))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    inviteEmail = ""
                    showInviteAlert = true
                } label: {
                    Image(systemName: "plus")
                }
            }
        }
        .task {
            await loadData()
        }
        .alert(locale.t("operator.inviteOperator"), isPresented: $showInviteAlert) {
            TextField(locale.t("operator.inviteEmail"), text: $inviteEmail)
                .textInputAutocapitalization(.never)
                .keyboardType(.emailAddress)
            Button(locale.t("operator.send")) {
                Task { await sendInvite() }
            }
            Button(locale.t("common.cancel"), role: .cancel) {}
        }
    }

    // MARK: - Helpers

    private func statusColor(_ status: String) -> Color {
        switch status.lowercased() {
        case "pending": return .orange
        case "accepted": return .green
        case "declined": return .red
        default: return .secondary
        }
    }

    // MARK: - Data Loading

    private func loadData() async {
        guard let token else { return }
        do {
            async let operatorsResult = appState.apiClient.getGameOperators(gameId: game.id, token: token)
            async let invitesResult = appState.apiClient.getGameInvites(gameId: game.id, token: token)
            let (o, i) = try await (operatorsResult, invitesResult)
            operators = o
            invites = i
        } catch {
            appState.setError(error.localizedDescription)
        }
        isLoading = false
    }

    // MARK: - Actions

    private func sendInvite() async {
        guard let token else { return }
        let trimmed = inviteEmail.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        isSendingInvite = true
        errorMessage = nil
        do {
            let newInvite = try await appState.apiClient.createInvite(
                request: InviteRequest(email: trimmed, gameId: game.id),
                token: token
            )
            invites.insert(newInvite, at: 0)
            inviteEmail = ""
        } catch {
            errorMessage = error.localizedDescription
        }
        isSendingInvite = false
    }
}
