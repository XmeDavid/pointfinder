package com.prayer.pointfinder.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@Data
@Builder
@AllArgsConstructor
public class GameResultsExportResponse {
    private String gameName;
    private List<ChallengeInfo> challenges;
    private List<TeamResult> teams;

    @Data
    @Builder
    @AllArgsConstructor
    public static class ChallengeInfo {
        private UUID id;
        private String title;
        private int maxPoints;
    }

    @Data
    @Builder
    @AllArgsConstructor
    public static class TeamResult {
        private UUID teamId;
        private String teamName;
        private String color;
        private long totalPoints;
        private Map<UUID, Long> challengePoints;
    }
}
