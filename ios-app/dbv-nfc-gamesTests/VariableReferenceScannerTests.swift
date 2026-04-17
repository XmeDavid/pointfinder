import XCTest
@testable import dbv_nfc_games

final class VariableReferenceScannerTests: XCTestCase {
    func testFindsReferences() {
        XCTAssertEqual(
            VariableReferenceScanner.scan("Find {{secret}} at {{place}}"),
            ["secret", "place"]
        )
    }

    func testDeduplicates() {
        XCTAssertEqual(VariableReferenceScanner.scan("{{a}} and {{a}}"), ["a"])
    }

    func testEmptyAndNilAreIgnored() {
        let empty: [String?] = [nil, ""]
        XCTAssertEqual(VariableReferenceScanner.scan(empty), [])
    }

    func testIgnoresMalformedBraces() {
        XCTAssertEqual(VariableReferenceScanner.scan("{{ }}"), [])
        XCTAssertEqual(VariableReferenceScanner.scan("{notAVar}"), [])
    }

    func testFindUndefined() {
        let out = VariableReferenceScanner.findUndefined(
            in: ["Find {{secret}}", "{{typo}}"],
            availableKeys: Set(["secret"])
        )
        XCTAssertEqual(out, ["typo"])
    }

    func testFindUndefinedReturnsEmptyWhenAllKnown() {
        let out = VariableReferenceScanner.findUndefined(
            in: ["{{a}} and {{b}}"],
            availableKeys: Set(["a", "b"])
        )
        XCTAssertEqual(out, [])
    }

    func testScanAcrossMultipleTexts() {
        let out = VariableReferenceScanner.scan(["{{x}} here", "there {{y}}", "{{x}} again"])
        XCTAssertEqual(out, ["x", "y"])
    }
}
