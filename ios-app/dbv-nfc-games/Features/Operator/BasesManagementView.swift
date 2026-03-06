import SwiftUI

struct BasesManagementView: View {
    @Environment(AppState.self) private var appState
    @Environment(LocaleManager.self) private var locale

    let game: Game

    @State private var bases: [Base] = []
    @State private var challenges: [Challenge] = []
    @State private var isLoading = true
    @State private var showCreateBase = false

    private var token: String? {
        if case .userOperator(let token, _, _) = appState.authType {
            return token
        }
        return nil
    }

    var body: some View {
        Group {
            if isLoading {
                ProgressView(locale.t("operator.loading"))
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if bases.isEmpty {
                ContentUnavailableView(
                    locale.t("operator.noBases"),
                    systemImage: "mappin.slash",
                    description: Text(locale.t("operator.noBasesDesc"))
                )
            } else {
                List(bases) { base in
                    NavigationLink(value: base.id) {
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
                                    .labelStyle(.iconOnly)
                            }
                            if base.hidden {
                                Image(systemName: "eye.slash")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }
                .listStyle(.plain)
            }
        }
        .navigationTitle(locale.t("operator.bases"))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    showCreateBase = true
                } label: {
                    Image(systemName: "plus")
                }
            }
        }
        .navigationDestination(for: UUID.self) { baseId in
            if let base = bases.first(where: { $0.id == baseId }) {
                BaseEditView(
                    game: game,
                    base: base,
                    challenges: challenges,
                    onSaved: { updatedBase in
                        if let index = bases.firstIndex(where: { $0.id == updatedBase.id }) {
                            bases[index] = updatedBase
                        }
                    },
                    onDeleted: {
                        bases.removeAll { $0.id == baseId }
                    }
                )
            }
        }
        .sheet(isPresented: $showCreateBase) {
            BaseCreateSheet(game: game) { newBase in
                bases.append(newBase)
            }
        }
        .task {
            await loadData()
        }
        .refreshable {
            await loadData()
        }
    }

    private func loadData() async {
        guard let token else { return }
        do {
            async let basesResult = appState.apiClient.getGameBases(gameId: game.id, token: token)
            async let challengesResult = appState.apiClient.getChallenges(gameId: game.id, token: token)
            let (b, c) = try await (basesResult, challengesResult)
            bases = b
            challenges = c
        } catch {
            appState.setError(error.localizedDescription)
        }
        isLoading = false
    }
}

// MARK: - Create Base Sheet

private struct BaseCreateSheet: View {
    @Environment(AppState.self) private var appState
    @Environment(LocaleManager.self) private var locale
    @Environment(\.dismiss) private var dismiss

    let game: Game
    var onCreated: (Base) -> Void

    @State private var name = ""
    @State private var description = ""
    @State private var lat = 47.3769
    @State private var lng = 8.5417
    @State private var isCreating = false
    @State private var errorMessage: String?

    private var token: String? {
        if case .userOperator(let token, _, _) = appState.authType {
            return token
        }
        return nil
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField(locale.t("operator.baseName"), text: $name)
                    TextField(locale.t("operator.baseDescription"), text: $description, axis: .vertical)
                        .lineLimit(2...4)
                }

                Section(locale.t("operator.location")) {
                    HStack {
                        Text(locale.t("operator.latitude"))
                        Spacer()
                        TextField("", value: $lat, format: .number)
                            .keyboardType(.decimalPad)
                            .multilineTextAlignment(.trailing)
                            .frame(width: 120)
                    }
                    HStack {
                        Text(locale.t("operator.longitude"))
                        Spacer()
                        TextField("", value: $lng, format: .number)
                            .keyboardType(.decimalPad)
                            .multilineTextAlignment(.trailing)
                            .frame(width: 120)
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
            .navigationTitle(locale.t("operator.createBase"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(locale.t("common.cancel")) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(locale.t("common.create")) {
                        Task { await createBase() }
                    }
                    .disabled(name.isEmpty || isCreating)
                }
            }
        }
    }

    private func createBase() async {
        guard let token else { return }
        isCreating = true
        errorMessage = nil
        do {
            let base = try await appState.apiClient.createBase(
                gameId: game.id,
                request: CreateBaseRequest(
                    name: name,
                    description: description,
                    lat: lat,
                    lng: lng,
                    fixedChallengeId: nil,
                    requirePresenceToSubmit: false,
                    hidden: false
                ),
                token: token
            )
            onCreated(base)
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
        isCreating = false
    }
}
