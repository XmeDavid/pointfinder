package com.prayer.pointfinder.service;

import com.prayer.pointfinder.dto.request.CreateStageRequest;
import com.prayer.pointfinder.dto.request.ReorderRequest;
import com.prayer.pointfinder.dto.request.UpdateStageRequest;
import com.prayer.pointfinder.dto.response.StageResponse;
import com.prayer.pointfinder.entity.Base;
import com.prayer.pointfinder.entity.Game;
import com.prayer.pointfinder.entity.GameStatus;
import com.prayer.pointfinder.entity.Stage;
import com.prayer.pointfinder.entity.TransitionType;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.exception.ErrorCode;
import com.prayer.pointfinder.exception.ResourceNotFoundException;
import com.prayer.pointfinder.repository.BaseRepository;
import com.prayer.pointfinder.repository.StageRepository;
import com.prayer.pointfinder.websocket.GameEventBroadcaster;
import jakarta.persistence.EntityManager;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@Slf4j
@RequiredArgsConstructor
public class StageService {

    private final StageRepository stageRepository;
    private final BaseRepository baseRepository;
    private final GameAccessService gameAccessService;
    private final GameEventBroadcaster broadcaster;
    private final EntityManager entityManager;
    private final org.springframework.transaction.PlatformTransactionManager transactionManager;

    @Transactional(readOnly = true)
    public List<StageResponse> getStages(UUID gameId) {
        gameAccessService.ensureCurrentUserCanAccessGame(gameId);
        return stageRepository.findByGameIdOrderByOrderIndexAsc(gameId).stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional(timeout = 10)
    public StageResponse createStage(UUID gameId, CreateStageRequest request) {
        Game game = gameAccessService.getAccessibleGame(gameId);

        TransitionType transitionType = parseTransitionType(request.getTransitionType());

        int existingCount = stageRepository.countByGameId(gameId);
        boolean isFirstStage = existingCount == 0;

        Stage stage = Stage.builder()
                .game(game)
                .name(request.getName())
                .description(request.getDescription() != null ? request.getDescription() : "")
                .orderIndex(existingCount)
                .transitionType(transitionType)
                .scheduledAt(request.getScheduledAt())
                .triggerBaseId(request.getTriggerBaseId())
                .isActive(isFirstStage)
                .enforceBaseOrder(Boolean.TRUE.equals(request.getEnforceBaseOrder()))
                .build();

        stage = stageRepository.save(stage);
        // Force the INSERT to hit the DB before any @Modifying queries reference the new stage ID.
        entityManager.flush();

        // First stage: auto-assign all existing bases to it
        if (isFirstStage) {
            baseRepository.setStageIdForAllInGame(stage.getId(), gameId);
        }

        log.info("[OP] operation=createStage gameId={} stageId={} name={} isFirst={}",
                gameId, stage.getId(), stage.getName(), isFirstStage);

        // Flush all pending SQL and clear the persistence context before broadcasting.
        // broadcastGameConfig calls incrementStateVersion (native UPDATE on games.state_version).
        // Without flush+clear, Hibernate's dirty-check at commit detects the stale
        // stateVersion on the managed Game entity → conflicting UPDATE → DataIntegrityViolationException → 409.
        entityManager.flush();
        entityManager.clear();

        broadcaster.broadcastGameConfig(gameId, "stages", "created");

        if (isFirstStage) {
            broadcaster.broadcastStageUnlock(gameId, stage.getId());
        }

        // Re-fetch stage after clear for the response
        Stage saved = findStageOrThrow(stage.getId());
        return toResponse(saved);
    }

    @Transactional(timeout = 10)
    public StageResponse updateStage(UUID gameId, UUID stageId, UpdateStageRequest request) {
        gameAccessService.ensureCurrentUserCanAccessGame(gameId);

        Stage stage = findStageOrThrow(stageId);
        ensureStageBelongsToGame(stage, gameId);

        TransitionType transitionType = parseTransitionType(request.getTransitionType());

        // Validate trigger base exists if transition type is trigger
        if (transitionType == TransitionType.trigger && request.getTriggerBaseId() != null) {
            if (!baseRepository.existsById(request.getTriggerBaseId())) {
                throw new BadRequestException(
                        "Trigger base not found: " + request.getTriggerBaseId(),
                        ErrorCode.STAGE_TRIGGER_BASE_NOT_FOUND
                );
            }
        }

        stage.setName(request.getName());
        stage.setDescription(request.getDescription() != null ? request.getDescription() : "");
        stage.setTransitionType(transitionType);
        stage.setScheduledAt(request.getScheduledAt());
        stage.setTriggerBaseId(request.getTriggerBaseId());
        if (request.getEnforceBaseOrder() != null && !request.getEnforceBaseOrder().equals(stage.getEnforceBaseOrder())) {
            // Like the game-level flag, a route is a setup-time structure.
            if (stage.getGame().getStatus() != GameStatus.setup) {
                throw new BadRequestException("Base order can only be changed during setup", ErrorCode.BASE_ORDER_LOCKED);
            }
            stage.setEnforceBaseOrder(request.getEnforceBaseOrder());
        }

        stage = stageRepository.save(stage);

        log.info("[OP] operation=updateStage gameId={} stageId={} name={}",
                gameId, stageId, stage.getName());

        entityManager.flush();
        entityManager.clear();

        broadcaster.broadcastGameConfig(gameId, "stages", "updated");
        Stage updated = findStageOrThrow(stageId);
        return toResponse(updated);
    }

    @Transactional(timeout = 10)
    public void deleteStage(UUID gameId, UUID stageId) {
        gameAccessService.ensureCurrentUserCanAccessGame(gameId);

        Stage stage = findStageOrThrow(stageId);
        ensureStageBelongsToGame(stage, gameId);

        // Clear stageId on all bases assigned to this stage
        baseRepository.clearStageId(stageId);

        log.info("[OP] operation=deleteStage gameId={} stageId={} name={}",
                gameId, stageId, stage.getName());

        stageRepository.delete(stage);

        entityManager.flush();
        entityManager.clear();

        broadcaster.broadcastGameConfig(gameId, "stages", "deleted");
    }

    @Transactional(timeout = 10)
    public void reorderStages(UUID gameId, ReorderRequest request) {
        gameAccessService.ensureCurrentUserCanAccessGame(gameId);
        List<UUID> ids = request.getIds();
        for (int i = 0; i < ids.size(); i++) {
            stageRepository.updateOrderIndex(ids.get(i), gameId, i);
        }

        log.info("[OP] operation=reorderStages gameId={} count={}", gameId, ids.size());

        entityManager.flush();
        entityManager.clear();

        broadcaster.broadcastGameConfig(gameId, "stages", "reordered");
    }

    /**
     * Activates a stage and broadcasts a stage_unlock event to all players.
     * Called by operator manual activation or by the scheduler for time-based transitions.
     */
    @Transactional(timeout = 10)
    public void activateStage(UUID gameId, UUID stageId) {
        Stage stage = findStageOrThrow(stageId);
        ensureStageBelongsToGame(stage, gameId);

        if (Boolean.TRUE.equals(stage.getIsActive())) {
            return; // already active — idempotent
        }

        stage.setIsActive(true);
        stageRepository.save(stage);

        log.info("[OP] operation=activateStage gameId={} stageId={} name={}",
                gameId, stageId, stage.getName());

        entityManager.flush();
        entityManager.clear();

        broadcaster.broadcastStageUnlock(gameId, stageId);
        broadcaster.broadcastGameConfig(gameId, "stages", "activated");
    }

    /**
     * A completed base may be the trigger of a stage (OW-21). The stage opens
     * once the completing transaction has committed, so a rolled-back
     * completion never opens a stage; outside a transaction it opens at once.
     * A failure here is logged, never surfaced: the completion is already
     * durable and must not be reported as failed to the client.
     */
    public void openTriggeredStagesAfterCommit(UUID gameId, UUID baseId) {
        if (org.springframework.transaction.support.TransactionSynchronizationManager.isSynchronizationActive()) {
            org.springframework.transaction.support.TransactionSynchronizationManager.registerSynchronization(
                    new org.springframework.transaction.support.TransactionSynchronization() {
                        @Override
                        public void afterCommit() {
                            activateTriggeredStagesQuietly(gameId, baseId);
                        }
                    });
        } else {
            activateTriggeredStagesQuietly(gameId, baseId);
        }
    }

    private void activateTriggeredStagesQuietly(UUID gameId, UUID baseId) {
        try {
            activateTriggeredStages(gameId, baseId);
        } catch (RuntimeException ex) {
            log.error("[OP] operation=activateTriggeredStage result=failed gameId={} triggerBaseId={}", gameId, baseId, ex);
        }
    }

    /**
     * Trigger stages: the first team to complete the trigger base opens the
     * stage for everyone. Runs in its own transaction (an explicit template,
     * so it also works when called from an after-commit hook on this bean).
     */
    public void activateTriggeredStages(UUID gameId, UUID baseId) {
        org.springframework.transaction.support.TransactionTemplate own =
                new org.springframework.transaction.support.TransactionTemplate(transactionManager);
        own.setPropagationBehavior(org.springframework.transaction.TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        own.setTimeout(10);
        own.executeWithoutResult(status -> {
            List<Stage> waiting = stageRepository.findByGameIdAndTransitionTypeAndTriggerBaseIdAndIsActiveFalse(
                    gameId, TransitionType.trigger, baseId);
            for (Stage stage : waiting) {
                if (stageRepository.activateIfTriggeredBy(stage.getId(), baseId) == 0) {
                    continue; // opened by a concurrent completion, or re-pointed by an operator meanwhile
                }
                log.info("[OP] operation=activateTriggeredStage gameId={} stageId={} name={} triggerBaseId={}",
                        gameId, stage.getId(), stage.getName(), baseId);
                broadcaster.broadcastStageUnlock(gameId, stage.getId());
                broadcaster.broadcastGameConfig(gameId, "stages", "activated");
            }
        });
    }

    // ── Helpers ──────────────────────────────────────────────────────

    public StageResponse toResponse(Stage stage) {
        List<UUID> baseIds = baseRepository.findByStageId(stage.getId()).stream()
                .map(Base::getId)
                .collect(Collectors.toList());

        return new StageResponse(
                stage.getId(),
                stage.getGame().getId(),
                stage.getName(),
                stage.getDescription(),
                stage.getOrderIndex(),
                stage.getTransitionType().name(),
                stage.getScheduledAt(),
                stage.getTriggerBaseId(),
                stage.getIsActive(),
                baseIds.isEmpty() ? List.of() : baseIds,
                stage.getCreatedAt(),
                stage.getUpdatedAt(),
                Boolean.TRUE.equals(stage.getEnforceBaseOrder())
        );
    }

    private Stage findStageOrThrow(UUID stageId) {
        return stageRepository.findById(stageId)
                .orElseThrow(() -> new ResourceNotFoundException("Stage", stageId));
    }

    private void ensureStageBelongsToGame(Stage stage, UUID gameId) {
        if (!stage.getGame().getId().equals(gameId)) {
            throw new BadRequestException(
                    "Stage does not belong to game " + gameId,
                    ErrorCode.STAGE_GAME_MISMATCH
            );
        }
    }

    private TransitionType parseTransitionType(String value) {
        try {
            return TransitionType.valueOf(value);
        } catch (IllegalArgumentException e) {
            throw new BadRequestException("Invalid transition type: " + value);
        }
    }
}
