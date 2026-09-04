package com.prayer.pointfinder.dto.response;

import java.util.List;

/**
 * Complete game data for offline caching.
 * Contains all bases, challenges assigned to the player's team,
 * assignments, and current progress.
 *
 * <p>Privacy note: both the {@code bases} and {@code challenges} lists
 * use player-safe DTOs — {@link PlayerBaseResponse} and
 * {@link PlayerChallengeResponse} — not the operator-facing
 * {@link BaseResponse} / {@link ChallengeResponse}, so operator-only
 * fields such as {@code correctAnswer}, {@code operatorNotes},
 * {@code tags}, and {@code color} are omitted by construction. See
 * {@link PlayerBaseResponse} and {@link PlayerChallengeResponse} for
 * the full rationale, and {@code PlayerControllerTest} for the enforcing
 * assertions on the serialized response body.
 */
public record GameDataResponse(
        String gameStatus,
        String unlockTrigger,
        List<PlayerBaseResponse> bases,
        List<PlayerChallengeResponse> challenges,
        List<AssignmentResponse> assignments,
        List<BaseProgressResponse> progress
) {}
