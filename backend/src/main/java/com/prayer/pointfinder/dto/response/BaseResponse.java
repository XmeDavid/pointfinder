package com.prayer.pointfinder.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;

import java.util.List;
import java.util.UUID;

/**
 * Operator-facing base DTO.
 *
 * <p>This DTO exposes fields that players MUST NOT see, specifically
 * {@code tagIds} (operator-only setup organization metadata) and
 * {@code nfcToken} (operator-only write token). It is therefore used
 * exclusively by operator-only endpoints under
 * {@code /api/games/{gameId}/bases}.
 *
 * <p>Player-facing paths intentionally use a different DTO
 * ({@code PlayerBaseResponse}) that omits these fields by construction.
 * Any new player-facing endpoint that needs base data MUST use the
 * player-specific DTO, never this one.
 */
@Data
@Builder
@AllArgsConstructor
public class BaseResponse {
    private UUID id;
    private UUID gameId;
    private String name;
    private String description;
    private Double lat;
    private Double lng;
    private Boolean nfcLinked;
    private String nfcToken;
    private Boolean hidden;
    private UUID fixedChallengeId;
    /**
     * Operator-only game-scoped tag IDs. Resolved against the game's tag
     * vocabulary ({@code GET /api/games/{gameId}/tags}). Never exposed to
     * players — see {@code PlayerBaseResponse} for the player-safe DTO.
     */
    private List<UUID> tagIds;
}
