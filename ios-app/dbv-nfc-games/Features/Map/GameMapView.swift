import SwiftUI
import UIKit
import CoreLocation

struct GameMapView: View {
    @Environment(AppState.self) private var appState
    @Environment(LocaleManager.self) private var locale
    @Environment(\.colorScheme) private var colorScheme
    @State private var selectedBase: BaseProgress?
    @State private var showNotifications = false

    var body: some View {
        NavigationStack {
            ZStack {
                let status = appState.currentGame?.status
                let shouldBlockGameplay = status == "setup" || status == "ended"

                let annotations = appState.baseProgress.map { base in
                    MapAnnotationItem(
                        id: base.baseId.uuidString,
                        coordinate: CLLocationCoordinate2D(latitude: base.lat, longitude: base.lng),
                        title: base.baseName,
                        subtitle: base.baseStatus.rawValue,
                        view: AnyView(
                            BaseAnnotationView(
                                status: base.baseStatus,
                                name: base.baseName
                            )
                        ),
                        onTap: { [base] in selectedBase = base }
                    )
                }

                MapLibreMapView(
                    styleURL: TileSources.resolvedStyleURL(for: appState.currentGame?.tileSource, isDark: colorScheme == .dark),
                    annotations: annotations,
                    fitCoordinates: appState.baseProgress.map {
                        CLLocationCoordinate2D(latitude: $0.lat, longitude: $0.lng)
                    }
                )
                .ignoresSafeArea()
                .accessibilityIdentifier("player-base-list")

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
            .navigationTitle(appState.currentGame?.name ?? locale.t("common.map"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    HStack(spacing: 16) {
                        Button {
                            showNotifications = true
                        } label: {
                            Image(systemName: "bell.fill")
                                .overlay(alignment: .topTrailing) {
                                    if appState.unseenNotificationCount > 0 {
                                        Text(appState.unseenNotificationCount > 99 ? "99+" : "\(appState.unseenNotificationCount)")
                                            .font(.system(size: 10, weight: .bold))
                                            .foregroundStyle(.white)
                                            .padding(3)
                                            .background(Color.red, in: Circle())
                                            .offset(x: 6, y: -6)
                                    }
                                }
                        }
                        .accessibilityLabel(locale.t("common.notifications"))
                        Button {
                            Task { await appState.loadProgress() }
                        } label: {
                            Image(systemName: "arrow.clockwise")
                        }
                        .accessibilityLabel(locale.t("common.refresh"))
                    }
                }
            }
            .navigationDestination(isPresented: $showNotifications) {
                PlayerNotificationListView()
            }
            .task {
                await appState.loadUnseenNotificationCount()
            }
            .sheet(item: $selectedBase) { base in
                BaseDetailSheet(baseId: base.baseId)
            }
            .refreshable {
                await appState.loadProgress()
            }
            .task(id: "\(appState.currentGame?.status ?? "none")-\(appState.isOnline)") {
                _ = appState.startProgressPollingTask()
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
            legendItem(color: .red, label: locale.t("map.rejected"))
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
