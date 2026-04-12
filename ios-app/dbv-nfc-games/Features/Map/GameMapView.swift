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

                // P1 Phase 4 W4: marker labels show the challenge title
                // (the thing a player is looking for on their phone),
                // not the operator-oriented base name. Hidden bases with
                // no assigned challenge fall back to the localized
                // placeholder via `displayTitle`.
                let mapLabelDefault = locale.t("base.defaultName")
                let annotations = appState.baseProgress.map { base in
                    let label = base.challengeTitle?.isEmpty == false
                        ? (base.challengeTitle ?? mapLabelDefault)
                        : mapLabelDefault
                    return MapAnnotationItem(
                        id: base.baseId.uuidString,
                        coordinate: CLLocationCoordinate2D(latitude: base.lat, longitude: base.lng),
                        title: label,
                        subtitle: base.baseStatus.rawValue,
                        view: AnyView(
                            BaseAnnotationView(
                                status: base.baseStatus,
                                name: label
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

                // Floating UI stack
                VStack(spacing: 0) {
                    playerHeaderBar
                    Spacer()
                    MapLegendView()
                        .padding(.bottom, 8)
                }

                if shouldBlockGameplay {
                    Color.black.opacity(0.45)
                        .ignoresSafeArea()
                    gameNotLiveCard
                }
            }
            .navigationBarHidden(true)
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

    // MARK: - Floating Glass Header

    private var playerHeaderBar: some View {
        HStack(spacing: 8) {
            VStack(alignment: .leading, spacing: 2) {
                Text(appState.currentGame?.name ?? locale.t("common.map"))
                    .font(.subheadline)
                    .fontWeight(.bold)
                    .foregroundStyle(Color.pfText)
                if appState.currentGame?.status == "live" {
                    Text("LIVE")
                        .font(.caption2)
                        .fontWeight(.semibold)
                        .foregroundStyle(.secondary)
                }
            }
            Spacer()

            // Notification bell
            Button {
                showNotifications = true
            } label: {
                Image(systemName: "bell.fill")
                    .font(.body)
                    .foregroundStyle(appState.unseenNotificationCount > 0 ? Color.pfPrimary : Color.pfTextMuted)
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
                    .frame(width: 36, height: 36)
                    .background(.ultraThinMaterial)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                    .shadow(color: .black.opacity(0.08), radius: 4, y: 1)
            }
            .accessibilityLabel(locale.t("common.notifications"))

            // Refresh button
            Button {
                Task { await appState.loadProgress() }
            } label: {
                Image(systemName: "arrow.clockwise")
                    .font(.body)
                    .fontWeight(.medium)
                    .foregroundStyle(Color.pfTextMuted)
                    .frame(width: 36, height: 36)
                    .background(.ultraThinMaterial)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                    .shadow(color: .black.opacity(0.08), radius: 4, y: 1)
            }
            .accessibilityLabel(locale.t("common.refresh"))
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(.ultraThinMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .shadow(color: .black.opacity(0.08), radius: 8, y: 2)
        .padding(.horizontal, 12)
        .padding(.top, 8)
    }

    // MARK: - Game Not Live Overlay

    private var gameNotLiveCard: some View {
        VStack(spacing: 16) {
            Image(systemName: "clock.fill")
                .font(.system(size: 40))
                .foregroundStyle(Color.pfTextMuted)
            Text(locale.t("player.gameNotLiveTitle"))
                .font(.headline)
                .foregroundStyle(Color.pfText)
            Text(locale.t("player.gameNotLiveMessage"))
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding(24)
        .background(.ultraThinMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 20))
        .shadow(color: .black.opacity(0.12), radius: 16, y: 4)
        .padding(.horizontal, 32)
    }
}

// MARK: - Legend

struct MapLegendView: View {
    @Environment(LocaleManager.self) private var locale

    var body: some View {
        HStack(spacing: 12) {
            legendItem(color: BaseStatus.notVisited.color, label: locale.t("map.notVisited"))
            legendItem(color: BaseStatus.checkedIn.color, label: locale.t("map.checkedIn"))
            legendItem(color: BaseStatus.submitted.color, label: locale.t("map.pending"))
            legendItem(color: BaseStatus.completed.color, label: locale.t("map.completed"))
            legendItem(color: BaseStatus.rejected.color, label: locale.t("map.rejected"))
        }
        .font(.caption2)
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(.ultraThinMaterial)
        .clipShape(RoundedRectangle(cornerRadius: PFRadius.small))
        .shadow(color: .black.opacity(0.05), radius: 4, y: 1)
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
