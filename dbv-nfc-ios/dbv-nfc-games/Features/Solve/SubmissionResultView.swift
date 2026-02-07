import SwiftUI

struct SubmissionResultView: View {
    @Environment(\.dismiss) private var dismiss

    let submission: SubmissionResponse
    let baseName: String

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
                    Text("Feedback: \(feedback)")
                        .font(.subheadline)
                        .foregroundStyle(.primary)
                        .padding()
                        .background(Color(.systemGray6))
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                }
            }

            Spacer()

            Button {
                // Pop back to root of this navigation
                dismiss()
            } label: {
                Text("Back to Map")
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
        case "correct": return "Correct!"
        case "approved": return "Approved!"
        case "incorrect": return "Incorrect"
        case "rejected": return "Rejected"
        default: return "Submitted"
        }
    }

    private var resultMessage: String {
        switch submission.status {
        case "correct": return "Great job! Your answer is correct."
        case "approved": return "Your submission has been approved."
        case "incorrect": return "Sorry, that's not the right answer. You can try again."
        case "rejected": return "Your submission was rejected. Check the feedback and try again."
        default: return "Your answer has been submitted and is awaiting review by an operator."
        }
    }
}
