import SwiftUI

struct GameLibraryMetric: Identifiable {
    let id: String
    let value: String
    let label: String
    let tone: OperatorTone

    init(id: String? = nil, value: String, label: String, tone: OperatorTone) {
        self.id = id ?? label
        self.value = value
        self.label = label
        self.tone = tone
    }
}

struct GameLibrarySummary: View {
    let metrics: [GameLibraryMetric]

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: PFSpaceToken.space2) {
                ForEach(metrics) { metric in
                    OperatorStatTile(value: metric.value, label: metric.label, tone: metric.tone)
                }
            }
        }
        .accessibilityElement(children: .contain)
    }
}

struct GameLibraryCard: View {
    let name: String
    let description: String
    let statusLabel: String
    let statusTone: OperatorTone
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: PFSpaceToken.space2) {
                HStack(alignment: .top) {
                    Text(name)
                        .font(.headline)
                        .foregroundStyle(PFColorToken.contentPrimary)
                        .lineLimit(2)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    OperatorStatusBadge(label: statusLabel, tone: statusTone)
                }
                if !description.isEmpty {
                    Text(description)
                        .font(.caption)
                        .foregroundStyle(PFColorToken.contentSecondary)
                        .lineLimit(2)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .padding(PFSpaceToken.space4)
            .frame(maxWidth: .infinity, minHeight: PFDimensionToken.touchTarget, alignment: .leading)
            .background(PFColorToken.surfacePanel)
            .overlay { RoundedRectangle(cornerRadius: PFRadiusToken.lg).stroke(PFColorToken.borderSubtle) }
            .clipShape(RoundedRectangle(cornerRadius: PFRadiusToken.lg))
            .shadow(color: PFShadowToken.panel.color, radius: PFShadowToken.panel.radius, y: PFShadowToken.panel.y)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

struct GameLibraryWorkspaceChip: View {
    let label: String
    let detail: String?
    let selected: Bool
    let action: () -> Void

    var body: some View {
        let tone = selected ? OperatorTone.info : OperatorTone.muted
        Button(action: action) {
            VStack(alignment: .leading, spacing: PFSpaceToken.space1) {
                Text(label).font(.subheadline.weight(selected ? .semibold : .regular)).lineLimit(1)
                if let detail { Text(detail).font(.caption2).opacity(0.78).lineLimit(1) }
            }
            .foregroundStyle(tone.color)
            .padding(.horizontal, PFSpaceToken.space3)
            .frame(minHeight: PFDimensionToken.touchTarget)
            .background(tone.color.opacity(selected ? 0.14 : 0.08), in: Capsule())
            .overlay { Capsule().stroke(tone.color.opacity(selected ? 0.42 : 0.20)) }
        }
        .buttonStyle(.plain)
    }
}

#Preview("Game library · light") {
    VStack(spacing: PFSpaceToken.space3) {
        GameLibrarySummary(metrics: [
            GameLibraryMetric(value: "3", label: "Setup", tone: .info),
            GameLibraryMetric(value: "1", label: "Live", tone: .success),
            GameLibraryMetric(value: "8", label: "Ended", tone: .muted),
        ])
        HStack {
            GameLibraryWorkspaceChip(label: "Personal", detail: "4 games", selected: true, action: {})
            GameLibraryWorkspaceChip(label: "Regional operations", detail: "12 members", selected: false, action: {})
        }
        GameLibraryCard(name: "Northern ridge field exercise", description: "An intentionally long localized description for the active exercise.", statusLabel: "Live", statusTone: .success, action: {})
    }
    .padding()
    .background(PFColorToken.surfaceCanvas)
}

#Preview("Game library · dark, large type") {
    GameLibraryCard(name: "Internationale Pfadfinderübung am nördlichen Berghang", description: "Ausführliche Beschreibung für einen langen lokalisierten Inhalt.", statusLabel: "Einrichtung", statusTone: .info, action: {})
        .padding()
        .background(PFColorToken.surfaceCanvas)
        .preferredColorScheme(.dark)
        .environment(\.dynamicTypeSize, .accessibility2)
}
