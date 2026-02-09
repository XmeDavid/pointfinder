import SwiftUI
import MapKit

struct OperatorMapView: View {
    let gameId: UUID
    let token: String
    let bases: [Base]
    
    @State private var teams: [Team] = []
    @State private var teamLocations: [TeamLocationResponse] = []
    @State private var teamProgress: [TeamBaseProgressResponse] = []
    @State private var isLoading = true
    @State private var selectedBase: Base?
    @State private var cameraPosition: MapCameraPosition = .automatic
    
    /// Incremented on each poll to force the Map to re-render annotations
    @State private var progressVersion: Int = 0
    
    private let apiClient = APIClient()
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
                            name: base.name
                        )
                        .onTapGesture {
                            selectedBase = base
                        }
                    }
                }
                
                // Team location annotations
                ForEach(teamLocations) { location in
                    if let team = teams.first(where: { $0.id == location.teamId }) {
                        Annotation(team.name, coordinate: CLLocationCoordinate2D(latitude: location.lat, longitude: location.lng)) {
                            TeamLocationAnnotationView(team: team, location: location)
                        }
                    }
                }
            }
            .mapStyle(.standard)
            // Force the entire Map to re-render when progress or locations change
            .id(progressVersion)
            
            if isLoading && teams.isEmpty {
                ProgressView("Loading...")
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
                base: base
            )
            .presentationDetents([.medium, .large])
        }
        .task {
            await loadInitialData()
            await startPolling()
        }
        .onAppear {
            updateCameraPosition()
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
            teams = try await apiClient.getTeams(gameId: gameId, token: token)
        } catch {
            print("Failed to load teams: \(error)")
        }
    }
    
    private func loadLocations() async {
        do {
            teamLocations = try await apiClient.getTeamLocations(gameId: gameId, token: token)
        } catch {
            print("Failed to load locations: \(error)")
        }
    }
    
    private func loadProgress() async {
        do {
            teamProgress = try await apiClient.getTeamProgress(gameId: gameId, token: token)
        } catch {
            print("Failed to load progress: \(error)")
        }
    }
    
    private func startPolling() async {
        while !Task.isCancelled {
            try? await Task.sleep(for: .seconds(pollInterval))
            
            // Poll locations and progress
            await loadLocations()
            await loadProgress()
            
            // Bump version to force Map re-render
            progressVersion += 1
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
    @Environment(\.dismiss) private var dismiss
    
    let gameId: UUID
    let token: String
    let base: Base
    
    @State private var teams: [Team] = []
    @State private var progress: [TeamBaseProgressResponse] = []
    @State private var isLoading = true
    
    private let apiClient = APIClient()
    
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
                            
                            if base.nfcLinked {
                                Label("NFC Linked", systemImage: "checkmark.circle.fill")
                                    .font(.caption)
                                    .foregroundStyle(.green)
                            } else {
                                Label("NFC Not Linked", systemImage: "xmark.circle")
                                    .font(.caption)
                                    .foregroundStyle(.orange)
                            }
                        }
                    }
                    .padding()
                    .frame(maxWidth: .infinity, alignment: .leading)
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
                            Text("Team Status")
                                .font(.headline)
                            
                            if teams.isEmpty {
                                Text("No teams in this game yet")
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
            .navigationTitle("Base Details")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
        }
        .task {
            await loadData()
            await pollWhileOpen()
        }
    }
    
    private func loadData() async {
        do {
            async let teamsResult = apiClient.getTeams(gameId: gameId, token: token)
            async let progressResult = apiClient.getTeamProgress(gameId: gameId, token: token)
            
            let (fetchedTeams, allProgress) = try await (teamsResult, progressResult)
            teams = fetchedTeams
            progress = allProgress.filter { $0.baseId == base.id }
        } catch {
            print("Failed to load sheet data: \(error)")
        }
        isLoading = false
    }
    
    private func pollWhileOpen() async {
        while !Task.isCancelled {
            try? await Task.sleep(for: .seconds(5))
            
            do {
                let allProgress = try await apiClient.getTeamProgress(gameId: gameId, token: token)
                progress = allProgress.filter { $0.baseId == base.id }
            } catch {
                // Silently continue polling
            }
        }
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
            
            Text(team.name)
                .font(.caption2)
                .fontWeight(.medium)
                .padding(.horizontal, 4)
                .padding(.vertical, 2)
                .background(.ultraThinMaterial)
                .clipShape(RoundedRectangle(cornerRadius: 4))
                .opacity(location.isStale ? 0.6 : 1.0)
        }
    }
}
