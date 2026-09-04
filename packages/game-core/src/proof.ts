/**
 * Proof of presence at a base.
 *
 * Today the backend accepts one kind: the token written on the base's NFC
 * tag. QR codes will carry the same token, and proximity will send a fix.
 * Modelling the proof now means the check-in flow, the queue, and the API
 * request never have to change shape when those modes arrive.
 */

export type CheckInProof =
  | { type: 'nfc'; token: string }
  | { type: 'qr'; token: string }
  | { type: 'geo'; lat: number; lng: number; accuracy: number; capturedAt: string }

export type CheckInMode = CheckInProof['type']

/** What the backend's check-in endpoint accepts today. */
export interface CheckInRequestBody {
  nfcToken: string
}

export class UnsupportedProofError extends Error {
  constructor(readonly mode: CheckInMode) {
    super(`Check-in mode "${mode}" is not supported by the backend yet`)
    this.name = 'UnsupportedProofError'
  }
}

/** Map a proof to the request body. Throws for modes the backend cannot verify yet. */
export function toCheckInRequest(proof: CheckInProof): CheckInRequestBody {
  switch (proof.type) {
    case 'nfc':
    case 'qr':
      return { nfcToken: proof.token }
    case 'geo':
      throw new UnsupportedProofError('geo')
  }
}

/**
 * Something that can obtain a proof for a base: the NFC sheet, a QR
 * scanner, or the location service. The UI picks one per base mode.
 */
export interface PresenceProvider {
  readonly mode: CheckInMode
  /** Resolve with a proof, or reject with `cancelled` / a provider error. */
  acquire(baseId: string, signal?: AbortSignal): Promise<CheckInProof>
}
