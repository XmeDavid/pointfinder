package com.prayer.pointfinder.dto.response;

import java.util.UUID;

public record LeaderboardEntry(
        UUID teamId,
        String teamName,
        String color,
        long points,
        int completedChallenges
) {}
