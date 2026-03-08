import SwiftUI
import CoreLocation

struct BaseEditView: View {
    @Environment(AppState.self) private var appState
    @Environment(LocaleManager.self) private var locale
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var colorScheme

    let game: Game
    let base: Base?
    let bases: [Base]
    let challenges: [Challenge]
    var onSaved: (Base) -> Void
    var onDeleted: (() -> Void)?

    @State private var name: String
    @State private var description: String
    @State private var lat: Double
    @State private var lng: Double
    @State private var requirePresenceToSubmit: Bool
    @State private var hidden: Bool
    @State private var fixedChallengeId: UUID?
    @State private var isSaving = false
    @State private var showDeleteAlert = false
    @State private var errorMessage: String?
    @State private var showSaveSuccess = false

    // NFC
    @State private var nfcWriter = NFCWriterService()
    @State private var nfcLinked: Bool
    @State private var isWritingNfc = false

    // Location (for create mode)
    @StateObject private var locationManager = BaseEditLocationManager()
    @State private var hasInitializedLocation = false

    private var isCreateMode: Bool { base == nil }

    /// Challenges available for the fixed-challenge picker, excluding those already fixed to other bases.
    private var availableChallenges: [Challenge] {
        let unavailableIds = Set(
            bases
                .filter { $0.id != base?.id && $0.fixedChallengeId != nil }
                .compactMap { $0.fixedChallengeId }
        )
        return challenges.filter { !unavailableIds.contains($0.id) || $0.id == fixedChallengeId }
    }

    private var token: String? {
        if case .userOperator(let token, _, _) = appState.authType {
            return token
        }
        return nil
    }

    init(game: Game, base: Base?, bases: [Base], challenges: [Challenge], initialCoordinate: CLLocationCoordinate2D? = nil, onSaved: @escaping (Base) -> Void, onDeleted: (() -> Void)? = nil) {
        self.game = game
        self.base = base
        self.bases = bases
        self.challenges = challenges
        self.onSaved = onSaved
        self.onDeleted = onDeleted
        self._name = State(initialValue: base?.name ?? "")
        self._description = State(initialValue: base?.description ?? "")
        self._lat = State(initialValue: base?.lat ?? initialCoordinate?.latitude ?? 0)
        self._lng = State(initialValue: base?.lng ?? initialCoordinate?.longitude ?? 0)
        self._requirePresenceToSubmit = State(initialValue: base?.requirePresenceToSubmit ?? false)
        self._hidden = State(initialValue: base?.hidden ?? false)
        self._fixedChallengeId = State(initialValue: base?.fixedChallengeId)
        self._nfcLinked = State(initialValue: base?.nfcLinked ?? false)
        // If coordinate was provided, skip GPS initialization
        if initialCoordinate != nil {
            self._hasInitializedLocation = State(initialValue: true)
        }
    }

    var body: some View {
        Form {
            // Map with draggable pin (tap to reposition)
            Section {
                MapLibreMapView(
                    styleURL: TileSources.resolvedStyleURL(for: game.tileSource, isDark: colorScheme == .dark),
                    annotations: [
                        MapAnnotationItem(
                            id: "edit-pin",
                            coordinate: CLLocationCoordinate2D(latitude: lat, longitude: lng),
                            title: name,
                            subtitle: nil,
                            view: AnyView(
                                BaseAnnotationView(status: .notVisited, name: name)
                            ),
                            onTap: nil
                        )
                    ],
                    fitCoordinates: [CLLocationCoordinate2D(latitude: lat, longitude: lng)],
                    onTap: { coordinate in
                        lat = coordinate.latitude
                        lng = coordinate.longitude
                    }
                )
                .frame(height: 200)
                .clipShape(RoundedRectangle(cornerRadius: 8))
                .listRowInsets(EdgeInsets(top: 8, leading: 0, bottom: 8, trailing: 0))

                Text(locale.t("operator.tapToMovePin"))
                    .font(.caption)
                    .foregroundStyle(.secondary)

                HStack {
                    Image(systemName: "location.fill")
                        .foregroundStyle(.blue)
                        .font(.caption)
                    Text(String(format: "%.6f, %.6f", lat, lng))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            // Name & Description
            Section {
                TextField(locale.t("operator.baseName"), text: $name)
                    .accessibilityIdentifier("base-name-input")
                TextField(locale.t("operator.baseDescription"), text: $description, axis: .vertical)
                    .lineLimit(2...4)
            }

            // Toggles
            Section {
                Toggle(locale.t("operator.requirePresence"), isOn: $requirePresenceToSubmit)
                Toggle(locale.t("operator.hiddenBase"), isOn: $hidden)
            }

            // Fixed Challenge picker
            Section(locale.t("operator.fixedChallenge")) {
                Picker(locale.t("operator.fixedChallenge"), selection: $fixedChallengeId) {
                    Text(locale.t("operator.none")).tag(nil as UUID?)
                    ForEach(availableChallenges) { challenge in
                        Text(challenge.title).tag(challenge.id as UUID?)
                    }
                }
                .pickerStyle(.menu)
                .accessibilityIdentifier("assign-challenge-btn")
            }

            // NFC section (edit mode only)
            if !isCreateMode {
                Section(locale.t("nfc.tag")) {
                    HStack {
                        if nfcLinked {
                            Label(locale.t("nfc.nfcLinked"), systemImage: "checkmark.circle.fill")
                                .foregroundStyle(.green)
                        } else {
                            Label(locale.t("nfc.nfcNotLinked"), systemImage: "xmark.circle")
                                .foregroundStyle(.orange)
                        }
                    }
                    Button {
                        Task { await writeNfcTag() }
                    } label: {
                        Label(
                            isWritingNfc ? locale.t("nfc.writing") : locale.t("nfc.writeToTag"),
                            systemImage: "sensor.tag.radiowaves.forward"
                        )
                    }
                    .disabled(isWritingNfc)
                }
            }

            // Save button
            Section {
                Button {
                    Task { await save() }
                } label: {
                    Text(isSaving ? locale.t("common.saving") : (isCreateMode ? locale.t("common.create") : locale.t("operator.save")))
                        .fontWeight(.semibold)
                        .frame(maxWidth: .infinity)
                }
                .disabled(name.isEmpty || isSaving)
                .accessibilityIdentifier("base-save-btn")
            }
            .accessibilityIdentifier("assignment-save-btn")

            if let errorMessage {
                Section {
                    Text(errorMessage)
                        .foregroundStyle(.red)
                        .font(.caption)
                }
            }

            // Delete (edit mode only)
            if !isCreateMode {
                Section {
                    Button(role: .destructive) {
                        showDeleteAlert = true
                    } label: {
                        Label(locale.t("operator.deleteBase"), systemImage: "trash")
                            .frame(maxWidth: .infinity)
                    }
                    .accessibilityIdentifier("base-delete-btn")
                }
            }
        }
        .overlay(alignment: .top) {
            if showSaveSuccess {
                Text(locale.t("common.saved"))
                    .font(.subheadline)
                    .fontWeight(.medium)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .background(.green.opacity(0.9))
                    .foregroundStyle(.white)
                    .clipShape(Capsule())
                    .transition(.move(edge: .top).combined(with: .opacity))
                    .onAppear {
                        DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                            withAnimation { showSaveSuccess = false }
                        }
                    }
                    .padding(.top, 8)
            }
        }
        .animation(.easeInOut, value: showSaveSuccess)
        .navigationTitle(isCreateMode ? locale.t("operator.createBase") : locale.t("operator.editBase"))
        .navigationBarTitleDisplayMode(.inline)
        .onReceive(locationManager.$lastLocation) { newLocation in
            if base == nil && !hasInitializedLocation, let coord = newLocation {
                lat = coord.latitude
                lng = coord.longitude
                hasInitializedLocation = true
            }
        }
        .alert(locale.t("operator.deleteBaseConfirmTitle"), isPresented: $showDeleteAlert) {
            Button(locale.t("operator.delete"), role: .destructive) {
                Task { await deleteBase() }
            }
            Button(locale.t("common.cancel"), role: .cancel) {}
        } message: {
            Text(locale.t("operator.deleteBaseConfirmMessage"))
        }
    }

    private func save() async {
        guard let token else { return }
        isSaving = true
        errorMessage = nil
        do {
            if let base {
                // Update existing
                let updatedBase = try await appState.apiClient.updateBase(
                    gameId: game.id,
                    baseId: base.id,
                    request: UpdateBaseRequest(
                        name: name,
                        description: description,
                        lat: lat,
                        lng: lng,
                        fixedChallengeId: fixedChallengeId,
                        requirePresenceToSubmit: requirePresenceToSubmit,
                        hidden: hidden
                    ),
                    token: token
                )
                onSaved(updatedBase)
                withAnimation { showSaveSuccess = true }
            } else {
                // Create new
                let newBase = try await appState.apiClient.createBase(
                    gameId: game.id,
                    request: CreateBaseRequest(
                        name: name,
                        description: description,
                        lat: lat,
                        lng: lng,
                        fixedChallengeId: fixedChallengeId,
                        requirePresenceToSubmit: requirePresenceToSubmit,
                        hidden: hidden
                    ),
                    token: token
                )
                withAnimation { showSaveSuccess = true }
                onSaved(newBase)
            }
        } catch {
            errorMessage = error.localizedDescription
        }
        isSaving = false
    }

    private func deleteBase() async {
        guard let token, let base else { return }
        do {
            try await appState.apiClient.deleteBase(gameId: game.id, baseId: base.id, token: token)
            onDeleted?()
            dismiss()
        } catch {
            appState.setError(error.localizedDescription)
        }
    }

    private func writeNfcTag() async {
        guard let token, let base else { return }
        isWritingNfc = true
        do {
            try await nfcWriter.writeBaseId(base.id)
            let _ = try await appState.apiClient.linkBaseNfc(
                gameId: game.id,
                baseId: base.id,
                token: token
            )
            nfcLinked = true
        } catch let error as NFCError {
            if case .cancelled = error { } else {
                appState.setError(error.localizedDescription)
            }
        } catch {
            appState.setError(error.localizedDescription)
        }
        isWritingNfc = false
    }
}

// MARK: - Location Manager for Create Mode

private class BaseEditLocationManager: NSObject, ObservableObject, CLLocationManagerDelegate {
    @Published var lastLocation: CLLocationCoordinate2D?
    private let manager = CLLocationManager()

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBest
        manager.requestWhenInUseAuthorization()
        manager.startUpdatingLocation()
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        if lastLocation == nil {
            lastLocation = locations.last?.coordinate
            manager.stopUpdatingLocation()
        }
    }
}
