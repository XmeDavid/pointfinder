import CoreNFC

/// Shared helper for extracting an `NFCNDEFTag` from any `NFCTag` variant.
enum NFCTagHelper {

    /// Attempts to obtain an `NFCNDEFTag` interface from the given tag,
    /// regardless of whether it is ISO 7816, MiFare, ISO 15693, or FeliCa.
    static func ndefTag(from tag: NFCTag) -> NFCNDEFTag? {
        switch tag {
        case .iso7816(let iso7816Tag):
            return iso7816Tag as? NFCNDEFTag
        case .miFare(let mifareTag):
            return mifareTag
        case .iso15693(let iso15693Tag):
            return iso15693Tag
        case .feliCa(let felicaTag):
            return felicaTag
        @unknown default:
            return nil
        }
    }
}
