package com.prayer.pointfinder.controller;

import com.prayer.pointfinder.dto.request.MarkCompletedRequest;
import com.prayer.pointfinder.dto.request.UnlockOverrideRequest;
import com.prayer.pointfinder.dto.response.BaseUnlockOverrideResponse;
import com.prayer.pointfinder.dto.response.SubmissionResponse;
import com.prayer.pointfinder.service.BaseUnlockOverrideService;
import com.prayer.pointfinder.service.SubmissionService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

/**
 * Operator rescue endpoints added by P1 Phase 2 of the post-pilot
 * reliability wave. These endpoints host audited overrides the operator
 * can use to rescue a blocked team during a live event, on top of the
 * existing manual check-in endpoint on {@link TeamController}.
 *
 * <p>Endpoints:
 * <ul>
 *   <li>{@code POST .../mark-completed} — synthesize an approved
 *       submission for "team did the task but the system got stuck".</li>
 *   <li>{@code POST .../unlock-override} — force a hidden base to become
 *       visible to the team.</li>
 *   <li>{@code DELETE .../unlock-override} — soft-delete the active
 *       override (reversible via recreation).</li>
 *   <li>{@code GET .../unlock-overrides} — list active overrides for the
 *       team (operator UI surfacing).</li>
 * </ul>
 *
 * <p>These are kept on a dedicated controller — rather than piled onto
 * {@link TeamController} — because they share the Phase 2 rescue
 * ownership boundary: mark-completed and unlock-override are an
 * integrated rescue surface, and keeping them co-located makes it easy
 * to add Phase 3 audit export and Phase 4 workflow hooks here later
 * without dragging team CRUD along.
 *
 * <p>Security: covered by the blanket {@code /api/games/**} matcher in
 * {@link com.prayer.pointfinder.config.SecurityConfig} which requires
 * {@code ROLE_ADMIN} or {@code ROLE_OPERATOR}. The services additionally
 * call {@code GameAccessService.ensureCurrentUserCanAccessGame} so only
 * an operator on the specific game (or an admin) can call these paths.
 */
@RestController
@RequestMapping("/api/games/{gameId}/teams/{teamId}")
@RequiredArgsConstructor
public class OperatorOverrideController {

    private final SubmissionService submissionService;
    private final BaseUnlockOverrideService baseUnlockOverrideService;

    /**
     * Marks the challenge as completed for the team at the base on behalf
     * of the operator. The request body carries the challenge id and
     * optional reason + points override.
     *
     * <p>Returns 201 with the synthesized {@link SubmissionResponse} on
     * first call, or 200 with the existing submission on idempotent
     * re-call (same operator + team + base + challenge).
     */
    @PostMapping("/bases/{baseId}/mark-completed")
    public ResponseEntity<SubmissionResponse> markCompleted(
            @PathVariable UUID gameId,
            @PathVariable UUID teamId,
            @PathVariable UUID baseId,
            @Valid @RequestBody MarkCompletedRequest request) {
        SubmissionResponse response = submissionService.markCompletedByOperator(
                gameId, teamId, baseId, request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    /**
     * Creates (or returns the existing active) unlock override for the
     * (team, base) pair. The request body is optional; when supplied the
     * {@code reason} is captured on the new override row.
     */
    @PostMapping("/bases/{baseId}/unlock-override")
    public ResponseEntity<BaseUnlockOverrideResponse> createUnlockOverride(
            @PathVariable UUID gameId,
            @PathVariable UUID teamId,
            @PathVariable UUID baseId,
            @Valid @RequestBody(required = false) UnlockOverrideRequest request) {
        BaseUnlockOverrideResponse response = baseUnlockOverrideService.createOverride(
                gameId, teamId, baseId, request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    /**
     * Soft-deletes the active unlock override for the (team, base) pair.
     * Returns 204 on success, 404 when no active override exists. The
     * optional request body carries a reason that is narrated on the
     * emitted activity event.
     */
    @DeleteMapping("/bases/{baseId}/unlock-override")
    public ResponseEntity<Void> removeUnlockOverride(
            @PathVariable UUID gameId,
            @PathVariable UUID teamId,
            @PathVariable UUID baseId,
            @Valid @RequestBody(required = false) UnlockOverrideRequest request) {
        baseUnlockOverrideService.removeOverride(gameId, teamId, baseId, request);
        return ResponseEntity.noContent().build();
    }

    /**
     * Lists active unlock overrides for the team in the game. Used by the
     * operator UI to show "this team has overrides active" and to allow
     * removal.
     */
    @GetMapping("/unlock-overrides")
    public ResponseEntity<List<BaseUnlockOverrideResponse>> listUnlockOverrides(
            @PathVariable UUID gameId,
            @PathVariable UUID teamId) {
        return ResponseEntity.ok(baseUnlockOverrideService.listActiveForTeam(gameId, teamId));
    }
}
