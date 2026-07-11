import SwiftUI

struct ManagementMetadata: Identifiable {
    let id: String
    let label: String
    let tone: OperatorTone

    init(id: String? = nil, label: String, tone: OperatorTone) {
        self.id = id ?? label
        self.label = label
        self.tone = tone
    }
}

struct ManagementResourceRow: View {
    let title: String
    let subtitle: String?
    let metadata: [ManagementMetadata]
    var systemImage: String? = nil
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: PFSpaceToken.space3) {
                if let systemImage {
                    Image(systemName: systemImage)
                        .foregroundStyle(OperatorTone.info.color)
                        .frame(width: 34, height: 34)
                        .background(OperatorTone.info.color.opacity(0.11), in: RoundedRectangle(cornerRadius: PFRadiusToken.sm))
                }
                VStack(alignment: .leading, spacing: PFSpaceToken.space1) {
                    Text(title).font(.subheadline.weight(.semibold)).foregroundStyle(PFColorToken.contentPrimary).lineLimit(2)
                    if let subtitle, !subtitle.isEmpty { Text(subtitle).font(.caption).foregroundStyle(PFColorToken.contentSecondary).lineLimit(2) }
                    OperatorFlowLayout(spacing: PFSpaceToken.space1) {
                        ForEach(metadata) { item in OperatorStatusBadge(label: item.label, tone: item.tone) }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Image(systemName: "chevron.right").font(.caption).foregroundStyle(PFColorToken.contentSecondary)
            }
            .padding(PFSpaceToken.space3)
            .frame(minHeight: PFDimensionToken.touchTarget)
            .background(PFColorToken.surfacePanel)
            .overlay { RoundedRectangle(cornerRadius: PFRadiusToken.lg).stroke(PFColorToken.borderSubtle) }
            .clipShape(RoundedRectangle(cornerRadius: PFRadiusToken.lg))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

struct ManagementTeamRow: View {
    let name: String
    let joinCode: String?
    let teamColor: Color
    let copyLabel: String
    let copied: Bool
    let copyAction: (() -> Void)?
    let action: () -> Void

    var body: some View {
        HStack(spacing: PFSpaceToken.space3) {
            Button(action: action) {
                HStack(spacing: PFSpaceToken.space3) {
                    Circle().fill(teamColor).frame(width: 34, height: 34)
                    VStack(alignment: .leading, spacing: PFSpaceToken.space1) {
                        Text(name).font(.subheadline.weight(.semibold)).foregroundStyle(PFColorToken.contentPrimary).lineLimit(2)
                        if let joinCode { Text(joinCode).font(.caption).foregroundStyle(PFColorToken.contentSecondary) }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .buttonStyle(.plain)
            if let copyAction {
                Button(action: copyAction) { Image(systemName: copied ? "checkmark" : "doc.on.doc") }
                    .buttonStyle(.plain)
                    .foregroundStyle(PFColorToken.contentSecondary)
                    .accessibilityLabel(copyLabel)
                    .frame(minWidth: PFDimensionToken.touchTarget, minHeight: PFDimensionToken.touchTarget)
            }
            Image(systemName: "chevron.right").font(.caption).foregroundStyle(PFColorToken.contentSecondary)
        }
        .padding(PFSpaceToken.space3)
        .background(PFColorToken.surfacePanel)
        .overlay { RoundedRectangle(cornerRadius: PFRadiusToken.lg).stroke(PFColorToken.borderSubtle) }
        .clipShape(RoundedRectangle(cornerRadius: PFRadiusToken.lg))
    }
}

struct ManagementListSummary: View {
    let label: String
    let count: Int
    var attentionLabel: String? = nil

    var body: some View {
        HStack {
            Text(label).font(.caption).foregroundStyle(PFColorToken.contentSecondary)
            Spacer()
            OperatorStatusBadge(label: "\(count)", tone: .info)
            if let attentionLabel { OperatorStatusBadge(label: attentionLabel, tone: .pending) }
        }
        .padding(.horizontal, PFSpaceToken.space3)
        .padding(.vertical, PFSpaceToken.space2)
        .background(OperatorTone.info.color.opacity(0.09), in: RoundedRectangle(cornerRadius: PFRadiusToken.md))
    }
}

struct ManagementAssignmentRow: View {
    let challengeTitle: String
    let teamLabel: String
    let pointsLabel: String?
    let teamColor: Color?
    let deleteLabel: String
    var deleteIdentifier: String? = nil
    let onDelete: () -> Void

    var body: some View {
        HStack(spacing: PFSpaceToken.space2) {
            VStack(alignment: .leading, spacing: PFSpaceToken.space1) {
                Text(challengeTitle).font(.subheadline.weight(.medium)).foregroundStyle(PFColorToken.contentPrimary).lineLimit(2)
                HStack(spacing: PFSpaceToken.space1) {
                    if let teamColor { Circle().fill(teamColor).frame(width: 9, height: 9) }
                    Text(teamLabel).font(.caption).foregroundStyle(PFColorToken.contentSecondary)
                    if let pointsLabel { OperatorStatusBadge(label: pointsLabel, tone: .pending) }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Button(role: .destructive, action: onDelete) { Image(systemName: "trash") }
                .buttonStyle(.plain)
                .foregroundStyle(OperatorTone.danger.color)
                .accessibilityLabel(deleteLabel)
                .accessibilityIdentifier(deleteIdentifier ?? deleteLabel)
                .frame(minWidth: PFDimensionToken.touchTarget, minHeight: PFDimensionToken.touchTarget)
        }
        .padding(.leading, PFSpaceToken.space3)
        .padding(.vertical, PFSpaceToken.space2)
        .background(PFColorToken.surfacePanel)
        .overlay { RoundedRectangle(cornerRadius: PFRadiusToken.md).stroke(PFColorToken.borderSubtle) }
        .clipShape(RoundedRectangle(cornerRadius: PFRadiusToken.md))
    }
}

struct VariableCompletenessSummary: View {
    let variableCount: Int
    let teamCount: Int
    let completedValues: Int
    let totalValues: Int
    let variablesLabel: String
    let teamsLabel: String
    let completeLabel: String

    var body: some View {
        HStack(spacing: PFSpaceToken.space2) {
            OperatorStatTile(value: "\(variableCount)", label: variablesLabel, tone: .info)
            OperatorStatTile(value: "\(teamCount)", label: teamsLabel, tone: .muted)
            OperatorStatTile(value: "\(completedValues)/\(totalValues)", label: completeLabel, tone: totalValues > 0 && completedValues == totalValues ? .success : .pending)
        }
    }
}

struct ManagementEditorSummary: View {
    let title: String
    let metadata: [ManagementMetadata]
    let validationLabel: String
    let isValid: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: PFSpaceToken.space2) {
            HStack(alignment: .firstTextBaseline) {
                Text(title)
                    .font(PFTypographyToken.section)
                    .foregroundStyle(PFColorToken.contentPrimary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                OperatorStatusBadge(label: validationLabel, tone: isValid ? .success : .pending)
            }
            OperatorFlowLayout(spacing: PFSpaceToken.space1) {
                ForEach(metadata) { item in OperatorStatusBadge(label: item.label, tone: item.tone) }
            }
        }
        .padding(PFSpaceToken.space3)
        .background(PFColorToken.surfacePanel)
        .overlay { RoundedRectangle(cornerRadius: PFRadiusToken.lg).stroke(PFColorToken.borderSubtle) }
        .clipShape(RoundedRectangle(cornerRadius: PFRadiusToken.lg))
    }
}

struct ManagementNotificationRow: View {
    let message: String
    let targetLabel: String
    let time: Date?

    var body: some View {
        VStack(alignment: .leading, spacing: PFSpaceToken.space2) {
            Text(message).font(.body).foregroundStyle(PFColorToken.contentPrimary).frame(maxWidth: .infinity, alignment: .leading)
            HStack(spacing: PFSpaceToken.space2) {
                OperatorStatusBadge(label: targetLabel, tone: .info)
                Spacer()
                if let time { Text(time, style: .relative).font(.caption).foregroundStyle(PFColorToken.contentSecondary) }
            }
        }
        .padding(.vertical, PFSpaceToken.space1)
    }
}

struct OrganizationWorkspaceSummary: View {
    let name: String
    let slug: String
    let tier: String
    let memberCount: Int
    let liveGameCount: Int
    let membersLabel: String
    let liveGamesLabel: String

    var body: some View {
        VStack(alignment: .leading, spacing: PFSpaceToken.space3) {
            HStack {
                VStack(alignment: .leading, spacing: PFSpaceToken.space1) {
                    Text(name).font(PFTypographyToken.section).foregroundStyle(PFColorToken.contentPrimary)
                    Text("@\(slug)").font(.caption).foregroundStyle(PFColorToken.contentSecondary)
                }
                Spacer()
                OperatorStatusBadge(label: tier.uppercased(), tone: .override)
            }
            HStack(spacing: PFSpaceToken.space2) {
                OperatorStatTile(value: "\(memberCount)", label: membersLabel, tone: .info)
                OperatorStatTile(value: "\(liveGameCount)", label: liveGamesLabel, tone: liveGameCount > 0 ? .success : .muted)
            }
        }
        .padding(PFSpaceToken.space3)
        .background(PFColorToken.surfacePanel)
        .overlay { RoundedRectangle(cornerRadius: PFRadiusToken.lg).stroke(PFColorToken.borderSubtle) }
        .clipShape(RoundedRectangle(cornerRadius: PFRadiusToken.lg))
    }
}

#Preview("Resource management · light") {
    VStack(spacing: PFSpaceToken.space3) {
        ManagementListSummary(label: "Field resources", count: 8, attentionLabel: "1 needs NFC")
        ManagementResourceRow(title: "Northern forest checkpoint", subtitle: "Navigation challenge with a long localized description", metadata: [ManagementMetadata(label: "NFC linked", tone: .success), ManagementMetadata(label: "Text", tone: .info)], systemImage: "mappin.and.ellipse", action: {})
        ManagementTeamRow(name: "International patrol north ridge", joinCode: "PF-42K9", teamColor: PFColorToken.statusCheckedIn, copyLabel: "Copy join code", copied: false, copyAction: {}, action: {})
        ManagementAssignmentRow(challengeTitle: "Emergency navigation", teamLabel: "All teams", pointsLabel: "25 pts", teamColor: nil, deleteLabel: "Delete", onDelete: {})
        ManagementEditorSummary(title: "Edit checkpoint", metadata: [ManagementMetadata(label: "NFC linked", tone: .success), ManagementMetadata(label: "3 challenges", tone: .info)], validationLabel: "Ready", isValid: true)
        ManagementNotificationRow(message: "Return to the northern checkpoint before dusk.", targetLabel: "All teams", time: Date().addingTimeInterval(-120))
    }
    .padding()
    .background(PFColorToken.surfaceCanvas)
}

#Preview("Resource management · dark, large type") {
    ManagementResourceRow(title: "Ausführliche internationale Stationsbezeichnung", subtitle: "Besonders lange lokalisierte Beschreibung", metadata: [ManagementMetadata(label: "NFC fehlt", tone: .pending), ManagementMetadata(label: "Datei-Upload", tone: .info)], action: {})
        .padding()
        .background(PFColorToken.surfaceCanvas)
        .preferredColorScheme(.dark)
        .environment(\.dynamicTypeSize, .accessibility2)
}
