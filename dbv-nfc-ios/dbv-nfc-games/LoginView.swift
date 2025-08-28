//
//  LoginView.swift
//  dbv-nfc-games
//
//  Entry screen for unauthenticated users to register by join code.
//

import SwiftUI

struct LoginView: View {
    @EnvironmentObject private var appState: AppState

    @State private var joinCode: String = ""
    @State private var isRegistering: Bool = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationView {
            VStack(spacing: 20) {
                Spacer()
                Image("logo_desbravadores")
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .frame(maxWidth: .infinity)
                    .padding(.horizontal, 96)

                TextField("Escreve o código da tua equipa para começar", text: $joinCode)
                    .keyboardType(.numberPad)
                    .textFieldStyle(RoundedBorderTextFieldStyle())
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                

                Button(action: register) {
                    if isRegistering { ProgressView() } else { Text("Entrar") }
                }
                .font(.title2)
                .buttonStyle(.borderedProminent)
                .disabled(joinCode.isEmpty || isRegistering)

            
                if let errorMessage = errorMessage {
                    Text(errorMessage).foregroundColor(.red)
                }

                Spacer()
                
                NavigationLink("Entrar como operador"){
                    OperatorLoginView()
                }.font(.footnote)
            }
            .padding()
        }
    }

    private func register() {
        guard isRegistering == false else { return }
        isRegistering = true
        errorMessage = nil
        Task {
            do {
                let client = APIClient(baseURL: appState.apiBaseURL)
                let (token, team) = try await client.joinTeam(joinCode: joinCode, deviceId: appState.deviceId)
                await MainActor.run {
                    appState.authToken = token
                    appState.currentTeam = team
                }
            } catch {
                await MainActor.run { errorMessage = String(describing: error) }
            }
            await MainActor.run { isRegistering = false }
        }
    }
}

#Preview {
    LoginView().environmentObject(AppState())
}


