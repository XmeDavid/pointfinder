package com.prayer.pointfinder.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;

import java.util.List;
import java.util.UUID;

/**
 * Operator-facing challenge DTO.
 *
 * <p>This DTO exposes fields that players MUST NOT see, specifically
 * {@code correctAnswer} and {@code operatorNotes}. It is therefore used
 * exclusively by operator-only endpoints under
 * {@code /api/games/{gameId}/challenges}.
 *
 * <p>Player-facing paths intentionally use a different DTO
 * ({@code PlayerChallengeResponse}) that omits these fields by
 * construction. Any new player-facing endpoint that needs challenge data
 * MUST use the player-specific DTO, never this one.
 */
@Data
@Builder
@AllArgsConstructor
public class ChallengeResponse {
    private UUID id;
    private UUID gameId;
    private String title;
    private String description;
    private String content;
    private String completionContent;
    private String answerType;
    private Boolean autoValidate;
    private List<String> correctAnswer;
    private Integer points;
    private Boolean locationBound;
    private Boolean requirePresenceToSubmit;
    private List<UUID> unlocksBaseIds;
    private UUID fixedBaseId;
    /**
     * Operator-only free-text notes. Never exposed to players — see
     * {@code PlayerChallengeResponse} for the player-safe DTO variant.
     */
    private String operatorNotes;
}
