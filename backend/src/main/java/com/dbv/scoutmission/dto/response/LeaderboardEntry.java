package com.dbv.scoutmission.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;

import java.util.UUID;

@Data
@Builder
@AllArgsConstructor
public class LeaderboardEntry {
    private UUID teamId;
    private String teamName;
    private String color;
    private int points;
    private int completedChallenges;
}
