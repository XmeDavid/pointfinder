import SwiftUI

struct WelcomeView: View {
    @Environment(LocaleManager.self) private var locale
    @State private var showPlayerJoin = false
    @State private var showOperatorLogin = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                Spacer()

                // Logo area
                VStack(spacing: 16) {
                    Text(locale.t("welcome.title"))
                        .font(.largeTitle)
                        .fontWeight(.bold)

                    Text(locale.t("welcome.subtitle"))
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 40)
                }

                Spacer()

                // Buttons
                VStack(spacing: 12) {
                    Button {
                        showPlayerJoin = true
                    } label: {
                        Label(locale.t("welcome.joinGame"), systemImage: "person.3.fill")
                            .font(.headline)
                            .frame(maxWidth: .infinity)
                            .padding()
                            .background(Color.accentColor)
                            .foregroundStyle(.white)
                            .clipShape(RoundedRectangle(cornerRadius: 14))
                    }

                    Button {
                        showOperatorLogin = true
                    } label: {
                        Label(locale.t("welcome.operatorLogin"), systemImage: "gearshape.fill")
                            .font(.subheadline)
                            .frame(maxWidth: .infinity)
                            .padding()
                            .background(Color(.systemGray6))
                            .foregroundStyle(.primary)
                            .clipShape(RoundedRectangle(cornerRadius: 14))
                    }
                }
                .padding(.horizontal, 24)
                .padding(.bottom, 40)
            }
            .navigationDestination(isPresented: $showPlayerJoin) {
                PlayerJoinView()
            }
            .navigationDestination(isPresented: $showOperatorLogin) {
                OperatorLoginView()
            }
        }
    }
}

#Preview {
    WelcomeView()
        .environment(AppState())
        .environment(LocaleManager())
}
