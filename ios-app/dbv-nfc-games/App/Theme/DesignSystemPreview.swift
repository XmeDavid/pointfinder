import SwiftUI

private struct PFScenarioMatrix: View {
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: PFSpaceToken.space2) {
                Text("PointFinder scenarios")
                    .font(PFTypographyToken.title)

                ForEach(PFPreviewScenario.allCases) { scenario in
                    Text(scenario.rawValue.replacingOccurrences(of: "([A-Z])", with: " $1", options: .regularExpression).lowercased())
                        .font(PFTypographyToken.label)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(PFSpaceToken.space3)
                        .background(PFColorToken.surfacePanel)
                        .overlay {
                            RoundedRectangle(cornerRadius: PFRadiusToken.md)
                                .stroke(tone(for: scenario), lineWidth: 1)
                        }
                }
            }
            .padding(PFSpaceToken.space4)
        }
        .background(PFColorToken.surfaceCanvas)
        .foregroundStyle(PFColorToken.contentPrimary)
    }

    private func tone(for scenario: PFPreviewScenario) -> Color {
        switch scenario {
        case .error, .destructive: PFColorToken.statusRejected
        case .offline, .queued, .stale: PFColorToken.statusPending
        case .selected: PFColorToken.statusCheckedIn
        default: PFColorToken.borderDefault
        }
    }
}

#Preview("PointFinder scenarios · light") {
    PFScenarioMatrix().preferredColorScheme(.light)
}

#Preview("PointFinder scenarios · dark") {
    PFScenarioMatrix().preferredColorScheme(.dark)
}
