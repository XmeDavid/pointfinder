import SwiftUI

/// Pill-shaped banner shown in the player navigation bar when there are pending offline actions.
/// - Blue with spinner when online and syncing/pending
/// - Red with wifi-off icon when offline and pending
/// Tapping opens SyncQueueSheet.
struct SyncStatusBanner: View {
    @Environment(AppState.self) private var appState
    @Environment(LocaleManager.self) private var locale
    @Binding var showSheet: Bool

    @State private var uploadPercent: Int? = nil

    private var pendingCount: Int { appState.pendingActionsCount }
    private var isOnline: Bool { appState.isOnline }

    var body: some View {
        if pendingCount > 0 {
            Button {
                showSheet = true
            } label: {
                HStack(spacing: 4) {
                    if isOnline {
                        ProgressView()
                            .progressViewStyle(.circular)
                            .scaleEffect(0.65)
                            .tint(.white)
                    } else {
                        Image(systemName: "wifi.slash")
                            .font(.caption2)
                            .foregroundStyle(.white)
                    }
                    if isOnline, let pct = uploadPercent {
                        Text(String(format: locale.t("sync.uploadingPercent"), pct))
                            .font(.caption2)
                            .fontWeight(.semibold)
                            .foregroundStyle(.white)
                    } else {
                        Text(isOnline
                             ? locale.t("sync.syncing", pendingCount)
                             : locale.t("sync.offline", pendingCount))
                            .font(.caption2)
                            .fontWeight(.semibold)
                            .foregroundStyle(.white)
                    }
                }
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(isOnline ? Color.blue : Color.red, in: Capsule())
            }
            .buttonStyle(.plain)
            .transition(.opacity)
            .animation(.easeInOut, value: pendingCount)
            .animation(.easeInOut, value: isOnline)
            .task {
                while !Task.isCancelled {
                    await refreshUploadPercent()
                    try? await Task.sleep(for: .milliseconds(500))
                }
            }
        }
    }

    private func refreshUploadPercent() async {
        guard appState.syncEngine.isSyncing && isOnline else {
            uploadPercent = nil
            return
        }
        let actions = await OfflineQueue.shared.allPending()
        if let uploading = actions.first(where: { $0.type == .mediaSubmission }),
           let total = uploading.uploadTotalChunks, total > 0,
           let index = uploading.uploadChunkIndex {
            uploadPercent = Int(Double(index) / Double(total) * 100)
        } else {
            uploadPercent = nil
        }
    }
}
