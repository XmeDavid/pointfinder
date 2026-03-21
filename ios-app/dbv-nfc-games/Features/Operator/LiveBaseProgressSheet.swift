import SwiftUI
import os

// MARK: - Live Base Progress Sheet (self-refreshing)

/// A version of the base progress sheet that fetches its own data
/// and polls for updates while open, so it always shows live status.
struct LiveBaseProgressSheet: View {
    @Environment(AppState.self) private var appState
    @Environment(LocaleManager.self) private var locale
    @Environment(\.dismiss) private var dismiss

    let gameId: UUID
    let token: String
    let base: Base
    var onNfcLinked: ((UUID) -> Void)?

    @State private var teams: [Team] = []
    @State private var progress: [TeamBaseProgressResponse] = []
    @State private var isLoading = true
    @State private var pollingTask: Task<Void, Never>?

    // NFC writing
    @State private var nfcWriter = NFCWriterService()
    @State private var nfcLinked: Bool
    @State private var isWritingNfc = false
    @State private var writeSuccess = false
    @State private var writeError: String?

    // Manual check-in
    @State private var showManualCheckIn = false
    @State private var selectedTeamForCheckIn: Team?
    @State private var showManualCheckInConfirm = false
    @State private var isDoingManualCheckIn = false
    @State private var manualCheckInMessage: String?
    @State private var manualCheckInIsError = false

    init(gameId: UUID, token: String, base: Base, onNfcLinked: ((UUID) -> Void)? = nil) {
        self.gameId = gameId
        self.token = token
        self.base = base
        self.onNfcLinked = onNfcLinked
        self._nfcLinked = State(initialValue: base.nfcLinked)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    // Base info header
                    VStack(alignment: .leading, spacing: 8) {
                        Text(base.name)
                            .font(.title2)
                            .fontWeight(.bold)

                        if !base.description.isEmpty {
                            Text(base.description)
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }

                        HStack(spacing: 16) {
                            Label(String(format: "%.4f, %.4f", base.lat, base.lng), systemImage: "location")
                                .font(.caption)
                                .foregroundStyle(.secondary)

                            if nfcLinked {
                                Label(locale.t("nfc.nfcLinked"), systemImage: "checkmark.circle.fill")
                                    .font(.caption)
                                    .foregroundStyle(.green)
                            } else {
                                Label(locale.t("nfc.nfcNotLinked"), systemImage: "xmark.circle")
                                    .font(.caption)
                                    .foregroundStyle(.orange)
                            }
                        }
                    }
                    .padding()
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color(.systemGray6))
                    .clipShape(RoundedRectangle(cornerRadius: 12))

                    // NFC Linking section
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
                                isWritingNfc ? locale.t("nfc.writing") : locale.t("nfc.writeToTag"),
                                systemImage: "sensor.tag.radiowaves.forward"
                            )
                            .font(.subheadline)
                            .fontWeight(.semibold)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                            .background(isWritingNfc ? Color.gray : Color.accentColor)
                            .foregroundStyle(.white)
                            .clipShape(RoundedRectangle(cornerRadius: 10))
                        }
                        .disabled(isWritingNfc)
                    }
                    .padding()
                    .background(Color(.systemGray6))
                    .clipShape(RoundedRectangle(cornerRadius: 12))

                    if isLoading {
                        HStack {
                            Spacer()
                            ProgressView()
                            Spacer()
                        }
                        .padding()
                    } else {
                        // Summary stats
                        SummaryStatsView(teams: teams, progress: progress)

                        // Team status list
                        VStack(alignment: .leading, spacing: 12) {
                            Text(locale.t("operator.teamStatus"))
                                .font(.headline)

                            if teams.isEmpty {
                                Text(locale.t("operator.noTeams"))
                                    .font(.subheadline)
                                    .foregroundStyle(.secondary)
                                    .frame(maxWidth: .infinity, alignment: .center)
                                    .padding()
                            } else {
                                ForEach(teams) { team in
                                    let teamProgress = progress.first { $0.teamId == team.id }
                                    HStack(spacing: 8) {
                                        TeamStatusRow(
                                            team: team,
                                            progress: teamProgress
                                        )
                                        if teamProgress == nil {
                                            Button {
                                                selectedTeamForCheckIn = team
                                                showManualCheckInConfirm = true
                                            } label: {
                                                Image(systemName: "checkmark.circle")
                                                    .font(.title3)
                                                    .foregroundStyle(.blue)
                                            }
                                            .buttonStyle(.plain)
                                            .disabled(isDoingManualCheckIn)
                                            .accessibilityLabel(locale.t("operator.manualCheckIn"))
                                        }
                                    }
                                }
                            }

                            if let msg = manualCheckInMessage {
                                Label(msg, systemImage: manualCheckInIsError ? "xmark.circle.fill" : "checkmark.circle.fill")
                                    .font(.caption)
                                    .foregroundStyle(manualCheckInIsError ? .red : .green)
                                    .padding(.top, 4)
                            }
                        }
                    }
                }
                .padding()
            }
            .navigationTitle(locale.t("operator.baseDetails"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button(locale.t("common.done")) {
                        dismiss()
                    }
                }
            }
        }
        .task {
            await loadData()
            startPolling()
        }
        .onReceive(NotificationCenter.default.publisher(for: .mobileRealtimeEvent)) { notification in
            guard let rawGameId = notification.userInfo?["gameId"] as? String,
                  UUID(uuidString: rawGameId) == gameId else { return }
            Task { await loadData() }
        }
        .onDisappear {
            pollingTask?.cancel()
            pollingTask = nil
        }
        .alert(locale.t("operator.manualCheckInConfirmTitle"), isPresented: $showManualCheckInConfirm) {
            Button(locale.t("common.ok")) {
                if let team = selectedTeamForCheckIn {
                    Task { await performManualCheckIn(team: team) }
                }
            }
            Button(locale.t("common.cancel"), role: .cancel) {
                selectedTeamForCheckIn = nil
            }
        } message: {
            if let team = selectedTeamForCheckIn {
                Text(String(format: locale.t("operator.manualCheckInConfirmMessage"), team.name, base.name))
            }
        }
    }

    private func loadData() async {
        do {
            async let teamsResult = appState.apiClient.getTeams(gameId: gameId, token: token)
            async let progressResult = appState.apiClient.getTeamProgress(gameId: gameId, token: token)

            let (fetchedTeams, allProgress) = try await (teamsResult, progressResult)
            teams = fetchedTeams
            progress = allProgress.filter { $0.baseId == base.id }
        } catch {
            Logger(subsystem: "com.prayer.pointfinder", category: "OperatorMap").error("Failed to load sheet data: \(error.localizedDescription, privacy: .public)")
        }
        isLoading = false
    }

    private func startPolling() {
        pollingTask?.cancel()
        pollingTask = Task {
            while !Task.isCancelled {
                let interval = appState.realtimeConnected ? 20.0 : 5.0
                try? await Task.sleep(for: .seconds(interval))

                if !appState.realtimeConnected {
                    do {
                        let allProgress = try await appState.apiClient.getTeamProgress(gameId: gameId, token: token)
                        progress = allProgress.filter { $0.baseId == base.id }
                    } catch {
                        // Silently continue polling
                    }
                }
            }
        }
    }

    // MARK: - Manual Check-In

    private func performManualCheckIn(team: Team) async {
        isDoingManualCheckIn = true
        manualCheckInMessage = nil
        do {
            _ = try await appState.apiClient.manualCheckIn(
                gameId: gameId,
                teamId: team.id,
                baseId: base.id,
                token: token
            )
            manualCheckInMessage = locale.t("operator.manualCheckInSuccess")
            manualCheckInIsError = false
            await loadData()
        } catch {
            manualCheckInMessage = error.localizedDescription
            manualCheckInIsError = true
        }
        isDoingManualCheckIn = false
        selectedTeamForCheckIn = nil

        // Auto-clear the success/error message after 3 seconds
        Task {
            try? await Task.sleep(for: .seconds(3))
            manualCheckInMessage = nil
        }
    }

    // MARK: - NFC Writing

    private func writeTag() async {
        isWritingNfc = true
        writeError = nil
        writeSuccess = false

        do {
            try await nfcWriter.writeBaseId(base.id)

            let _ = try await appState.apiClient.linkBaseNfc(
                gameId: gameId,
                baseId: base.id,
                token: token
            )

            nfcLinked = true
            writeSuccess = true
            onNfcLinked?(base.id)
        } catch let error as NFCError {
            if case .cancelled = error {
                // User cancelled
            } else {
                writeError = error.localizedDescription
            }
        } catch {
            writeError = error.localizedDescription
        }

        isWritingNfc = false
    }
}
