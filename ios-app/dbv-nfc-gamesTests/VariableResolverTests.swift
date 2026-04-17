import XCTest
@testable import dbv_nfc_games

final class VariableResolverTests: XCTestCase {
    func testSubstitutesSingleKey() {
        let vars = ["secret": "FOX"]
        XCTAssertEqual(VariableResolver.resolve("{{secret}}", variables: vars), "FOX")
    }

    func testSubstitutesMixedLiteralAndVariable() {
        let vars = ["prefix": "answer"]
        XCTAssertEqual(VariableResolver.resolve("{{prefix}}-FOX", variables: vars), "answer-FOX")
    }

    func testLeavesUnknownKeysAsIs() {
        XCTAssertEqual(VariableResolver.resolve("{{foo}}", variables: [:]), "{{foo}}")
    }

    func testEmptyInput() {
        XCTAssertEqual(VariableResolver.resolve("", variables: [:]), "")
    }

    func testNilInput() {
        XCTAssertEqual(VariableResolver.resolve(nil, variables: [:]), "")
    }

    func testMultipleKeysAndLiteralSurround() {
        let vars = ["a": "ONE", "b": "TWO"]
        XCTAssertEqual(
            VariableResolver.resolve("start {{a}} mid {{b}} end", variables: vars),
            "start ONE mid TWO end"
        )
    }

    func testUnknownKeyIsPreservedAmongstKnown() {
        let vars = ["known": "K"]
        XCTAssertEqual(
            VariableResolver.resolve("{{known}}-{{other}}", variables: vars),
            "K-{{other}}"
        )
    }
}
