package com.prayer.pointfinder.entity;

/**
 * How a team proves it reached a base. Chosen per base, seeded from the
 * game's {@code defaultCheckInMethod} when the base is created; changing the
 * game default later does not rewrite existing bases.
 *
 * <p>Persisted as {@code VARCHAR(16)} rather than a Postgres enum so future
 * methods do not need an enum migration.
 */
public enum CheckInMethod {
    /** Tap the NFC tag written for the base. */
    NFC,
    /** Scan the printed QR code, which carries the same token as the tag. */
    QR,
    /** Be inside the base radius; verified server-side from a GPS fix. */
    LOCATION
}
