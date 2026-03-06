import SwiftUI
import Foundation

func normalizedTeamVariables(_ variables: [TeamVariable], teams: [Team]) -> [TeamVariable] {
    let teamIds = teams.map { $0.id.uuidString.lowercased() }
    let allowedTeamIds = Set(teamIds)

    return variables.map { variable in
        var teamValues = variable.teamValues.filter { allowedTeamIds.contains($0.key) }
        for teamId in teamIds {
            if teamValues[teamId] == nil {
                teamValues[teamId] = ""
            }
        }
        return TeamVariable(key: variable.key, teamValues: teamValues)
    }
}

func teamVariableKeyIsValid(_ key: String) -> Bool {
    key.range(of: "^[A-Za-z][A-Za-z0-9_]*$", options: .regularExpression) != nil
}

func resolveVariablePreview(
    template: String,
    gameVariables: [TeamVariable],
    challengeVariables: [TeamVariable] = [],
    teamId: String
) -> String {
    var resolvedValues: [String: String] = [:]

    for variable in gameVariables {
        if let value = variable.teamValues[teamId] {
            resolvedValues[variable.key] = value
        }
    }

    for variable in challengeVariables {
        if let value = variable.teamValues[teamId] {
            resolvedValues[variable.key] = value
        }
    }

    guard let regex = try? NSRegularExpression(pattern: #"\{\{(\w+)\}\}"#) else {
        return template
    }

    let nsTemplate = template as NSString
    let mutable = NSMutableString(string: template)
    let matches = regex.matches(in: template, range: NSRange(location: 0, length: nsTemplate.length))

    for match in matches.reversed() {
        let key = nsTemplate.substring(with: match.range(at: 1))
        let replacement = resolvedValues[key] ?? nsTemplate.substring(with: match.range(at: 0))
        mutable.replaceCharacters(in: match.range(at: 0), with: replacement)
    }

    return mutable as String
}

struct TeamVariablesEditorView: View {
    @Environment(LocaleManager.self) private var locale

    let teams: [Team]
    let initialVariables: [TeamVariable]
    let onSave: ([TeamVariable]) async throws -> [TeamVariable]

    @State private var variables: [TeamVariable]
    @State private var baselineVariables: [TeamVariable]
    @State private var expandedKeys: Set<String>
    @State private var newVariableName = ""
    @State private var keyError: String?
    @State private var errorMessage: String?
    @State private var isSaving = false

    init(
        teams: [Team],
        initialVariables: [TeamVariable],
        onSave: @escaping ([TeamVariable]) async throws -> [TeamVariable]
    ) {
        let normalized = normalizedTeamVariables(initialVariables, teams: teams)
        self.teams = teams
        self.initialVariables = normalized
        self.onSave = onSave
        self._variables = State(initialValue: normalized)
        self._baselineVariables = State(initialValue: normalized)
        self._expandedKeys = State(initialValue: Set(normalized.map(\.key)))
    }

    private var hasChanges: Bool {
        variables != baselineVariables
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if teams.isEmpty {
                Text(locale.t("operator.noTeamsInGame"))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            } else if variables.isEmpty {
                Text(locale.t("operator.noVariables"))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            ForEach(variables, id: \.key) { variable in
                DisclosureGroup(
                    isExpanded: Binding(
                        get: { expandedKeys.contains(variable.key) },
                        set: { isExpanded in
                            if isExpanded {
                                expandedKeys.insert(variable.key)
                            } else {
                                expandedKeys.remove(variable.key)
                            }
                        }
                    )
                ) {
                    VStack(spacing: 10) {
                        ForEach(teams) { team in
                            HStack(spacing: 12) {
                                HStack(spacing: 8) {
                                    Circle()
                                        .fill(Color(hex: team.color) ?? .blue)
                                        .frame(width: 10, height: 10)
                                    Text(team.name)
                                        .font(.subheadline)
                                        .lineLimit(1)
                                }
                                .frame(maxWidth: .infinity, alignment: .leading)

                                TextField(
                                    "",
                                    text: Binding(
                                        get: { value(for: variable.key, teamId: team.id.uuidString.lowercased()) },
                                        set: { updateValue(for: variable.key, teamId: team.id.uuidString.lowercased(), value: $0) }
                                    )
                                )
                                .multilineTextAlignment(.trailing)
                            }
                        }
                    }
                    .padding(.top, 8)
                } label: {
                    HStack(spacing: 8) {
                        Text("{{\(variable.key)}}")
                            .font(.system(.subheadline, design: .monospaced))
                        Spacer()
                        Button(role: .destructive) {
                            removeVariable(variable.key)
                        } label: {
                            Image(systemName: "trash")
                                .font(.caption)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }

            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 8) {
                    TextField(locale.t("operator.variableName"), text: $newVariableName)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    Button(locale.t("operator.createVariable")) {
                        addVariable()
                    }
                    .disabled(newVariableName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || teams.isEmpty)
                }

                if let keyError {
                    Text(keyError)
                        .font(.caption)
                        .foregroundStyle(.red)
                }
            }

            if hasChanges {
                Button {
                    Task { await saveVariables() }
                } label: {
                    Text(isSaving ? locale.t("common.saving") : locale.t("operator.save"))
                        .fontWeight(.semibold)
                        .frame(maxWidth: .infinity)
                }
                .disabled(isSaving || teams.isEmpty)
            }

            if let errorMessage {
                Text(errorMessage)
                    .font(.caption)
                    .foregroundStyle(.red)
            }
        }
        .onChange(of: initialVariables) { _, newValue in
            let normalized = normalizedTeamVariables(newValue, teams: teams)
            variables = normalized
            baselineVariables = normalized
            expandedKeys = Set(normalized.map(\.key))
        }
    }

    private func value(for key: String, teamId: String) -> String {
        variables.first(where: { $0.key == key })?.teamValues[teamId] ?? ""
    }

    private func updateValue(for key: String, teamId: String, value: String) {
        variables = variables.map { variable in
            guard variable.key == key else { return variable }
            var teamValues = variable.teamValues
            teamValues[teamId] = value
            return TeamVariable(key: variable.key, teamValues: teamValues)
        }
    }

    private func addVariable() {
        let trimmed = newVariableName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }

        if !teamVariableKeyIsValid(trimmed) {
            keyError = locale.t("operator.invalidVariableName")
            return
        }

        if variables.contains(where: { $0.key.caseInsensitiveCompare(trimmed) == .orderedSame }) {
            keyError = locale.t("operator.duplicateVariable")
            return
        }

        keyError = nil
        errorMessage = nil
        let teamValues = Dictionary(uniqueKeysWithValues: teams.map { ($0.id.uuidString.lowercased(), "") })
        variables.append(TeamVariable(key: trimmed, teamValues: teamValues))
        expandedKeys.insert(trimmed)
        newVariableName = ""
    }

    private func removeVariable(_ key: String) {
        variables.removeAll { $0.key == key }
        expandedKeys.remove(key)
        errorMessage = nil
    }

    private func saveVariables() async {
        isSaving = true
        errorMessage = nil
        do {
            let savedVariables = normalizedTeamVariables(try await onSave(variables), teams: teams)
            variables = savedVariables
            baselineVariables = savedVariables
            expandedKeys = Set(savedVariables.map(\.key))
        } catch {
            errorMessage = error.localizedDescription
        }
        isSaving = false
    }
}
