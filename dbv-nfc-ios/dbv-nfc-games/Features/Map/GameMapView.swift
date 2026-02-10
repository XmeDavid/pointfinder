import SwiftUI
import MapKit

struct GameMapView: View {
    @Environment(AppState.self) private var appState
    @Environment(LocaleManager.self) private var locale
    @State private var selectedBaseId: UUID?
    @State private var showBaseDetail = false
    @State private var cameraPosition: MapCameraPosition = .automatic

    var body: some View {
        NavigationStack {
            ZStack {
                Map(position: $cameraPosition) {
                    ForEach(appState.baseProgress) { base in
                        Annotation(
                            base.baseName,
                            coordinate: CLLocationCoordinate2D(latitude: base.lat, longitude: base.lng)
                        ) {
                            BaseAnnotationView(
                                status: base.baseStatus,
                                name: base.baseName
                            )
                            .onTapGesture {
                                selectedBaseId = base.baseId
                                showBaseDetail = true
                            }
                        }
                    }
                }
                .mapStyle(.standard(elevation: .flat))
                .mapControls {
                    MapCompass()
                    MapScaleView()
                }

                // Legend overlay
                VStack {
                    Spacer()
                    MapLegendView()
                        .padding(.bottom, 8)
                }
            }
            .navigationTitle(appState.currentGame?.name ?? locale.t("map.defaultTitle"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        Task { await appState.loadProgress() }
                    } label: {
                        Image(systemName: "arrow.clockwise")
                    }
                }
            }
            .sheet(isPresented: $showBaseDetail) {
                if let baseId = selectedBaseId {
                    BaseDetailSheet(baseId: baseId)
                }
            }
            .refreshable {
                await appState.loadProgress()
            }
            .alert(locale.t("common.error"), isPresented: Binding(
                get: { appState.showError },
                set: { if !$0 { appState.showError = false } }
            )) {
                Button(locale.t("common.ok")) {
                    appState.showError = false
                }
            } message: {
                Text(appState.errorMessage ?? locale.t("common.unknownError"))
            }
        }
    }
}

// MARK: - Legend

struct MapLegendView: View {
    @Environment(LocaleManager.self) private var locale

    var body: some View {
        HStack(spacing: 12) {
            legendItem(color: .gray, label: locale.t("map.notVisited"))
            legendItem(color: .blue, label: locale.t("map.checkedIn"))
            legendItem(color: .orange, label: locale.t("map.pending"))
            legendItem(color: .green, label: locale.t("map.completed"))
        }
        .font(.caption2)
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 8))
        .padding(.horizontal)
    }

    private func legendItem(color: Color, label: String) -> some View {
        HStack(spacing: 4) {
            Circle()
                .fill(color)
                .frame(width: 8, height: 8)
            Text(label)
                .foregroundStyle(.secondary)
        }
    }
}

#Preview {
    GameMapView()
        .environment(AppState())
        .environment(LocaleManager())
}
