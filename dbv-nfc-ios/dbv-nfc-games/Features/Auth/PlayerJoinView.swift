import SwiftUI

struct PlayerJoinView: View {
    @Environment(AppState.self) private var appState

    @State private var joinCode = ""
    @State private var displayName = ""
    @State private var isLoading = false

    var body: some View {
        @Bindable var appState = appState

        VStack(spacing: 24) {
            VStack(spacing: 8) {
                Image(systemName: "qrcode.viewfinder")
                    .font(.system(size: 60))
                    .foregroundStyle(.secondary)

                Text("Join Your Team")
                    .font(.title2)
                    .fontWeight(.bold)

                Text("Enter the code your team leader gave you")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
            .padding(.top, 20)

            VStack(spacing: 16) {
                TextField("Join Code", text: $joinCode)
                    .textFieldStyle(.roundedBorder)
                    .font(.title3)
                    .multilineTextAlignment(.center)
                    .textInputAutocapitalization(.characters)
                    .autocorrectionDisabled()

                TextField("Your Name", text: $displayName)
                    .textFieldStyle(.roundedBorder)
                    .textContentType(.name)
            }
            .padding(.horizontal, 24)

            Button {
                Task {
                    isLoading = true
                    await appState.playerJoin(
                        joinCode: joinCode.trimmingCharacters(in: .whitespacesAndNewlines),
                        displayName: displayName.trimmingCharacters(in: .whitespacesAndNewlines)
                    )
                    isLoading = false
                }
            } label: {
                if isLoading {
                    ProgressView()
                        .frame(maxWidth: .infinity)
                        .padding()
                } else {
                    Text("Join Game")
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                        .padding()
                }
            }
            .background(canJoin ? Color.accentColor : Color.gray)
            .foregroundStyle(.white)
            .clipShape(RoundedRectangle(cornerRadius: 14))
            .disabled(!canJoin || isLoading)
            .padding(.horizontal, 24)

            Spacer()
        }
        .navigationTitle("Join Game")
        .navigationBarTitleDisplayMode(.inline)
        .alert("Error", isPresented: $appState.showError) {
            Button("OK") {}
        } message: {
            Text(appState.errorMessage ?? "An unknown error occurred")
        }
    }

    private var canJoin: Bool {
        !joinCode.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
        !displayName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
}

#Preview {
    NavigationStack {
        PlayerJoinView()
    }
    .environment(AppState())
}
