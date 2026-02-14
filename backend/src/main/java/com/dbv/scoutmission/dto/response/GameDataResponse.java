package com.dbv.scoutmission.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;

import java.util.List;

/**
 * Complete game data for offline caching.
 * Contains all bases, challenges assigned to the player's team,
 * assignments, and current progress.
 */
@Data
@Builder
@AllArgsConstructor
public class GameDataResponse {
    private String gameStatus;
    private List<BaseResponse> bases;
    private List<ChallengeResponse> challenges;
    private List<AssignmentResponse> assignments;
    private List<BaseProgressResponse> progress;
}
