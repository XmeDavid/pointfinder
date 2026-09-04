package com.prayer.pointfinder.dto.response;

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
 *   <li>{@code points} — scoring is operator-only in PointFinder. The
 *       player app must never surface point values (per CLAUDE.md
 *       "Players don't see scores or leaderboards"). Omitting the field
 *       at the DTO level means a regression that adds a score badge on
 *       a player surface cannot ship because the field is structurally
 *       absent from the response body.</li>
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
public record PlayerChallengeResponse(
    UUID id, UUID gameId, String title, String description, String content,
    String completionContent, String answerType, Boolean autoValidate,
    Boolean locationBound, Boolean requirePresenceToSubmit,
    List<UUID> unlocksBaseIds, UUID fixedBaseId
) {}
