package com.dbv.scoutmission.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;

import java.time.Instant;

@Data
@Builder
@AllArgsConstructor
public class DashboardResponse {
    private long totalTeams;
    private long totalBases;
    private long totalChallenges;
    private long pendingSubmissions;
    private long completedSubmissions;
    private long totalSubmissions;
    private Instant startDate;
    private Instant endDate;
}
