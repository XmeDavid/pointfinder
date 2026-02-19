import SwiftUI

struct PlayerNotificationListView: View {
    @Environment(AppState.self) private var appState
    @Environment(LocaleManager.self) private var locale

    var body: some View {
        Group {
            if appState.isLoadingNotifications && appState.notifications.isEmpty {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if appState.notifications.isEmpty {
                VStack(spacing: 12) {
                    Image(systemName: "bell.slash")
                        .font(.system(size: 40))
                        .foregroundStyle(.secondary)
                    Text(locale.t("notifications.empty"))
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                List(appState.notifications) { notification in
                    NotificationRow(
                        notification: notification,
                        isUnseen: isUnseen(notification)
                    )
                    .listRowInsets(EdgeInsets(top: 12, leading: 16, bottom: 12, trailing: 16))
                }
                .listStyle(.plain)
            }
        }
        .navigationTitle(locale.t("notifications.title"))
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await appState.loadNotifications()
        }
    }

    private func isUnseen(_ notification: PlayerNotificationResponse) -> Bool {
        guard let seenAt = appState.lastNotificationsSeenAt else { return true }
        return notification.sentAt > seenAt
    }
}

private struct NotificationRow: View {
    let notification: PlayerNotificationResponse
    let isUnseen: Bool

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            if isUnseen {
                Circle()
                    .fill(Color.accentColor)
                    .frame(width: 8, height: 8)
                    .padding(.top, 6)
            }
            VStack(alignment: .leading, spacing: 4) {
                Text(notification.message)
                    .font(.body)
                    .fontWeight(isUnseen ? .semibold : .regular)
                Text(formatRelativeTime(notification.sentAt))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .listRowBackground(
            isUnseen ? Color.accentColor.opacity(0.06) : Color.clear
        )
    }

    private func formatRelativeTime(_ isoString: String) -> String {
        // Backend Instant values may include fractional seconds, so support both forms.
        let withFractionalSeconds = ISO8601DateFormatter()
        withFractionalSeconds.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let fallback = ISO8601DateFormatter()
        fallback.formatOptions = [.withInternetDateTime]

        guard let date = withFractionalSeconds.date(from: isoString) ?? fallback.date(from: isoString) else {
            return isoString
        }
        let interval = Date().timeIntervalSince(date)

        switch interval {
        case ..<60:
            return "Just now"
        case ..<3600:
            let minutes = Int(interval / 60)
            return "\(minutes)m ago"
        case ..<86400:
            let hours = Int(interval / 3600)
            return "\(hours)h ago"
        case ..<604800:
            let days = Int(interval / 86400)
            return "\(days)d ago"
        default:
            let df = DateFormatter()
            df.dateFormat = "MMM d"
            return df.string(from: date)
        }
    }
}

#Preview {
    NavigationStack {
        PlayerNotificationListView()
            .environment(AppState())
            .environment(LocaleManager())
    }
}
