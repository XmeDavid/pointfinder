package com.prayer.pointfinder.dto.response;

import java.util.UUID;

/**
 * The result of standing a club up. Exactly one of {@code adminUserId} and
 * {@code inviteId} is set: the club administrator either already had an
 * account and is a member now, or was sent a registration invite that will
 * make them a member and the org's owner when they accept it.
 */
public record AdminCreateOrgResponse(
    OrgResponse org,
    String adminEmail,
    /** Set when the address already had an account. */
    UUID adminUserId,
    /** Set when a registration invite was sent instead. */
    UUID inviteId
) {}
