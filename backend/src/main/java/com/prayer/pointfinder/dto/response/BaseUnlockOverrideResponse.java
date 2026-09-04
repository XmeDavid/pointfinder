package com.prayer.pointfinder.dto.response;

import java.time.Instant;
import java.util.UUID;

/**
 * API projection for a {@link com.prayer.pointfinder.entity.BaseUnlockOverride}.
 *
 * <p>Returned by the operator rescue endpoints that create or list base
 * unlock overrides. The response never carries FK objects directly — only
 * the IDs and the immutable display-name snapshots — so it is safe to
 * serialize without triggering lazy-load proxies.
 */
public record BaseUnlockOverrideResponse(
    UUID id,
    UUID gameId,
    UUID teamId,
    UUID baseId,
    UUID createdByOperatorId,
    String createdByDisplayName,
    String reason,
    Instant createdAt
) {}
