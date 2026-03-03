import Foundation

enum DateFormatting {
    /// Shared formatter with fractional seconds support.
    static let iso8601WithFractionalSeconds: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    /// Shared formatter without fractional seconds (fallback).
    static let iso8601: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    /// Format current date as ISO 8601 string.
    static func iso8601String(from date: Date = Date()) -> String {
        iso8601WithFractionalSeconds.string(from: date)
    }

    /// Parse an ISO 8601 string, trying fractional seconds first.
    static func parseISO8601(_ string: String) -> Date? {
        iso8601WithFractionalSeconds.date(from: string) ?? iso8601.date(from: string)
    }
}
