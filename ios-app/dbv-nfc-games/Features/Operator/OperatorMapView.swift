import SwiftUI
import MapKit
import os

struct OperatorMapView: View {
    @Environment(AppState.self) private var appState
    @Environment(LocaleManager.self) private var locale

    let gameId: UUID
    let token: String
    @Binding var bases: [Base]
    
    @State private var teams: [Team] = []
    @State private var teamLocations: [TeamLocationResponse] = []
    @State private var teamProgress: [TeamBaseProgressResponse] = []
    @State private var isLoading = true
    @State private var selectedBase: Base?
    @State private var cameraPosition: MapCameraPosition = .automatic
    @State private var pollingTask: Task<Void, Never>?
    
    private let pollInterval: TimeInterval = 5.0
    
    var body: some View {
        ZStack {
            Map(position: $cameraPosition) {
                // Base annotations
                ForEach(bases) { base in
                    let status = aggregateStatus(for: base).toBaseStatus
                    Annotation(base.name, coordinate: CLLocationCoordinate2D(latitude: base.lat, longitude: base.lng)) {
                        BaseAnnotationView(
                            status: status,
                            name: base.name,
                            isHidden: base.hidden
                        )
                        .onTapGesture {
                            selectedBase = base
                        }
                    }
                }
                
                // Player location annotations (one per player)
                ForEach(teamLocations) { location in
                    if let team = teams.first(where: { $0.id == location.teamId }) {
                        let label = location.displayName ?? team.name
                        Annotation(label, coordinate: CLLocationCoordinate2D(latitude: location.lat, longitude: location.lng)) {
                            TeamLocationAnnotationView(team: team, location: location)
                        }
                    }
                }
            }
            .mapStyle(.standard)
            
            if isLoading && teams.isEmpty {
                ProgressView(locale.t("operator.loading"))
                    .padding()
                    .background(.ultraThinMaterial)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
            }
            
            // Legend overlay
            VStack {
                Spacer()
                MapLegendView()
                    .padding(.bottom, 8)
            }
        }
        .sheet(item: $selectedBase) { base in
            LiveBaseProgressSheet(
                gameId: gameId,
                token: token,
                base: base,
                onNfcLinked: { baseId in
                    if let index = bases.firstIndex(where: { $0.id == baseId }) {
                        bases[index].nfcLinked = true
                    }
                }
            )
            .presentationDetents([.medium, .large])
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
            case "location":
                Task { await loadLocations() }
            case "activity", "submission_status", "game_status", "notification":
                Task {
                    await loadLocations()
                    await loadProgress()
                }
            default:
                break
            }
        }
        .onAppear {
            updateCameraPosition()
        }
        .onDisappear {
            pollingTask?.cancel()
            pollingTask = nil
        }
    }
    
    // MARK: - Data Loading
    
    private func loadInitialData() async {
        isLoading = true
        
        async let teamsTask = loadTeams()
        async let locationsTask = loadLocations()
        async let progressTask = loadProgress()
        
        _ = await (teamsTask, locationsTask, progressTask)
        
        isLoading = false
    }
    
    private func loadTeams() async {
        do {
            teams = try await appState.apiClient.getTeams(gameId: gameId, token: token)
        } catch {
            Logger(subsystem: "com.prayer.pointfinder", category: "OperatorMap").error("Failed to load teams: \(error.localizedDescription, privacy: .public)")
        }
    }
    
    private func loadLocations() async {
        do {
            teamLocations = try await appState.apiClient.getTeamLocations(gameId: gameId, token: token)
        } catch {
            Logger(subsystem: "com.prayer.pointfinder", category: "OperatorMap").error("Failed to load locations: \(error.localizedDescription, privacy: .public)")
        }
    }
    
    private func loadProgress() async {
        do {
            teamProgress = try await appState.apiClient.getTeamProgress(gameId: gameId, token: token)
        } catch {
            Logger(subsystem: "com.prayer.pointfinder", category: "OperatorMap").error("Failed to load progress: \(error.localizedDescription, privacy: .public)")
        }
    }
    
    private func startPolling() {
        pollingTask?.cancel()
        pollingTask = Task {
            while !Task.isCancelled {
                let interval = appState.realtimeConnected ? 20.0 : pollInterval
                try? await Task.sleep(for: .seconds(interval))
                if !appState.realtimeConnected {
                    await loadLocations()
                    await loadProgress()
                }
            }
        }
    }
    
    // MARK: - Helpers
    
    private func aggregateStatus(for base: Base) -> AggregateBaseStatus {
        let baseProgress = teamProgress.filter { $0.baseId == base.id }
        
        if baseProgress.isEmpty {
            return .notVisited
        }
        
        let statuses = baseProgress.map { $0.baseStatus }
        return AggregateBaseStatus.aggregate(statuses)
    }
    
    private func updateCameraPosition() {
        guard !bases.isEmpty else { return }
        
        let coordinates = bases.map { CLLocationCoordinate2D(latitude: $0.lat, longitude: $0.lng) }
        
        let minLat = coordinates.map(\.latitude).min() ?? 0
        let maxLat = coordinates.map(\.latitude).max() ?? 0
        let minLng = coordinates.map(\.longitude).min() ?? 0
        let maxLng = coordinates.map(\.longitude).max() ?? 0
        
        let center = CLLocationCoordinate2D(
            latitude: (minLat + maxLat) / 2,
            longitude: (minLng + maxLng) / 2
        )
        
        let span = MKCoordinateSpan(
            latitudeDelta: max((maxLat - minLat) * 1.5, 0.01),
            longitudeDelta: max((maxLng - minLng) * 1.5, 0.01)
        )
        
        cameraPosition = .region(MKCoordinateRegion(center: center, span: span))
    }
}

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
                                    TeamStatusRow(
                                        team: team,
                                        progress: progress.first { $0.teamId == team.id }
                                    )
                                }
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

// MARK: - Team Location Annotation View

struct TeamLocationAnnotationView: View {
    let team: Team
    let location: TeamLocationResponse
    
    private var teamColor: Color {
        Color(hex: team.color) ?? .blue
    }
    
    var body: some View {
        VStack(spacing: 2) {
            ZStack {
                Circle()
                    .fill(location.isStale ? .gray : teamColor)
                    .frame(width: 24, height: 24)
                
                if location.isStale {
                    Image(systemName: "wifi.slash")
                        .font(.system(size: 10))
                        .foregroundStyle(.white)
                } else {
                    Circle()
                        .strokeBorder(teamColor.opacity(0.4), lineWidth: 3)
                        .frame(width: 32, height: 32)
                }
            }
            .opacity(location.isStale ? 0.6 : 1.0)
            
            VStack(spacing: 0) {
                Text(location.displayName ?? team.name)
                    .font(.caption2)
                    .fontWeight(.medium)
                if location.displayName != nil {
                    Text(team.name)
                        .font(.system(size: 8))
                        .foregroundStyle(.secondary)
                }
            }
            .padding(.horizontal, 4)
            .padding(.vertical, 2)
            .background(.ultraThinMaterial)
            .clipShape(RoundedRectangle(cornerRadius: 4))
            .opacity(location.isStale ? 0.6 : 1.0)
        }
    }
}
