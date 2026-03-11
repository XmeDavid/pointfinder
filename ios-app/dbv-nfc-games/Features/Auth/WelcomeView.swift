import SwiftUI

struct WelcomeView: View {
    @Environment(LocaleManager.self) private var locale
    @State private var showPlayerJoin = false
    @State private var showOperatorLogin = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                Spacer().frame(height: 48)

                // Title
                Text(locale.t("welcome.title"))
                    .font(.largeTitle)
                    .fontWeight(.bold)
                    .foregroundStyle(.white)

                Spacer()

                // Compass animation
                CompassRoseView()
                    .padding(.horizontal, 24)

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
                            .background(Color.white.opacity(0.12))
                            .foregroundStyle(.white)
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
            .background(Color(red: 0x0A / 255.0, green: 0x0A / 255.0, blue: 0x0A / 255.0))
        }
        .preferredColorScheme(.dark)
    }
}

#Preview {
    WelcomeView()
        .environment(AppState())
        .environment(LocaleManager())
}
