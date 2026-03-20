import Foundation

/// Shared utility to determine whether an error is a transient network error
/// (suitable for retry) vs a server/application error (should not retry).
enum NetworkErrorHelper {

    /// Returns `true` when the error represents a transient network condition
    /// that is likely to succeed on retry (e.g. no internet, timeout, DNS failure).
    static func isNetworkError(_ error: Error) -> Bool {
        if let apiError = error as? APIError {
            switch apiError {
            case .networkError:
                return true
            default:
                return false
            }
        }
        // URLSession network errors
        let nsError = error as NSError
        guard nsError.domain == NSURLErrorDomain else { return false }
        let transientNetworkCodes: Set<Int> = [
            NSURLErrorNotConnectedToInternet,
            NSURLErrorNetworkConnectionLost,
            NSURLErrorTimedOut,
            NSURLErrorCannotFindHost,
            NSURLErrorCannotConnectToHost,
            NSURLErrorDNSLookupFailed,
            NSURLErrorInternationalRoamingOff,
            NSURLErrorCallIsActive,
            NSURLErrorDataNotAllowed
        ]
        return transientNetworkCodes.contains(nsError.code)
    }
}
