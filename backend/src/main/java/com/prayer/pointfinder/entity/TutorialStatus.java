package com.prayer.pointfinder.entity;

import java.util.Locale;

/**
 * Where an operator stands in one guided tutorial.
 *
 * <p>Persisted as the constant name ({@code IN_PROGRESS}) so the column reads
 * like every other enum column in the schema, but exposed on the wire in
 * lowercase ({@code in_progress}) because that is what the web client and the
 * design spec use. {@link #fromWire(String)} is deliberately lenient about case
 * and surrounding whitespace and deliberately strict about everything else: it
 * returns {@code null} rather than guessing, and the caller turns that into a
 * 400.
 */
public enum TutorialStatus {
    IN_PROGRESS,
    COMPLETED,
    SKIPPED;

    public String wireName() {
        return name().toLowerCase(Locale.ROOT);
    }

    public static TutorialStatus fromWire(String raw) {
        if (raw == null) {
            return null;
        }
        String normalized = raw.trim().toUpperCase(Locale.ROOT);
        for (TutorialStatus status : values()) {
            if (status.name().equals(normalized)) {
                return status;
            }
        }
        return null;
    }
}
