//
//  LoginView.swift
//  dbv-nfc-games
//
//  Entry screen for unauthenticated users to register by join code.
//

import SwiftUI

struct OperatorLoginView: View {
    @EnvironmentObject private var appState: AppState

    var body: some View {
        NavigationView {
            Text("Do this")
        }
    }

}

#Preview {
    OperatorLoginView().environmentObject(AppState())
}


