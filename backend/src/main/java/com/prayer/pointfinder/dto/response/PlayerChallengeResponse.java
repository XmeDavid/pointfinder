package com.prayer.pointfinder.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;

import java.util.List;
import java.util.UUID;

/**
 * Player-facing challenge DTO.
 *
 * <p>Deliberately omits operator-only fields from the generic
 * {@link ChallengeResponse}:
 *
 * <ul>
 *   <li>{@code correctAnswer} — would leak the auto-validate answer list.</li>
 *   <li>{@code operatorNotes} — P1 Phase 4 W2: plain operator-only
 *       challenge notes must never be visible to players.</li>
 * </ul>
 *
 * <p>Any player-facing endpoint that needs challenge data MUST use this
 * DTO (or a narrower one like {@code CheckInResponse.ChallengeInfo}) and
 * never the operator-facing {@link ChallengeResponse}. The
 * {@code GET /api/player/games/{gameId}/data} endpoint returns this shape
 * inside {@link GameDataResponse}, and {@code PlayerControllerTest}
 * asserts via JSON path that {@code operatorNotes} never appears in the
 * response body.
 *
 * <p>Source spec: docs/specs/2026-04-08-post-pilot-reliability-and-operator-workflow.md
 * — P1 Operator Workflow and Content Model.
 */
@Data
@Builder
@AllArgsConstructor
public class PlayerChallengeResponse {
    private UUID id;
    private UUID gameId;
    private String title;
    private String description;
    private String content;
    private String completionContent;
    private String answerType;
    private Boolean autoValidate;
    private Integer points;
    private Boolean locationBound;
    private Boolean requirePresenceToSubmit;
    private List<UUID> unlocksBaseIds;
    private UUID fixedBaseId;
}
