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

    // ── Stages ──────────────────────────────────────────────────────────
    /** No stage found with this ID. */
    STAGE_NOT_FOUND,
    /** The stage does not belong to the specified game. */
    STAGE_GAME_MISMATCH,
    /** The stage still has bases assigned; unassign them first. */
    STAGE_HAS_BASES,
    /** The trigger base referenced by this stage does not exist. */
    STAGE_TRIGGER_BASE_NOT_FOUND,
    /** The stage is already the active stage for its game. */
    STAGE_ALREADY_ACTIVE,

    // ── Auth / profile ───────────────────────────────────────────────────
    /** The current password provided does not match the account's stored password. */
    INVALID_CURRENT_PASSWORD,
    /** The new password does not meet complexity requirements. */
    INVALID_NEW_PASSWORD,
    /** The email address is already registered to another account. */
    EMAIL_ALREADY_TAKEN,
    /** The email-change verification token is invalid or does not exist. */
    EMAIL_CHANGE_TOKEN_INVALID,
    /** The email-change verification token has expired. */
    EMAIL_CHANGE_TOKEN_EXPIRED,

    // ── Billing / account state ──────────────────────────────────────────
    /** The operator's account is frozen; they must update their payment method. */
    ACCOUNT_FROZEN,

    // ── Player join & check-in ───────────────────────────────────────────
    /** Player check-in missing required nfcToken; client must scan the base NFC tag. */
    NFC_TOKEN_REQUIRED,
    /** The device already joined this game on a different team; switching teams mid-game is not allowed. */
    DEVICE_ALREADY_IN_DIFFERENT_TEAM,
    /** Too many join attempts for this IP or device in the current window. */
    RATE_LIMITED,

    // ── Quota enforcement ────────────────────────────────────────────────
    /** User has reached the maximum number of active games for their tier. */
    QUOTA_ACTIVE_GAMES_EXCEEDED,
    /** Game has reached the maximum number of bases for this tier. */
    QUOTA_BASES_PER_GAME_EXCEEDED,
    /** Game has reached the maximum number of operators for this tier. */
    QUOTA_OPERATORS_PER_GAME_EXCEEDED,
    /** Organization has reached the maximum number of members for its tier. */
    QUOTA_ORG_MEMBERS_EXCEEDED,
    /** Organization has reached the maximum number of live games for its tier. */
    QUOTA_LIVE_GAMES_EXCEEDED,
    /** Uploaded file exceeds the maximum file size for this tier. */
    QUOTA_FILE_SIZE_EXCEEDED,
    /** Game has reached the maximum number of players for this tier. */
    QUOTA_PLAYERS_PER_GAME_EXCEEDED,

    // ── Variables ─────────────────────────────────────────────────────────
    /**
     * A challenge's content, completionContent, or correctAnswer references a
     * {@code {{key}}} that has no matching variable defined for at least one
     * team. Emitted at {@code setup → live} transition. The error payload
     * includes the offending challenge id, referenced key, and teams that
     * are missing a value for that key.
     */
    VARIABLE_REFERENCE_UNDEFINED,
}
