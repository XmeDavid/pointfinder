import SwiftUI
import CoreImage
import CoreImage.CIFilterBuiltins

// MARK: - Constants
private let reasonMaxLength = 500

struct TeamDetailView: View {
    @Environment(AppState.self) private var appState
    @Environment(LocaleManager.self) private var locale
    @Environment(\.dismiss) private var dismiss

    let game: Game
    let team: Team
    var onSaved: (Team) -> Void
    var onDeleted: () -> Void

    @State private var name: String
    @State private var color: String
    @State private var allTeams: [Team] = []
    @State private var players: [PlayerResponse] = []
    @State private var variables: [TeamVariable] = []
    @State private var variableValues: [String: String] = [:]
    @State private var isLoading = true
    @State private var isSaving = false
    @State private var showDeleteAlert = false
    @State private var showQRCode = false
    @State private var showRemovePlayerAlert = false
    @State private var playerToRemove: PlayerResponse?
    @State private var errorMessage: String?
    @State private var showCopiedToast = false
    @State private var showSaveSuccess = false

    // MARK: - Rescue action state
    @State private var bases: [Base] = []
    @State private var progress: [TeamBaseProgressResponse] = []
    @State private var unlockOverrides: [BaseUnlockOverrideResponse] = []

    // Mark-completed sheet
    @State private var markCompletedBase: Base? = nil
    @State private var markCompletedReason: String = ""
    @State private var markCompletedPointsText: String = ""
    @State private var isMarkingCompleted = false
    @State private var showMarkCompletedSheet = false

    // Manual check-in sheet
    @State private var manualCheckInBase: Base? = nil
    @State private var manualCheckInReason: String = ""
    @State private var isCheckingIn = false
    @State private var showManualCheckInSheet = false

    // Unlock override grant sheet
    @State private var unlockOverrideBase: Base? = nil
    @State private var unlockOverrideReason: String = ""
    @State private var isGrantingOverride = false
    @State private var showUnlockOverrideSheet = false

    // Remove override confirmation
    @State private var removeOverrideTarget: BaseUnlockOverrideResponse? = nil
    @State private var showRemoveOverrideAlert = false

    // Toast state — single top-toast slot for rescue actions; separate bottom for copy
    @State private var rescueSuccessMessage: String? = nil
    @State private var rescueToastTask: Task<Void, Never>? = nil

    private let colorOptions = [
        "#ef4444", "#f97316", "#eab308", "#22c55e", "#14b8a6", "#06b6d4",
        "#3b82f6", "#6366f1", "#8b5cf6", "#a855f7", "#ec4899", "#f43f5e"
    ]

    private var token: String? {
        if case .userOperator(let token, _, _) = appState.authType {
            return token
        }
        return nil
    }

    init(game: Game, team: Team, onSaved: @escaping (Team) -> Void, onDeleted: @escaping () -> Void) {
        self.game = game
        self.team = team
        self.onSaved = onSaved
        self.onDeleted = onDeleted
        self._name = State(initialValue: team.name)
        self._color = State(initialValue: team.color)
    }

    var body: some View {
        Form {
            // Name & Color
            Section {
                TextField(locale.t("operator.teamName"), text: $name)
                    .accessibilityIdentifier("team-name-input")
                VStack(alignment: .leading, spacing: 8) {
                    Text(locale.t("operator.teamColor"))
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 12) {
                            ForEach(colorOptions, id: \.self) { hex in
                                Circle()
                                    .fill(Color(hex: hex) ?? .blue)
                                    .frame(width: 36, height: 36)
                                    .overlay {
                                        if color == hex {
                                            Image(systemName: "checkmark")
                                                .font(.caption)
                                                .fontWeight(.bold)
                                                .foregroundStyle(.white)
                                        }
                                    }
                                    .accessibilityLabel(hex)
                                    .accessibilityAddTraits(color == hex ? [.isSelected] : [])
                                    .onTapGesture {
                                        color = hex
                                    }
                            }
                        }
                        .padding(.vertical, 4)
                    }
                }
            }

            // Join Code
            if let joinCode = team.joinCode {
                Section(locale.t("operator.joinCode")) {
                    Text(joinCode)
                        .font(.title2)
                        .fontWeight(.semibold)
                        .fontDesign(.monospaced)
                        .frame(maxWidth: .infinity, alignment: .center)
                        .padding(.vertical, 4)
                        .accessibilityIdentifier("team-join-code")

                    Button {
                        UIPasteboard.general.string = joinCode
                        withAnimation {
                            showCopiedToast = true
                        }
                        DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                            withAnimation {
                                showCopiedToast = false
                            }
                        }
                    } label: {
                        Label(locale.t("operator.copyCode"), systemImage: "doc.on.doc")
                    }

                    Button {
                        showQRCode = true
                    } label: {
                        Label(locale.t("operator.showQR"), systemImage: "qrcode")
                    }
                }
            }

            // Variables
            Section(locale.t("operator.variables")) {
                if isLoading {
                    ProgressView()
                } else if variables.isEmpty {
                    Text(locale.t("operator.noVariables"))
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(variables, id: \.key) { variable in
                        HStack {
                            Text(variable.key)
                                .font(.subheadline)
                            Spacer()
                            TextField("", text: Binding(
                                get: { variableValues[variable.key] ?? "" },
                                set: { variableValues[variable.key] = $0 }
                            ))
                            .multilineTextAlignment(.trailing)
                            .frame(maxWidth: 160)
                        }
                    }
                }
            }

            // Players
            Section(locale.t("operator.players")) {
                if isLoading {
                    ProgressView()
                } else if players.isEmpty {
                    Text(locale.t("operator.noPlayers"))
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(players) { player in
                        HStack {
                            Text(player.displayName)
                            Spacer()
                            Button(role: .destructive) {
                                playerToRemove = player
                                showRemovePlayerAlert = true
                            } label: {
                                Image(systemName: "person.badge.minus")
                                    .font(.caption)
                                    .foregroundStyle(.red)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }

            // Base Progress & Rescue Actions
            Section(locale.t("teamDetail.baseProgress")) {
                if isLoading {
                    ProgressView()
                } else if bases.isEmpty {
                    Text(locale.t("teamDetail.noBases"))
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(bases) { base in
                        BaseProgressRow(
                            base: base,
                            progress: progress.first { $0.baseId == base.id },
                            override: unlockOverrides.first { $0.baseId == base.id },
                            locale: locale,
                            onMarkCompleted: {
                                markCompletedBase = base
                                markCompletedReason = ""
                                markCompletedPointsText = ""
                                showMarkCompletedSheet = true
                            },
                            onManualCheckIn: {
                                manualCheckInBase = base
                                manualCheckInReason = ""
                                showManualCheckInSheet = true
                            },
                            onGrantOverride: {
                                unlockOverrideBase = base
                                unlockOverrideReason = ""
                                showUnlockOverrideSheet = true
                            },
                            onRemoveOverride: { override in
                                removeOverrideTarget = override
                                showRemoveOverrideAlert = true
                            }
                        )
                    }
                }
            }

            // Save button
            Section {
                Button {
                    Task { await save() }
                } label: {
                    Text(isSaving ? locale.t("common.saving") : locale.t("operator.save"))
                        .fontWeight(.semibold)
                        .frame(maxWidth: .infinity)
                }
                .disabled(name.isEmpty || isSaving)
                .accessibilityIdentifier("team-save-btn")
            }

            if let errorMessage {
                Section {
                    Text(errorMessage)
                        .foregroundStyle(.red)
                        .font(.caption)
                }
            }

            // Delete
            Section {
                Button(role: .destructive) {
                    showDeleteAlert = true
                } label: {
                    Label(locale.t("operator.deleteTeam"), systemImage: "trash")
                        .frame(maxWidth: .infinity)
                }
                .accessibilityIdentifier("team-delete-btn")
            }
        }
        .navigationTitle(team.name)
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await loadData()
        }
        .alert(locale.t("operator.deleteTeamConfirmTitle"), isPresented: $showDeleteAlert) {
            Button(locale.t("operator.delete"), role: .destructive) {
                Task { await deleteTeam() }
            }
            Button(locale.t("common.cancel"), role: .cancel) {}
        } message: {
            Text(locale.t("common.cannotUndo"))
        }
        .alert(locale.t("operator.removePlayer"), isPresented: $showRemovePlayerAlert) {
            Button(locale.t("operator.removePlayer"), role: .destructive) {
                if let player = playerToRemove {
                    Task { await removePlayer(player) }
                }
            }
            Button(locale.t("common.cancel"), role: .cancel) {
                playerToRemove = nil
            }
        } message: {
            Text(locale.t("operator.removePlayerConfirm"))
        }
        .alert(locale.t("teamDetail.unlockOverrideRemoveConfirmTitle"), isPresented: $showRemoveOverrideAlert) {
            Button(locale.t("teamDetail.unlockOverrideRemove"), role: .destructive) {
                if let override = removeOverrideTarget {
                    Task { await removeUnlockOverride(override) }
                }
            }
            Button(locale.t("common.cancel"), role: .cancel) {
                removeOverrideTarget = nil
            }
        } message: {
            if let override = removeOverrideTarget,
               let base = bases.first(where: { $0.id == override.baseId }) {
                Text(String(format: locale.t("teamDetail.unlockOverrideRemoveConfirmDescription"), base.name))
            } else {
                Text(locale.t("teamDetail.unlockOverrideRemoveConfirmDescription"))
            }
        }
        .sheet(isPresented: $showQRCode) {
            QRCodeSheet(joinCode: team.joinCode ?? "", teamName: team.name)
        }
        .sheet(isPresented: $showMarkCompletedSheet) {
            MarkCompletedSheet(
                base: markCompletedBase,
                reason: $markCompletedReason,
                pointsText: $markCompletedPointsText,
                isSubmitting: isMarkingCompleted,
                locale: locale,
                onConfirm: {
                    Task { await markCompleted() }
                }
            )
            .presentationDetents([.medium])
        }
        .sheet(isPresented: $showManualCheckInSheet) {
            ManualCheckInSheet(
                base: manualCheckInBase,
                reason: $manualCheckInReason,
                isSubmitting: isCheckingIn,
                locale: locale,
                onConfirm: {
                    Task { await performManualCheckIn() }
                }
            )
            .presentationDetents([.medium])
        }
        .sheet(isPresented: $showUnlockOverrideSheet) {
            UnlockOverrideSheet(
                base: unlockOverrideBase,
                reason: $unlockOverrideReason,
                isSubmitting: isGrantingOverride,
                locale: locale,
                onConfirm: {
                    Task { await grantUnlockOverride() }
                }
            )
            .presentationDetents([.medium])
        }
        // Bottom toast: copy confirmation
        .overlay(alignment: .bottom) {
            if showCopiedToast {
                Text(locale.t("operator.copied"))
                    .font(.subheadline)
                    .fontWeight(.medium)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .background(.ultraThinMaterial)
                    .clipShape(Capsule())
                    .padding(.bottom, 20)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        // Top toast: save success OR rescue action success (single overlay)
        .overlay(alignment: .top) {
            if showSaveSuccess || rescueSuccessMessage != nil {
                let msg = rescueSuccessMessage ?? locale.t("common.saved")
                Text(msg)
                    .font(.subheadline)
                    .fontWeight(.medium)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .background(.green.opacity(0.9))
                    .foregroundStyle(.white)
                    .clipShape(Capsule())
                    .transition(.move(edge: .top).combined(with: .opacity))
                    .onAppear {
                        if showSaveSuccess && rescueSuccessMessage == nil {
                            DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                                withAnimation { showSaveSuccess = false }
                            }
                        }
                    }
                    .padding(.top, 8)
            }
        }
        .animation(.easeInOut, value: showSaveSuccess)
        .animation(.easeInOut, value: rescueSuccessMessage)
    }

    // MARK: - Data Loading

    private func loadData() async {
        guard let token else { return }
        do {
            async let playersResult = appState.apiClient.getTeamPlayers(gameId: game.id, teamId: team.id, token: token)
            async let variablesResult = appState.apiClient.getGameVariables(gameId: game.id, token: token)
            async let teamsResult = appState.apiClient.getTeams(gameId: game.id, token: token)
            async let basesResult = appState.apiClient.getGameBases(gameId: game.id, token: token)
            async let progressResult = appState.apiClient.getTeamProgress(gameId: game.id, token: token)
            async let overridesResult = appState.apiClient.listUnlockOverrides(gameId: game.id, teamId: team.id, token: token)
            let (p, v, teams, b, prog, overrides) = try await (playersResult, variablesResult, teamsResult, basesResult, progressResult, overridesResult)
            allTeams = teams
            players = p
            variables = normalizedTeamVariables(v.variables, teams: teams)
            bases = b
            progress = prog.filter { $0.teamId == team.id }
            unlockOverrides = overrides
            // Initialize variable values for this team
            for variable in variables {
                variableValues[variable.key] = variable.teamValues[team.id.uuidString.lowercased()] ?? ""
            }
        } catch is CancellationError {
            // Task cancelled during navigation
        } catch {
            appState.setError(error.localizedDescription)
        }
        isLoading = false
    }

    // MARK: - Actions

    private func save() async {
        guard let token else { return }
        isSaving = true
        errorMessage = nil
        do {
            let updatedTeam = try await appState.apiClient.updateTeam(
                gameId: game.id,
                teamId: team.id,
                request: UpdateTeamRequest(name: name, color: color),
                token: token
            )

            // Save variables if any exist
            if !variables.isEmpty {
                let updatedVariables = normalizedTeamVariables(variables, teams: allTeams).map { variable in
                    var teamValues = variable.teamValues
                    teamValues[team.id.uuidString.lowercased()] = variableValues[variable.key] ?? ""
                    return TeamVariable(key: variable.key, teamValues: teamValues)
                }
                _ = try await appState.apiClient.saveGameVariables(
                    gameId: game.id,
                    request: TeamVariablesRequest(variables: updatedVariables),
                    token: token
                )
            }

            withAnimation { showSaveSuccess = true }
            onSaved(updatedTeam)
        } catch {
            errorMessage = error.localizedDescription
        }
        isSaving = false
    }

    private func deleteTeam() async {
        guard let token else { return }
        do {
            try await appState.apiClient.deleteTeam(gameId: game.id, teamId: team.id, token: token)
            onDeleted()
            dismiss()
        } catch is CancellationError {
            // Task cancelled during navigation
        } catch {
            appState.setError(error.localizedDescription)
        }
    }

    private func removePlayer(_ player: PlayerResponse) async {
        guard let token else { return }
        do {
            try await appState.apiClient.removePlayer(gameId: game.id, teamId: team.id, playerId: player.id, token: token)
            players.removeAll { $0.id == player.id }
        } catch is CancellationError {
            // Task cancelled during navigation
        } catch {
            appState.setError(error.localizedDescription)
        }
        playerToRemove = nil
    }

    // Resolve a challengeId for a base: prefer live progress, fall back to base.fixedChallengeId
    private func challengeIdForBase(_ base: Base) -> UUID? {
        if let prog = progress.first(where: { $0.baseId == base.id }), let cid = prog.challengeId {
            return cid
        }
        if let fixedId = base.fixedChallengeId {
            return fixedId
        }
        return nil
    }

    private func markCompleted() async {
        guard let token, let base = markCompletedBase else { return }
        guard let challengeId = challengeIdForBase(base) else {
            appState.setError(locale.t("teamDetail.noChallengeForBase"))
            showMarkCompletedSheet = false
            return
        }
        isMarkingCompleted = true
        let pointsOverride = Int(markCompletedPointsText.trimmingCharacters(in: .whitespaces))
        let reason = markCompletedReason.trimmingCharacters(in: .whitespaces)
        do {
            _ = try await appState.apiClient.markCompleted(
                gameId: game.id,
                teamId: team.id,
                baseId: base.id,
                request: MarkCompletedRequest(
                    challengeId: challengeId,
                    reason: reason.isEmpty ? nil : String(reason.prefix(reasonMaxLength)),
                    pointsOverride: pointsOverride
                ),
                token: token
            )
            // Refresh progress
            let updated = try await appState.apiClient.getTeamProgress(gameId: game.id, token: token)
            progress = updated.filter { $0.teamId == team.id }
            showMarkCompletedSheet = false
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            showRescueToast(locale.t("teamDetail.markCompletedSuccess"))
        } catch {
            showMarkCompletedSheet = false
            appState.setError(friendlyRescueError(error.localizedDescription))
        }
        isMarkingCompleted = false
    }

    private func performManualCheckIn() async {
        guard let token, let base = manualCheckInBase else { return }
        isCheckingIn = true
        do {
            _ = try await appState.apiClient.manualCheckIn(
                gameId: game.id,
                teamId: team.id,
                baseId: base.id,
                token: token
            )
            // Refresh progress so mark-completed button reflects new check-in status
            let updated = try await appState.apiClient.getTeamProgress(gameId: game.id, token: token)
            progress = updated.filter { $0.teamId == team.id }
            showManualCheckInSheet = false
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            showRescueToast(locale.t("teamDetail.manualCheckInSuccess"))
        } catch {
            showManualCheckInSheet = false
            appState.setError(error.localizedDescription)
        }
        isCheckingIn = false
    }

    private func grantUnlockOverride() async {
        guard let token, let base = unlockOverrideBase else { return }
        isGrantingOverride = true
        let reason = unlockOverrideReason.trimmingCharacters(in: .whitespaces)
        do {
            let newOverride = try await appState.apiClient.createUnlockOverride(
                gameId: game.id,
                teamId: team.id,
                baseId: base.id,
                request: UnlockOverrideRequest(reason: reason.isEmpty ? nil : String(reason.prefix(reasonMaxLength))),
                token: token
            )
            unlockOverrides.removeAll { $0.baseId == base.id }
            unlockOverrides.append(newOverride)
            showUnlockOverrideSheet = false
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            showRescueToast(locale.t("teamDetail.unlockOverrideSuccess"))
        } catch {
            showUnlockOverrideSheet = false
            appState.setError(error.localizedDescription)
        }
        isGrantingOverride = false
    }

    private func removeUnlockOverride(_ override: BaseUnlockOverrideResponse) async {
        guard let token else { return }
        do {
            try await appState.apiClient.removeUnlockOverride(
                gameId: game.id,
                teamId: team.id,
                baseId: override.baseId,
                token: token
            )
            unlockOverrides.removeAll { $0.id == override.id }
            removeOverrideTarget = nil
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            showRescueToast(locale.t("teamDetail.unlockOverrideRemoveSuccess"))
        } catch {
            appState.setError(error.localizedDescription)
        }
    }

    // MARK: - Toast helpers

    private func showRescueToast(_ message: String) {
        rescueToastTask?.cancel()
        withAnimation {
            rescueSuccessMessage = message
        }
        rescueToastTask = Task {
            try? await Task.sleep(for: .seconds(3))
            withAnimation { rescueSuccessMessage = nil }
        }
    }

    /// Map known backend error codes to friendly messages.
    private func friendlyRescueError(_ raw: String) -> String {
        if raw.contains("MARK_COMPLETED_REQUIRES_CHECKIN") {
            return locale.t("teamDetail.errorRequiresCheckIn")
        }
        return raw
    }
}

// MARK: - Base Progress Row

private struct BaseProgressRow: View {
    let base: Base
    let progress: TeamBaseProgressResponse?
    let override: BaseUnlockOverrideResponse?
    let locale: LocaleManager
    let onMarkCompleted: () -> Void
    let onManualCheckIn: () -> Void
    let onGrantOverride: () -> Void
    let onRemoveOverride: (BaseUnlockOverrideResponse) -> Void

    private var statusLabel: String {
        switch progress?.baseStatus {
        case .completed: return locale.t("teamDetail.completed")
        case .checkedIn: return locale.t("teamDetail.checkedIn")
        case .submitted: return locale.t("common.pendingReview")
        case .rejected: return locale.t("status.rejected")
        case .notVisited, .none: return locale.t("teamDetail.notVisited")
        }
    }

    private var statusColor: Color {
        switch progress?.baseStatus {
        case .completed: return .green
        case .checkedIn: return .blue
        case .submitted: return .orange
        case .rejected: return .red
        default: return .secondary
        }
    }

    private var isCompleted: Bool {
        progress?.baseStatus == .completed
    }

    private var isCheckedIn: Bool {
        progress?.baseStatus == .checkedIn
    }

    private var isPendingSubmission: Bool {
        progress?.baseStatus == .submitted
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        if base.hidden {
                            Image(systemName: "eye.slash")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        Text(base.name)
                            .font(.subheadline)
                            .fontWeight(.medium)
                    }
                    Text(statusLabel)
                        .font(.caption)
                        .foregroundStyle(statusColor)
                }
                Spacer()
                if let ov = override {
                    OverrideBadge(override: ov, locale: locale)
                }
            }

            HStack(spacing: 8) {
                // Manual Check-In: shown when not yet checked in and not completed
                if !isCompleted && !isCheckedIn && !isPendingSubmission {
                    Button {
                        onManualCheckIn()
                    } label: {
                        Label(locale.t("teamDetail.manualCheckIn"), systemImage: "arrow.down.to.line")
                            .font(.caption)
                            .fontWeight(.medium)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 10)
                            .background(Color(hex: "#f59e0b")?.opacity(0.12) ?? Color.orange.opacity(0.12))
                            .foregroundStyle(Color(hex: "#f59e0b") ?? .orange)
                            .clipShape(Capsule())
                            .contentShape(Capsule())
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("manual-check-in-btn-\(base.id)")
                }

                // Mark Completed: shown when not completed and not a pending submission awaiting review
                if !isCompleted && !isPendingSubmission {
                    Button {
                        onMarkCompleted()
                    } label: {
                        Label(locale.t("teamDetail.markCompleted"), systemImage: "checkmark.seal")
                            .font(.caption)
                            .fontWeight(.medium)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 10)
                            .background(Color(hex: "#f59e0b")?.opacity(0.15) ?? Color.orange.opacity(0.15))
                            .foregroundStyle(Color(hex: "#f59e0b") ?? .orange)
                            .clipShape(Capsule())
                            .contentShape(Capsule())
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("mark-completed-btn-\(base.id)")
                } else if isPendingSubmission {
                    Text(locale.t("teamDetail.pendingReviewHint"))
                        .font(.caption2)
                        .foregroundStyle(.orange)
                        .italic()
                }

                if base.hidden {
                    if override == nil {
                        Button {
                            onGrantOverride()
                        } label: {
                            Label(locale.t("teamDetail.unlockOverrideAction"), systemImage: "lock.open")
                                .font(.caption)
                                .fontWeight(.medium)
                                .padding(.horizontal, 10)
                                .padding(.vertical, 10)
                                .background(Color.blue.opacity(0.12))
                                .foregroundStyle(Color.blue)
                                .clipShape(Capsule())
                                .contentShape(Capsule())
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("grant-override-btn-\(base.id)")
                    } else {
                        Button(role: .destructive) {
                            onRemoveOverride(override!)
                        } label: {
                            Label(locale.t("teamDetail.unlockOverrideRemove"), systemImage: "lock")
                                .font(.caption)
                                .fontWeight(.medium)
                                .padding(.horizontal, 10)
                                .padding(.vertical, 10)
                                .background(Color.red.opacity(0.12))
                                .foregroundStyle(Color.red)
                                .clipShape(Capsule())
                                .contentShape(Capsule())
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("remove-override-btn-\(base.id)")
                    }
                }
            }
        }
        .padding(.vertical, 4)
    }
}

// MARK: - Override Badge

private struct OverrideBadge: View {
    let override: BaseUnlockOverrideResponse
    let locale: LocaleManager

    private var formattedTime: String {
        // Parse ISO date and show HH:mm
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let date = formatter.date(from: override.createdAt)
            ?? ISO8601DateFormatter().date(from: override.createdAt)
        guard let date else { return "" }
        let display = DateFormatter()
        display.dateFormat = "HH:mm"
        return display.string(from: date)
    }

    var body: some View {
        let operatorName = override.createdByDisplayName ?? "?"
        let label: String
        let fmt = locale.t("teamDetail.unlockOverrideActiveBadge")
        if fmt.contains("%@") {
            label = String(format: fmt, operatorName, formattedTime)
        } else {
            label = fmt
        }
        return Text(label)
            .font(.caption2)
            .fontWeight(.semibold)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(Color.blue.opacity(0.15))
            .foregroundStyle(Color.blue)
            .clipShape(Capsule())
    }
}

// MARK: - Mark Completed Sheet

private struct MarkCompletedSheet: View {
    @Environment(\.dismiss) private var dismiss
    let base: Base?
    @Binding var reason: String
    @Binding var pointsText: String
    let isSubmitting: Bool
    let locale: LocaleManager
    let onConfirm: () -> Void

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text(locale.t("teamDetail.markCompletedDialogDescription"))
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }

                Section(locale.t("teamDetail.markCompletedReasonLabel")) {
                    ZStack(alignment: .topLeading) {
                        TextEditor(text: $reason)
                            .frame(minHeight: 80)
                            .onChange(of: reason) { _, new in
                                if new.count > reasonMaxLength {
                                    reason = String(new.prefix(reasonMaxLength))
                                }
                            }
                        if reason.isEmpty {
                            Text(locale.t("teamDetail.markCompletedReasonPlaceholder"))
                                .font(.body)
                                .foregroundStyle(.tertiary)
                                .padding(.top, 8)
                                .padding(.leading, 4)
                                .allowsHitTesting(false)
                        }
                    }
                    Text("\(reason.count)/\(reasonMaxLength)")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, alignment: .trailing)
                }

                Section(locale.t("teamDetail.markCompletedPointsLabel")) {
                    TextField(locale.t("teamDetail.markCompletedPointsPlaceholder"), text: $pointsText)
                        .keyboardType(.numbersAndPunctuation)
                }

                Section {
                    Text(locale.t("submissions.markCompletedHelper"))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Section {
                    Button {
                        onConfirm()
                    } label: {
                        if isSubmitting {
                            HStack {
                                Spacer()
                                ProgressView()
                                Spacer()
                            }
                        } else {
                            Text(locale.t("teamDetail.markCompletedAction"))
                                .fontWeight(.semibold)
                                .frame(maxWidth: .infinity)
                                .foregroundStyle(Color(hex: "#f59e0b") ?? .orange)
                        }
                    }
                    .disabled(isSubmitting)
                    .accessibilityIdentifier("mark-completed-confirm-btn")
                }
            }
            .navigationTitle(locale.t("teamDetail.markCompletedDialogTitle"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(locale.t("common.cancel")) { dismiss() }
                        .disabled(isSubmitting)
                }
            }
        }
    }
}

// MARK: - Manual Check-In Sheet

private struct ManualCheckInSheet: View {
    @Environment(\.dismiss) private var dismiss
    let base: Base?
    @Binding var reason: String
    let isSubmitting: Bool
    let locale: LocaleManager
    let onConfirm: () -> Void

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text(locale.t("teamDetail.manualCheckInDialogDescription"))
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }

                Section(locale.t("teamDetail.manualCheckInReasonLabel")) {
                    ZStack(alignment: .topLeading) {
                        TextEditor(text: $reason)
                            .frame(minHeight: 80)
                            .onChange(of: reason) { _, new in
                                if new.count > reasonMaxLength {
                                    reason = String(new.prefix(reasonMaxLength))
                                }
                            }
                        if reason.isEmpty {
                            Text(locale.t("teamDetail.manualCheckInReasonPlaceholder"))
                                .font(.body)
                                .foregroundStyle(.tertiary)
                                .padding(.top, 8)
                                .padding(.leading, 4)
                                .allowsHitTesting(false)
                        }
                    }
                    Text("\(reason.count)/\(reasonMaxLength)")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, alignment: .trailing)
                }

                Section {
                    Button {
                        onConfirm()
                    } label: {
                        if isSubmitting {
                            HStack {
                                Spacer()
                                ProgressView()
                                Spacer()
                            }
                        } else {
                            Text(locale.t("teamDetail.manualCheckInAction"))
                                .fontWeight(.semibold)
                                .frame(maxWidth: .infinity)
                                .foregroundStyle(Color(hex: "#f59e0b") ?? .orange)
                        }
                    }
                    .disabled(isSubmitting)
                    .accessibilityIdentifier("manual-check-in-confirm-btn")
                }
            }
            .navigationTitle(locale.t("teamDetail.manualCheckInDialogTitle"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(locale.t("common.cancel")) { dismiss() }
                        .disabled(isSubmitting)
                }
            }
        }
    }
}

// MARK: - Unlock Override Sheet

private struct UnlockOverrideSheet: View {
    @Environment(\.dismiss) private var dismiss
    let base: Base?
    @Binding var reason: String
    let isSubmitting: Bool
    let locale: LocaleManager
    let onConfirm: () -> Void

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text(locale.t("teamDetail.unlockOverrideDialogDescription"))
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }

                Section(locale.t("teamDetail.unlockOverrideReasonLabel")) {
                    ZStack(alignment: .topLeading) {
                        TextEditor(text: $reason)
                            .frame(minHeight: 80)
                            .onChange(of: reason) { _, new in
                                if new.count > reasonMaxLength {
                                    reason = String(new.prefix(reasonMaxLength))
                                }
                            }
                        if reason.isEmpty {
                            Text(locale.t("teamDetail.unlockOverrideReasonPlaceholder"))
                                .font(.body)
                                .foregroundStyle(.tertiary)
                                .padding(.top, 8)
                                .padding(.leading, 4)
                                .allowsHitTesting(false)
                        }
                    }
                    Text("\(reason.count)/\(reasonMaxLength)")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, alignment: .trailing)
                }

                Section {
                    Button {
                        onConfirm()
                    } label: {
                        if isSubmitting {
                            HStack {
                                Spacer()
                                ProgressView()
                                Spacer()
                            }
                        } else {
                            Text(locale.t("teamDetail.unlockOverrideAction"))
                                .fontWeight(.semibold)
                                .frame(maxWidth: .infinity)
                        }
                    }
                    .disabled(isSubmitting)
                    .accessibilityIdentifier("grant-override-confirm-btn")
                }
            }
            .navigationTitle(locale.t("teamDetail.unlockOverrideDialogTitle"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(locale.t("common.cancel")) { dismiss() }
                        .disabled(isSubmitting)
                }
            }
        }
    }
}

// MARK: - QR Code Sheet

private struct QRCodeSheet: View {
    @Environment(LocaleManager.self) private var locale
    @Environment(\.dismiss) private var dismiss

    let joinCode: String
    let teamName: String

    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                Text(teamName)
                    .font(.title2)
                    .fontWeight(.bold)

                if let qrImage = generateQRCode(from: joinCode) {
                    Image(uiImage: qrImage)
                        .interpolation(.none)
                        .resizable()
                        .scaledToFit()
                        .frame(width: 250, height: 250)
                } else {
                    ContentUnavailableView(
                        locale.t("operator.qrCode"),
                        systemImage: "qrcode"
                    )
                }

                Text(joinCode)
                    .font(.title3)
                    .fontWeight(.semibold)
                    .fontDesign(.monospaced)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .navigationTitle(locale.t("operator.qrCode"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(locale.t("common.done")) { dismiss() }
                }
            }
        }
    }

    private func generateQRCode(from string: String) -> UIImage? {
        let data = string.data(using: .utf8)
        let filter = CIFilter.qrCodeGenerator()
        filter.setValue(data, forKey: "inputMessage")
        filter.setValue("M", forKey: "inputCorrectionLevel")
        guard let output = filter.outputImage else { return nil }
        let scaled = output.transformed(by: CGAffineTransform(scaleX: 12, y: 12))
        let context = CIContext()
        guard let cgImage = context.createCGImage(scaled, from: scaled.extent.integral) else { return nil }
        return UIImage(cgImage: cgImage)
    }
}
