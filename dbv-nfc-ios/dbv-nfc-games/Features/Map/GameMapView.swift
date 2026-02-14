import SwiftUI
import MapKit
import UIKit

struct GameMapView: View {
    @Environment(AppState.self) private var appState
    @Environment(LocaleManager.self) private var locale
    @State private var selectedBase: BaseProgress?
    @State private var cameraPosition: MapCameraPosition = .automatic

    var body: some View {
        NavigationStack {
            ZStack {
                let status = appState.currentGame?.status
                let shouldBlockGameplay = status == "setup" || status == "ended"
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
                                selectedBase = base
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

                if shouldBlockGameplay {
                    Color.black.opacity(0.35)
                        .ignoresSafeArea()
                    VStack(spacing: 10) {
                        Text(locale.t("player.gameNotLiveTitle"))
                            .font(.headline)
                        Text(locale.t("player.gameNotLiveMessage"))
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                    }
                    .padding(20)
                    .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14))
                    .padding(.horizontal, 24)
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
            .sheet(item: $selectedBase) { base in
                BaseDetailSheet(baseId: base.baseId)
            }
            .refreshable {
                await appState.loadProgress()
            }
            .task(id: "\(appState.currentGame?.status ?? "none")-\(appState.isOnline)") {
                guard appState.isOnline, appState.currentGame?.status != "live" else { return }
                while !Task.isCancelled && appState.isOnline && appState.currentGame?.status != "live" {
                    try? await Task.sleep(nanoseconds: 10_000_000_000)
                    await appState.loadProgress()
                }
            }
            .onReceive(NotificationCenter.default.publisher(for: UIApplication.willEnterForegroundNotification)) { _ in
                guard appState.isOnline, appState.currentGame?.status != "live" else { return }
                Task { await appState.loadProgress() }
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
