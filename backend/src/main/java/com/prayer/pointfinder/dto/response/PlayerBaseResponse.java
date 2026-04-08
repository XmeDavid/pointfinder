package com.prayer.pointfinder.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;

import java.util.UUID;

/**
 * Player-facing base DTO.
 *
 * <p>Deliberately omits operator-only fields from the generic
 * {@link BaseResponse}:
 *
 * <ul>
 *   <li>{@code tags} — P1 Phase 4 W3: operator-only free-text tags for
 *       setup organization must never be visible to players.</li>
 *   <li>{@code color} — P1 Phase 4 W3: operator-only fixed-palette color
 *       for setup organization must never be visible to players.</li>
 * </ul>
 *
 * <p>Any player-facing endpoint that needs base data MUST use this DTO
 * (or a narrower one like {@code BaseProgressResponse} or
 * {@code BroadcastBaseResponse}) and never the operator-facing
 * {@link BaseResponse}. The {@code GET /api/player/games/{gameId}/bases}
 * endpoint returns a list of this shape, and
 * {@code GET /api/player/games/{gameId}/data} returns this shape inside
 * {@link GameDataResponse}. {@code PlayerControllerTest} asserts via
 * JSON path and case-insensitive full-body substring checks that neither
 * {@code tags} nor {@code color} appears in the serialized response body.
 *
 * <p>Source spec: docs/specs/2026-04-08-post-pilot-reliability-and-operator-workflow.md
 * — P1 Operator Workflow and Content Model.
 */
@Data
@Builder
@AllArgsConstructor
public class PlayerBaseResponse {
    private UUID id;
    private UUID gameId;
    private String name;
    private String description;
    private Double lat;
    private Double lng;
    private Boolean nfcLinked;
    private Boolean hidden;
    private UUID fixedChallengeId;
}
