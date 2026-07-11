import SwiftUI

enum OperatorTone {
    case info
    case pending
    case success
    case danger
    case override
    case muted

    var color: Color {
        switch self {
        case .info: PFColorToken.statusCheckedIn
        case .pending: PFColorToken.statusPending
        case .success: PFColorToken.statusCompleted
        case .danger: PFColorToken.statusRejected
        case .override: PFColorToken.statusOperatorOverride
        case .muted: PFColorToken.contentSecondary
        }
    }
}

struct OperatorStatusBadge: View {
    let label: String
    let tone: OperatorTone

    var body: some View {
        Text(label)
            .font(.caption.weight(.semibold))
            .foregroundStyle(tone.color)
            .padding(.horizontal, PFSpaceToken.space2)
            .padding(.vertical, PFSpaceToken.space1)
            .background(tone.color.opacity(0.14), in: Capsule())
            .fixedSize(horizontal: true, vertical: false)
    }
}

struct OperatorStatTile: View {
    let value: String
    let label: String
    var tone: OperatorTone = .muted

    var body: some View {
        VStack(spacing: PFSpaceToken.space1) {
            Text(value)
                .font(.system(.subheadline, design: .rounded).weight(.bold))
                .foregroundStyle(tone.color)
            Text(label.uppercased())
                .font(.caption2)
                .foregroundStyle(PFColorToken.contentSecondary)
                .lineLimit(1)
        }
        .padding(.horizontal, PFSpaceToken.space3)
        .padding(.vertical, PFSpaceToken.space2)
        .background(PFColorToken.surfaceOverlay)
        .overlay {
            RoundedRectangle(cornerRadius: PFRadiusToken.md)
                .stroke(PFColorToken.borderSubtle, lineWidth: 1)
        }
        .clipShape(RoundedRectangle(cornerRadius: PFRadiusToken.md))
        .shadow(color: PFShadowToken.panel.color, radius: PFShadowToken.panel.radius, y: PFShadowToken.panel.y)
    }
}

struct OperatorConnectivityBanner: View {
    let label: String

    var body: some View {
        Label(label, systemImage: "wifi.slash")
            .font(.caption)
            .foregroundStyle(PFColorToken.statusPending)
            .padding(.horizontal, PFSpaceToken.space3)
            .padding(.vertical, PFSpaceToken.space2)
            .background(PFColorToken.statusPending.opacity(0.10))
            .overlay {
                RoundedRectangle(cornerRadius: PFRadiusToken.md)
                    .stroke(PFColorToken.statusPending.opacity(0.3), lineWidth: 1)
            }
            .clipShape(RoundedRectangle(cornerRadius: PFRadiusToken.md))
            .accessibilityElement(children: .combine)
    }
}

struct OperatorSubmissionCard: View {
    let teamName: String
    let challengeTitle: String
    let baseName: String
    var answer: String?
    let submittedAt: String
    let statusLabel: String
    let statusTone: OperatorTone
    var mediaCount = 0
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: PFSpaceToken.space1) {
                HStack {
                    Text(teamName)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(PFColorToken.contentPrimary)
                        .lineLimit(1)
                    Spacer()
                    if mediaCount > 0 {
                        Label(mediaCount > 1 ? "\(mediaCount)" : "", systemImage: mediaCount > 1 ? "photo.on.rectangle" : "photo")
                            .font(.caption2)
                            .foregroundStyle(PFColorToken.contentSecondary)
                            .accessibilityLabel("\(mediaCount)")
                    }
                    OperatorStatusBadge(label: statusLabel, tone: statusTone)
                }
                Text(challengeTitle)
                    .font(.subheadline)
                    .foregroundStyle(PFColorToken.contentPrimary)
                    .lineLimit(2)
                Text(baseName)
                    .font(.caption)
                    .foregroundStyle(PFColorToken.contentSecondary)
                    .lineLimit(1)
                if let answer, !answer.isEmpty {
                    Text(answer)
                        .font(.caption)
                        .foregroundStyle(PFColorToken.contentSecondary)
                        .lineLimit(2)
                }
                Text(submittedAt)
                    .font(.caption2)
                    .foregroundStyle(PFColorToken.contentMuted)
            }
            .padding(PFSpaceToken.space3)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(PFColorToken.surfacePanel)
            .overlay {
                RoundedRectangle(cornerRadius: PFRadiusToken.lg)
                    .stroke(PFColorToken.borderSubtle, lineWidth: 1)
            }
            .clipShape(RoundedRectangle(cornerRadius: PFRadiusToken.lg))
            .shadow(color: PFShadowToken.panel.color, radius: PFShadowToken.panel.radius, y: PFShadowToken.panel.y)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

struct OperatorRescueActionButton: View {
    let label: String
    let systemImage: String
    let tone: OperatorTone
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Label(label, systemImage: systemImage)
                .font(.caption.weight(.semibold))
                .foregroundStyle(tone.color)
                .padding(.horizontal, PFSpaceToken.space3)
                .frame(minHeight: PFDimensionToken.touchTarget)
                .background(tone.color.opacity(0.13), in: Capsule())
                .overlay { Capsule().stroke(tone.color.opacity(0.28), lineWidth: 1) }
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
    }
}

struct OperatorOverrideBadge: View {
    let label: String
    var body: some View { OperatorStatusBadge(label: label, tone: .override) }
}

struct OperatorFlowLayout: Layout {
    var spacing: CGFloat = PFSpaceToken.space2

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? 0
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowHeight: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x > 0 && x + size.width > width { x = 0; y += rowHeight + spacing; rowHeight = 0 }
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
        return CGSize(width: width, height: y + rowHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX
        var y = bounds.minY
        var rowHeight: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x > bounds.minX && x + size.width > bounds.maxX { x = bounds.minX; y += rowHeight + spacing; rowHeight = 0 }
            subview.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
    }
}

#Preview("Operator live components · light") {
    ScrollView {
        VStack(spacing: PFSpaceToken.space3) {
            HStack {
                OperatorStatTile(value: "8", label: "Teams")
                OperatorStatTile(value: "3", label: "Pending", tone: .pending)
                OperatorStatTile(value: "68%", label: "Progress", tone: .success)
            }
            OperatorConnectivityBanner(label: "Last synchronized at 21:42")
            OperatorSubmissionCard(
                teamName: "Team North Ridge",
                challengeTitle: "Emergency navigation with an intentionally long localized title",
                baseName: "Forest checkpoint",
                answer: "We followed the eastern bearing and documented the marker.",
                submittedAt: "21:42",
                statusLabel: "Pending",
                statusTone: .pending,
                mediaCount: 3,
                action: {}
            )
            OperatorFlowLayout {
                OperatorRescueActionButton(label: "Mark completed", systemImage: "checkmark.seal", tone: .override, action: {})
                OperatorRescueActionButton(label: "Grant access", systemImage: "lock.open", tone: .info, action: {})
            }
            OperatorOverrideBadge(label: "Override · Alex · 21:40")
        }
        .padding()
    }
    .background(PFColorToken.surfaceCanvas)
}

#Preview("Operator live components · dark, large type") {
    VStack(spacing: PFSpaceToken.space3) {
        OperatorSubmissionCard(
            teamName: "Internationale Pfadfindergruppe Nordhang",
            challengeTitle: "Ausführliche Aufgabe mit besonders langer lokalisierter Bezeichnung",
            baseName: "Kontrollpunkt im Wald",
            answer: "Ausführliche Antwort der Gruppe.",
            submittedAt: "21:42",
            statusLabel: "Ausstehend",
            statusTone: .pending,
            mediaCount: 1,
            action: {}
        )
        OperatorRescueActionButton(label: "Fortschritt als abgeschlossen markieren", systemImage: "checkmark.seal", tone: .override, action: {})
    }
    .padding()
    .background(PFColorToken.surfaceCanvas)
    .preferredColorScheme(.dark)
    .environment(\.dynamicTypeSize, .accessibility2)
}
