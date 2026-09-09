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

    // ── Check-in ─────────────────────────────────────────────────────────
    /** The submitted proof type does not match the base's configured method. */
    CHECK_IN_METHOD_MISMATCH,
    /** The NFC or QR token does not match the base token. */
    CHECK_IN_TOKEN_INVALID,
    /** GPS accuracy is missing, non-finite, or worse than the cap for this proof. */
    CHECK_IN_FIX_TOO_COARSE,
    /** The fix's capturedAt is more than 10 min ahead or more than 24 h behind now. */
    CHECK_IN_FIX_STALE,
    /**
     * An automatic geo proof landed outside the accepted distance. Details
     * carry {@code distanceM} and {@code allowedM}, both rounded to metres.
     */
    CHECK_IN_OUT_OF_RANGE,
    /**
     * An "I'm here" claim failed the dwell rule. Details carry {@code reason}:
     * {@code too_few_fixes}, {@code span_too_short}, {@code outside_ring},
     * {@code fix_too_coarse}, or {@code buffer_stale}.
     */
    CHECK_IN_CLAIM_NOT_DWELLED,
    PREVIOUS_BASE_REQUIRED,
    BASE_ORDER_LOCKED,
    BASE_ORDER_DISABLED,
    BASE_ORDER_INVALID,
    BASE_ORDER_DEPENDENCY_CONFLICT,
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
    /** Location check-in is a paid feature; the free tier may only use NFC and QR bases. */
    QUOTA_LOCATION_CHECK_IN_NOT_ALLOWED,
    /**
     * The upload would push the workspace past its resource storage
     * allowance. Like the member limit, this one is always enforced — it
     * bounds real bytes in object storage, not a product feature.
     */
    QUOTA_RESOURCE_STORAGE_EXCEEDED,

    // ── Variables ─────────────────────────────────────────────────────────
    /**
     * A challenge's content, completionContent, or correctAnswer references a
     * {@code {{key}}} that has no matching variable defined for at least one
     * team. Emitted at {@code setup → live} transition. The error payload
     * includes the offending challenge id, referenced key, and teams that
     * are missing a value for that key.
     */
    VARIABLE_REFERENCE_UNDEFINED,

    // ── Tutorials ─────────────────────────────────────────────────────────
    /** The tutorial scenario id is not on the server-side allowlist. Details carry {@code scenarioId}. */
    TUTORIAL_SCENARIO_UNKNOWN,
    /** The tutorial status is not one of {@code in_progress|completed|skipped}. Details carry {@code status}. */
    TUTORIAL_STATUS_UNKNOWN,
    /** The operator already owns a practice game that has not ended; delete or keep it first. */
    TUTORIAL_PRACTICE_GAME_EXISTS,
    /** Only {@code practice-game} scenarios create their game through the practice endpoint. */
    TUTORIAL_PRACTICE_GAME_NOT_ALLOWED,
    /** A practice game takes a single player. */
    TUTORIAL_PRACTICE_GAME_PLAYER_LIMIT,
    /** "Keep" was called on a game that is not a practice game. */
    TUTORIAL_NOT_PRACTICE_GAME,

    // ── Assignments ───────────────────────────────────────────────────────
    /** The team already has a challenge at this base. */
    ASSIGNMENT_TEAM_HAS_BASE,
    /** The base already carries an "All Teams" assignment. */
    ASSIGNMENT_BASE_ALL_TEAMS,
    /** The base already carries team-specific assignments. */
    ASSIGNMENT_BASE_TEAM_SPECIFIC,
    /** The team already meets this challenge at another base. */
    ASSIGNMENT_CHALLENGE_TEAM_ELSEWHERE,
    /** This challenge is already an "All Teams" assignment at another base. */
    ASSIGNMENT_CHALLENGE_ALL_TEAMS_ELSEWHERE,
    /** A bulk set mixes "All Teams" and team-specific rows on one base. */
    ASSIGNMENT_MIXED_MODES,
    /** A bulk set names the same base and team, or the same base as "All Teams", twice. */
    ASSIGNMENT_DUPLICATE,
    /** A bulk set puts the same challenge at two bases within one column. */
    ASSIGNMENT_CHALLENGE_REPEATED,

    // ── Clubs and invoicing ───────────────────────────────────────────────
    /** The admin email on a club creation request is missing or not a valid address. */
    ORG_ADMIN_EMAIL_INVALID,
    /** An admin sent a tier, status, or other enum value the backend does not know. */
    ORG_INVALID_ENUM_VALUE,
    /** Ownership can only move to someone who is already a member of the org. */
    ORG_TRANSFER_TARGET_NOT_MEMBER,
    /**
     * The org's creator cannot walk out of their own org — an ownerless org
     * cannot be administered, and {@code created_by} is NOT NULL. They must
     * transfer ownership first.
     */
    ORG_CREATOR_CANNOT_LEAVE,
    /** Invoicing needs STRIPE_SECRET_KEY; this deployment has none configured. */
    INVOICE_STRIPE_NOT_CONFIGURED,
    /** The club has no billing email to invoice — no admin member and no pending invite. */
    INVOICE_NO_BILLING_CONTACT,
    /** Stripe rejected the customer or invoice call. Details carry Stripe's own message. */
    INVOICE_STRIPE_CALL_FAILED,
    /** amountCents, dueDays, or termMonths was outside its allowed range. */
    INVOICE_AMOUNT_INVALID,
}
