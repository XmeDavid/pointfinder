package com.prayer.pointfinder.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;

import java.time.Instant;
import java.util.UUID;

/**
 * Player-facing check-in response DTO.
 *
 * <p>P1 Phase 4 W4: the player-facing naming contract is "players see
 * challenge titles, not base names". This DTO therefore omits
 * {@code baseName} entirely — the player already knows which base they
 * scanned (they walked up to it and held their phone to the tag), and
 * the relevant post-check-in label is the challenge title which lives
 * on the nested {@link ChallengeInfo}.
 *
 * <p>Note this DTO is also returned by the operator-only manual
 * check-in rescue endpoint via {@code TeamService}. The operator UI
 * does not need {@code baseName} in this response either, because
 * operators trigger the rescue from a screen that already knows the
 * base they are rescuing; the confirmation path relies on the returned
 * {@code baseId} plus local state.
 *
 * <p>Source spec: docs/specs/2026-04-08-post-pilot-reliability-and-operator-workflow.md
 * — P1 Operator Workflow and Content Model.
 */
@Data
@Builder
@AllArgsConstructor
public class CheckInResponse {
    private UUID checkInId;
    private UUID baseId;
    private Instant checkedInAt;
    private ChallengeInfo challenge;

    @Data
    @Builder
    @AllArgsConstructor
    public static class ChallengeInfo {
        private UUID id;
        private String title;
        private String description;
        private String content;
        private String completionContent;
        private String answerType;
        private Integer points;
        private Boolean requirePresenceToSubmit;
    }
}
