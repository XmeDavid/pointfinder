package com.prayer.pointfinder.service;

import com.prayer.pointfinder.dto.request.CreateStageRequest;
import com.prayer.pointfinder.dto.request.ReorderRequest;
import com.prayer.pointfinder.dto.request.UpdateStageRequest;
import com.prayer.pointfinder.dto.response.StageResponse;
import com.prayer.pointfinder.entity.Base;
import com.prayer.pointfinder.entity.Game;
import com.prayer.pointfinder.entity.Stage;
import com.prayer.pointfinder.entity.TransitionType;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.exception.ErrorCode;
import com.prayer.pointfinder.exception.ResourceNotFoundException;
import com.prayer.pointfinder.repository.BaseRepository;
import com.prayer.pointfinder.repository.StageRepository;
import com.prayer.pointfinder.websocket.GameEventBroadcaster;
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
                .build();

        stage = stageRepository.save(stage);

        // First stage: auto-assign all existing bases to it
        if (isFirstStage) {
            baseRepository.setStageIdForAllInGame(stage.getId(), gameId);
        }

        log.info("[OP] operation=createStage gameId={} stageId={} name={} isFirst={}",
                gameId, stage.getId(), stage.getName(), isFirstStage);

        broadcaster.broadcastGameConfig(gameId, "stages", "created");

        // First stage is auto-active: broadcast stage_unlock so players
        // receive the bases that just moved into this stage.
        if (isFirstStage) {
            broadcaster.broadcastStageUnlock(gameId, stage.getId());
        }

        return toResponse(stage);
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

        stage = stageRepository.save(stage);

        log.info("[OP] operation=updateStage gameId={} stageId={} name={}",
                gameId, stageId, stage.getName());

        broadcaster.broadcastGameConfig(gameId, "stages", "updated");
        return toResponse(stage);
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

        broadcaster.broadcastStageUnlock(gameId, stageId);
        broadcaster.broadcastGameConfig(gameId, "stages", "activated");
    }

    // ── Helpers ──────────────────────────────────────────────────────

    public StageResponse toResponse(Stage stage) {
        List<UUID> baseIds = baseRepository.findByStageId(stage.getId()).stream()
                .map(Base::getId)
                .collect(Collectors.toList());

        return StageResponse.builder()
                .id(stage.getId())
                .gameId(stage.getGame().getId())
                .name(stage.getName())
                .description(stage.getDescription())
                .orderIndex(stage.getOrderIndex())
                .transitionType(stage.getTransitionType().name())
                .scheduledAt(stage.getScheduledAt())
                .triggerBaseId(stage.getTriggerBaseId())
                .isActive(stage.getIsActive())
                .baseIds(baseIds.isEmpty() ? List.of() : baseIds)
                .createdAt(stage.getCreatedAt())
                .updatedAt(stage.getUpdatedAt())
                .build();
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
