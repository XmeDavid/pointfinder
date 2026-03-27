import SwiftUI

struct MyInvitesView: View {
    @Environment(AppState.self) private var appState
    @Environment(LocaleManager.self) private var locale

    @State private var invites: [InviteResponse] = []
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var acceptingIds: Set<UUID> = []

    private var token: String? {
        if case .userOperator(let token, _, _) = appState.authType {
            return token
        }
        return nil
    }

    var body: some View {
        List {
            if isLoading {
                Section {
                    ProgressView()
                        .frame(maxWidth: .infinity)
                }
            } else if invites.isEmpty {
                Section {
                    ContentUnavailableView(
                        "No Pending Invitations",
                        systemImage: "envelope",
                        description: Text("You have no pending game invitations.")
                    )
                }
            } else {
                Section {
                    ForEach(invites) { invite in
                        HStack {
                            VStack(alignment: .leading, spacing: 4) {
                                Text("\(invite.inviterName ?? "Someone") invited you to \(invite.gameName ?? "a game")")
                                    .font(.body)
                                if let createdAt = invite.createdAt,
                                   let date = DateFormatting.parseISO8601(createdAt) {
                                    Text(date, style: .relative)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                            Spacer()
                            Button {
                                Task { await acceptInvite(invite) }
                            } label: {
                                if acceptingIds.contains(invite.id) {
                                    ProgressView()
                                        .frame(width: 60)
                                } else {
                                    Text("Accept")
                                        .fontWeight(.semibold)
                                        .padding(.horizontal, 12)
                                        .padding(.vertical, 6)
                                        .background(Color.blue)
                                        .foregroundStyle(.white)
                                        .clipShape(Capsule())
                                }
                            }
                            .disabled(acceptingIds.contains(invite.id))
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
        .navigationTitle("Invitations")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await loadInvites()
            await startPolling()
        }
    }

    // MARK: - Data Loading

    private func loadInvites() async {
        guard let token else { return }
        do {
            invites = try await appState.apiClient.getMyInvites(token: token)
        } catch is CancellationError {
            // Task cancelled during navigation
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    private func startPolling() async {
        while !Task.isCancelled {
            try? await Task.sleep(for: .seconds(30))
            guard !Task.isCancelled else { break }
            guard let token else { break }
            do {
                invites = try await appState.apiClient.getMyInvites(token: token)
            } catch {
                // Silent poll failure — don't update error message during background refresh
            }
        }
    }

    // MARK: - Actions

    private func acceptInvite(_ invite: InviteResponse) async {
        guard let token else { return }
        acceptingIds.insert(invite.id)
        errorMessage = nil
        do {
            try await appState.apiClient.acceptInvite(inviteId: invite.id, token: token)
            invites.removeAll { $0.id == invite.id }
        } catch {
            errorMessage = error.localizedDescription
        }
        acceptingIds.remove(invite.id)
    }
}
