import SwiftUI
import UIKit

struct CheckInTabView: View {
    @Environment(AppState.self) private var appState
    @Environment(LocaleManager.self) private var locale
    @State private var nfcReader = NFCReaderService()
    @State private var isScanning = false
    @State private var scanError: String?
    @State private var navigationPath = NavigationPath()
    @State private var failedSyncCount = 0
    @State private var showSyncSheet = false

    var body: some View {
        NavigationStack(path: $navigationPath) {
            ZStack {
                let status = appState.currentGame?.status
                let shouldBlockGameplay = status == "setup" || status == "ended"
                VStack(spacing: 24) {
                    Spacer()

                    // Check-in illustration
                    VStack(spacing: 16) {
                        ZStack {
                            Circle()
                                .fill(Color.accentColor.opacity(0.1))
                                .frame(width: 160, height: 160)

                            Circle()
                                .fill(Color.accentColor.opacity(0.2))
                                .frame(width: 120, height: 120)

                            Image(systemName: "mappin.and.ellipse")
                                .font(.system(size: 48))
                                .foregroundStyle(.secondary)
                                .symbolEffect(.pulse, isActive: isScanning)
                        }

                        Text(locale.t("checkIn.title"))
                            .font(.title2)
                            .fontWeight(.bold)

                        Text(locale.t("checkIn.instructions"))
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 40)
                    }

                    if let error = scanError {
                        Text(error)
                            .font(.caption)
                            .foregroundStyle(.red)
                            .padding(.horizontal)
                    }

                    // Pending sync indicator
                    if appState.pendingActionsCount > 0 {
                        HStack(spacing: 8) {
                            Image(systemName: "arrow.triangle.2.circlepath")
                                .foregroundStyle(.orange)
                            let key = appState.pendingActionsCount == 1
                                ? "checkIn.pendingSyncOne"
                                : "checkIn.pendingSyncOther"
                            Text(locale.t(key, appState.pendingActionsCount))
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        .padding(.horizontal)
                    }

                    if failedSyncCount > 0 {
                        HStack(spacing: 8) {
                            Image(systemName: "exclamationmark.triangle.fill")
                                .foregroundStyle(.red)
                            Text(locale.t("offline.failedSubmissions", String(failedSyncCount)))
                                .font(.caption)
                                .foregroundStyle(.red)
                        }
                        .padding(.horizontal)
                    }

                    if let syncError = appState.syncEngine.lastSyncError, !syncError.isEmpty {
                        Text(syncError)
                            .font(.caption2)
                            .foregroundStyle(.orange)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 24)
                    }

                    Spacer()

                    // Check-in button
                    Button {
                        Task { await performCheckIn() }
                    } label: {
                        Label(
                            isScanning ? locale.t("checkIn.checkingIn") : locale.t("checkIn.checkInAtBase"),
                            systemImage: "location.circle.fill"
                        )
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(isScanning ? Color.gray : Color.accentColor)
                        .foregroundStyle(.white)
                        .clipShape(RoundedRectangle(cornerRadius: 14))
                    }
                    .disabled(isScanning || shouldBlockGameplay)
                    .padding(.horizontal, 24)
                    .padding(.bottom, 24)
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
            .navigationTitle(locale.t("common.checkIn"))
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    SyncStatusBanner(showSheet: $showSyncSheet)
                }
            }
            .sheet(isPresented: $showSyncSheet) {
                SyncQueueSheet()
            }
            .navigationDestination(for: UUID.self) { baseId in
                BaseCheckInDetailView(baseId: baseId, popToRoot: popToRoot)
            }
            .task(id: "\(appState.currentGame?.status ?? "none")-\(appState.isOnline)") {
                _ = appState.startProgressPollingTask()
            }
            .onReceive(NotificationCenter.default.publisher(for: UIApplication.willEnterForegroundNotification)) { _ in
                appState.realtimeClient.ensureConnected()
                appState.locationService.resumeIfNeeded()
                guard appState.isOnline, appState.currentGame?.status != "live" else { return }
                Task { await appState.loadProgress() }
            }
            .task {
                failedSyncCount = await OfflineQueue.shared.failedCount
            }
            .onAppear { consumeDeepLink() }
            .onChange(of: appState.pendingDeepLinkBaseId) { consumeDeepLink() }
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

    private func popToRoot() {
        navigationPath.removeLast(navigationPath.count)
    }

    private func consumeDeepLink() {
        if let baseId = appState.pendingDeepLinkBaseId {
            appState.pendingDeepLinkBaseId = nil
            Task { await performDeepLinkCheckIn(baseId: baseId) }
        }
    }

    private func performDeepLinkCheckIn(baseId: UUID) async {
        isScanning = true
        scanError = nil

        let result = await appState.checkIn(baseId: baseId)
        if result != nil {
            navigationPath.append(baseId)
        }

        isScanning = false
    }

    private func performCheckIn() async {
        isScanning = true
        scanError = nil

        do {
            let payload = try await nfcReader.scanForBaseId()
            let result = await appState.checkIn(baseId: payload.baseId, nfcToken: payload.nfcToken)
            if result != nil {
                navigationPath.append(payload.baseId)
            }
        } catch let error as NFCError {
            if case .cancelled = error {
                // User cancelled, no error to show
            } else {
                scanError = error.localizedDescription
            }
        } catch {
            scanError = error.localizedDescription
        }

        isScanning = false
    }
}

#Preview {
    CheckInTabView()
        .environment(AppState())
        .environment(LocaleManager())
}
