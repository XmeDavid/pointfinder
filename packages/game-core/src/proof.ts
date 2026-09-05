/**
 * Proof of presence at a base.
 *
 * A base declares how a team proves it arrived: tap the tag written for it,
 * scan the printed code, or let the phone's own fix speak. Every route
 * produces one of these proofs, and the server verifies it against the
 * base's declared method — a QR code will not open an NFC base.
 */

/** One GPS sample as the wire carries it. `capturedAt` is ISO 8601. */
export interface DwellFix {
  lat: number
  lng: number
  accuracy: number
  capturedAt: string
}

export type CheckInProof =
  | { type: 'nfc'; token: string }
  | { type: 'qr'; token: string }
  | { type: 'geo'; lat: number; lng: number; accuracy: number; capturedAt: string; claimed: false }
  | { type: 'geo'; lat: number; lng: number; accuracy: number; capturedAt: string; claimed: true; dwell: DwellFix[] }

export type CheckInMode = CheckInProof['type']

/** How the server names a base's check-in method. */
export type CheckInMethod = 'NFC' | 'QR' | 'LOCATION'

/** What the check-in endpoint accepts. */
export type CheckInRequestBody =
  | { method: 'nfc' | 'qr'; token: string }
  | { method: 'geo'; lat: number; lng: number; accuracy: number; capturedAt: string; claimed: boolean; dwell?: DwellFix[] }

/** Map a proof onto the request body. Every variant is supported. */
export function toCheckInRequest(proof: CheckInProof): CheckInRequestBody {
  switch (proof.type) {
    case 'nfc':
    case 'qr':
      return { method: proof.type, token: proof.token }
    case 'geo':
      return proof.claimed
        ? { method: 'geo', lat: proof.lat, lng: proof.lng, accuracy: proof.accuracy, capturedAt: proof.capturedAt, claimed: true, dwell: proof.dwell }
        : { method: 'geo', lat: proof.lat, lng: proof.lng, accuracy: proof.accuracy, capturedAt: proof.capturedAt, claimed: false }
  }
}

/** The proof a base of this method asks for. */
export function proofTypeForMethod(method: CheckInMethod): 'nfc' | 'qr' | 'geo' {
  switch (method) {
    case 'NFC':
      return 'nfc'
    case 'QR':
      return 'qr'
    case 'LOCATION':
      return 'geo'
  }
}
