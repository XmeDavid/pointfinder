import Foundation

enum VariableReferenceScanner {
    private static let pattern = try! NSRegularExpression(
        pattern: #"\{\{([a-zA-Z][a-zA-Z0-9_]*)\}\}"#
    )

    /// Variadic convenience — scans each provided text.
    static func scan(_ texts: String...) -> [String] {
        scan(Array(texts))
    }

    /// Returns unique `{{key}}` references across all given texts, in first-seen order.
    static func scan(_ texts: [String?]) -> [String] {
        var seen = Set<String>()
        var ordered: [String] = []
        for text in texts {
            guard let text = text, !text.isEmpty else { continue }
            let ns = text as NSString
            let matches = pattern.matches(in: text, range: NSRange(location: 0, length: ns.length))
            for m in matches {
                let key = ns.substring(with: m.range(at: 1))
                if seen.insert(key).inserted {
                    ordered.append(key)
                }
            }
        }
        return ordered
    }

    /// Returns the referenced keys that are NOT present in `availableKeys`, preserving scan order.
    static func findUndefined(in texts: [String?], availableKeys: Set<String>) -> [String] {
        scan(texts).filter { !availableKeys.contains($0) }
    }
}
