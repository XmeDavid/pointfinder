import SwiftUI

private enum OperatorSubmissionFilter: String, CaseIterable {
    case pending
    case all
}

struct OperatorSubmissionsView: View {
    @Environment(AppState.self) private var appState
    @Environment(LocaleManager.self) private var locale

    let gameId: UUID
    let token: String

    @State private var submissions: [SubmissionResponse] = []
    @State private var teams: [Team] = []
    @State private var challenges: [Challenge] = []
    @State private var bases: [Base] = []
    @State private var filter: OperatorSubmissionFilter = .pending
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var reviewingSubmission: SubmissionResponse?
    @State private var pollingTask: Task<Void, Never>?

    var body: some View {
        NavigationStack {
            VStack(spacing: 12) {
                Picker("", selection: $filter) {
                    Text(locale.t("operator.pending")).tag(OperatorSubmissionFilter.pending)
                    Text(locale.t("common.all")).tag(OperatorSubmissionFilter.all)
                }
                .pickerStyle(.segmented)
                .padding(.horizontal)

                if let errorMessage {
                    Text(errorMessage)
                        .font(.caption)
                        .foregroundStyle(.red)
                        .padding(.horizontal)
                }

                if isLoading {
                    Spacer()
                    ProgressView(locale.t("operator.loading"))
                    Spacer()
                } else if filteredSubmissions.isEmpty {
                    Spacer()
                    ContentUnavailableView(
                        filter == .pending
                            ? locale.t("operator.noPendingSubmissions")
                            : locale.t("operator.noSubmissions"),
                        systemImage: "checkmark.circle"
                    )
                    Spacer()
                } else {
                    List(filteredSubmissions) { submission in
                        Button {
                            reviewingSubmission = submission
                        } label: {
                            submissionRow(submission)
                        }
                        .buttonStyle(.plain)
                    }
                    .listStyle(.plain)
                }
            }
            .navigationTitle(locale.t("operator.submissionsTitle"))
        }
        .task {
            await loadInitialData()
            startPolling()
        }
        .onReceive(NotificationCenter.default.publisher(for: .mobileRealtimeEvent)) { notification in
            guard let rawGameId = notification.userInfo?["gameId"] as? String,
                  UUID(uuidString: rawGameId) == gameId,
                  let type = notification.userInfo?["type"] as? String else { return }

            switch type {
            case "submission_status", "activity", "game_status":
                Task { await loadSubmissions() }
            default:
                break
            }
        }
        .sheet(item: $reviewingSubmission) { submission in
            OperatorSubmissionReviewSheet(
                submission: submission,
                teamName: teamName(for: submission.teamId),
                challengeTitle: challengeTitle(for: submission.challengeId),
                baseName: baseName(for: submission.baseId),
                token: token,
                gameId: gameId,
                onSaved: {
                    Task { await loadSubmissions() }
                }
            )
        }
        .onDisappear {
            pollingTask?.cancel()
            pollingTask = nil
        }
    }

    private var filteredSubmissions: [SubmissionResponse] {
        let source: [SubmissionResponse]
        switch filter {
        case .pending:
            source = submissions.filter { $0.status == "pending" }
        case .all:
            source = submissions
        }

        return source.sorted { lhs, rhs in
            parseISODate(lhs.submittedAt) > parseISODate(rhs.submittedAt)
        }
    }

    private func submissionRow(_ submission: SubmissionResponse) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(teamName(for: submission.teamId))
                    .font(.subheadline)
                    .fontWeight(.semibold)
                Spacer()
                Text(statusLabel(for: submission.status))
                    .font(.caption)
                    .fontWeight(.medium)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(statusColor(for: submission.status).opacity(0.15))
                    .foregroundStyle(statusColor(for: submission.status))
                    .clipShape(Capsule())
            }

            Text(challengeTitle(for: submission.challengeId))
                .font(.subheadline)
            Text(baseName(for: submission.baseId))
                .font(.caption)
                .foregroundStyle(.secondary)

            if !submission.answer.isEmpty {
                Text(submission.answer)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }

            Text(formatDate(submission.submittedAt))
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .padding(.vertical, 4)
    }

    private func loadInitialData() async {
        isLoading = true
        errorMessage = nil
        do {
            async let submissionsTask = appState.apiClient.getSubmissions(gameId: gameId, token: token)
            async let teamsTask = appState.apiClient.getTeams(gameId: gameId, token: token)
            async let challengesTask = appState.apiClient.getChallenges(gameId: gameId, token: token)
            async let basesTask = appState.apiClient.getGameBases(gameId: gameId, token: token)

            let (loadedSubmissions, loadedTeams, loadedChallenges, loadedBases) = try await (
                submissionsTask,
                teamsTask,
                challengesTask,
                basesTask
            )

            submissions = loadedSubmissions
            teams = loadedTeams
            challenges = loadedChallenges
            bases = loadedBases
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    private func loadSubmissions() async {
        do {
            submissions = try await appState.apiClient.getSubmissions(gameId: gameId, token: token)
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func startPolling() {
        pollingTask?.cancel()
        pollingTask = Task {
            while !Task.isCancelled {
                let interval = appState.realtimeConnected ? 20.0 : 6.0
                try? await Task.sleep(for: .seconds(interval))
                if !appState.realtimeConnected {
                    await loadSubmissions()
                }
            }
        }
    }

    private func teamName(for teamId: UUID) -> String {
        teams.first { $0.id == teamId }?.name ?? locale.t("operator.unknownTeam")
    }

    private func challengeTitle(for challengeId: UUID) -> String {
        challenges.first { $0.id == challengeId }?.title ?? locale.t("operator.unknownChallenge")
    }

    private func baseName(for baseId: UUID) -> String {
        bases.first { $0.id == baseId }?.name ?? locale.t("operator.unknownBase")
    }

    private func statusLabel(for status: String) -> String {
        switch status {
        case "pending":
            return locale.t("submissions.statusPending")
        case "approved":
            return locale.t("submissions.statusApproved")
        case "rejected":
            return locale.t("submissions.statusRejected")
        case "correct":
            return locale.t("submissions.statusCorrect")
        default:
            return status.capitalized
        }
    }

    private func statusColor(for status: String) -> Color {
        switch status {
        case "pending":
            return .orange
        case "approved", "correct":
            return .green
        case "rejected":
            return .red
        default:
            return .gray
        }
    }

    private func parseISODate(_ value: String) -> Date {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: value) {
            return date
        }
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.date(from: value) ?? .distantPast
    }

    private func formatDate(_ value: String) -> String {
        let date = parseISODate(value)
        let formatter = DateFormatter()
        formatter.dateStyle = .short
        formatter.timeStyle = .short
        return formatter.string(from: date)
    }
}

private struct OperatorSubmissionReviewSheet: View {
    @Environment(AppState.self) private var appState
    @Environment(LocaleManager.self) private var locale
    @Environment(\.dismiss) private var dismiss

    let submission: SubmissionResponse
    let teamName: String
    let challengeTitle: String
    let baseName: String
    let token: String
    let gameId: UUID
    let onSaved: () -> Void

    @State private var feedback: String
    @State private var isSaving = false
    @State private var errorMessage: String?

    init(
        submission: SubmissionResponse,
        teamName: String,
        challengeTitle: String,
        baseName: String,
        token: String,
        gameId: UUID,
        onSaved: @escaping () -> Void
    ) {
        self.submission = submission
        self.teamName = teamName
        self.challengeTitle = challengeTitle
        self.baseName = baseName
        self.token = token
        self.gameId = gameId
        self.onSaved = onSaved
        self._feedback = State(initialValue: submission.feedback ?? "")
    }

    var body: some View {
        NavigationStack {
            Form {
                Section(locale.t("submissions.team")) {
                    Text(teamName)
                }
                Section(locale.t("submissions.challenge")) {
                    Text(challengeTitle)
                }
                Section(locale.t("operator.base")) {
                    Text(baseName)
                }
                if !submission.answer.isEmpty {
                    Section(locale.t("submissions.answer")) {
                        Text(submission.answer)
                    }
                }
                Section(locale.t("submissions.feedbackLabel")) {
                    TextEditor(text: $feedback)
                        .frame(minHeight: 100)
                }
                if let errorMessage {
                    Section {
                        Text(errorMessage)
                            .font(.caption)
                            .foregroundStyle(.red)
                    }
                }
            }
            .navigationTitle(locale.t("submissions.reviewTitle"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button(locale.t("common.cancel")) {
                        dismiss()
                    }
                    .disabled(isSaving)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    HStack {
                        Button(locale.t("submissions.reject"), role: .destructive) {
                            Task { await submit(status: "rejected") }
                        }
                        .disabled(isSaving)
                        Button(locale.t("submissions.approve")) {
                            Task { await submit(status: "approved") }
                        }
                        .disabled(isSaving)
                    }
                }
            }
        }
    }

    private func submit(status: String) async {
        isSaving = true
        errorMessage = nil
        do {
            _ = try await appState.apiClient.reviewSubmission(
                gameId: gameId,
                submissionId: submission.id,
                status: status,
                feedback: feedback.isEmpty ? nil : feedback,
                token: token
            )
            onSaved()
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
        isSaving = false
    }
}

