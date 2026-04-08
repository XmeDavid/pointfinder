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
 * {@code tags} and {@code color} (P1 Phase 4 W3 — operator-only setup
 * organization metadata) and {@code nfcToken} (operator-only write
 * token). It is therefore used exclusively by operator-only endpoints
 * under {@code /api/games/{gameId}/bases}.
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
     * Operator-only free-text tags. Never exposed to players — see
     * {@code PlayerBaseResponse} for the player-safe DTO variant.
     */
    private List<String> tags;
    /**
     * Operator-only fixed-palette color (7-char hex). Never exposed to
     * players — see {@code PlayerBaseResponse} for the player-safe DTO
     * variant.
     */
    private String color;
}
