import SwiftUI

struct SolveView: View {
    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss

    let baseId: UUID
    let challengeId: UUID
    let baseName: String
    let requirePresenceToSubmit: Bool
    /// Optional closure to dismiss all the way back to the map (dismisses the sheet)
    var dismissToMap: (() -> Void)?

    @State private var answer = ""
    @State private var isSubmitting = false
    @State private var showResult = false
    @State private var submissionResult: SubmissionResponse?
    @State private var nfcReader = NFCReaderService()
    @State private var scanError: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                // Instructions
                VStack(alignment: .leading, spacing: 8) {
                    Label("Submit Your Answer", systemImage: "lightbulb.fill")
                        .font(.title3)
                        .fontWeight(.bold)

                    if requirePresenceToSubmit {
                        Text("Enter your answer below. You'll need to confirm at the base to submit.")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    } else {
                        Text("Enter your answer below and tap submit when ready.")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                }

                // Offline indicator
                if !appState.isOnline && !requirePresenceToSubmit {
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

                if let error = scanError {
                    Text(error)
                        .font(.caption)
                        .foregroundStyle(.red)
                        .padding(.horizontal)
                }

                // Submit button
                Button {
                    Task { await handleSubmit() }
                } label: {
                    if isSubmitting {
                        ProgressView()
                            .progressViewStyle(CircularProgressViewStyle(tint: .white))
                            .frame(maxWidth: .infinity)
                            .padding()
                            .background(Color.gray)
                            .clipShape(RoundedRectangle(cornerRadius: 14))
                    } else {
                        Label(
                            requirePresenceToSubmit ? "Confirm at Base to Submit" : "Submit Answer",
                            systemImage: requirePresenceToSubmit ? "location.circle.fill" : "paperplane.fill"
                        )
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
                    if requirePresenceToSubmit {
                        Text("Return to this base and tap the button to confirm your presence and submit.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    } else {
                        Text("Your answer will be reviewed and you'll earn points if correct.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .padding()
        }
        .navigationTitle("Solve: \(baseName)")
        .navigationBarTitleDisplayMode(.inline)
        .navigationDestination(isPresented: $showResult) {
            if let result = submissionResult {
                SubmissionResultView(submission: result, baseName: baseName, dismissToMap: dismissToMap)
            }
        }
    }

    private var canSubmit: Bool {
        !answer.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private func handleSubmit() async {
        scanError = nil

        if requirePresenceToSubmit {
            await submitWithPresenceCheck()
        } else {
            await submitDirectly()
        }
    }

    private func submitWithPresenceCheck() async {
        isSubmitting = true

        do {
            // Scan NFC to verify presence
            let scannedBaseId = try await nfcReader.scanForBaseId()

            // Verify the scanned base matches
            guard scannedBaseId == baseId else {
                scanError = "Wrong base! You need to be at \(baseName) to submit."
                isSubmitting = false
                return
            }

            // NFC confirmed, now submit
            if let result = await appState.submitAnswer(
                baseId: baseId,
                challengeId: challengeId,
                answer: answer.trimmingCharacters(in: .whitespacesAndNewlines)
            ) {
                submissionResult = result
                showResult = true
            }
        } catch let error as NFCError {
            if case .cancelled = error {
                // User cancelled, no error to show
            } else {
                scanError = error.localizedDescription
            }
        } catch {
            scanError = error.localizedDescription
        }

        isSubmitting = false
    }

    private func submitDirectly() async {
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
