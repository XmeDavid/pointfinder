package com.prayer.pointfinder.dto.response;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Operator-facing per-team, per-base progress row.
 *
 * <p>The check-in proof fields are populated for operators only: the public
 * broadcast viewer reuses this shape with them left null, because a teammate
 * position snapshot names players and must never reach spectators.
 */
public record TeamBaseProgressResponse(
    UUID baseId,
    UUID teamId,
    String status,
    Instant checkedInAt,
    UUID challengeId,
    String submissionStatus,
    /** {@code NFC}, {@code QR}, {@code LOCATION}; null when not checked in. */
    String checkInMethod,
    /** {@code VERIFIED}, {@code CLAIMED}, {@code OPERATOR}; null when not checked in. */
    String verification,
    Double proofDistanceM,
    Double proofAccuracyM,
    Instant proofCapturedAt,
    /** Only filled for CLAIMED rows: one entry per teammate at claim time. */
    List<Map<String, Object>> teamPositionsSnapshot
) {
    /** Pre-check-in-methods shape, also used for the public broadcast. */
    public TeamBaseProgressResponse(UUID baseId, UUID teamId, String status, Instant checkedInAt, UUID challengeId, String submissionStatus) {
        this(baseId, teamId, status, checkedInAt, challengeId, submissionStatus, null, null, null, null, null, null);
    }
}
