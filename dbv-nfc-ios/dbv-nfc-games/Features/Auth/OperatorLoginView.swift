import SwiftUI

struct OperatorLoginView: View {
    @Environment(AppState.self) private var appState

    @State private var email = ""
    @State private var password = ""
    @State private var isLoading = false

    var body: some View {
        @Bindable var appState = appState

        VStack(spacing: 24) {
            VStack(spacing: 8) {
                Image(systemName: "gearshape.circle.fill")
                    .font(.system(size: 60))
                    .foregroundStyle(.accent)

                Text("Operator Login")
                    .font(.title2)
                    .fontWeight(.bold)

                Text("Sign in with your operator account")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            .padding(.top, 20)

            VStack(spacing: 16) {
                TextField("Email", text: $email)
                    .textFieldStyle(.roundedBorder)
                    .textContentType(.emailAddress)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()

                SecureField("Password", text: $password)
                    .textFieldStyle(.roundedBorder)
                    .textContentType(.password)
            }
            .padding(.horizontal, 24)

            Button {
                Task {
                    isLoading = true
                    await appState.operatorLogin(email: email, password: password)
                    isLoading = false
                }
            } label: {
                if isLoading {
                    ProgressView()
                        .frame(maxWidth: .infinity)
                        .padding()
                } else {
                    Text("Sign In")
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                        .padding()
                }
            }
            .background(canLogin ? Color.accentColor : Color.gray)
            .foregroundStyle(.white)
            .clipShape(RoundedRectangle(cornerRadius: 14))
            .disabled(!canLogin || isLoading)
            .padding(.horizontal, 24)

            Spacer()
        }
        .navigationTitle("Operator Login")
        .navigationBarTitleDisplayMode(.inline)
        .alert("Error", isPresented: $appState.showError) {
            Button("OK") {}
        } message: {
            Text(appState.errorMessage ?? "An unknown error occurred")
        }
    }

    private var canLogin: Bool {
        !email.isEmpty && !password.isEmpty
    }
}

#Preview {
    NavigationStack {
        OperatorLoginView()
    }
    .environment(AppState())
}
