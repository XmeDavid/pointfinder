import SwiftUI
import UniformTypeIdentifiers

struct CreateGameView: View {
    @Environment(AppState.self) private var appState
    @Environment(LocaleManager.self) private var locale
    @Environment(\.dismiss) private var dismiss

    @State private var name = ""
    @State private var description = ""
    @State private var importMode = false
    @State private var importData: GameExportDto?
    @State private var isCreating = false
    @State private var showFilePicker = false
    @State private var errorMessage: String?

    var onCreated: (Game) -> Void

    private var token: String? {
        if case .userOperator(let token, _, _) = appState.authType {
            return token
        }
        return nil
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField(locale.t("operator.gameName"), text: $name)
                        .accessibilityIdentifier("game-name-input")
                    if !importMode {
                        TextField(locale.t("common.description"), text: $description, axis: .vertical)
                            .lineLimit(3...6)
                    }
                }

                Section(locale.t("operator.startFrom")) {
                    Picker("", selection: $importMode) {
                        Text(locale.t("operator.emptyGame")).tag(false)
                        Text(locale.t("operator.importFromFile")).tag(true)
                    }
                    .pickerStyle(.segmented)

                    if importMode {
                        Button(locale.t("operator.selectFile")) {
                            showFilePicker = true
                        }
                        if importData != nil {
                            Label(locale.t("operator.fileLoaded"), systemImage: "checkmark.circle.fill")
                                .foregroundStyle(.green)
                        }
                    }
                }

                if let errorMessage {
                    Section {
                        Text(errorMessage)
                            .foregroundStyle(.red)
                            .font(.caption)
                    }
                }

                if isCreating {
                    Section {
                        HStack {
                            Spacer()
                            ProgressView()
                            Spacer()
                        }
                    }
                }
            }
            .navigationTitle(locale.t("operator.createGame"))
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(locale.t("common.cancel")) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(locale.t("common.create")) {
                        Task { await createGame() }
                    }
                    .disabled(name.isEmpty || isCreating || (importMode && importData == nil))
                    .accessibilityIdentifier("game-save-btn")
                }
            }
            .onChange(of: importMode) { _, newValue in
                if !newValue { importData = nil }
            }
            .fileImporter(isPresented: $showFilePicker, allowedContentTypes: [.json]) { result in
                switch result {
                case .success(let url):
                    loadImportFile(url: url)
                case .failure(let error):
                    errorMessage = error.localizedDescription
                }
            }
        }
    }

    private func loadImportFile(url: URL) {
        guard url.startAccessingSecurityScopedResource() else {
            errorMessage = locale.t("operator.fileAccessError")
            return
        }
        defer { url.stopAccessingSecurityScopedResource() }

        do {
            let data = try Data(contentsOf: url)
            importData = try JSONDecoder().decode(GameExportDto.self, from: data)
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
            importData = nil
        }
    }

    private func createGame() async {
        guard let token else { return }
        isCreating = true
        errorMessage = nil

        do {
            let game: Game
            if importMode, var exportData = importData {
                exportData.game.name = name
                game = try await appState.apiClient.importGame(
                    request: ImportGameRequest(
                        gameData: exportData
                    ),
                    token: token
                )
            } else {
                game = try await appState.apiClient.createGame(
                    request: CreateGameRequest(name: name, description: description),
                    token: token
                )
            }
            onCreated(game)
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }

        isCreating = false
    }
}
