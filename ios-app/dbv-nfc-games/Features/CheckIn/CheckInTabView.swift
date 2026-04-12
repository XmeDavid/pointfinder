import SwiftUI
import UIKit
import CoreNFC

struct CheckInTabView: View {
    @Environment(AppState.self) private var appState
    @Environment(LocaleManager.self) private var locale
    @State private var nfcReader = NFCReaderService()
    @State private var isScanning = false
    @State private var scanError: String?
    @State private var navigationPath = NavigationPath()
    @State private var failedSyncCount = 0
    @State private var showSyncSheet = false
    /// Whether this device has NFC hardware capable of reading tags.
    /// Checked on every onAppear since it is static for a given device.
    @State private var nfcSupported: Bool = NFCTagReaderSession.readingAvailable

    var body: some View {
        NavigationStack(path: $navigationPath) {
            ZStack {
                let status = appState.currentGame?.status
                let shouldBlockGameplay = status == "setup" || status == "ended"

                if !nfcSupported {
                    // Full-screen NFC unsupported state — no settings button since iOS
                    // has no user-toggleable NFC switch.
                    NfcUnsupportedView()
                } else {
                    VStack(spacing: 24) {
                        Spacer()

                        // Check-in illustration — animated scan area
                        VStack(spacing: 20) {
                            AnimatedScanView(isScanning: isScanning)
                                .frame(width: 260, height: 260)

                            Text(locale.t("checkIn.title"))
                                .font(.title2)
                                .fontWeight(.bold)
                                .foregroundStyle(Color.pfText)

                            Text(locale.t("checkIn.instructions"))
                                .font(.subheadline)
                                .foregroundStyle(Color.pfTextMuted)
                                .multilineTextAlignment(.center)
                                .padding(.horizontal, 40)
                        }

                        if let error = scanError {
                            Text(error)
                                .font(.caption)
                                .foregroundStyle(.red)
                                .padding(.horizontal)
                        }

                        // Sync indicators
                        VStack(spacing: 8) {
                            // Pending sync indicator
                            if appState.pendingActionsCount > 0 {
                                HStack(spacing: 8) {
                                    Image(systemName: "arrow.triangle.2.circlepath")
                                        .foregroundStyle(Color.pfPending)
                                    let key = appState.pendingActionsCount == 1
                                        ? "checkIn.pendingSyncOne"
                                        : "checkIn.pendingSyncOther"
                                    Text(locale.t(key, appState.pendingActionsCount))
                                        .font(.caption)
                                        .foregroundStyle(Color.pfTextMuted)
                                }
                                .padding(10)
                                .background(Color.pfPending.opacity(0.08))
                                .clipShape(RoundedRectangle(cornerRadius: PFRadius.small))
                            }

                            if failedSyncCount > 0 {
                                HStack(spacing: 8) {
                                    Image(systemName: "exclamationmark.triangle.fill")
                                        .foregroundStyle(Color.pfRejected)
                                    Text(locale.t("offline.failedSubmissions", String(failedSyncCount)))
                                        .font(.caption)
                                        .foregroundStyle(Color.pfRejected)
                                }
                                .padding(10)
                                .background(Color.pfRejected.opacity(0.08))
                                .clipShape(RoundedRectangle(cornerRadius: PFRadius.small))
                            }

                            if let syncError = appState.syncEngine.lastSyncError, !syncError.isEmpty {
                                HStack(spacing: 8) {
                                    Image(systemName: "wifi.slash")
                                        .foregroundStyle(Color.pfPending)
                                    Text(syncError)
                                        .font(.caption2)
                                        .foregroundStyle(Color.pfPending)
                                        .multilineTextAlignment(.leading)
                                }
                                .padding(10)
                                .background(Color.pfPending.opacity(0.08))
                                .clipShape(RoundedRectangle(cornerRadius: PFRadius.small))
                            }
                        }
                        .padding(.horizontal, 24)

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
                            .background(isScanning ? Color.pfInactive : Color.pfPrimary)
                            .foregroundStyle(.white)
                            .clipShape(RoundedRectangle(cornerRadius: PFRadius.button))
                            .shadow(color: Color.pfPrimary.opacity(isScanning ? 0 : 0.3), radius: 12, y: 4)
                        }
                        .disabled(isScanning || shouldBlockGameplay)
                        .padding(.horizontal, 24)
                        .padding(.bottom, 24)
                    }

                    if shouldBlockGameplay {
                        Color.black.opacity(0.45)
                            .ignoresSafeArea()
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
            .onAppear {
                // Re-check NFC capability each time the screen appears (static per device,
                // but checking on appear keeps the state fresh after any navigation).
                nfcSupported = NFCTagReaderSession.readingAvailable
                consumeDeepLink()
            }
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

// MARK: - NFC Unsupported full-screen state

private struct NfcUnsupportedView: View {
    @Environment(LocaleManager.self) private var locale

    var body: some View {
        VStack(spacing: 24) {
            Spacer()

            ZStack {
                Circle()
                    .fill(Color.red.opacity(0.06))
                    .frame(width: 200, height: 200)
                Circle()
                    .fill(Color.red.opacity(0.12))
                    .frame(width: 160, height: 160)
                Circle()
                    .fill(Color.red.opacity(0.18))
                    .frame(width: 120, height: 120)
                Image(systemName: "wave.3.right.circle.fill")
                    .font(.system(size: 52))
                    .foregroundStyle(.red)
            }

            Text(locale.t("checkIn.nfcUnsupported.title"))
                .font(.title2)
                .fontWeight(.bold)
                .foregroundStyle(Color.pfText)
                .multilineTextAlignment(.center)

            Text(locale.t("checkIn.nfcUnsupported.body"))
                .font(.subheadline)
                .foregroundStyle(Color.pfTextMuted)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)

            Spacer()
        }
    }
}

#Preview {
    CheckInTabView()
        .environment(AppState())
        .environment(LocaleManager())
}
