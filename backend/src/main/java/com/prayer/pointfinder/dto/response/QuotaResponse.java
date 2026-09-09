package com.prayer.pointfinder.dto.response;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;

public record QuotaResponse(
    String context,
    UUID orgId,
    String tier,
    Limits limits,
    Usage usage,
    @JsonInclude(JsonInclude.Include.NON_NULL) Map<String, Object> overrides,
    /** Subscription status of the workspace: active, past_due, grace_period, frozen, cancelled. */
    String status,
    /**
     * For a club, the end of the paid term — what the dashboard shows as
     * "paid until". Null for personal quota and for orgs with no term.
     */
    Instant termEnd
) {
    public record Limits(
        Integer maxActiveGames,
        Integer maxOperatorsPerGame,
        Integer maxBasesPerGame,
        Long maxFileSizeBytes,
        Integer maxMembers,
        Integer maxLiveGames,
        Long maxResourceStorageBytes,
        Integer maxPlayersPerGame,
        /** Whether bases may use the LOCATION check-in method. Paid tiers only. */
        Boolean locationCheckIn
    ) {}

    public record Usage(
        int currentActiveGames,
        Integer currentMembers,
        Integer currentLiveGames,
        Long currentResourceStorageBytes
    ) {}
}
