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
                    PlayerMapLegend(items: mapLegendItems)
                        .padding(.horizontal, PFSpaceToken.space4)
                        .padding(.bottom, 8)
                }

                if shouldBlockGameplay {
                    PFColorToken.surfaceScrim
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
        PlayerMapHeader(
            title: appState.currentGame?.name ?? locale.t("common.map"),
            liveLabel: appState.currentGame?.status == "live" ? locale.t("game.status.live") : nil,
            unseenNotificationCount: appState.unseenNotificationCount,
            notificationsLabel: locale.t("common.notifications"),
            refreshLabel: locale.t("common.refresh"),
            onNotifications: { showNotifications = true },
            onRefresh: { Task { await appState.loadProgress() } }
        )
        .padding(.horizontal, 12)
        .padding(.top, 8)
    }

    private var mapLegendItems: [PlayerMapLegendItem] {
        [
            .init(locale.t("map.notVisited"), tone: .unknown),
            .init(locale.t("map.checkedIn"), tone: .info),
            .init(locale.t("map.pending"), tone: .pending),
            .init(locale.t("map.completed"), tone: .success),
            .init(locale.t("map.rejected"), tone: .danger),
        ]
    }

    // MARK: - Game Not Live Overlay

    private var gameNotLiveCard: some View {
        PlayerDetailMessage(
            systemImage: "clock.fill",
            title: locale.t("player.gameNotLiveTitle"),
            message: locale.t("player.gameNotLiveMessage")
        )
        .padding(PFSpaceToken.space6)
        .background(PFColorToken.surfaceOverlay)
        .clipShape(RoundedRectangle(cornerRadius: PFRadiusToken.lg))
        .shadow(color: PFShadowToken.overlay.color, radius: PFShadowToken.overlay.radius, y: PFShadowToken.overlay.y)
        .padding(.horizontal, 32)
    }
}

#Preview {
    GameMapView()
        .environment(AppState())
        .environment(LocaleManager())
}

/// Compatibility wrapper shared by existing operator map surfaces.
/// Visual styling is owned by the canonical scroll-safe map legend component.
struct MapLegendView: View {
    @Environment(LocaleManager.self) private var locale

    var body: some View {
        PlayerMapLegend(items: [
            .init(locale.t("map.notVisited"), tone: .unknown),
            .init(locale.t("map.checkedIn"), tone: .info),
            .init(locale.t("map.pending"), tone: .pending),
            .init(locale.t("map.completed"), tone: .success),
            .init(locale.t("map.rejected"), tone: .danger),
        ])
        .padding(.horizontal, PFSpaceToken.space4)
    }
}
