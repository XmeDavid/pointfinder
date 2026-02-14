import SwiftUI

struct PlayerNameView: View {
    @Environment(AppState.self) private var appState
    @Environment(LocaleManager.self) private var locale

    let joinCode: String

    @State private var displayName = ""
    @State private var isLoading = false

    var body: some View {
        @Bindable var appState = appState

        VStack(spacing: 24) {
            VStack(spacing: 8) {
                Image(systemName: "person.crop.circle.badge.plus")
                    .font(.system(size: 60))
                    .foregroundStyle(.secondary)

                Text(locale.t("join.enterYourName"))
                    .font(.title2)
                    .fontWeight(.bold)

                Text(locale.t("join.subtitle"))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
            .padding(.top, 20)

            TextField(locale.t("join.yourName"), text: $displayName)
                .textFieldStyle(.roundedBorder)
                .textContentType(.name)
                .padding(.horizontal, 24)

            Button {
                Task {
                    isLoading = true
                    await appState.playerJoin(
                        joinCode: joinCode,
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
                    Text(locale.t("join.joinGame"))
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
        .navigationTitle(locale.t("join.joinGame"))
        .navigationBarTitleDisplayMode(.inline)
        .alert(locale.t("common.error"), isPresented: $appState.showError) {
            Button(locale.t("common.ok")) {}
        } message: {
            Text(appState.errorMessage ?? locale.t("common.unknownError"))
        }
    }

    private var canJoin: Bool {
        !displayName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
}

#Preview {
    NavigationStack {
        PlayerNameView(joinCode: "ABC123")
    }
    .environment(AppState())
    .environment(LocaleManager())
}
