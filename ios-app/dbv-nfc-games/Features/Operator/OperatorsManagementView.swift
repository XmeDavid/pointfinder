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
    @State private var successMessage: String?
    @State private var operatorToRemove: OperatorUserResponse?
    @State private var inviteToRevoke: InviteResponse?

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
                            Text(locale.t("operator.role.\(op.role)"))
                                .font(.caption)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 3)
                                .background(op.role == "admin" ? Color.blue.opacity(0.15) : Color(.systemGray5))
                                .foregroundStyle(op.role == "admin" ? .blue : .secondary)
                                .clipShape(Capsule())
                        }
                        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                            if op.role != "admin" {
                                Button(role: .destructive) {
                                    operatorToRemove = op
                                } label: {
                                    Label(locale.t("common.remove"), systemImage: "trash")
                                }
                            }
                        }
                    }
                }
            }

            // Invites (pending only)
            Section(locale.t("operator.invites")) {
                if isLoading {
                    ProgressView(locale.t("operator.loading"))
                } else if pendingInvites.isEmpty {
                    Text(locale.t("operator.noInvites"))
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(pendingInvites) { invite in
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(invite.email)
                                    .font(.body)
                                if let createdAt = invite.createdAt, let date = DateFormatting.parseISO8601(createdAt) {
                                    Text(date, style: .relative)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                            Spacer()
                            Text(locale.t("operator.invite.\(invite.status)"))
                                .font(.caption)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 3)
                                .background(statusColor(invite.status).opacity(0.15))
                                .foregroundStyle(statusColor(invite.status))
                                .clipShape(Capsule())
                        }
                        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                            Button(role: .destructive) {
                                inviteToRevoke = invite
                            } label: {
                                Label(locale.t("common.remove"), systemImage: "trash")
                            }
                        }
                    }
                }
            }

            if let successMessage {
                Section {
                    Text(successMessage)
                        .foregroundStyle(.green)
                        .font(.caption)
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
        .alert(locale.t("operator.removeOperator"), isPresented: Binding(
            get: { operatorToRemove != nil },
            set: { if !$0 { operatorToRemove = nil } }
        )) {
            Button(locale.t("common.remove"), role: .destructive) {
                if let op = operatorToRemove {
                    Task { await removeOperator(op) }
                }
            }
            Button(locale.t("common.cancel"), role: .cancel) {}
        } message: {
            Text(locale.t("operator.removeOperatorConfirm", operatorToRemove?.name ?? ""))
        }
        .alert(locale.t("operator.revokeInvite"), isPresented: Binding(
            get: { inviteToRevoke != nil },
            set: { if !$0 { inviteToRevoke = nil } }
        )) {
            Button(locale.t("common.remove"), role: .destructive) {
                if let invite = inviteToRevoke {
                    Task { await revokeInvite(invite) }
                }
            }
            Button(locale.t("common.cancel"), role: .cancel) {}
        } message: {
            Text(locale.t("operator.revokeInviteConfirm", inviteToRevoke?.email ?? ""))
        }
    }

    // MARK: - Computed

    private var pendingInvites: [InviteResponse] {
        invites.filter { $0.status.lowercased() == "pending" }
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
        } catch is CancellationError {
            // Task cancelled during navigation
        } catch {
            appState.setError(error.localizedDescription)
        }
        isLoading = false
    }

    // MARK: - Actions

    private func removeOperator(_ op: OperatorUserResponse) async {
        guard let token else { return }
        do {
            try await appState.apiClient.removeOperator(gameId: game.id, userId: op.id, token: token)
            operators.removeAll { $0.id == op.id }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func revokeInvite(_ invite: InviteResponse) async {
        guard let token else { return }
        do {
            try await appState.apiClient.deleteInvite(inviteId: invite.id, token: token)
            invites.removeAll { $0.id == invite.id }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

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
            successMessage = "Invite sent successfully"
            Task { try? await Task.sleep(for: .seconds(3)); successMessage = nil }
        } catch {
            errorMessage = error.localizedDescription
        }
        isSendingInvite = false
    }
}
