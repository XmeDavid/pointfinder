package com.prayer.pointfinder.entity;

/**
 * How strong the proof behind a check-in row was.
 *
 * <p>Operators see this in the command view and the audit export, so the
 * distinction has to survive in the data rather than being re-derived.
 */
public enum CheckInVerification {
    /** Token matched, or a GPS fix landed inside the accepted distance. */
    VERIFIED,
    /** Player claimed presence after dwelling in the wider ring; flagged. */
    CLAIMED,
    /** Operator rescue; no player proof was involved. */
    OPERATOR
}
