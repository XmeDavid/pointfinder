import SwiftUI

struct NFCWriteView: View {
    @Environment(AppState.self) private var appState
    @State private var nfcWriter = NFCWriterService()

    let game: Game
    let base: Base

    @State private var isWriting = false
    @State private var writeSuccess = false
    @State private var errorMessage: String?

    var body: some View {
        VStack(spacing: 24) {
            // Base info
            VStack(spacing: 8) {
                Image(systemName: "mappin.circle.fill")
                    .font(.system(size: 48))
                    .foregroundStyle(.accent)

                Text(base.name)
                    .font(.title2)
                    .fontWeight(.bold)

                Text(base.description)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 20)

                // NFC status
                HStack {
                    Image(systemName: base.nfcLinked ? "checkmark.circle.fill" : "circle.dashed")
                        .foregroundStyle(base.nfcLinked ? .green : .orange)
                    Text(base.nfcLinked ? "NFC Tag Linked" : "NFC Tag Not Linked")
                        .font(.subheadline)
                        .fontWeight(.medium)
                }
                .padding(.top, 8)
            }
            .padding(.top, 20)

            Divider()

            // Write section
            VStack(spacing: 12) {
                Text("Write NFC Tag")
                    .font(.headline)

                Text("This will write the base ID to the NFC tag. Players will scan this tag to check in at this base.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 20)

                // Base ID display
                VStack(spacing: 4) {
                    Text("Base ID")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text(base.id.uuidString)
                        .font(.caption2)
                        .monospaced()
                        .foregroundStyle(.secondary)
                }
                .padding()
                .background(Color(.systemGray6))
                .clipShape(RoundedRectangle(cornerRadius: 8))
            }

            if let error = errorMessage {
                Text(error)
                    .font(.caption)
                    .foregroundStyle(.red)
            }

            if writeSuccess {
                Label("Tag written and linked successfully!", systemImage: "checkmark.circle.fill")
                    .font(.subheadline)
                    .foregroundStyle(.green)
            }

            Spacer()

            // Write button
            Button {
                Task { await writeTag() }
            } label: {
                Label(
                    isWriting ? "Writing..." : "Write to NFC Tag",
                    systemImage: "sensor.tag.radiowaves.forward"
                )
                .font(.headline)
                .frame(maxWidth: .infinity)
                .padding()
                .background(isWriting ? Color.gray : Color.accentColor)
                .foregroundStyle(.white)
                .clipShape(RoundedRectangle(cornerRadius: 14))
            }
            .disabled(isWriting)
            .padding(.horizontal, 24)
            .padding(.bottom, 24)
        }
        .navigationTitle("Link NFC Tag")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func writeTag() async {
        isWriting = true
        errorMessage = nil
        writeSuccess = false

        do {
            try await nfcWriter.writeBaseId(base.id)

            // Mark base as NFC-linked in backend
            guard case .userOperator(let token, _, _) = appState.authType else { return }
            _ = try await appState.apiClient.linkBaseNfc(
                gameId: game.id,
                baseId: base.id,
                token: token
            )

            writeSuccess = true
        } catch let error as NFCError {
            if case .cancelled = error {
                // User cancelled
            } else {
                errorMessage = error.localizedDescription
            }
        } catch {
            errorMessage = error.localizedDescription
        }

        isWriting = false
    }
}
