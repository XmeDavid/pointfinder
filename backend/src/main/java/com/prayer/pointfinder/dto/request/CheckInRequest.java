package com.prayer.pointfinder.dto.request;

import lombok.Data;

import java.time.Instant;
import java.util.List;

/**
 * Discriminated check-in proof.
 *
 * <p>Three shapes travel through this one class because the endpoint is a
 * single POST per base and the valid shape depends on the base's configured
 * method, which the client does not get to choose:
 *
 * <pre>
 * { "method": "nfc", "token": "ab12cd34" }
 * { "method": "qr",  "token": "ab12cd34" }
 * { "method": "geo", "lat": 41.1, "lng": -8.6, "accuracy": 8.5,
 *   "capturedAt": "2026-09-05T10:00:00Z", "claimed": false }
 * { "method": "geo", ..., "claimed": true, "dwell": [ { ...fix... } x4+ ] }
 * </pre>
 *
 * <p>The legacy body {@code {"nfcToken": "ab12cd34"}} stays accepted and is
 * treated as {@code method: "nfc"}. It is only valid at NFC bases, so the
 * legacy iOS and Android apps keep working for the games they can complete.
 *
 * <p>Structural validation lives in
 * {@link com.prayer.pointfinder.service.CheckInVerificationService} rather
 * than in bean-validation annotations, because which fields are required
 * depends on the base's method — something the DTO cannot see.
 */
@Data
public class CheckInRequest {

    /** {@code nfc}, {@code qr}, or {@code geo}. Null means the legacy body. */
    private String method;

    /** Token for {@code nfc} and {@code qr} proofs. */
    private String token;

    /** Legacy field, equivalent to {@code method: "nfc"} with this token. */
    private String nfcToken;

    private Double lat;
    private Double lng;

    /** Reported horizontal accuracy in metres for a {@code geo} proof. */
    private Double accuracy;

    /** When the phone captured the fix. */
    private Instant capturedAt;

    /** True when the player pressed "I'm here" instead of GPS confirming. */
    private Boolean claimed;

    /** Dwell buffer backing a claim. Required only when {@code claimed}. */
    private List<FixDto> dwell;

    /** One sampled GPS fix from the dwell buffer. */
    @Data
    public static class FixDto {
        private Double lat;
        private Double lng;
        private Double accuracy;
        private Instant capturedAt;
    }
}
