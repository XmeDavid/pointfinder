import SwiftUI

struct SubmissionResultView: View {
    @Environment(LocaleManager.self) private var locale
    @Environment(\.dismiss) private var dismiss

    let submission: SubmissionResponse
    let baseName: String
    /// Optional closure to dismiss all the way back to the map (dismisses the sheet)
    var dismissToMap: (() -> Void)?

    var body: some View {
        VStack(spacing: 24) {
            Spacer()

            // Result icon
            VStack(spacing: 16) {
                ZStack {
                    Circle()
                        .fill(resultColor.opacity(0.15))
                        .frame(width: 120, height: 120)

                    Image(systemName: resultIcon)
                        .font(.system(size: 48))
                        .foregroundStyle(resultColor)
                }

                Text(resultTitle)
                    .font(.title2)
                    .fontWeight(.bold)

                Text(resultMessage)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 40)

                if let feedback = submission.feedback, !feedback.isEmpty {
                    Text(locale.t("result.feedback", feedback))
                        .font(.subheadline)
                        .foregroundStyle(.primary)
                        .padding()
                        .background(Color(.systemGray6))
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                }
            }

            Spacer()

            Button {
                // If we have a dismissToMap closure, use it to dismiss the entire sheet
                // Otherwise fall back to regular dismiss (pops one level)
                if let dismissToMap = dismissToMap {
                    dismissToMap()
                } else {
                    dismiss()
                }
            } label: {
                Text(locale.t("result.backToMap"))
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(Color.accentColor)
                    .foregroundStyle(.white)
                    .clipShape(RoundedRectangle(cornerRadius: 14))
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 24)
        }
        .navigationTitle(baseName)
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(true)
    }

    private var resultColor: Color {
        switch submission.status {
        case "correct", "approved": return .green
        case "incorrect", "rejected": return .red
        default: return .orange
        }
    }

    private var resultIcon: String {
        switch submission.status {
        case "correct", "approved": return "checkmark.circle.fill"
        case "incorrect", "rejected": return "xmark.circle.fill"
        default: return "clock.fill"
        }
    }

    private var resultTitle: String {
        switch submission.status {
        case "correct": return locale.t("result.correct")
        case "approved": return locale.t("result.approved")
        case "incorrect": return locale.t("result.incorrect")
        case "rejected": return locale.t("result.rejected")
        default: return locale.t("result.submitted")
        }
    }

    private var resultMessage: String {
        switch submission.status {
        case "correct": return locale.t("result.correctMsg")
        case "approved": return locale.t("result.approvedMsg")
        case "incorrect": return locale.t("result.incorrectMsg")
        case "rejected": return locale.t("result.rejectedMsg")
        default: return locale.t("result.submittedMsg")
        }
    }
}
