import Foundation
import CryptoKit
import Security

// MARK: - Certificate Pinning (Audit finding 12.2)
//
// Pin rotation strategy:
// This file pins the ISRG Root X1 and X2 CA certificates used by Let's Encrypt.
// When rotating pins (e.g. migrating to a new CA), add the new pin BEFORE the old
// certificate expires, ship an app update with both old and new pins, then remove the
// old pin in a subsequent release once adoption is sufficient. Always maintain at
// least two pins to avoid bricking clients if a CA key is revoked. Monitor certificate
// expiry dates and plan updates well in advance (ISRG Root X1 expires 2035-06-04,
// Root X2 expires 2040-09-17).

/// Thread-safe URLSession delegate that enforces SPKI pinning for the production domain.
/// Connections to non-production hosts (e.g. localhost, staging) are allowed through
/// without pinning so that development and testing workflows are not disrupted.
final class CertificatePinningDelegate: NSObject, URLSessionDelegate, URLSessionWebSocketDelegate, @unchecked Sendable {

    /// The domain to enforce certificate pinning on.
    static let pinnedDomain = "pointfinder.pt"

    /// Base64-encoded SHA-256 hashes of the Subject Public Key Info (SPKI)
    /// for each trusted root certificate in the chain.
    static let pinnedSPKIHashes: Set<String> = [
        "C5+lpZ7tcVwmwQIMcRtPbsQtWLABXhQzejna0wHFr8M=", // ISRG Root X1
        "diGVwiVYbubAI3RW4hB9xU8e/CH2GnkuvVFZE8zmgzI=", // ISRG Root X2
    ]

    /// ASN.1 header prepended to the raw public key bytes before hashing to produce
    /// the SPKI hash. This is the DER-encoded prefix for a 2048-bit RSA public key
    /// (also works for EC keys when the correct header is used, but Let's Encrypt
    /// roots use RSA-2048 for X1 and ECDSA P-384 for X2).
    /// For RSA 2048: 30 82 01 22 30 0d 06 09 2a 86 48 86 f7 0d 01 01 01 05 00 03 82 01 0f 00
    private static let rsaSPKIHeader: [UInt8] = [
        0x30, 0x82, 0x01, 0x22, 0x30, 0x0d, 0x06, 0x09,
        0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01,
        0x01, 0x05, 0x00, 0x03, 0x82, 0x01, 0x0f, 0x00,
    ]

    /// ASN.1 header for EC P-384 public keys (ISRG Root X2).
    private static let ecP384SPKIHeader: [UInt8] = [
        0x30, 0x76, 0x30, 0x10, 0x06, 0x07, 0x2a, 0x86,
        0x48, 0xce, 0x3d, 0x02, 0x01, 0x06, 0x05, 0x2b,
        0x81, 0x04, 0x00, 0x22, 0x03, 0x62, 0x00,
    ]

    /// ASN.1 header for EC P-256 public keys (common intermediates).
    private static let ecP256SPKIHeader: [UInt8] = [
        0x30, 0x59, 0x30, 0x13, 0x06, 0x07, 0x2a, 0x86,
        0x48, 0xce, 0x3d, 0x02, 0x01, 0x06, 0x08, 0x2a,
        0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07, 0x03,
        0x42, 0x00,
    ]

    // MARK: - URLSessionDelegate

    func urlSession(
        _ session: URLSession,
        didReceive challenge: URLAuthenticationChallenge,
        completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
    ) {
        guard challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust,
              let serverTrust = challenge.protectionSpace.serverTrust else {
            completionHandler(.performDefaultHandling, nil)
            return
        }

        let host = challenge.protectionSpace.host

        // Only enforce pinning for the production domain and its subdomains.
        guard host == Self.pinnedDomain || host.hasSuffix(".\(Self.pinnedDomain)") else {
            completionHandler(.performDefaultHandling, nil)
            return
        }

        // Evaluate the server trust to ensure the certificate chain is valid
        // according to the system trust store before checking pins.
        var error: CFError?
        guard SecTrustEvaluateWithError(serverTrust, &error) else {
            completionHandler(.cancelAuthenticationChallenge, nil)
            return
        }

        // Walk the entire certificate chain and check each certificate's SPKI hash.
        let chainLength = SecTrustGetCertificateCount(serverTrust)
        for index in 0..<chainLength {
            guard let certificate = SecTrustGetCertificateAtIndex(serverTrust, index) else {
                continue
            }

            if let spkiHash = Self.spkiHash(for: certificate),
               Self.pinnedSPKIHashes.contains(spkiHash) {
                // At least one certificate in the chain matches a pinned hash.
                let credential = URLCredential(trust: serverTrust)
                completionHandler(.useCredential, credential)
                return
            }
        }

        // No certificate in the chain matched any pinned hash.
        completionHandler(.cancelAuthenticationChallenge, nil)
    }

    // MARK: - URLSessionWebSocketDelegate

    func urlSession(
        _ session: URLSession,
        webSocketTask: URLSessionWebSocketTask,
        didOpenWithProtocol protocol: String?
    ) {
        // No-op; required for protocol conformance. Connection handling is
        // managed by the caller (MobileRealtimeClient).
    }

    func urlSession(
        _ session: URLSession,
        webSocketTask: URLSessionWebSocketTask,
        didCloseWith closeCode: URLSessionWebSocketTask.CloseCode,
        reason: Data?
    ) {
        // No-op; required for protocol conformance. Disconnect handling is
        // managed by the caller (MobileRealtimeClient).
    }

    // MARK: - SPKI Hash Extraction

    /// Extracts the SPKI SHA-256 hash from a certificate, returned as a base64 string.
    /// Returns nil if the public key cannot be extracted.
    private static func spkiHash(for certificate: SecCertificate) -> String? {
        guard let publicKey = SecCertificateCopyKey(certificate) else {
            return nil
        }

        guard let publicKeyData = SecKeyCopyExternalRepresentation(publicKey, nil) as Data? else {
            return nil
        }

        // Determine the correct ASN.1 header based on key type and size.
        guard let header = spkiHeader(for: publicKey) else {
            return nil
        }

        // Build the full SPKI by prepending the ASN.1 header to the raw key data,
        // then hash with SHA-256.
        var spkiData = Data(header)
        spkiData.append(publicKeyData)

        let hash = SHA256.hash(data: spkiData)
        return Data(hash).base64EncodedString()
    }

    /// Returns the appropriate ASN.1 DER header for the given public key's algorithm and size.
    private static func spkiHeader(for key: SecKey) -> [UInt8]? {
        guard let attributes = SecKeyCopyAttributes(key) as? [String: Any],
              let keyType = attributes[kSecAttrKeyType as String] as? String,
              let keySize = attributes[kSecAttrKeySizeInBits as String] as? Int else {
            return nil
        }

        if keyType == (kSecAttrKeyTypeRSA as String) {
            // RSA keys (2048, 4096, etc.) all use the same header for 2048-bit
            // since that matches the ISRG Root X1 pin. For other sizes the hash
            // simply won't match any pin, which is the correct behavior.
            return rsaSPKIHeader
        } else if keyType == (kSecAttrKeyTypeECSECPrimeRandom as String) {
            switch keySize {
            case 256:
                return ecP256SPKIHeader
            case 384:
                return ecP384SPKIHeader
            default:
                return nil
            }
        }

        return nil
    }
}

// MARK: - Shared Pinned Session Factory

extension CertificatePinningDelegate {

    /// A shared delegate instance. Because CertificatePinningDelegate holds no mutable
    /// state, a single instance is safe to share across multiple URLSessions.
    static let shared = CertificatePinningDelegate()

    /// Creates a URLSession configured with certificate pinning.
    /// Use this for all production network requests.
    static func makePinnedSession(
        configuration: URLSessionConfiguration = .default,
        delegateQueue: OperationQueue? = nil
    ) -> URLSession {
        URLSession(
            configuration: configuration,
            delegate: shared,
            delegateQueue: delegateQueue
        )
    }
}
