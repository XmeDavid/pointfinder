import SwiftUI

struct PlayerMapLegendItem: Identifiable {
    let id: String
    let label: String
    let tone: PlayerFieldTone

    init(_ label: String, tone: PlayerFieldTone) {
        id = label
        self.label = label
        self.tone = tone
    }
}

struct PlayerMapHeader: View {
    let title: String
    var liveLabel: String?
    let unseenNotificationCount: Int
    var isRefreshing = false
    let notificationsLabel: String
    let refreshLabel: String
    let onNotifications: () -> Void
    let onRefresh: () -> Void

    var body: some View {
        HStack(spacing: PFSpaceToken.space2) {
            VStack(alignment: .leading, spacing: PFSpaceToken.space1) {
                Text(title)
                    .font(PFTypographyToken.label.weight(.bold))
                    .foregroundStyle(PFColorToken.contentPrimary)
                    .lineLimit(2)
                if let liveLabel {
                    Text(liveLabel.uppercased())
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(PFColorToken.statusLive)
                }
            }
            Spacer(minLength: PFSpaceToken.space2)
            Button(action: onNotifications) {
                ZStack(alignment: .topTrailing) {
                    Image(systemName: "bell.fill")
                        .frame(width: PFDimensionToken.touchTarget, height: PFDimensionToken.touchTarget)
                    if unseenNotificationCount > 0 {
                        Text(unseenNotificationCount > 99 ? "99+" : "\(unseenNotificationCount)")
                            .font(.system(size: 9, weight: .bold))
                            .foregroundStyle(PFColorToken.actionOnPrimary)
                            .padding(.horizontal, PFSpaceToken.space1)
                            .padding(.vertical, 2)
                            .background(PFColorToken.statusRejected, in: Capsule())
                            .offset(x: 4, y: -2)
                    }
                }
            }
            .buttonStyle(.plain)
            .accessibilityLabel(notificationsLabel)

            Button(action: onRefresh) {
                Group {
                    if isRefreshing {
                        ProgressView()
                    } else {
                        Image(systemName: "arrow.clockwise")
                    }
                }
                .frame(width: PFDimensionToken.touchTarget, height: PFDimensionToken.touchTarget)
            }
            .buttonStyle(.plain)
            .disabled(isRefreshing)
            .accessibilityLabel(refreshLabel)
        }
        .padding(.leading, PFSpaceToken.space4)
        .padding(.trailing, PFSpaceToken.space2)
        .padding(.vertical, PFSpaceToken.space2)
        .background(PFColorToken.surfaceOverlay)
        .overlay {
            RoundedRectangle(cornerRadius: PFRadiusToken.lg)
                .stroke(PFColorToken.borderDefault.opacity(0.8), lineWidth: 1)
        }
        .clipShape(RoundedRectangle(cornerRadius: PFRadiusToken.lg))
        .shadow(color: PFShadowToken.overlay.color, radius: 8, y: 2)
    }
}

struct PlayerMapLegend: View {
    let items: [PlayerMapLegendItem]

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: PFSpaceToken.space3) {
                ForEach(items) { item in
                    HStack(spacing: PFSpaceToken.space1) {
                        Circle().fill(item.tone.color).frame(width: 8, height: 8)
                        Text(item.label)
                            .font(.caption2)
                            .foregroundStyle(PFColorToken.contentSecondary)
                            .fixedSize()
                    }
                }
            }
            .padding(.horizontal, PFSpaceToken.space3)
            .padding(.vertical, PFSpaceToken.space2)
        }
        .background(PFColorToken.surfaceOverlay)
        .clipShape(RoundedRectangle(cornerRadius: PFRadiusToken.md))
        .shadow(color: PFShadowToken.panel.color, radius: 4, y: 1)
    }
}

struct PlayerDetailMessage: View {
    let systemImage: String
    let title: String
    var message: String?
    var tone: PlayerFieldTone = .unknown

    var body: some View {
        VStack(spacing: PFSpaceToken.space2) {
            Image(systemName: systemImage)
                .font(.system(size: 32, weight: .semibold))
                .foregroundStyle(tone.color)
                .frame(width: 68, height: 68)
                .background(tone.color.opacity(0.12), in: Circle())
                .accessibilityHidden(true)
            Text(title)
                .font(PFTypographyToken.section)
                .multilineTextAlignment(.center)
            if let message, !message.isEmpty {
                Text(message)
                    .font(.subheadline)
                    .foregroundStyle(PFColorToken.contentSecondary)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, PFSpaceToken.space6)
        .accessibilityElement(children: .combine)
    }
}

extension BaseStatus {
    var playerFieldTone: PlayerFieldTone {
        switch self {
        case .notVisited: .unknown
        case .checkedIn: .info
        case .submitted: .pending
        case .completed: .success
        case .rejected: .danger
        }
    }
}

#Preview("Player map chrome · light") {
    VStack(spacing: PFSpaceToken.space4) {
        PlayerMapHeader(
            title: "International Pathfinder Field Exercise",
            liveLabel: "Live",
            unseenNotificationCount: 12,
            notificationsLabel: "Notifications",
            refreshLabel: "Refresh",
            onNotifications: {},
            onRefresh: {}
        )
        PlayerMapLegend(items: [
            .init("Not visited", tone: .unknown),
            .init("Checked in", tone: .info),
            .init("Awaiting review", tone: .pending),
            .init("Completed", tone: .success),
            .init("Rejected", tone: .danger),
        ])
        PlayerDetailMessage(
            systemImage: "lock.fill",
            title: "Challenge locked",
            message: "Scan the NFC tag at this location to continue."
        )
    }
    .padding()
    .background(PFColorToken.surfaceCanvas)
}

#Preview("Player map chrome · dark, large type") {
    VStack(spacing: PFSpaceToken.space4) {
        PlayerMapHeader(
            title: "Internationale Pfadfinder-Feldübung mit sehr langem Namen",
            liveLabel: "Live",
            unseenNotificationCount: 123,
            notificationsLabel: "Benachrichtigungen",
            refreshLabel: "Aktualisieren",
            onNotifications: {},
            onRefresh: {}
        )
        PlayerDetailMessage(
            systemImage: "wifi.slash",
            title: "Keine zwischengespeicherte Aufgabe verfügbar",
            message: "Stelle eine Verbindung her und versuche es erneut.",
            tone: .pending
        )
    }
    .padding()
    .background(PFColorToken.surfaceCanvas)
    .preferredColorScheme(.dark)
    .environment(\.dynamicTypeSize, .accessibility2)
}
