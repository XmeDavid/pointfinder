import SwiftUI

struct SetupReadinessItem: Identifiable {
    let id: String
    let label: String
    let detail: String
    let ready: Bool

    init(id: String? = nil, label: String, detail: String, ready: Bool) {
        self.id = id ?? label
        self.label = label
        self.detail = detail
        self.ready = ready
    }
}

struct SetupReadinessPanel: View {
    let title: String
    let readyLabel: String
    let items: [SetupReadinessItem]

    var body: some View {
        let readyCount = items.filter(\.ready).count
        let allReady = readyCount == items.count

        VStack(alignment: .leading, spacing: PFSpaceToken.space3) {
            HStack {
                VStack(alignment: .leading, spacing: PFSpaceToken.space1) {
                    Text(title)
                        .font(.headline)
                        .foregroundStyle(PFColorToken.contentPrimary)
                    Text(readyLabel)
                        .font(.caption)
                        .foregroundStyle(PFColorToken.contentSecondary)
                }
                Spacer()
                OperatorStatusBadge(label: "\(readyCount)/\(items.count)", tone: allReady ? .success : .pending)
            }

            ForEach(items) { item in
                HStack(alignment: .top, spacing: PFSpaceToken.space2) {
                    Image(systemName: item.ready ? "checkmark.circle.fill" : "exclamationmark.triangle.fill")
                        .foregroundStyle(item.ready ? OperatorTone.success.color : OperatorTone.pending.color)
                        .accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: PFSpaceToken.space1) {
                        Text(item.label)
                            .font(.subheadline.weight(.medium))
                            .foregroundStyle(PFColorToken.contentPrimary)
                        Text(item.detail)
                            .font(.caption)
                            .foregroundStyle(PFColorToken.contentSecondary)
                    }
                }
                .accessibilityElement(children: .combine)
            }
        }
        .padding(PFSpaceToken.space4)
        .background(PFColorToken.surfacePanel)
        .overlay { RoundedRectangle(cornerRadius: PFRadiusToken.lg).stroke(PFColorToken.borderSubtle) }
        .clipShape(RoundedRectangle(cornerRadius: PFRadiusToken.lg))
    }
}

struct SetupSpatialSummary: View {
    let title: String
    let description: String
    let basesLabel: String
    let nfcLabel: String
    let assignmentsLabel: String
    let openMapLabel: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: PFSpaceToken.space3) {
                HStack(spacing: PFSpaceToken.space2) {
                    Image(systemName: "map.fill")
                        .foregroundStyle(OperatorTone.info.color)
                    VStack(alignment: .leading, spacing: PFSpaceToken.space1) {
                        Text(title)
                            .font(.headline)
                            .foregroundStyle(PFColorToken.contentPrimary)
                        Text(description)
                            .font(.caption)
                            .foregroundStyle(PFColorToken.contentSecondary)
                    }
                    Spacer()
                }
                OperatorFlowLayout {
                    OperatorStatusBadge(label: basesLabel, tone: .info)
                    OperatorStatusBadge(label: nfcLabel, tone: .success)
                    OperatorStatusBadge(label: assignmentsLabel, tone: .muted)
                }
                HStack {
                    Text(openMapLabel)
                        .font(.subheadline.weight(.semibold))
                    Spacer()
                    Image(systemName: "arrow.right")
                }
                .foregroundStyle(OperatorTone.info.color)
            }
            .padding(PFSpaceToken.space4)
            .background(OperatorTone.info.color.opacity(0.10))
            .overlay { RoundedRectangle(cornerRadius: PFRadiusToken.lg).stroke(OperatorTone.info.color.opacity(0.30)) }
            .clipShape(RoundedRectangle(cornerRadius: PFRadiusToken.lg))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
    }
}

struct SetupResourceRow: View {
    let systemImage: String
    let label: String
    let value: String
    let tone: OperatorTone
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: PFSpaceToken.space3) {
                Image(systemName: systemImage)
                    .foregroundStyle(tone.color)
                    .frame(width: 34, height: 34)
                    .background(tone.color.opacity(0.12), in: RoundedRectangle(cornerRadius: PFRadiusToken.sm))
                Text(label)
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(PFColorToken.contentPrimary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                OperatorStatusBadge(label: value, tone: tone)
                Image(systemName: "chevron.right")
                    .font(.caption)
                    .foregroundStyle(PFColorToken.contentSecondary)
            }
            .padding(PFSpaceToken.space3)
            .frame(minHeight: PFDimensionToken.touchTarget)
            .background(PFColorToken.surfacePanel)
            .overlay { RoundedRectangle(cornerRadius: PFRadiusToken.md).stroke(PFColorToken.borderSubtle) }
            .clipShape(RoundedRectangle(cornerRadius: PFRadiusToken.md))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

struct SetupLaunchButton: View {
    let label: String
    let enabled: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Label(label, systemImage: "play.fill")
                .font(.headline)
                .frame(maxWidth: .infinity, minHeight: PFDimensionToken.touchTarget)
        }
        .buttonStyle(.borderedProminent)
        .tint(OperatorTone.success.color)
        .disabled(!enabled)
        .accessibilityIdentifier("game-activate-btn")
    }
}

#Preview("Setup builder · light") {
    ScrollView {
        VStack(spacing: PFSpaceToken.space3) {
            SetupSpatialSummary(title: "Spatial plan", description: "Place and inspect field stations on the map.", basesLabel: "8 bases", nfcLabel: "7 NFC", assignmentsLabel: "12 links", openMapLabel: "Open map", action: {})
            SetupReadinessPanel(title: "Launch readiness", readyLabel: "Four of five checks are ready", items: [
                SetupReadinessItem(label: "Bases", detail: "Eight bases placed", ready: true),
                SetupReadinessItem(label: "NFC", detail: "One base still needs a tag", ready: false),
                SetupReadinessItem(label: "Teams", detail: "Six teams configured", ready: true),
            ])
            SetupResourceRow(systemImage: "mappin.and.ellipse", label: "Bases", value: "8", tone: .info, action: {})
            SetupLaunchButton(label: "Go live", enabled: false, action: {})
        }
        .padding()
    }
    .background(PFColorToken.surfaceCanvas)
}

#Preview("Setup builder · dark, large type") {
    SetupReadinessPanel(title: "Startbereitschaft", readyLabel: "Vier von fünf Prüfungen sind bereit", items: [
        SetupReadinessItem(label: "NFC-Stationen", detail: "Eine Station benötigt noch einen NFC-Tag", ready: false),
        SetupReadinessItem(label: "Teams und Variablen", detail: "Alle Teams sind vollständig konfiguriert", ready: true),
    ])
    .padding()
    .background(PFColorToken.surfaceCanvas)
    .preferredColorScheme(.dark)
    .environment(\.dynamicTypeSize, .accessibility2)
}
