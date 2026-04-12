import SwiftUI
import CoreLocation
import os

struct OperatorMapView: View {
    @Environment(AppState.self) private var appState
    @Environment(LocaleManager.self) private var locale
    @Environment(\.colorScheme) private var colorScheme

    let game: Game
    let token: String
    @Binding var bases: [Base]

    private var gameId: UUID { game.id }
    private var tileSource: String { game.tileSource }

    @State private var teams: [Team] = []
    @State private var teamLocations: [TeamLocationResponse] = []
    @State private var teamProgress: [TeamBaseProgressResponse] = []
    @State private var challenges: [Challenge] = []
    @State private var isLoading = true
    @State private var selectedBase: Base?
    @State private var editingBase: Base?
    @State private var pollingTask: Task<Void, Never>?

    // Edit mode
    @State private var editMode = false
    @State private var showBaseCreateSheet = false
    @State private var newBaseCoordinate: CLLocationCoordinate2D?
    @State private var centerTarget: CLLocationCoordinate2D?
    @State private var mapFocusState: MapFocusState = .centerOnMe
    @State private var fitAllBasesId: UUID?
    @StateObject private var locationManager = LocationManagerHelper()

    private enum MapFocusState {
        case centerOnMe, showAllBases
    }

    private let pollInterval: TimeInterval = 5.0

    // MARK: - Computed Stats

    private var pendingCount: Int {
        teamProgress.filter { $0.baseStatus == .submitted }.count
    }

    private var progressPercent: Int {
        let total = teams.count * bases.count
        guard total > 0 else { return 0 }
        let completed = teamProgress.filter { $0.baseStatus == .completed }.count
        return Int((Double(completed) / Double(total)) * 100)
    }

    private var headerSubtitle: String {
        var parts: [String] = []
        if !bases.isEmpty {
            parts.append("\(bases.count) bases")
        }
        if !teams.isEmpty {
            parts.append("\(teams.count) teams")
        }
        return parts.isEmpty ? game.status.capitalized : parts.joined(separator: " · ")
    }

    private var statusColor: Color {
        switch game.status {
        case "live":   return .pfCompleted
        case "setup":  return .pfPending
        default:       return .pfTextMuted
        }
    }

    // MARK: - Body

    var body: some View {
        ZStack {
            let baseAnnotations: [MapAnnotationItem] = bases.map { base in
                let status = aggregateStatus(for: base).toBaseStatus
                return MapAnnotationItem(
                    id: "base-\(base.id.uuidString)-\(status.rawValue)",
                    coordinate: CLLocationCoordinate2D(latitude: base.lat, longitude: base.lng),
                    title: base.name,
                    subtitle: nil,
                    view: AnyView(
                        BaseAnnotationView(
                            status: status,
                            name: base.name,
                            isHidden: base.hidden
                        )
                    ),
                    onTap: { [base] in
                        if editMode {
                            editingBase = base
                        } else {
                            selectedBase = base
                        }
                    }
                )
            }

            // Build clustered player location points (rendered via GeoJSON style layers)
            let clusteredLocations: [PlayerLocationPoint] = teamLocations.compactMap { location in
                guard let team = teams.first(where: { $0.id == location.teamId }) else { return nil }
                let label = location.displayName ?? team.name
                let teamColor: UIColor = UIColor(hex: team.color)
                    ?? UIColor(red: 0.08, green: 0.55, blue: 1.00, alpha: 1.0)
                return PlayerLocationPoint(
                    id: "loc-\(location.id)",
                    coordinate: CLLocationCoordinate2D(latitude: location.lat, longitude: location.lng),
                    color: teamColor,
                    label: label
                )
            }

            let unlockConnections: [(CLLocationCoordinate2D, CLLocationCoordinate2D)] = challenges
                .filter { $0.unlocksBaseIds != nil && !$0.unlocksBaseIds!.isEmpty }
                .flatMap { challenge -> [(CLLocationCoordinate2D, CLLocationCoordinate2D)] in
                    guard let sourceBase = bases.first(where: { $0.fixedChallengeId == challenge.id }) else { return [] }
                    return challenge.unlocksBaseIds!.compactMap { targetId in
                        guard let targetBase = bases.first(where: { $0.id == targetId }) else { return nil }
                        return (
                            CLLocationCoordinate2D(latitude: sourceBase.lat, longitude: sourceBase.lng),
                            CLLocationCoordinate2D(latitude: targetBase.lat, longitude: targetBase.lng)
                        )
                    }
                }

            // Full-screen map
            MapLibreMapView(
                styleURL: TileSources.resolvedStyleURL(for: tileSource, isDark: colorScheme == .dark),
                annotations: baseAnnotations,
                fitCoordinates: bases.map { CLLocationCoordinate2D(latitude: $0.lat, longitude: $0.lng) },
                connections: unlockConnections,
                showsUserLocation: true,
                onLongPress: editMode ? { coordinate in
                    newBaseCoordinate = coordinate
                    showBaseCreateSheet = true
                } : nil,
                centerOnCoordinate: centerTarget,
                fitAllBasesId: fitAllBasesId,
                onUserInteraction: {
                    mapFocusState = .centerOnMe
                },
                clusteredPlayerLocations: clusteredLocations
            )
            .ignoresSafeArea()

            // Loading overlay
            if isLoading && teams.isEmpty {
                ProgressView(locale.t("operator.loading"))
                    .padding()
                    .background(.ultraThinMaterial)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
            }

            // Floating UI stack (left/center column)
            VStack(spacing: 0) {
                headerBar
                statsStrip
                editModeHint
                Spacer()
                MapLegendView()
                    .padding(.bottom, 8)
            }

            // Map control buttons (top-right, below header)
            VStack {
                HStack {
                    Spacer()
                    mapControls
                        .padding(.trailing, 12)
                        .padding(.top, 70)
                }
                Spacer()
            }

            // FAB (bottom-right, edit mode only)
            if editMode {
                VStack {
                    Spacer()
                    HStack {
                        Spacer()
                        fabButton
                            .padding(.trailing, 16)
                            .padding(.bottom, 80)
                    }
                }
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
        .sheet(item: $editingBase) { base in
            NavigationStack {
                BaseEditView(
                    game: game,
                    base: base,
                    bases: bases,
                    challenges: challenges,
                    onSaved: { updatedBase in
                        if let index = bases.firstIndex(where: { $0.id == updatedBase.id }) {
                            bases[index] = updatedBase
                        }
                        editingBase = nil
                    },
                    onDeleted: {
                        bases.removeAll { $0.id == base.id }
                        editingBase = nil
                    }
                )
            }
            .presentationDetents([.large])
        }
        .sheet(isPresented: $showBaseCreateSheet) {
            NavigationStack {
                BaseEditView(
                    game: game,
                    base: nil,
                    bases: bases,
                    challenges: challenges,
                    initialCoordinate: newBaseCoordinate,
                    onSaved: { newBase in
                        bases.append(newBase)
                        showBaseCreateSheet = false
                    }
                )
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button {
                            showBaseCreateSheet = false
                        } label: {
                            Image(systemName: "xmark")
                        }
                    }
                }
            }
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
        .onDisappear {
            pollingTask?.cancel()
            pollingTask = nil
        }
    }

    // MARK: - Floating UI Subviews

    private var headerBar: some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text(game.name)
                    .font(.subheadline)
                    .fontWeight(.bold)
                    .foregroundStyle(.pfText)
                Text(headerSubtitle)
                    .font(.caption2)
                    .fontWeight(.medium)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Text(game.status.uppercased())
                .font(.caption2)
                .fontWeight(.semibold)
                .padding(.horizontal, 8)
                .padding(.vertical, 3)
                .background(statusColor.opacity(0.15))
                .foregroundStyle(statusColor)
                .clipShape(Capsule())
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(.ultraThinMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .shadow(color: .black.opacity(0.08), radius: 8, y: 2)
        .padding(.horizontal, 12)
        .padding(.top, 8)
    }

    @ViewBuilder
    private var statsStrip: some View {
        if game.status == "live" && !teams.isEmpty {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    StatPill(value: "\(teams.count)", label: "Teams", color: .pfText)
                    StatPill(value: "\(pendingCount)", label: "Pending", color: .pfPending)
                    StatPill(value: "\(progressPercent)%", label: "Progress", color: .pfCompleted)
                }
                .padding(.horizontal, 12)
            }
            .padding(.top, 4)
        }
    }

    @ViewBuilder
    private var editModeHint: some View {
        if editMode {
            Text(locale.t("operator.longPressHint"))
                .font(.caption)
                .fontWeight(.medium)
                .foregroundStyle(.white)
                .padding(.horizontal, 14)
                .padding(.vertical, 7)
                .background(Color.pfPrimary.opacity(0.9))
                .clipShape(Capsule())
                .shadow(color: Color.pfPrimary.opacity(0.2), radius: 6, y: 2)
                .padding(.top, 6)
        }
    }

    private var mapControls: some View {
        VStack(spacing: 6) {
            MapControlButton(
                icon: editMode ? "pencil.circle.fill" : "pencil.circle",
                isActive: editMode,
                accessibilityLabel: editMode ? locale.t("operator.editModeOn") : locale.t("operator.editModeOff"),
                accessibilityIdentifier: "map-edit-button"
            ) {
                editMode.toggle()
            }

            MapControlButton(
                icon: mapFocusState == .centerOnMe ? "location" : "map",
                isActive: false,
                accessibilityLabel: mapFocusState == .centerOnMe ? locale.t("map.centerOnMe") : locale.t("map.showAllBases"),
                accessibilityIdentifier: "map-focus-button"
            ) {
                switch mapFocusState {
                case .centerOnMe:
                    if let loc = locationManager.lastLocation {
                        centerTarget = CLLocationCoordinate2D(
                            latitude: loc.latitude,
                            longitude: loc.longitude
                        )
                    }
                    mapFocusState = .showAllBases
                case .showAllBases:
                    fitAllBasesId = UUID()
                    locationManager.requestLocationPermission()
                    mapFocusState = .centerOnMe
                }
            }
        }
    }

    private var fabButton: some View {
        Button {
            if let coord = locationManager.lastLocation {
                newBaseCoordinate = coord
                showBaseCreateSheet = true
            }
        } label: {
            Image(systemName: "plus")
                .font(.title3)
                .fontWeight(.bold)
                .foregroundStyle(.white)
                .frame(width: 52, height: 52)
                .background(Color.pfPrimary)
                .clipShape(Circle())
                .shadow(color: Color.pfPrimary.opacity(0.3), radius: 12, y: 4)
        }
        .accessibilityLabel(locale.t("operator.addBaseAtLocation"))
        .accessibilityIdentifier("map-add-base-button")
    }

    // MARK: - Data Loading

    private func loadInitialData() async {
        isLoading = true

        async let teamsTask: Void = loadTeams()
        async let locationsTask: Void = loadLocations()
        async let progressTask: Void = loadProgress()
        async let challengesTask: Void = loadChallenges()

        _ = await (teamsTask, locationsTask, progressTask, challengesTask)

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

    private func loadChallenges() async {
        do {
            challenges = try await appState.apiClient.getChallenges(gameId: gameId, token: token)
        } catch {
            Logger(subsystem: "com.prayer.pointfinder", category: "OperatorMap").error("Failed to load challenges: \(error.localizedDescription, privacy: .public)")
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
}

// MARK: - Helper Views

private struct StatPill: View {
    let value: String
    let label: String
    let color: Color

    var body: some View {
        VStack(spacing: 2) {
            Text(value)
                .font(.system(.subheadline, design: .rounded))
                .fontWeight(.bold)
                .foregroundStyle(color)
            Text(label)
                .font(.system(size: 9))
                .foregroundStyle(.pfTextMuted)
                .textCase(.uppercase)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .background(.ultraThinMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .shadow(color: .black.opacity(0.05), radius: 4, y: 1)
    }
}

private struct MapControlButton: View {
    let icon: String
    let isActive: Bool
    let accessibilityLabel: String
    let accessibilityIdentifier: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.body)
                .fontWeight(.medium)
                .foregroundStyle(isActive ? .white : Color.pfText)
                .frame(width: 38, height: 38)
                .background(isActive ? AnyShapeStyle(Color.pfPrimary) : AnyShapeStyle(.ultraThinMaterial))
                .clipShape(RoundedRectangle(cornerRadius: 10))
                .shadow(color: .black.opacity(0.08), radius: 4, y: 1)
        }
        .accessibilityLabel(accessibilityLabel)
        .accessibilityIdentifier(accessibilityIdentifier)
    }
}

// MARK: - Location Manager Helper

private class LocationManagerHelper: NSObject, ObservableObject, CLLocationManagerDelegate {
    @Published var lastLocation: CLLocationCoordinate2D?
    private let manager = CLLocationManager()
    private var hasRequestedPermission = false

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBest
        // Defer permission request and location updates until explicitly requested
    }

    func requestLocationPermission() {
        guard !hasRequestedPermission else { return }
        hasRequestedPermission = true
        manager.requestWhenInUseAuthorization()
        manager.startUpdatingLocation()
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        lastLocation = locations.last?.coordinate
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        if manager.authorizationStatus == .authorizedWhenInUse || manager.authorizationStatus == .authorizedAlways {
            manager.startUpdatingLocation()
        }
    }
}
