import SwiftUI

enum PlayerFieldTone {
    case info
    case pending
    case success
    case danger
    case unknown

    var color: Color {
        switch self {
        case .info: PFColorToken.statusCheckedIn
        case .pending: PFColorToken.statusPending
        case .success: PFColorToken.statusCompleted
        case .danger: PFColorToken.statusRejected
        case .unknown: PFColorToken.statusUnknown
        }
    }
}

struct PlayerFieldStatusBanner: View {
    let title: String
    var message: String?
    let systemImage: String
    let tone: PlayerFieldTone

    var body: some View {
        HStack(alignment: .top, spacing: PFSpaceToken.space3) {
            Image(systemName: systemImage)
                .font(.headline)
                .foregroundStyle(tone.color)
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: PFSpaceToken.space1) {
                Text(title)
                    .font(PFTypographyToken.label)
                    .foregroundStyle(tone.color)
                if let message, !message.isEmpty {
                    Text(message)
                        .font(.caption)
                        .foregroundStyle(PFColorToken.contentSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(PFSpaceToken.space3)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(tone.color.opacity(0.08))
        .overlay {
            RoundedRectangle(cornerRadius: PFRadiusToken.md)
                .stroke(tone.color.opacity(0.35), lineWidth: 1)
        }
        .clipShape(RoundedRectangle(cornerRadius: PFRadiusToken.md))
        .accessibilityElement(children: .combine)
    }
}

struct PlayerNFCScanPrompt: View {
    let state: ScanAnimationState
    let title: String
    let instructions: String

    var body: some View {
        VStack(spacing: PFSpaceToken.space5) {
            AnimatedScanView(state: state)
                .frame(width: 260, height: 260)
            VStack(spacing: PFSpaceToken.space2) {
                Text(title)
                    .font(PFTypographyToken.title)
                    .foregroundStyle(PFColorToken.contentPrimary)
                    .multilineTextAlignment(.center)
                Text(instructions)
                    .font(.subheadline)
                    .foregroundStyle(PFColorToken.contentSecondary)
                    .multilineTextAlignment(.center)
            }
        }
        .frame(maxWidth: .infinity)
    }
}

struct PlayerSubmissionState: View {
    let title: String
    let message: String
    let systemImage: String
    let tone: PlayerFieldTone
    var titleIdentifier: String?

    var body: some View {
        VStack(spacing: PFSpaceToken.space4) {
            ZStack {
                Circle()
                    .fill(tone.color.opacity(0.13))
                    .frame(width: 120, height: 120)
                Image(systemName: systemImage)
                    .font(.system(size: 48))
                    .foregroundStyle(tone.color)
                    .accessibilityHidden(true)
            }
            Text(title)
                .font(PFTypographyToken.title)
                .multilineTextAlignment(.center)
                .accessibilityIdentifier(titleIdentifier ?? "")
            Text(message)
                .font(.subheadline)
                .foregroundStyle(PFColorToken.contentSecondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .contain)
    }
}

#Preview("Player field states · light") {
    ScrollView {
        VStack(spacing: PFSpaceToken.space3) {
            PlayerFieldStatusBanner(
                title: "Saved on this device",
                message: "It will sync when a connection returns.",
                systemImage: "arrow.triangle.2.circlepath",
                tone: .pending
            )
            PlayerFieldStatusBanner(
                title: "Unable to sync",
                message: "Open the sync queue to retry.",
                systemImage: "exclamationmark.triangle.fill",
                tone: .danger
            )
            PlayerSubmissionState(
                title: "Answer submitted",
                message: "Your answer is waiting for review.",
                systemImage: "clock.fill",
                tone: .pending
            )
        }
        .padding()
    }
    .background(PFColorToken.surfaceCanvas)
}

#Preview("Player field states · dark") {
    ScrollView {
        VStack(spacing: PFSpaceToken.space3) {
            PlayerFieldStatusBanner(
                title: "Saved on this device",
                message: "It will sync when a connection returns.",
                systemImage: "arrow.triangle.2.circlepath",
                tone: .pending
            )
            PlayerSubmissionState(
                title: "Answer accepted",
                message: "The next field instruction is available.",
                systemImage: "checkmark.circle.fill",
                tone: .success
            )
        }
        .padding()
    }
    .background(PFColorToken.surfaceCanvas)
    .preferredColorScheme(.dark)
}
