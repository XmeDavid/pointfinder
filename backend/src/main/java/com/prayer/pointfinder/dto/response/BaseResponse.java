package com.prayer.pointfinder.dto.response;

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
public record BaseResponse(
        UUID id,
        UUID gameId,
        String name,
        String description,
        Double lat,
        Double lng,
        Boolean nfcLinked,
        String nfcToken,
        Boolean hidden,
        UUID fixedChallengeId,
        /**
         * Operator-only game-scoped tag IDs. Resolved against the game's tag
         * vocabulary ({@code GET /api/games/{gameId}/tags}). Never exposed to
         * players — see {@code PlayerBaseResponse} for the player-safe DTO.
         */
        List<UUID> tagIds,
        UUID stageId,
        Integer sequenceNumber,
        /** {@code NFC}, {@code QR}, or {@code LOCATION}. */
        String checkInMethod,
        /**
         * Raw per-base radius override in metres, or null when the base
         * inherits the game default. The operator UI shows the inherited value
         * as a hint, so it needs to know the difference.
         */
        Integer checkInRadiusM
) {
    public BaseResponse(UUID id, UUID gameId, String name, String description, Double lat, Double lng, Boolean nfcLinked, String nfcToken, Boolean hidden, UUID fixedChallengeId, List<UUID> tagIds, UUID stageId) {
        this(id, gameId, name, description, lat, lng, nfcLinked, nfcToken, hidden, fixedChallengeId, tagIds, stageId, null, "NFC", null);
    }

    public BaseResponse(UUID id, UUID gameId, String name, String description, Double lat, Double lng, Boolean nfcLinked, String nfcToken, Boolean hidden, UUID fixedChallengeId, List<UUID> tagIds, UUID stageId, Integer sequenceNumber) {
        this(id, gameId, name, description, lat, lng, nfcLinked, nfcToken, hidden, fixedChallengeId, tagIds, stageId, sequenceNumber, "NFC", null);
    }
}
