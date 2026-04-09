package com.prayer.pointfinder.exception;

/**
 * Machine-readable error codes emitted in the {@code code} field of every
 * error response. Mobile clients and web-admin map these to localized copy
 * so operators and players see actionable messages instead of raw backend
 * strings.
 *
 * <p>Codes are grouped by domain prefix for easy filtering. New codes should
 * follow the pattern {@code DOMAIN_ACTION_CONDITION}.
 *
 * <p>The string name of each enum constant (e.g. {@code "MARK_COMPLETED_REQUIRES_CHECKIN"})
 * is what appears in the {@code code} field of the JSON error response.
 */
public enum ErrorCode {

    // ── Mark-completed rescue ────────────────────────────────────────────
    /** Team is not checked in at the base; operator must call manual check-in first. */
    MARK_COMPLETED_REQUIRES_CHECKIN,
    /** The (operator, team, base, challenge) tuple already has an approved submission. */
    MARK_COMPLETED_ALREADY_COMPLETED,

    // ── Manual check-in ──────────────────────────────────────────────────
    /** Team is already checked in at this base; idempotent — the existing record is returned. */
    MANUAL_CHECKIN_ALREADY_CHECKED_IN,

    // ── Unlock override ──────────────────────────────────────────────────
    /** An active unlock override already exists for this (team, base) pair. */
    UNLOCK_OVERRIDE_ALREADY_EXISTS,
    /** No active unlock override exists for this (team, base) pair; cannot remove. */
    UNLOCK_OVERRIDE_NOT_FOUND,

    // ── Tags ─────────────────────────────────────────────────────────────
    /** A tag with this label already exists in the game (case-insensitive). */
    TAG_LABEL_DUPLICATE,
    /** The game has already reached the maximum number of tags. */
    TAG_CAP_EXCEEDED,
    /** The tag is assigned to at least one base or challenge and cannot be deleted. */
    TAG_IN_USE,
    /**
     * The tag (or game) was modified concurrently by another operator between
     * the client's read and the attempted write. The client should reload the
     * resource and retry. Emitted when Hibernate detects an optimistic-locking
     * conflict ({@code ObjectOptimisticLockingFailureException}).
     */
    TAG_MODIFIED_CONCURRENTLY,
}
