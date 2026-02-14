import Testing
import Foundation

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
}
