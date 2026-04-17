import Foundation

enum VariableResolver {
    private static let pattern = try! NSRegularExpression(
        pattern: #"\{\{([a-zA-Z][a-zA-Z0-9_]*)\}\}"#
    )

    /// Substitutes `{{key}}` placeholders with values from the given map.
    /// Unknown keys are left intact. Returns the fully-resolved string.
    static func resolve(_ text: String?, variables: [String: String]) -> String {
        guard let text = text, !text.isEmpty else { return "" }
        let ns = text as NSString
        let range = NSRange(location: 0, length: ns.length)
        let matches = pattern.matches(in: text, range: range)
        guard !matches.isEmpty else { return text }

        var result = ""
        var cursor = 0
        for m in matches {
            if m.range.location > cursor {
                result += ns.substring(with: NSRange(
                    location: cursor,
                    length: m.range.location - cursor
                ))
            }
            let key = ns.substring(with: m.range(at: 1))
            if let v = variables[key] {
                result += v
            } else {
                result += ns.substring(with: m.range)
            }
            cursor = m.range.location + m.range.length
        }
        if cursor < ns.length {
            result += ns.substring(with: NSRange(
                location: cursor,
                length: ns.length - cursor
            ))
        }
        return result
    }
}
