import SwiftUI

struct SolveView: View {
    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss

    let baseId: UUID
    let challengeId: UUID
    let baseName: String

    @State private var answer = ""
    @State private var showSubmitScan = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                // Instructions
                VStack(alignment: .leading, spacing: 8) {
                    Label("Submit Your Answer", systemImage: "lightbulb.fill")
                        .font(.title3)
                        .fontWeight(.bold)

                    Text("Enter your answer below. You'll need to scan the NFC tag at \(baseName) to confirm your submission.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
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
                    appState.startSolving(baseId: baseId, challengeId: challengeId)
                    showSubmitScan = true
                } label: {
                    Label("Scan Tag to Submit", systemImage: "sensor.tag.radiowaves.forward")
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(canSubmit ? Color.accentColor : Color.gray)
                        .foregroundStyle(.white)
                        .clipShape(RoundedRectangle(cornerRadius: 14))
                }
                .disabled(!canSubmit)

                // Help text
                HStack(alignment: .top, spacing: 8) {
                    Image(systemName: "info.circle")
                        .foregroundStyle(.blue)
                    Text("After tapping the button above, hold your phone near the NFC tag to confirm and submit your answer.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .padding()
        }
        .navigationTitle("Solve: \(baseName)")
        .navigationBarTitleDisplayMode(.inline)
        .navigationDestination(isPresented: $showSubmitScan) {
            SubmitScanView(
                baseId: baseId,
                challengeId: challengeId,
                baseName: baseName,
                answer: answer
            )
        }
    }

    private var canSubmit: Bool {
        !answer.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
}
