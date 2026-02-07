import SwiftUI

struct WelcomeView: View {
    @State private var showPlayerJoin = false
    @State private var showOperatorLogin = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                Spacer()

                // Logo area
                VStack(spacing: 16) {
                    Image("logo_desbravadores")
                        .resizable()
                        .scaledToFit()
                        .frame(width: 120, height: 120)
                        .clipShape(RoundedRectangle(cornerRadius: 24))

                    Text("Scout Mission")
                        .font(.largeTitle)
                        .fontWeight(.bold)

                    Text("Explore, discover, and complete challenges with your team")
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
                        Label("Join a Game", systemImage: "person.3.fill")
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
                        Label("Operator Login", systemImage: "gearshape.fill")
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
}
