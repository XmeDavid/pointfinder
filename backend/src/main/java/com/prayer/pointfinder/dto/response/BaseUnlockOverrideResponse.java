package com.prayer.pointfinder.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;

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
@Data
@Builder
@AllArgsConstructor
public class BaseUnlockOverrideResponse {
    private UUID id;
    private UUID gameId;
    private UUID teamId;
    private UUID baseId;
    private UUID createdByOperatorId;
    private String createdByDisplayName;
    private String reason;
    private Instant createdAt;
}
