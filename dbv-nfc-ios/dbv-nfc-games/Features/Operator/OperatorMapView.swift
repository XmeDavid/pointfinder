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
    
    private let apiClient = APIClient()
    private let pollInterval: TimeInterval = 5.0
    
    var body: some View {
        ZStack {
            Map(position: $cameraPosition) {
                // Base annotations
                ForEach(bases) { base in
                    Annotation(base.name, coordinate: CLLocationCoordinate2D(latitude: base.lat, longitude: base.lng)) {
                        BaseAnnotationView(
                            base: base,
                            aggregateStatus: aggregateStatus(for: base)
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
            
            if isLoading && teams.isEmpty {
                ProgressView("Loading...")
                    .padding()
                    .background(.ultraThinMaterial)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
            }
            
            // Legend overlay
            VStack {
                Spacer()
                HStack {
                    MapLegendView()
                        .padding(8)
                        .background(.ultraThinMaterial)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                    Spacer()
                }
                .padding()
            }
        }
        .sheet(item: $selectedBase) { base in
            OperatorBaseProgressSheet(
                base: base,
                teams: teams,
                progress: teamProgress.filter { $0.baseId == base.id }
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
            
            // Poll locations and progress (teams rarely change)
            await loadLocations()
            await loadProgress()
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

// MARK: - Base Annotation View

struct BaseAnnotationView: View {
    let base: Base
    let aggregateStatus: AggregateBaseStatus
    
    var body: some View {
        VStack(spacing: 0) {
            ZStack {
                Circle()
                    .fill(aggregateStatus.color)
                    .frame(width: 36, height: 36)
                
                Image(systemName: "mappin")
                    .font(.system(size: 18, weight: .bold))
                    .foregroundStyle(.white)
            }
            
            // Triangle pointer
            Triangle()
                .fill(aggregateStatus.color)
                .frame(width: 12, height: 8)
                .offset(y: -2)
        }
        .shadow(color: .black.opacity(0.3), radius: 3, x: 0, y: 2)
    }
}

struct Triangle: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.move(to: CGPoint(x: rect.midX, y: rect.maxY))
        path.addLine(to: CGPoint(x: rect.minX, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.minY))
        path.closeSubpath()
        return path
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
                
                Circle()
                    .strokeBorder(location.isStale ? .gray.opacity(0.5) : teamColor.opacity(0.5), lineWidth: location.isStale ? 2 : 0)
                    .frame(width: 32, height: 32)
                
                if location.isStale {
                    Image(systemName: "wifi.slash")
                        .font(.system(size: 10))
                        .foregroundStyle(.white)
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

// MARK: - Map Legend View

struct MapLegendView: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Status")
                .font(.caption2)
                .fontWeight(.semibold)
                .foregroundStyle(.secondary)
            
            LegendItem(color: .gray, label: "Not Visited")
            LegendItem(color: .blue, label: "Checked In")
            LegendItem(color: .orange, label: "Pending Review")
            LegendItem(color: .red, label: "Rejected")
            LegendItem(color: .green, label: "Completed")
        }
    }
}

struct LegendItem: View {
    let color: Color
    let label: String
    
    var body: some View {
        HStack(spacing: 6) {
            Circle()
                .fill(color)
                .frame(width: 10, height: 10)
            Text(label)
                .font(.caption2)
                .foregroundStyle(.primary)
        }
    }
}
