package com.prayer.pointfinder.controller;

import com.prayer.pointfinder.entity.Player;
import com.prayer.pointfinder.service.GameSnapshotService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * Single endpoint for the canonical state snapshot of a game.
 *
 * <p>{@code GET /api/games/{gameId}/snapshot} returns the current authoritative
 * state for the caller. The response shape depends on the caller's role:
 * player JWTs receive a {@code PlayerSnapshotResponse} (NO scores, NO
 * leaderboard), operator/admin JWTs receive an {@code OperatorSnapshotResponse}
 * (full leaderboard, pending reviews, upload observability).
 *
 * <p>This is the recovery contract clients reach for when realtime fails:
 * reconnect, foreground, missed event, or any time the cached state might be
 * wrong. See docs/business-logic.md "State Snapshot and Version Contract" and
 * docs/specs/2026-04-08-post-pilot-reliability-and-operator-workflow.md
 * (P0 Track 2 Slice 1).
 *
 * <p><strong>Security.</strong> The route is mounted under
 * {@code /api/games/**}, which is role-gated to {@code ADMIN}/{@code OPERATOR}
 * by default. {@code SecurityConfig} adds an explicit carve-out for
 * {@code /api/games/ * /snapshot} that also admits {@code PLAYER}, so a player
 * JWT can reach this controller. The controller then branches on the
 * authentication principal: a {@link Player} principal runs the player
 * snapshot path (including a player-belongs-to-game check via
 * {@code GameAccessService}); anything else runs the operator path
 * (including the operator access check via
 * {@code GameAccessService#ensureCurrentUserCanAccessGame}). 403 for a
 * mismatched game falls out of those existing checks.
 */
@RestController
@RequestMapping("/api/games")
@RequiredArgsConstructor
public class GameSnapshotController {

    private final GameSnapshotService gameSnapshotService;

    @GetMapping("/{gameId}/snapshot")
    public ResponseEntity<?> getSnapshot(@PathVariable UUID gameId) {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        Object principal = authentication != null ? authentication.getPrincipal() : null;

        if (principal instanceof Player player) {
            return ResponseEntity.ok(gameSnapshotService.buildPlayerSnapshot(gameId, player));
        }

        // Operator / admin path. GameAccessService enforces access inside
        // buildOperatorSnapshot via SecurityUtils.getCurrentUser(), which
        // throws IllegalStateException if no user is authenticated.
        return ResponseEntity.ok(gameSnapshotService.buildOperatorSnapshot(gameId));
    }
}
