package com.prayer.pointfinder.dto.response;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;

import java.util.Map;
import java.util.UUID;

@Data
@Builder
@AllArgsConstructor
public class QuotaResponse {
    private String context;
    private UUID orgId;
    private String tier;
    private Limits limits;
    private Usage usage;
    @JsonInclude(JsonInclude.Include.NON_NULL)
    private Map<String, Object> overrides;

    @Data
    @Builder
    @AllArgsConstructor
    public static class Limits {
        private Integer maxActiveGames;
        private Integer maxOperatorsPerGame;
        private Integer maxBasesPerGame;
        private Long maxFileSizeBytes;
        private Integer maxMembers;
        private Integer maxLiveGames;
        private Long maxResourceStorageBytes;
    }

    @Data
    @Builder
    @AllArgsConstructor
    public static class Usage {
        private int currentActiveGames;
        private Integer currentMembers;
        private Integer currentLiveGames;
        private Long currentResourceStorageBytes;
    }
}
