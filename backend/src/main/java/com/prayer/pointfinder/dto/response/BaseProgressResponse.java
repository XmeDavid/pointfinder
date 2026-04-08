package com.prayer.pointfinder.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;

import java.time.Instant;
import java.util.UUID;

/**
 * Player-facing per-base progress DTO.
 *
 * <p>P1 Phase 4 W4: the player-facing naming contract is "players see
 * challenge titles, not base names". This DTO therefore carries the
 * challenge title (nullable — null when no challenge is assigned, e.g.
 * a check-in-only base, or a base whose assignment was cleared) and
 * does NOT carry {@code baseName}. The base name remains an
 * operator-oriented setup label and is exposed only on operator DTOs.
 *
 * <p>A future regression that tries to add a base name here would
 * surface both in Java (this DTO being the only shape returned to the
 * player) and in the case-insensitive substring check performed by
 * {@code PlayerControllerTest.getGameDataResponseStringDoesNotContainBaseNameKey}.
 *
 * <p>Source spec: docs/specs/2026-04-08-post-pilot-reliability-and-operator-workflow.md
 * — P1 Operator Workflow and Content Model.
 */
@Data
@Builder
@AllArgsConstructor
public class BaseProgressResponse {
    private UUID baseId;
    /**
     * Title of the challenge assigned to this base for the team, or
     * {@code null} when no challenge is assigned (e.g. a hidden base
     * that is a check-in-only unlock target). Populated by
     * {@code PlayerService.getProgress} via the standard assignment
     * resolution path.
     */
    private String challengeTitle;
    private Double lat;
    private Double lng;
    private Boolean nfcLinked;
    private String status; // not_visited, checked_in, submitted, completed, rejected
    private Instant checkedInAt;
    private UUID challengeId;
    private String submissionStatus; // null if no submission
}
