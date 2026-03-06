import SwiftUI

struct TeamVariablesManagementSheet: View {
    @Environment(AppState.self) private var appState
    @Environment(LocaleManager.self) private var locale
    @Environment(\.dismiss) private var dismiss

    let game: Game
    let teams: [Team]

    @State private var variables: [TeamVariable] = []
    @State private var isLoading = true
    @State private var errorMessage: String?

    private var token: String? {
        if case .userOperator(let token, _, _) = appState.authType {
            return token
        }
        return nil
    }

    var body: some View {
        NavigationStack {
            Group {
                if isLoading {
                    ProgressView(locale.t("operator.loading"))
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 16) {
                            TeamVariablesEditorView(
                                teams: teams,
                                initialVariables: variables,
                                onSave: saveVariables
                            )

                            if let errorMessage {
                                Text(errorMessage)
                                    .font(.caption)
                                    .foregroundStyle(.red)
                            }
                        }
                        .padding()
                    }
                }
            }
            .navigationTitle(locale.t("operator.gameVariables"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(locale.t("common.done")) {
                        dismiss()
                    }
                }
            }
        }
        .task {
            await loadVariables()
        }
    }

    private func loadVariables() async {
        guard let token else {
            isLoading = false
            return
        }
        do {
            let response = try await appState.apiClient.getGameVariables(gameId: game.id, token: token)
            variables = normalizedTeamVariables(response.variables, teams: teams)
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    private func saveVariables(_ updatedVariables: [TeamVariable]) async throws -> [TeamVariable] {
        guard let token else { throw APIError.authExpired }
        let request = TeamVariablesRequest(variables: normalizedTeamVariables(updatedVariables, teams: teams))
        let response = try await appState.apiClient.saveGameVariables(gameId: game.id, request: request, token: token)
        let normalized = normalizedTeamVariables(response.variables, teams: teams)
        await MainActor.run {
            variables = normalized
            errorMessage = nil
        }
        return normalized
    }
}
