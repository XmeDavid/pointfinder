package com.prayer.pointfinder.dto.response;

import java.util.List;
import java.util.UUID;

/**
 * Operator-facing challenge DTO.
 *
 * <p>This DTO exposes fields that players MUST NOT see, specifically
 * {@code correctAnswer}, {@code operatorNotes}, and {@code tagIds}. It is
 * therefore used exclusively by operator-only endpoints under
 * {@code /api/games/{gameId}/challenges}.
 *
 * <p>Player-facing paths intentionally use a different DTO
 * ({@code PlayerChallengeResponse}) that omits these fields by
 * construction. Any new player-facing endpoint that needs challenge data
 * MUST use the player-specific DTO, never this one.
 */
public record ChallengeResponse(
    UUID id, UUID gameId, String title, String description, String content,
    String completionContent, String answerType, Boolean autoValidate,
    List<String> correctAnswer, Integer points, Boolean locationBound,
    Boolean requirePresenceToSubmit, List<UUID> unlocksBaseIds, UUID fixedBaseId,
    String operatorNotes, List<UUID> tagIds
) {}
