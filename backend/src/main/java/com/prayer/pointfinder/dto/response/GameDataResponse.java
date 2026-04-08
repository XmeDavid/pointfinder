package com.prayer.pointfinder.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;

import java.util.List;

/**
 * Complete game data for offline caching.
 * Contains all bases, challenges assigned to the player's team,
 * assignments, and current progress.
 *
 * <p>Privacy note: the {@code challenges} list uses
 * {@link PlayerChallengeResponse}, not the operator-facing
 * {@link ChallengeResponse}, so operator-only fields such as
 * {@code correctAnswer} and {@code operatorNotes} are omitted by
 * construction. See {@code PlayerChallengeResponse} for the full
 * rationale and {@code PlayerControllerTest.getGameDataNeverLeaksOperatorNotes}
 * for the enforcing assertion.
 */
@Data
@Builder
@AllArgsConstructor
public class GameDataResponse {
    private String gameStatus;
    private String unlockTrigger;
    private List<BaseResponse> bases;
    private List<PlayerChallengeResponse> challenges;
    private List<AssignmentResponse> assignments;
    private List<BaseProgressResponse> progress;
}
