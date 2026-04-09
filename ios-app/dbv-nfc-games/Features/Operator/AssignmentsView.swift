import SwiftUI

/// Full Assignments CRUD screen for the operator.
/// Shows all assignments grouped by base, with a create sheet and delete confirmation.
struct AssignmentsView: View {
    @Environment(AppState.self) private var appState
    @Environment(LocaleManager.self) private var locale

    let game: Game
    var onDismiss: (() -> Void)? = nil

    @State private var bases: [Base] = []
    @State private var challenges: [Challenge] = []
    @State private var teams: [Team] = []
    @State private var assignments: [Assignment] = []
    @State private var isLoading = true
    @State private var showCreateSheet = false
    @State private var deleteTarget: UUID? = nil
    @State private var isDeleting = false
    @State private var errorMessage: String?

    private var token: String? {
        if case .userOperator(let token, _, _) = appState.authType { return token }
        return nil
    }

    // Assignments grouped by baseId, preserving base order
    private var assignmentsByBase: [(base: Base, assignments: [Assignment])] {
        let assignableBases = bases.filter { $0.fixedChallengeId == nil }
        return assignableBases.map { base in
            let baseAssignments = assignments.filter { $0.baseId == base.id }
            return (base: base, assignments: baseAssignments)
        }
    }

    private var challengeById: [UUID: Challenge] {
        Dictionary(uniqueKeysWithValues: challenges.map { ($0.id, $0) })
    }

    private var teamById: [UUID: Team] {
        Dictionary(uniqueKeysWithValues: teams.map { ($0.id, $0) })
    }

    var body: some View {
        NavigationStack {
            Group {
                if isLoading {
                    ProgressView(locale.t("operator.loading"))
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if assignments.isEmpty && bases.isEmpty {
                    ContentUnavailableView(
                        locale.t("operator.assignments"),
                        systemImage: "link.badge.plus",
                        description: Text(locale.t("operator.noAssignmentsDesc"))
                    )
                } else {
                    list
                }
            }
            .navigationTitle(locale.t("operator.assignments"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                if let onDismiss {
                    ToolbarItem(placement: .cancellationAction) {
                        Button { onDismiss() } label: { Image(systemName: "xmark") }
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showCreateSheet = true
                    } label: {
                        Image(systemName: "plus")
                    }
                    .accessibilityIdentifier("create-assignment-btn")
                }
            }
            .sheet(isPresented: $showCreateSheet) {
                AssignmentCreateSheet(
                    game: game,
                    bases: bases.filter { $0.fixedChallengeId == nil },
                    challenges: challenges,
                    teams: teams,
                    existingAssignments: assignments
                ) { newAssignment in
                    assignments.append(newAssignment)
                }
            }
            .alert(locale.t("operator.deleteAssignmentTitle"), isPresented: Binding(
                get: { deleteTarget != nil },
                set: { if !$0 { deleteTarget = nil } }
            )) {
                Button(locale.t("common.delete"), role: .destructive) {
                    if let id = deleteTarget {
                        Task { await performDelete(assignmentId: id) }
                    }
                }
                Button(locale.t("common.cancel"), role: .cancel) { deleteTarget = nil }
            } message: {
                Text(locale.t("operator.deleteAssignmentMessage"))
            }
            .task { await loadData() }
            .refreshable { await loadData() }
        }
    }

    private var list: some View {
        List {
            if let errorMessage {
                Section {
                    Text(errorMessage)
                        .foregroundStyle(.red)
                        .font(.caption)
                }
            }

            // Summary row
            Section {
                HStack {
                    Label("\(assignments.count)", systemImage: "link")
                    Spacer()
                    Text(locale.t("operator.assignments"))
                        .foregroundStyle(.secondary)
                        .font(.caption)
                }
            }

            ForEach(assignmentsByBase, id: \.base.id) { group in
                if !group.assignments.isEmpty {
                    Section {
                        ForEach(group.assignments) { assignment in
                            AssignmentRow(
                                assignment: assignment,
                                challenge: challengeById[assignment.challengeId],
                                team: assignment.teamId.flatMap { teamById[$0] },
                                locale: locale,
                                onDelete: {
                                    deleteTarget = assignment.id
                                }
                            )
                        }
                    } header: {
                        Text(group.base.name)
                            .font(.subheadline)
                            .fontWeight(.semibold)
                    }
                }
            }

            // Bases with no assignments
            let unassigned = assignmentsByBase.filter { $0.assignments.isEmpty }
            if !unassigned.isEmpty {
                Section(locale.t("operator.basesWithNoAssignments")) {
                    ForEach(unassigned, id: \.base.id) { group in
                        HStack {
                            Text(group.base.name)
                                .foregroundStyle(.secondary)
                            Spacer()
                            Image(systemName: "exclamationmark.triangle")
                                .foregroundStyle(.orange)
                                .font(.caption)
                        }
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
    }

    private func loadData() async {
        guard let token else { return }
        isLoading = true
        errorMessage = nil
        do {
            async let basesResult = appState.apiClient.getGameBases(gameId: game.id, token: token)
            async let challengesResult = appState.apiClient.getChallenges(gameId: game.id, token: token)
            async let teamsResult = appState.apiClient.getTeams(gameId: game.id, token: token)
            async let assignmentsResult = appState.apiClient.getAssignments(gameId: game.id, token: token)
            let (b, c, t, a) = try await (basesResult, challengesResult, teamsResult, assignmentsResult)
            bases = b
            challenges = c
            teams = t
            assignments = a
        } catch is CancellationError {
            // Task cancelled during navigation — not an error
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    private func performDelete(assignmentId: UUID) async {
        guard let token else { return }
        isDeleting = true
        do {
            try await appState.apiClient.deleteAssignment(gameId: game.id, assignmentId: assignmentId, token: token)
            assignments.removeAll { $0.id == assignmentId }
        } catch {
            errorMessage = error.localizedDescription
        }
        isDeleting = false
        deleteTarget = nil
    }
}

// MARK: - Assignment Row

private struct AssignmentRow: View {
    let assignment: Assignment
    let challenge: Challenge?
    let team: Team?
    let locale: LocaleManager
    let onDelete: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text(challenge?.title ?? "?")
                    .font(.body)
                HStack(spacing: 6) {
                    if let team {
                        Circle()
                            .fill(Color(hex: team.color) ?? .blue)
                            .frame(width: 10, height: 10)
                        Text(team.name)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    } else {
                        Text(locale.t("common.allTeams"))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    if let pts = challenge?.points {
                        Text("· \(pts) \(locale.t("common.pts"))")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            Spacer()
            Button(role: .destructive) {
                onDelete()
            } label: {
                Image(systemName: "trash")
                    .font(.caption)
                    .foregroundStyle(.red)
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("delete-assignment-btn")
        }
        .accessibilityIdentifier("assignment-row")
    }
}

// MARK: - Create Sheet

private struct AssignmentCreateSheet: View {
    @Environment(AppState.self) private var appState
    @Environment(LocaleManager.self) private var locale
    @Environment(\.dismiss) private var dismiss

    let game: Game
    let bases: [Base]
    let challenges: [Challenge]
    let teams: [Team]
    let existingAssignments: [Assignment]
    var onCreated: (Assignment) -> Void

    @State private var selectedBaseId: UUID? = nil
    @State private var selectedChallengeId: UUID? = nil
    @State private var selectedTeamId: UUID? = nil  // nil = all teams
    @State private var isSaving = false
    @State private var errorMessage: String?

    private var token: String? {
        if case .userOperator(let token, _, _) = appState.authType { return token }
        return nil
    }

    // Challenges not tied to a fixed base
    private var assignableChallenges: [Challenge] {
        let fixedIds = Set(bases.compactMap { $0.fixedChallengeId })
        return challenges.filter { !fixedIds.contains($0.id) }
    }

    // For the selected base, which team slots are already taken
    private var assignedTeamIds: Set<UUID> {
        guard let baseId = selectedBaseId else { return [] }
        return Set(existingAssignments.filter { $0.baseId == baseId }.compactMap { $0.teamId })
    }

    private var hasAllTeamsAssignment: Bool {
        guard let baseId = selectedBaseId else { return false }
        return existingAssignments.contains { $0.baseId == baseId && $0.teamId == nil }
    }

    // Whether "all teams" is the only option (no existing assignments for this base)
    private var showAllTeamsOption: Bool {
        guard let baseId = selectedBaseId else { return true }
        return existingAssignments.filter { $0.baseId == baseId }.isEmpty
    }

    private var availableTeams: [Team] {
        teams.filter { !assignedTeamIds.contains($0.id) }
    }

    private var canSave: Bool {
        selectedBaseId != nil
            && selectedChallengeId != nil
            && !isSaving
            && !hasAllTeamsAssignment
    }

    var body: some View {
        NavigationStack {
            Form {
                Section(locale.t("operator.base")) {
                    Picker(locale.t("operator.selectBase"), selection: $selectedBaseId) {
                        Text(locale.t("operator.selectBase")).tag(UUID?.none)
                        ForEach(bases) { base in
                            Text(base.name).tag(Optional(base.id))
                        }
                    }
                    .accessibilityIdentifier("assignment-base-picker")
                    .onChange(of: selectedBaseId) { _, _ in
                        // Reset team selection when base changes
                        selectedTeamId = nil
                    }
                }

                Section(locale.t("common.challenge")) {
                    Picker(locale.t("operator.selectChallenge"), selection: $selectedChallengeId) {
                        Text(locale.t("operator.selectChallenge")).tag(UUID?.none)
                        ForEach(assignableChallenges) { challenge in
                            Text("\(challenge.title) (\(challenge.points) \(locale.t("common.pts")))")
                                .tag(Optional(challenge.id))
                        }
                    }
                    .accessibilityIdentifier("assignment-challenge-picker")
                }

                Section(locale.t("common.team")) {
                    Picker(
                        showAllTeamsOption ? locale.t("common.allTeams") : locale.t("operator.selectTeam"),
                        selection: $selectedTeamId
                    ) {
                        if showAllTeamsOption {
                            Text(locale.t("common.allTeams")).tag(UUID?.none)
                        }
                        ForEach(availableTeams) { team in
                            HStack {
                                Circle()
                                    .fill(Color(hex: team.color) ?? .blue)
                                    .frame(width: 12, height: 12)
                                Text(team.name)
                            }
                            .tag(Optional(team.id))
                        }
                    }
                    .accessibilityIdentifier("assignment-team-picker")

                    if hasAllTeamsAssignment {
                        Text(locale.t("operator.assignmentLockedAllTeams"))
                            .font(.caption)
                            .foregroundStyle(.secondary)
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
            .navigationTitle(locale.t("operator.newAssignment"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(locale.t("common.cancel")) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isSaving ? locale.t("common.saving") : locale.t("operator.assign")) {
                        Task { await save() }
                    }
                    .disabled(!canSave)
                    .accessibilityIdentifier("assignment-save-btn")
                }
            }
        }
    }

    private func save() async {
        guard let token, let baseId = selectedBaseId, let challengeId = selectedChallengeId else { return }
        isSaving = true
        errorMessage = nil
        let request = CreateAssignmentRequest(
            baseId: baseId,
            challengeId: challengeId,
            teamId: selectedTeamId
        )
        do {
            let created = try await appState.apiClient.createAssignment(gameId: game.id, request: request, token: token)
            onCreated(created)
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
        isSaving = false
    }
}
