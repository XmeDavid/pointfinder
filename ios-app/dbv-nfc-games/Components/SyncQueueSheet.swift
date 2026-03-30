import SwiftUI

/// Bottom sheet listing pending offline actions with their sync status.
/// Opened by tapping the SyncStatusBanner. Auto-dismisses when the queue empties.
struct SyncQueueSheet: View {
    @Environment(AppState.self) private var appState
    @Environment(LocaleManager.self) private var locale
    @Environment(\.dismiss) private var dismiss

    @State private var pendingActions: [PendingAction] = []

    var body: some View {
        NavigationStack {
            Group {
                if pendingActions.isEmpty {
                    ContentUnavailableView(
                        locale.t("sync.pendingActions"),
                        systemImage: "checkmark.circle",
                        description: Text("")
                    )
                } else {
                    List(pendingActions) { action in
                        SyncQueueRow(action: action, isOnline: appState.isOnline, isSyncing: appState.syncEngine.isSyncing, locale: locale)
                    }
                    .listStyle(.plain)
                }
            }
            .navigationTitle(locale.t("sync.pendingActions"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button(locale.t("common.done")) { dismiss() }
                }
            }
        }
        .task {
            await loadActions()
        }
        .task {
            // Poll for progress updates while syncing so chunk progress is reflected in the UI.
            while !Task.isCancelled {
                try? await Task.sleep(for: .milliseconds(500))
                if appState.syncEngine.isSyncing {
                    await loadActions()
                }
            }
        }
        .onChange(of: appState.pendingActionsCount) {
            Task { await loadActions() }
            if appState.pendingActionsCount == 0 {
                dismiss()
            }
        }
    }

    private func loadActions() async {
        pendingActions = await OfflineQueue.shared.allPending()
    }
}

// MARK: - Row

private struct SyncQueueRow: View {
    let action: PendingAction
    let isOnline: Bool
    let isSyncing: Bool
    let locale: LocaleManager

    private var icon: String {
        switch action.type {
        case .checkIn: return "mappin.circle.fill"
        case .submission: return "text.bubble.fill"
        case .mediaSubmission: return "camera.fill"
        }
    }

    private var label: String {
        switch action.type {
        case .checkIn:
            return locale.t("common.checkIn")
        case .submission, .mediaSubmission:
            return locale.t("common.challenge")
        }
    }

    /// Upload progress fraction [0, 1], or nil if indeterminate / not applicable.
    private var uploadFraction: Double? {
        guard action.type == .mediaSubmission,
              let total = action.uploadTotalChunks, total > 0,
              let index = action.uploadChunkIndex else { return nil }
        return Double(index) / Double(total)
    }

    private var isUploading: Bool {
        action.type == .mediaSubmission && isSyncing && isOnline
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 10) {
                Image(systemName: icon)
                    .foregroundStyle(.secondary)
                    .frame(width: 24)

                Text(label)
                    .font(.subheadline)

                Spacer()

                statusBadge
            }

            if isUploading {
                if let fraction = uploadFraction {
                    ProgressView(value: fraction)
                        .progressViewStyle(.linear)
                        .tint(.blue)
                } else {
                    ProgressView()
                        .progressViewStyle(.linear)
                        .tint(.blue)
                }
            }
        }
        .padding(.vertical, 4)
    }

    @ViewBuilder
    private var statusBadge: some View {
        if !isOnline {
            Text(locale.t("sync.noConnection"))
                .font(.caption2)
                .fontWeight(.bold)
                .foregroundStyle(.white)
                .padding(.horizontal, 6)
                .padding(.vertical, 3)
                .background(Color.red, in: Capsule())
        } else if isUploading {
            Text(uploadFraction.map { String(format: locale.t("sync.uploadingPercent"), Int($0 * 100)) } ?? locale.t("sync.uploading"))
                .font(.caption2)
                .fontWeight(.bold)
                .foregroundStyle(.white)
                .padding(.horizontal, 6)
                .padding(.vertical, 3)
                .background(Color.blue, in: Capsule())
        } else {
            Text(locale.t("sync.queued"))
                .font(.caption2)
                .fontWeight(.bold)
                .foregroundStyle(.white)
                .padding(.horizontal, 6)
                .padding(.vertical, 3)
                .background(Color.secondary, in: Capsule())
        }
    }
}
