import Testing
import Foundation
@testable import dbv_nfc_games

struct PointFinderTests {

    @Test func baseStatusMapsCorrectly() async throws {
        let statuses: [(String, String)] = [
            ("not_visited", "notVisited"),
            ("checked_in", "checkedIn"),
            ("submitted", "submitted"),
            ("completed", "completed"),
            ("rejected", "rejected"),
        ]

        for (raw, expected) in statuses {
            let status = BaseStatus(rawValue: raw)
            #expect(status != nil, "Failed to parse status: \(raw)")
            #expect(status?.rawValue == raw)
        }
    }

    @Test func translationsReturnKeyAsFallback() async throws {
        let result = Translations.string("nonexistent.key.that.does.not.exist", language: "en")
        #expect(result == "nonexistent.key.that.does.not.exist")
    }

    @Test func translationsReturnEnglishFallbackForMissingLanguage() async throws {
        let enResult = Translations.string("welcome.title", language: "en")
        let unknownResult = Translations.string("welcome.title", language: "xx")
        #expect(enResult == "PointFinder")
        #expect(unknownResult == "PointFinder")
    }

    @Test func configurationDeviceIdIsStable() async throws {
        let id1 = AppConfiguration.deviceId
        let id2 = AppConfiguration.deviceId
        #expect(id1 == id2, "Device ID should be stable across calls")
        #expect(!id1.isEmpty)
    }

    @Test func configurationKeysUsePointFinderPrefix() async throws {
        #expect(AppConfiguration.playerTokenKey.hasPrefix("com.prayer.pointfinder."))
        #expect(AppConfiguration.operatorTokenKey.hasPrefix("com.prayer.pointfinder."))
        #expect(AppConfiguration.deviceIdKey.hasPrefix("com.prayer.pointfinder."))
    }

    @Test func normalizedTeamVariablesAddsMissingCurrentTeamsWithoutDroppingExistingValues() async throws {
        let team1 = Team(id: UUID(), gameId: UUID(), name: "Red", joinCode: nil, color: "#ff0000")
        let team2 = Team(id: UUID(), gameId: team1.gameId, name: "Blue", joinCode: nil, color: "#0000ff")
        let variables = [
            TeamVariable(
                key: "greeting",
                teamValues: [
                    team1.id.uuidString.lowercased(): "hello",
                    "archived-team": "legacy"
                ]
            )
        ]

        let normalized = normalizedTeamVariables(variables, teams: [team1, team2])

        #expect(normalized.count == 1)
        #expect(normalized[0].teamValues[team1.id.uuidString.lowercased()] == "hello")
        #expect(normalized[0].teamValues[team2.id.uuidString.lowercased()] == "")
        #expect(normalized[0].teamValues["archived-team"] == nil)
    }

    @Test func teamVariableKeyValidationMatchesBackendRules() async throws {
        #expect(teamVariableKeyIsValid("Greeting"))
        #expect(teamVariableKeyIsValid("greeting_2"))
        #expect(!teamVariableKeyIsValid("2greeting"))
        #expect(!teamVariableKeyIsValid("greeting-value"))
        #expect(!teamVariableKeyIsValid("greeting value"))
    }

    @Test func resolveVariablePreviewUsesChallengeValuesOverGameValues() async throws {
        let teamId = UUID().uuidString
        let html = "<p>{{greeting}} {{target}} {{unknown}}</p>"
        let gameVariables = [
            TeamVariable(key: "greeting", teamValues: [teamId: "Hello"]),
            TeamVariable(key: "target", teamValues: [teamId: "World"])
        ]
        let challengeVariables = [
            TeamVariable(key: "target", teamValues: [teamId: "Team"])
        ]

        let resolved = resolveVariablePreview(
            template: html,
            gameVariables: gameVariables,
            challengeVariables: challengeVariables,
            teamId: teamId
        )

        #expect(resolved == "<p>Hello Team {{unknown}}</p>")
    }

    // MARK: - DateFormatting

    @Test func dateFormattingParsesISO8601WithFractionalSeconds() async throws {
        let date = DateFormatting.parseISO8601("2026-03-01T12:30:45.123Z")
        #expect(date != nil, "Should parse ISO 8601 with fractional seconds")
    }

    @Test func dateFormattingParsesISO8601WithoutFractionalSeconds() async throws {
        let date = DateFormatting.parseISO8601("2026-03-01T12:30:45Z")
        #expect(date != nil, "Should parse ISO 8601 without fractional seconds")
    }

    @Test func dateFormattingReturnsNilForInvalidString() async throws {
        let date = DateFormatting.parseISO8601("not-a-date")
        #expect(date == nil, "Should return nil for invalid string")
    }

    @Test func dateFormattingProducesRoundTrippableString() async throws {
        let now = Date()
        let formatted = DateFormatting.iso8601String(from: now)
        let parsed = DateFormatting.parseISO8601(formatted)
        #expect(parsed != nil, "Formatted string should be parseable")
        // Allow 1 second tolerance due to fractional second rounding
        let interval = abs(now.timeIntervalSince(parsed!))
        #expect(interval < 1.0, "Round-tripped date should be within 1 second")
    }
}
