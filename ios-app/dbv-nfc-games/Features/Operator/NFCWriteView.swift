import SwiftUI
import os

struct BaseDetailView: View {
    @Environment(AppState.self) private var appState
    @Environment(LocaleManager.self) private var locale
    @State private var nfcWriter = NFCWriterService()

    let game: Game
    @Binding var base: Base

    @State private var isWriting = false
    @State private var writeSuccess = false
    @State private var writeError: String?

    // Challenge & assignment data
    @State private var challenges: [Challenge] = []
    @State private var assignments: [Assignment] = []
    @State private var teams: [Team] = []
    @State private var isLoadingData = true

    private let apiClient = APIClient()

    private var token: String? {
        if case .userOperator(let token, _, _) = appState.authType {
            return token
        }
        return nil
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                // MARK: - Section 1: Base Info
                baseInfoSection

                // MARK: - Section 2: NFC Linking
                nfcLinkingSection

                // MARK: - Section 3: Challenge Assignment
                challengeAssignmentSection
            }
            .padding()
        }
        .navigationTitle(base.name)
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await loadData()
        }
    }

    // MARK: - Base Info Section

    private var baseInfoSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Name and description
            if !base.description.isEmpty {
                Text(base.description)
                    .font(.body)
                    .foregroundStyle(.secondary)
            }

            // Location
            Label(
                String(format: "%.5f, %.5f", base.lat, base.lng),
                systemImage: "location"
            )
            .font(.caption)
            .foregroundStyle(.secondary)

            // Status badges
            HStack(spacing: 12) {
                // NFC status
                HStack(spacing: 4) {
                    Image(systemName: base.nfcLinked ? "checkmark.circle.fill" : "circle.dashed")
                    Text(base.nfcLinked ? locale.t("nfc.nfcLinked") : locale.t("nfc.nfcNotLinked"))
                }
                .font(.caption)
                .fontWeight(.medium)
                .foregroundStyle(base.nfcLinked ? .green : .orange)
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background((base.nfcLinked ? Color.green : Color.orange).opacity(0.15))
                .clipShape(Capsule())

                // Require presence
                if base.requirePresenceToSubmit {
                    HStack(spacing: 4) {
                        Image(systemName: "location.circle.fill")
                        Text(locale.t("nfc.presenceRequired"))
                    }
                    .font(.caption)
                    .fontWeight(.medium)
                    .foregroundStyle(.blue)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(Color.blue.opacity(0.15))
                    .clipShape(Capsule())
                }
            }
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.systemGray6))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    // MARK: - NFC Linking Section

    private var nfcLinkingSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label(locale.t("nfc.tag"), systemImage: "sensor.tag.radiowaves.forward")
                .font(.headline)

            Text(locale.t("nfc.writeInstructions"))
                .font(.caption)
                .foregroundStyle(.secondary)

            if let error = writeError {
                Text(error)
                    .font(.caption)
                    .foregroundStyle(.red)
            }

            if writeSuccess {
                Label(locale.t("nfc.writeSuccess"), systemImage: "checkmark.circle.fill")
                    .font(.caption)
                    .foregroundStyle(.green)
            }

            Button {
                Task { await writeTag() }
            } label: {
                Label(
                    isWriting ? locale.t("nfc.writing") : locale.t("nfc.writeToTag"),
                    systemImage: "sensor.tag.radiowaves.forward"
                )
                .font(.subheadline)
                .fontWeight(.semibold)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
                .background(isWriting ? Color.gray : Color.accentColor)
                .foregroundStyle(.white)
                .clipShape(RoundedRectangle(cornerRadius: 10))
            }
            .disabled(isWriting)
        }
        .padding()
        .background(Color(.systemGray6))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    // MARK: - Challenge Assignment Section

    @ViewBuilder
    private var challengeAssignmentSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label(locale.t("nfc.challenge"), systemImage: "lightbulb.fill")
                .font(.headline)

            if isLoadingData {
                HStack {
                    Spacer()
                    ProgressView(locale.t("nfc.loadingChallengeInfo"))
                    Spacer()
                }
                .padding(.vertical)
            } else if let fixedChallengeId = base.fixedChallengeId {
                // Fixed challenge
                fixedChallengeView(challengeId: fixedChallengeId)
            } else if game.status == "setup" {
                // Random, game not started
                randomNotStartedView
            } else {
                // Random, game live/ended -- show per-team assignments
                perTeamAssignmentsView
            }
        }
        .padding()
        .background(Color(.systemGray6))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    @ViewBuilder
    private func fixedChallengeView(challengeId: UUID) -> some View {
        HStack(spacing: 6) {
            Image(systemName: "pin.fill")
            Text(locale.t("nfc.fixedChallenge"))
        }
        .font(.caption)
        .fontWeight(.medium)
        .foregroundStyle(.purple)
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(Color.purple.opacity(0.15))
        .clipShape(Capsule())

        if let challenge = challenges.first(where: { $0.id == challengeId }) {
            ChallengeCardView(challenge: challenge)
        } else {
            Text(locale.t("nfc.challengeNotFound"))
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    private var randomNotStartedView: some View {
        HStack(spacing: 12) {
            Image(systemName: "shuffle")
                .font(.title2)
                .foregroundStyle(.secondary)

            VStack(alignment: .leading, spacing: 4) {
                Text(locale.t("nfc.randomAssignment"))
                    .font(.subheadline)
                    .fontWeight(.medium)
                Text(locale.t("nfc.randomDesc"))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    @ViewBuilder
    private var perTeamAssignmentsView: some View {
        let baseAssignments = assignments.filter { $0.baseId == base.id }

        HStack(spacing: 6) {
            Image(systemName: "shuffle")
            Text(locale.t("nfc.randomlyAssigned"))
        }
        .font(.caption)
        .fontWeight(.medium)
        .foregroundStyle(.indigo)
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(Color.indigo.opacity(0.15))
        .clipShape(Capsule())

        if baseAssignments.isEmpty {
            Text(locale.t("nfc.noChallengesYet"))
                .font(.caption)
                .foregroundStyle(.secondary)
                .padding(.vertical, 8)
        } else {
            ForEach(baseAssignments) { assignment in
                teamAssignmentRow(assignment: assignment)
            }
        }
    }

    @ViewBuilder
    private func teamAssignmentRow(assignment: Assignment) -> some View {
        let team = teams.first(where: { $0.id == assignment.teamId })
        let challenge = challenges.first(where: { $0.id == assignment.challengeId })
        let teamColor = team.flatMap { Color(hex: $0.color) } ?? .gray

        DisclosureGroup {
            if let challenge = challenge {
                ChallengeCardView(challenge: challenge)
                    .padding(.top, 4)
            } else {
                Text(locale.t("nfc.challengeNotFound"))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        } label: {
            HStack(spacing: 10) {
                Circle()
                    .fill(teamColor)
                    .frame(width: 10, height: 10)

                Text(team?.name ?? "All Teams")
                    .font(.subheadline)
                    .fontWeight(.medium)

                Spacer()

                if let challenge = challenge {
                    Text("\(challenge.points) \(locale.t("common.pts"))")
                        .font(.caption)
                        .foregroundStyle(.orange)
                        .fontWeight(.medium)
                }
            }
        }
        .padding(12)
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    // MARK: - Data Loading

    private func loadData() async {
        guard let token = token else { return }
        isLoadingData = true

        async let challengesTask: () = loadChallenges(token: token)
        async let teamsTask: () = loadTeams(token: token)

        // Only load assignments if there's no fixed challenge and game is live/ended
        if base.fixedChallengeId == nil && (game.status == "live" || game.status == "ended") {
            async let assignmentsTask: () = loadAssignments(token: token)
            _ = await (challengesTask, teamsTask, assignmentsTask)
        } else {
            _ = await (challengesTask, teamsTask)
        }

        isLoadingData = false
    }

    private func loadChallenges(token: String) async {
        do {
            challenges = try await apiClient.getChallenges(gameId: game.id, token: token)
        } catch {
            Logger(subsystem: "com.prayer.pointfinder", category: "NFCWrite").error("Failed to load challenges: \(error.localizedDescription, privacy: .public)")
        }
    }

    private func loadAssignments(token: String) async {
        do {
            assignments = try await apiClient.getAssignments(gameId: game.id, token: token)
        } catch {
            Logger(subsystem: "com.prayer.pointfinder", category: "NFCWrite").error("Failed to load assignments: \(error.localizedDescription, privacy: .public)")
        }
    }

    private func loadTeams(token: String) async {
        do {
            teams = try await apiClient.getTeams(gameId: game.id, token: token)
        } catch {
            Logger(subsystem: "com.prayer.pointfinder", category: "NFCWrite").error("Failed to load teams: \(error.localizedDescription, privacy: .public)")
        }
    }

    // MARK: - NFC Writing

    private func writeTag() async {
        isWriting = true
        writeError = nil
        writeSuccess = false

        do {
            try await nfcWriter.writeBaseId(base.id)

            guard let token = token else { return }
            let updated = try await appState.apiClient.linkBaseNfc(
                gameId: game.id,
                baseId: base.id,
                token: token
            )

            base.nfcLinked = true
            writeSuccess = true
        } catch let error as NFCError {
            if case .cancelled = error {
                // User cancelled
            } else {
                writeError = error.localizedDescription
            }
        } catch {
            writeError = error.localizedDescription
        }

        isWriting = false
    }
}

// MARK: - Challenge Card View

struct ChallengeCardView: View {
    let challenge: Challenge

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(challenge.title)
                    .font(.subheadline)
                    .fontWeight(.semibold)

                Spacer()

                Label("\(challenge.points) pts", systemImage: "star.fill")
                    .font(.caption)
                    .foregroundStyle(.orange)
            }

            if !challenge.description.isEmpty {
                Text(challenge.description)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(3)
            }

            HStack(spacing: 12) {
                HStack(spacing: 4) {
                    Image(systemName: "doc.text")
                    Text(challenge.answerType.capitalized)
                }
                .font(.caption2)
                .foregroundStyle(.secondary)
            }
        }
        .padding(12)
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }
}
