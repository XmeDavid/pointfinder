package com.prayer.pointfinder.dto.response;

import java.time.Instant;

public record DashboardResponse(
    long totalTeams,
    long totalBases,
    long totalChallenges,
    long pendingSubmissions,
    long completedSubmissions,
    long totalSubmissions,
    Instant startDate,
    Instant endDate
) {}
