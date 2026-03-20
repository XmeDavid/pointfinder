import SwiftUI

struct GameSettingsView: View {
    @Environment(AppState.self) private var appState
    @Environment(LocaleManager.self) private var locale
    @Environment(\.dismiss) private var dismiss

    let game: Game

    @State private var name: String
    @State private var gameDescription: String
    @State private var startDate: Date?
    @State private var endDate: Date?
    @State private var uniformAssignment: Bool
    @State private var broadcastEnabled: Bool
    @State private var tileSource: String
    @State private var isSaving = false
    @State private var errorMessage: String?
    @State private var showGoLiveAlert = false
    @State private var showEndGameAlert = false
    @State private var gameStatus: String

    private var token: String? {
        if case .userOperator(let token, _, _) = appState.authType {
            return token
        }
        return nil
    }

    init(game: Game) {
        self.game = game
        self._name = State(initialValue: game.name)
        self._gameDescription = State(initialValue: game.description)
        self._startDate = State(initialValue: Self.parseDate(game.startDate))
        self._endDate = State(initialValue: Self.parseDate(game.endDate))
        self._uniformAssignment = State(initialValue: game.uniformAssignment)
        self._broadcastEnabled = State(initialValue: game.broadcastEnabled)
        self._tileSource = State(initialValue: game.tileSource)
        self._gameStatus = State(initialValue: game.status)
    }

    private static func parseDate(_ string: String?) -> Date? {
        guard let string else { return nil }
        return DateFormatting.parseISO8601(string)
    }

    private static func formatDate(_ date: Date?) -> String? {
        guard let date else { return nil }
        return DateFormatting.iso8601String(from: date)
    }

    var body: some View {
        Form {
            // Name & Description
            Section {
                TextField(locale.t("operator.gameName"), text: $name)
                VStack(alignment: .leading, spacing: 4) {
                    Text(locale.t("common.description"))
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    TextEditor(text: $gameDescription)
                        .frame(minHeight: 80)
                }
            }

            // Dates
            Section {
                Toggle(locale.t("operator.startDate"), isOn: Binding(
                    get: { startDate != nil },
                    set: { startDate = $0 ? Date() : nil }
                ))
                if let _ = startDate {
                    DatePicker(
                        locale.t("operator.startDate"),
                        selection: Binding(
                            get: { startDate ?? Date() },
                            set: { startDate = $0 }
                        ),
                        displayedComponents: [.date, .hourAndMinute]
                    )
                }

                Toggle(locale.t("operator.endDate"), isOn: Binding(
                    get: { endDate != nil },
                    set: { endDate = $0 ? Date() : nil }
                ))
                if let _ = endDate {
                    DatePicker(
                        locale.t("operator.endDate"),
                        selection: Binding(
                            get: { endDate ?? Date() },
                            set: { endDate = $0 }
                        ),
                        displayedComponents: [.date, .hourAndMinute]
                    )
                }
            }

            // Options
            Section {
                Toggle(locale.t("operator.uniformAssignment"), isOn: $uniformAssignment)
                Toggle(locale.t("operator.broadcastEnabled"), isOn: $broadcastEnabled)

                if let broadcastCode = game.broadcastCode, !broadcastCode.isEmpty {
                    HStack {
                        Text(locale.t("operator.broadcastCode"))
                        Spacer()
                        Text(broadcastCode)
                            .foregroundStyle(.secondary)
                            .fontDesign(.monospaced)
                    }
                }
            }

            // Map
            Section {
                Picker(locale.t("operator.tileSource"), selection: $tileSource) {
                    Text("OpenStreetMap").tag("osm")
                    Text("OpenStreetMap Classic").tag("osm-classic")
                    Text("CartoDB Voyager").tag("voyager")
                    Text("CartoDB Positron").tag("positron")
                    Text("SwissTopo").tag("swisstopo")
                    Text("SwissTopo Satellite").tag("swisstopo-sat")
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
            }

            if let errorMessage {
                Section {
                    Text(errorMessage)
                        .foregroundStyle(.red)
                        .font(.caption)
                }
            }

            // Status section
            Section(locale.t("common.status")) {
                HStack {
                    Text(locale.t("common.status"))
                    Spacer()
                    Text(locale.t("game.status.\(gameStatus)"))
                        .foregroundStyle(.secondary)
                }

                if gameStatus == "setup" {
                    Button {
                        showGoLiveAlert = true
                    } label: {
                        Label(locale.t("operator.goLive"), systemImage: "play.circle.fill")
                            .frame(maxWidth: .infinity)
                    }
                } else if gameStatus == "live" {
                    Button(role: .destructive) {
                        showEndGameAlert = true
                    } label: {
                        Label(locale.t("operator.endGame"), systemImage: "stop.circle.fill")
                            .frame(maxWidth: .infinity)
                    }
                }
            }
        }
        .navigationTitle(locale.t("operator.gameSettings"))
        .navigationBarTitleDisplayMode(.inline)
        .alert(locale.t("operator.goLiveConfirmTitle"), isPresented: $showGoLiveAlert) {
            Button(locale.t("operator.goLive")) {
                Task { await updateStatus("live") }
            }
            Button(locale.t("common.cancel"), role: .cancel) {}
        } message: {
            Text(locale.t("operator.goLiveConfirmMessage"))
        }
        .alert(locale.t("operator.endGameConfirmTitle"), isPresented: $showEndGameAlert) {
            Button(locale.t("operator.endGame"), role: .destructive) {
                Task { await updateStatus("ended") }
            }
            Button(locale.t("common.cancel"), role: .cancel) {}
        } message: {
            Text(locale.t("operator.endGameConfirmMessage"))
        }
    }

    // MARK: - Actions

    private func save() async {
        guard let token else { return }
        isSaving = true
        errorMessage = nil
        do {
            _ = try await appState.apiClient.updateGame(
                gameId: game.id,
                request: UpdateGameRequest(
                    name: name,
                    description: gameDescription,
                    startDate: Self.formatDate(startDate),
                    endDate: Self.formatDate(endDate),
                    uniformAssignment: uniformAssignment,
                    broadcastEnabled: broadcastEnabled,
                    tileSource: tileSource
                ),
                token: token
            )
        } catch {
            errorMessage = error.localizedDescription
        }
        isSaving = false
    }

    private func updateStatus(_ newStatus: String) async {
        guard let token else { return }
        errorMessage = nil
        do {
            _ = try await appState.apiClient.updateGameStatus(
                gameId: game.id,
                request: UpdateGameStatusRequest(status: newStatus),
                token: token
            )
            gameStatus = newStatus
            NotificationCenter.default.post(
                name: .mobileRealtimeEvent,
                object: nil,
                userInfo: [
                    "gameId": game.id.uuidString,
                    "type": "game_status",
                    "data": ["status": newStatus]
                ]
            )
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
