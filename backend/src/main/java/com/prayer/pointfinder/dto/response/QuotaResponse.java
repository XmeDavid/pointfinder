package com.prayer.pointfinder.dto.response;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.Map;
import java.util.UUID;

public record QuotaResponse(
    String context,
    UUID orgId,
    String tier,
    Limits limits,
    Usage usage,
    @JsonInclude(JsonInclude.Include.NON_NULL) Map<String, Object> overrides
) {
    public record Limits(
        Integer maxActiveGames,
        Integer maxOperatorsPerGame,
        Integer maxBasesPerGame,
        Long maxFileSizeBytes,
        Integer maxMembers,
        Integer maxLiveGames,
        Long maxResourceStorageBytes,
        Integer maxPlayersPerGame
    ) {}

    public record Usage(
        int currentActiveGames,
        Integer currentMembers,
        Integer currentLiveGames,
        Long currentResourceStorageBytes
    ) {}
}
