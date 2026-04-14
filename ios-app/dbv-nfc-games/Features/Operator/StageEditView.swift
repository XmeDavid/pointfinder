import SwiftUI

struct StageEditView: View {
    @Environment(AppState.self) private var appState
    @Environment(LocaleManager.self) private var locale
    @Environment(\.dismiss) private var dismiss

    let game: Game
    let stage: Stage?
    let stages: [Stage]
    let bases: [Base]
    var onSaved: (Stage) -> Void
    var onDeleted: (() -> Void)?

    @State private var name: String
    @State private var descriptionText: String
    @State private var transitionType: String
    @State private var scheduledAt: Date
    @State private var triggerBaseId: UUID?
    @State private var isSaving = false
    @State private var showDeleteAlert = false
    @State private var errorMessage: String?

    private var isCreateMode: Bool { stage == nil }

    private var token: String? {
        if case .userOperator(let token, _, _) = appState.authType {
            return token
        }
        return nil
    }

    init(
        game: Game,
        stage: Stage?,
        stages: [Stage],
        bases: [Base],
        onSaved: @escaping (Stage) -> Void,
        onDeleted: (() -> Void)? = nil
    ) {
        self.game = game
        self.stage = stage
        self.stages = stages
        self.bases = bases
        self.onSaved = onSaved
        self.onDeleted = onDeleted

        self._name = State(initialValue: stage?.name ?? "")
        self._descriptionText = State(initialValue: stage?.description ?? "")
        self._transitionType = State(initialValue: stage?.transitionType ?? "manual")
        self._triggerBaseId = State(initialValue: stage?.triggerBaseId)

        // Parse scheduledAt from ISO 8601 string
        if let scheduledStr = stage?.scheduledAt,
           let parsed = ISO8601DateFormatter().date(from: scheduledStr) {
            self._scheduledAt = State(initialValue: parsed)
        } else {
            // Default to one hour from now
            self._scheduledAt = State(initialValue: Date().addingTimeInterval(3600))
        }
    }

    var body: some View {
        Form {
            // MARK: - Basic Info
            Section(locale.t("stages.details")) {
                TextField(locale.t("stages.name"), text: $name)
                    .accessibilityIdentifier("stage-name-field")
                TextField(locale.t("stages.descriptionOptional"), text: $descriptionText)
                    .accessibilityIdentifier("stage-description-field")
            }

            // MARK: - Transition Type
            Section(locale.t("stages.transition")) {
                Picker(locale.t("stages.transition"), selection: $transitionType) {
                    Text(locale.t("stages.manual")).tag("manual")
                    Text(locale.t("stages.scheduled")).tag("scheduled")
                    Text(locale.t("stages.trigger")).tag("trigger")
                }
                .pickerStyle(.segmented)
                .accessibilityIdentifier("stage-transition-type-picker")

                if transitionType == "scheduled" {
                    DatePicker(
                        locale.t("stages.activateAt"),
                        selection: $scheduledAt,
                        displayedComponents: [.date, .hourAndMinute]
                    )
                    .accessibilityIdentifier("stage-scheduled-at-picker")
                }

                if transitionType == "trigger" {
                    Picker(locale.t("stages.triggerBase"), selection: $triggerBaseId) {
                        Text(locale.t("stages.none")).tag(Optional<UUID>.none)
                        ForEach(bases) { base in
                            Text(base.name).tag(Optional(base.id))
                        }
                    }
                    .accessibilityIdentifier("stage-trigger-base-picker")
                }
            }

            // MARK: - Assigned Bases (read-only)
            if let stage, let baseIds = stage.baseIds, !baseIds.isEmpty {
                Section(locale.t("stages.assignedBases")) {
                    ForEach(baseIds, id: \.self) { baseId in
                        if let base = bases.first(where: { $0.id == baseId }) {
                            Text(base.name)
                                .foregroundStyle(.pfText)
                        } else {
                            Text(baseId.uuidString)
                                .font(.caption)
                                .foregroundStyle(.pfTextMuted)
                        }
                    }
                }
            } else if stage != nil {
                Section("Assigned Bases") {
                    Text("No bases assigned to this stage yet. Assign bases via the Base editor.")
                        .font(.caption)
                        .foregroundStyle(.pfTextMuted)
                }
            }

            // MARK: - Error
            if let errorMessage {
                Section {
                    Text(errorMessage)
                        .foregroundStyle(.red)
                        .font(.caption)
                }
            }

            // MARK: - Delete (edit mode only)
            if !isCreateMode {
                Section {
                    Button(role: .destructive) {
                        showDeleteAlert = true
                    } label: {
                        HStack {
                            Spacer()
                            Text("Delete Stage")
                            Spacer()
                        }
                    }
                    .accessibilityIdentifier("stage-delete-btn")
                }
            }
        }
        .navigationTitle(isCreateMode ? "New Stage" : (stage?.name ?? "Stage"))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    Task { await save() }
                } label: {
                    if isSaving {
                        ProgressView()
                    } else {
                        Text("Save")
                            .fontWeight(.semibold)
                    }
                }
                .disabled(isSaving || name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                .accessibilityIdentifier("stage-save-btn")
            }
        }
        .alert("Delete Stage", isPresented: $showDeleteAlert) {
            Button("Delete", role: .destructive) {
                Task { await delete() }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Are you sure you want to delete \"\(stage?.name ?? "this stage")\"? This cannot be undone.")
        }
    }

    // MARK: - Actions

    private func save() async {
        guard let token else { return }
        let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedName.isEmpty else { return }

        isSaving = true
        errorMessage = nil

        let resolvedScheduledAt: String? = transitionType == "scheduled"
            ? ISO8601DateFormatter().string(from: scheduledAt)
            : nil
        let resolvedTriggerBaseId: UUID? = transitionType == "trigger" ? triggerBaseId : nil
        let resolvedDescription: String? = descriptionText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            ? nil
            : descriptionText.trimmingCharacters(in: .whitespacesAndNewlines)

        do {
            let savedStage: Stage
            if let stage {
                let request = UpdateStageRequest(
                    name: trimmedName,
                    description: resolvedDescription,
                    transitionType: transitionType,
                    scheduledAt: resolvedScheduledAt,
                    triggerBaseId: resolvedTriggerBaseId
                )
                savedStage = try await appState.apiClient.updateStage(
                    gameId: game.id,
                    stageId: stage.id,
                    request: request,
                    token: token
                )
            } else {
                let request = CreateStageRequest(
                    name: trimmedName,
                    description: resolvedDescription,
                    transitionType: transitionType,
                    scheduledAt: resolvedScheduledAt,
                    triggerBaseId: resolvedTriggerBaseId
                )
                savedStage = try await appState.apiClient.createStage(
                    gameId: game.id,
                    request: request,
                    token: token
                )
            }
            onSaved(savedStage)
        } catch is CancellationError {
            // Task cancelled (e.g. view dismissed) — ignore
        } catch {
            errorMessage = error.localizedDescription
        }

        isSaving = false
    }

    private func delete() async {
        guard let token, let stage else { return }
        isSaving = true
        do {
            try await appState.apiClient.deleteStage(gameId: game.id, stageId: stage.id, token: token)
            onDeleted?()
            dismiss()
        } catch is CancellationError {
            // ignore
        } catch {
            errorMessage = error.localizedDescription
            isSaving = false
        }
    }
}
