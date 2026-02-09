import SwiftUI

struct SolveView: View {
    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss

    let baseId: UUID
    let challengeId: UUID
    let baseName: String

    @State private var answer = ""
    @State private var isSubmitting = false
    @State private var showResult = false
    @State private var submissionResult: SubmissionResponse?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                // Instructions
                VStack(alignment: .leading, spacing: 8) {
                    Label("Submit Your Answer", systemImage: "lightbulb.fill")
                        .font(.title3)
                        .fontWeight(.bold)

                    Text("Enter your answer below and tap submit when ready.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }

                // Offline indicator
                if !appState.isOnline {
                    HStack(spacing: 8) {
                        Image(systemName: "wifi.slash")
                            .foregroundStyle(.orange)
                        Text("You're offline. Submission will sync when connected.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }

                // Answer input
                VStack(alignment: .leading, spacing: 8) {
                    Text("Your Answer")
                        .font(.headline)

                    TextField("Type your answer here...", text: $answer, axis: .vertical)
                        .textFieldStyle(.roundedBorder)
                        .lineLimit(3...8)
                }

                // Submit button
                Button {
                    Task { await submitAnswer() }
                } label: {
                    if isSubmitting {
                        ProgressView()
                            .progressViewStyle(CircularProgressViewStyle(tint: .white))
                            .frame(maxWidth: .infinity)
                            .padding()
                            .background(Color.gray)
                            .clipShape(RoundedRectangle(cornerRadius: 14))
                    } else {
                        Label("Submit Answer", systemImage: "paperplane.fill")
                            .font(.headline)
                            .frame(maxWidth: .infinity)
                            .padding()
                            .background(canSubmit ? Color.accentColor : Color.gray)
                            .foregroundStyle(.white)
                            .clipShape(RoundedRectangle(cornerRadius: 14))
                    }
                }
                .disabled(!canSubmit || isSubmitting)

                // Help text
                HStack(alignment: .top, spacing: 8) {
                    Image(systemName: "info.circle")
                        .foregroundStyle(.blue)
                    Text("Your answer will be reviewed and you'll earn points if correct.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .padding()
        }
        .navigationTitle("Solve: \(baseName)")
        .navigationBarTitleDisplayMode(.inline)
        .navigationDestination(isPresented: $showResult) {
            if let result = submissionResult {
                SubmissionResultView(submission: result, baseName: baseName)
            }
        }
    }

    private var canSubmit: Bool {
        !answer.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private func submitAnswer() async {
        isSubmitting = true

        if let result = await appState.submitAnswer(
            baseId: baseId,
            challengeId: challengeId,
            answer: answer.trimmingCharacters(in: .whitespacesAndNewlines)
        ) {
            submissionResult = result
            showResult = true
        }

        isSubmitting = false
    }
}
