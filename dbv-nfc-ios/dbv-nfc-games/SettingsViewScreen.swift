//
//  SettingsViewScreen.swift
//  dbv-nfc-games
//

import SwiftUI

struct SettingsViewScreen: View {
    @EnvironmentObject private var appState: AppState
    @EnvironmentObject private var locationService: LocationService

    @State private var wantsPings: Bool = false

    var body: some View {
        NavigationView {
            Form {
                Section(header: Text("Session")) {
                    HStack {
                        Text("Device ID")
                        Spacer()
                        Text(appState.deviceId).lineLimit(1).truncationMode(.middle)
                    }
                    if let token = appState.authToken {
                        HStack {
                            Text("JWT")
                            Spacer()
                            Text(token).lineLimit(1).truncationMode(.middle)
                        }
                    } else {
                        Text("Not authenticated")
                    }
                }

                

                Section(header: Text("Location")) {
                    Toggle(isOn: $wantsPings) {
                        Text("Enable presence pings")
                    }
                    .onChange(of: wantsPings) { on in
                        if on {
                            locationService.requestAuthorization()
                            locationService.startUpdates()
                        } else {
                            locationService.stopUpdates()
                        }
                    }
                    HStack {
                        Text("Status")
                        Spacer()
                        Text(locationService.authorizationStatus.description)
                    }
                }
            }
            .navigationTitle("Settings")
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    NavigationLink(destination: AdminNFCWriterView().environmentObject(appState)) {
                        Image(systemName: "wrench.and.screwdriver")
                    }
                }
            }
        }
        .onAppear { wantsPings = locationService.isPinging }
    }
}

#Preview {
    SettingsViewScreen().environmentObject(AppState())
}


