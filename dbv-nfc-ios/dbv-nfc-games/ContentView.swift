//
//  ContentView.swift
//  dbv-nfc-games
//
//  Created by David Batista on 26/08/2025.
//

import SwiftUI
import CoreData

struct ContentView: View {
    @Environment(\.managedObjectContext) private var viewContext
    @EnvironmentObject private var appState: AppState

    var body: some View {
        // Temporarily bypassing login for NFC testing
        TabView {
            HomeView()
                .tabItem { Label("Home", systemImage: "house") }
            NFCProofOfConceptView()
                .tabItem { Label("NFC POC", systemImage: "antenna.radiowaves.left.and.right") }
            ProgressViewScreen()
                .tabItem { Label("Progress", systemImage: "list.bullet.rectangle") }
            SettingsViewScreen()
                .tabItem { Label("Settings", systemImage: "gearshape") }
        }
    }
}

#Preview {
    ContentView()
        .environmentObject(AppState())
        .environmentObject(LocationService())
        .environment(\.managedObjectContext, PersistenceController.preview.container.viewContext)
}
