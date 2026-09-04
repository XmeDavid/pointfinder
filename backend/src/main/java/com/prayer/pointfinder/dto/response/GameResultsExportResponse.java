package com.prayer.pointfinder.dto.response;

import java.util.List;
import java.util.Map;
import java.util.UUID;

public record GameResultsExportResponse(
        String gameName,
        List<ChallengeInfo> challenges,
        List<TeamResult> teams
) {
    public record ChallengeInfo(
            UUID id,
            String title,
            int maxPoints
    ) {}

    public record TeamResult(
            UUID teamId,
            String teamName,
            String color,
            long totalPoints,
            Map<UUID, Long> challengePoints
    ) {}
}
