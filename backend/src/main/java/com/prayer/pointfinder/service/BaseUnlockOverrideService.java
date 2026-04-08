package com.prayer.pointfinder.service;

import com.prayer.pointfinder.dto.request.UnlockOverrideRequest;
import com.prayer.pointfinder.dto.response.BaseUnlockOverrideResponse;
import com.prayer.pointfinder.entity.ActivityEvent;
import com.prayer.pointfinder.entity.ActivityEventType;
import com.prayer.pointfinder.entity.Base;
import com.prayer.pointfinder.entity.BaseUnlockOverride;
import com.prayer.pointfinder.entity.Game;
import com.prayer.pointfinder.entity.Team;
import com.prayer.pointfinder.entity.User;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.exception.ResourceNotFoundException;
import com.prayer.pointfinder.repository.ActivityEventRepository;
import com.prayer.pointfinder.repository.BaseRepository;
import com.prayer.pointfinder.repository.BaseUnlockOverrideRepository;
import com.prayer.pointfinder.repository.GameRepository;
import com.prayer.pointfinder.repository.TeamRepository;
import com.prayer.pointfinder.repository.UserRepository;
import com.prayer.pointfinder.security.SecurityUtils;
import com.prayer.pointfinder.util.LazyInitHelper;
import com.prayer.pointfinder.websocket.GameEventBroadcaster;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Service for the operator-driven base unlock override rescue action
 * (P1 Phase 2 of the post-pilot reliability wave).
 *
 * <p>An override lets an operator force a specific hidden base to become
 * visible to a specific team, regardless of the game's normal unlock
 * trigger. The override is REVERSIBLE via a soft-delete — DELETE on an
 * active row sets {@code deletedAt} instead of erasing the history, and
 * a later create for the same (team, base) pair produces a NEW row.
 *
 * <p>Visibility consumption lives in {@code PlayerService.getProgress}:
 * it calls {@link BaseUnlockOverrideRepository#findActiveByGameIdAndTeamId}
 * and treats the base as visible when an active override exists.
 *
 * <p>Audit capture mirrors V36: creator and (on remove) deleter user
 * FKs, immutable display-name snapshots at action time, optional
 * operator reason. Both create and remove emit an
 * {@link ActivityEventType#operator_override} activity event and
 * broadcast a {@code game_config} event via
 * {@link GameEventBroadcaster}, which bumps {@code state_version} so
 * player clients pick up the visibility change on next snapshot.
 */
@Service
@RequiredArgsConstructor
public class BaseUnlockOverrideService {

    private final BaseUnlockOverrideRepository overrideRepository;
    private final GameRepository gameRepository;
    private final TeamRepository teamRepository;
    private final BaseRepository baseRepository;
    private final UserRepository userRepository;
    private final ActivityEventRepository activityEventRepository;
    private final GameEventBroadcaster eventBroadcaster;
    private final GameAccessService gameAccessService;

    /**
     * Creates (or returns the existing) active base unlock override for
     * the (team, base) pair.
     *
     * <p>Idempotent by design: if an active override already exists for
     * the pair, the existing row is returned WITHOUT mutating its audit
     * fields. Re-clicking the "unlock" button in the operator UI should
     * not rewrite history.
     *
     * <p>If a previously soft-deleted override exists for the same pair,
     * a NEW row is created (the deleted row is preserved for audit). The
     * partial unique index on {@code deleted_at IS NULL} enforces this at
     * the schema level.
     */
    @Transactional(timeout = 10)
    public BaseUnlockOverrideResponse createOverride(
            UUID gameId, UUID teamId, UUID baseId, UnlockOverrideRequest request) {

        Game game = gameAccessService.getAccessibleGame(gameId);

        Team team = teamRepository.findById(teamId)
                .orElseThrow(() -> new ResourceNotFoundException("Team", teamId));
        gameAccessService.ensureBelongsToGame("Team", team.getGame().getId(), gameId);

        Base base = baseRepository.findById(baseId)
                .orElseThrow(() -> new ResourceNotFoundException("Base", baseId));
        gameAccessService.ensureBelongsToGame("Base", base.getGame().getId(), gameId);

        // Force lazy initialization for the broadcast payload.
        team.getName();
        base.getName();
        game.getId();

        // Idempotent: if an active override already exists, return it.
        Optional<BaseUnlockOverride> existing = overrideRepository
                .findActiveByTeamIdAndBaseId(teamId, baseId);
        if (existing.isPresent()) {
            return toResponse(existing.get());
        }

        User currentOperator = SecurityUtils.getCurrentUser();
        UUID operatorId = currentOperator.getId();
        User operator = userRepository.findById(operatorId)
                .orElseThrow(() -> new ResourceNotFoundException("User", operatorId));
        String operatorDisplayName = resolveDisplayName(operator);
        String reason = request != null ? request.getReason() : null;

        BaseUnlockOverride override = BaseUnlockOverride.builder()
                .game(game)
                .team(team)
                .base(base)
                .createdByOperator(operator)
                .createdByDisplayNameSnapshot(operatorDisplayName)
                .operatorReason(reason)
                .createdAt(Instant.now())
                .build();

        try {
            override = overrideRepository.save(override);
        } catch (DataIntegrityViolationException ex) {
            // A concurrent create raced us; fall back to the winner.
            BaseUnlockOverride winner = overrideRepository
                    .findActiveByTeamIdAndBaseId(teamId, baseId)
                    .orElseThrow(() -> new BadRequestException("Unlock override create failed"));
            return toResponse(winner);
        }

        String reasonSuffix = reason != null && !reason.isBlank() ? ": " + reason : "";
        ActivityEvent event = ActivityEvent.builder()
                .game(game)
                .type(ActivityEventType.operator_override)
                .team(team)
                .base(base)
                .message(operatorDisplayName + " unlocked " + base.getName()
                        + " for " + team.getName() + reasonSuffix)
                .timestamp(Instant.now())
                .actorOperatorUser(operator)
                .actorDisplayNameSnapshot(operatorDisplayName)
                .sourceSurface("operator_rescue")
                .build();
        activityEventRepository.save(event);

        LazyInitHelper.initializeForBroadcast(event);
        eventBroadcaster.broadcastActivityEvent(gameId, event);
        // game_config auto-bumps state_version; player snapshot will
        // reconcile visibility on next foreground / reconnect.
        eventBroadcaster.broadcastGameConfig(gameId, "base_unlock_override", "created");

        return toResponse(override);
    }

    /**
     * Soft-deletes the active base unlock override for the (team, base)
     * pair. Returns silently (404) if no active override exists — the
     * caller should be able to distinguish "already gone" from "never
     * existed" at the HTTP layer, and the 404 carries the same meaning
     * as any other resource-not-found case in this codebase.
     *
     * <p>The previously soft-deleted row is preserved; {@code deletedAt},
     * {@code deletedByOperator}, and
     * {@code deletedByDisplayNameSnapshot} are populated so the audit
     * export can reconstruct the create/remove window.
     */
    @Transactional(timeout = 10)
    public void removeOverride(UUID gameId, UUID teamId, UUID baseId, UnlockOverrideRequest request) {
        Game game = gameAccessService.getAccessibleGame(gameId);

        Team team = teamRepository.findById(teamId)
                .orElseThrow(() -> new ResourceNotFoundException("Team", teamId));
        gameAccessService.ensureBelongsToGame("Team", team.getGame().getId(), gameId);

        Base base = baseRepository.findById(baseId)
                .orElseThrow(() -> new ResourceNotFoundException("Base", baseId));
        gameAccessService.ensureBelongsToGame("Base", base.getGame().getId(), gameId);

        team.getName();
        base.getName();

        BaseUnlockOverride override = overrideRepository
                .findActiveByTeamIdAndBaseId(teamId, baseId)
                .orElseThrow(() -> new ResourceNotFoundException(
                        "Active base unlock override for team " + teamId + " and base " + baseId));

        User currentOperator = SecurityUtils.getCurrentUser();
        UUID operatorId = currentOperator.getId();
        User operator = userRepository.findById(operatorId)
                .orElseThrow(() -> new ResourceNotFoundException("User", operatorId));
        String operatorDisplayName = resolveDisplayName(operator);

        override.setDeletedAt(Instant.now());
        override.setDeletedByOperator(operator);
        override.setDeletedByDisplayNameSnapshot(operatorDisplayName);
        overrideRepository.save(override);

        String reason = request != null ? request.getReason() : null;
        String reasonSuffix = reason != null && !reason.isBlank() ? ": " + reason : "";
        ActivityEvent event = ActivityEvent.builder()
                .game(game)
                .type(ActivityEventType.operator_override)
                .team(team)
                .base(base)
                .message(operatorDisplayName + " removed unlock override on " + base.getName()
                        + " for " + team.getName() + reasonSuffix)
                .timestamp(Instant.now())
                .actorOperatorUser(operator)
                .actorDisplayNameSnapshot(operatorDisplayName)
                .sourceSurface("operator_rescue")
                .build();
        activityEventRepository.save(event);

        LazyInitHelper.initializeForBroadcast(event);
        eventBroadcaster.broadcastActivityEvent(gameId, event);
        eventBroadcaster.broadcastGameConfig(gameId, "base_unlock_override", "removed");
    }

    /**
     * Lists all active overrides for the team in the given game. Used by
     * the operator UI listing endpoint. Read-only by design.
     */
    @Transactional(readOnly = true)
    public List<BaseUnlockOverrideResponse> listActiveForTeam(UUID gameId, UUID teamId) {
        gameAccessService.ensureCurrentUserCanAccessGame(gameId);
        Team team = teamRepository.findById(teamId)
                .orElseThrow(() -> new ResourceNotFoundException("Team", teamId));
        gameAccessService.ensureBelongsToGame("Team", team.getGame().getId(), gameId);
        return overrideRepository.findActiveByGameIdAndTeamId(gameId, teamId).stream()
                .map(this::toResponse)
                .toList();
    }

    private static String resolveDisplayName(User user) {
        return user.getName() != null && !user.getName().isBlank() ? user.getName() : user.getEmail();
    }

    private BaseUnlockOverrideResponse toResponse(BaseUnlockOverride override) {
        return BaseUnlockOverrideResponse.builder()
                .id(override.getId())
                .gameId(override.getGame().getId())
                .teamId(override.getTeam().getId())
                .baseId(override.getBase().getId())
                .createdByOperatorId(override.getCreatedByOperator() != null
                        ? override.getCreatedByOperator().getId() : null)
                .createdByDisplayName(override.getCreatedByDisplayNameSnapshot())
                .reason(override.getOperatorReason())
                .createdAt(override.getCreatedAt())
                .build();
    }
}
