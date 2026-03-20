import SwiftUI

struct OperatorLoginView: View {
    @Environment(AppState.self) private var appState
    @Environment(LocaleManager.self) private var locale

    @State private var email = ""
    @State private var password = ""
    @State private var isLoading = false
    @FocusState private var focusedField: Field?

    private enum Field { case email, password }

    var body: some View {
        @Bindable var appState = appState

        VStack(spacing: 24) {
            VStack(spacing: 8) {
                Image(systemName: "gearshape.circle.fill")
                    .font(.system(size: 60))
                    .foregroundStyle(.secondary)

                Text(locale.t("common.operatorLogin"))
                    .font(.title2)
                    .fontWeight(.bold)

                Text(locale.t("auth.signInSubtitle"))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            .padding(.top, 20)

            VStack(spacing: 16) {
                TextField(locale.t("auth.email"), text: $email)
                    .textFieldStyle(.roundedBorder)
                    .textContentType(.emailAddress)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .focused($focusedField, equals: .email)
                    .accessibilityIdentifier("login-email")

                SecureField(locale.t("auth.password"), text: $password)
                    .textFieldStyle(.roundedBorder)
                    .textContentType(.password)
                    .focused($focusedField, equals: .password)
                    .accessibilityIdentifier("login-password")
            }
            .padding(.horizontal, 24)

            Button {
                focusedField = nil
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
                    Text(locale.t("auth.signIn"))
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
            .accessibilityIdentifier("login-submit")

            Spacer()
        }
        .navigationTitle(locale.t("common.operatorLogin"))
        .navigationBarTitleDisplayMode(.inline)
        .alert(locale.t("common.error"), isPresented: $appState.showError) {
            Button(locale.t("common.ok")) {}
        } message: {
            Text(appState.errorMessage ?? locale.t("common.unknownError"))
                .accessibilityIdentifier("login-error")
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
    .environment(LocaleManager())
}
