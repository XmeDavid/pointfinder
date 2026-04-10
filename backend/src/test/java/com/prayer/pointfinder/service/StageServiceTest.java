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
import com.prayer.pointfinder.repository.BaseRepository;
import com.prayer.pointfinder.repository.StageRepository;
import com.prayer.pointfinder.websocket.GameEventBroadcaster;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class StageServiceTest {

    @Mock private StageRepository stageRepository;
    @Mock private BaseRepository baseRepository;
    @Mock private GameAccessService gameAccessService;
    @Mock private GameEventBroadcaster broadcaster;
    @Mock private EntityManager entityManager;

    @InjectMocks private StageService stageService;

    private UUID gameId;
    private Game game;

    @BeforeEach
    void setUp() {
        gameId = UUID.randomUUID();
        game = Game.builder().id(gameId).name("Game").description("Desc").build();
    }

    // ── getStages ────────────────────────────────────────────────────

    @Test
    void getStages_returnsOrderedStages() {
        UUID stageId1 = UUID.randomUUID();
        UUID stageId2 = UUID.randomUUID();

        Stage stage1 = Stage.builder()
                .id(stageId1).game(game).name("Stage 1").description("")
                .orderIndex(0).transitionType(TransitionType.manual).isActive(true)
                .build();
        Stage stage2 = Stage.builder()
                .id(stageId2).game(game).name("Stage 2").description("")
                .orderIndex(1).transitionType(TransitionType.manual).isActive(false)
                .build();

        when(stageRepository.findByGameIdOrderByOrderIndexAsc(gameId))
                .thenReturn(List.of(stage1, stage2));
        when(baseRepository.findByStageId(stageId1)).thenReturn(List.of());
        when(baseRepository.findByStageId(stageId2)).thenReturn(List.of());

        List<StageResponse> result = stageService.getStages(gameId);

        assertEquals(2, result.size());
        assertEquals("Stage 1", result.get(0).getName());
        assertEquals(0, result.get(0).getOrderIndex());
        assertTrue(result.get(0).isActive());
        assertEquals("Stage 2", result.get(1).getName());
        assertEquals(1, result.get(1).getOrderIndex());
        assertFalse(result.get(1).isActive());

        verify(gameAccessService).ensureCurrentUserCanAccessGame(gameId);
    }

    // ── createStage ──────────────────────────────────────────────────

    @Test
    void createStage_firstStage_autoAssignsBases() {
        when(gameAccessService.getAccessibleGame(gameId)).thenReturn(game);
        when(stageRepository.countByGameId(gameId)).thenReturn(0);
        when(stageRepository.save(any(Stage.class))).thenAnswer(inv -> {
            Stage saved = inv.getArgument(0);
            saved.setId(UUID.randomUUID());
            return saved;
        });
        when(stageRepository.findById(any(UUID.class))).thenAnswer(inv -> {
            UUID id = inv.getArgument(0);
            Stage s = Stage.builder().id(id).game(game).name("Stage 1").description("")
                    .orderIndex(0).transitionType(TransitionType.manual).isActive(true).build();
            return Optional.of(s);
        });
        when(baseRepository.findByStageId(any())).thenReturn(List.of());

        CreateStageRequest request = new CreateStageRequest();
        request.setName("Stage 1");
        request.setTransitionType("manual");

        stageService.createStage(gameId, request);

        // Verify auto-assign was called for first stage
        verify(baseRepository).setStageIdForAllInGame(any(UUID.class), eq(gameId));
    }

    @Test
    void createStage_firstStage_isActive() {
        when(gameAccessService.getAccessibleGame(gameId)).thenReturn(game);
        when(stageRepository.countByGameId(gameId)).thenReturn(0);
        when(stageRepository.save(any(Stage.class))).thenAnswer(inv -> {
            Stage saved = inv.getArgument(0);
            saved.setId(UUID.randomUUID());
            return saved;
        });
        when(stageRepository.findById(any(UUID.class))).thenAnswer(inv -> {
            UUID id = inv.getArgument(0);
            Stage s = Stage.builder().id(id).game(game).name("Stage 1").description("")
                    .orderIndex(0).transitionType(TransitionType.manual).isActive(true).build();
            return Optional.of(s);
        });
        when(baseRepository.findByStageId(any())).thenReturn(List.of());

        CreateStageRequest request = new CreateStageRequest();
        request.setName("Stage 1");
        request.setTransitionType("manual");

        StageResponse response = stageService.createStage(gameId, request);

        assertTrue(response.isActive());
    }

    @Test
    void createStage_subsequentStage_isNotActive() {
        when(gameAccessService.getAccessibleGame(gameId)).thenReturn(game);
        when(stageRepository.countByGameId(gameId)).thenReturn(2);
        when(stageRepository.save(any(Stage.class))).thenAnswer(inv -> {
            Stage saved = inv.getArgument(0);
            saved.setId(UUID.randomUUID());
            return saved;
        });
        when(stageRepository.findById(any(UUID.class))).thenAnswer(inv -> {
            UUID id = inv.getArgument(0);
            Stage s = Stage.builder().id(id).game(game).name("Stage 3").description("")
                    .orderIndex(2).transitionType(TransitionType.manual).isActive(false).build();
            return Optional.of(s);
        });
        when(baseRepository.findByStageId(any())).thenReturn(List.of());

        CreateStageRequest request = new CreateStageRequest();
        request.setName("Stage 3");
        request.setTransitionType("manual");

        StageResponse response = stageService.createStage(gameId, request);

        assertFalse(response.isActive());
        assertEquals(2, response.getOrderIndex());
        // Should NOT auto-assign bases for subsequent stages
        verify(baseRepository, never()).setStageIdForAllInGame(any(), any());
    }

    // ── deleteStage ──────────────────────────────────────────────────

    @Test
    void deleteStage_clearsBaseStageIds() {
        UUID stageId = UUID.randomUUID();
        Stage stage = Stage.builder()
                .id(stageId).game(game).name("Stage 1").description("")
                .orderIndex(0).transitionType(TransitionType.manual).isActive(true)
                .build();

        when(stageRepository.findById(stageId)).thenReturn(Optional.of(stage));

        stageService.deleteStage(gameId, stageId);

        // Verify bases are unlinked before deletion
        verify(baseRepository).clearStageId(stageId);
        verify(stageRepository).delete(stage);
        verify(broadcaster).broadcastGameConfig(gameId, "stages", "deleted");
    }

    @Test
    void deleteStage_lastStage_allBasesFlat() {
        UUID stageId = UUID.randomUUID();
        Stage stage = Stage.builder()
                .id(stageId).game(game).name("Only Stage").description("")
                .orderIndex(0).transitionType(TransitionType.manual).isActive(true)
                .build();

        when(stageRepository.findById(stageId)).thenReturn(Optional.of(stage));

        stageService.deleteStage(gameId, stageId);

        // clearStageId nullifies all bases that had this stage
        // After deleting the last stage, no bases have stageId set
        verify(baseRepository).clearStageId(stageId);
        verify(stageRepository).delete(stage);
    }

    // ── updateStage ──────────────────────────────────────────────────

    @Test
    void updateStage_triggerType_validatesBase() {
        UUID stageId = UUID.randomUUID();
        UUID triggerBaseId = UUID.randomUUID();
        Stage stage = Stage.builder()
                .id(stageId).game(game).name("Stage 1").description("")
                .orderIndex(0).transitionType(TransitionType.manual).isActive(true)
                .build();

        when(stageRepository.findById(stageId)).thenReturn(Optional.of(stage));
        when(baseRepository.existsById(triggerBaseId)).thenReturn(false);

        UpdateStageRequest request = new UpdateStageRequest();
        request.setName("Stage 1 Updated");
        request.setTransitionType("trigger");
        request.setTriggerBaseId(triggerBaseId);

        BadRequestException ex = assertThrows(BadRequestException.class,
                () -> stageService.updateStage(gameId, stageId, request));

        assertEquals(ErrorCode.STAGE_TRIGGER_BASE_NOT_FOUND, ex.getErrorCode());
        verify(stageRepository, never()).save(any());
    }

    @Test
    void updateStage_triggerType_succeedsWhenBaseExists() {
        UUID stageId = UUID.randomUUID();
        UUID triggerBaseId = UUID.randomUUID();
        Stage stage = Stage.builder()
                .id(stageId).game(game).name("Stage 1").description("")
                .orderIndex(0).transitionType(TransitionType.manual).isActive(true)
                .build();

        when(stageRepository.findById(stageId)).thenReturn(Optional.of(stage));
        when(baseRepository.existsById(triggerBaseId)).thenReturn(true);
        when(stageRepository.save(any(Stage.class))).thenAnswer(inv -> inv.getArgument(0));
        when(baseRepository.findByStageId(stageId)).thenReturn(List.of());

        UpdateStageRequest request = new UpdateStageRequest();
        request.setName("Stage 1 Updated");
        request.setTransitionType("trigger");
        request.setTriggerBaseId(triggerBaseId);

        StageResponse response = stageService.updateStage(gameId, stageId, request);

        assertEquals("Stage 1 Updated", response.getName());
        assertEquals("trigger", response.getTransitionType());
        assertEquals(triggerBaseId, response.getTriggerBaseId());
    }

    // ── reorderStages ────────────────────────────────────────────────

    @Test
    void reorderStages_updatesOrderIndex() {
        UUID id1 = UUID.randomUUID();
        UUID id2 = UUID.randomUUID();
        UUID id3 = UUID.randomUUID();

        ReorderRequest request = new ReorderRequest();
        request.setIds(List.of(id3, id1, id2));

        stageService.reorderStages(gameId, request);

        verify(gameAccessService).ensureCurrentUserCanAccessGame(gameId);
        verify(stageRepository).updateOrderIndex(id3, gameId, 0);
        verify(stageRepository).updateOrderIndex(id1, gameId, 1);
        verify(stageRepository).updateOrderIndex(id2, gameId, 2);
        verify(broadcaster).broadcastGameConfig(gameId, "stages", "reordered");
    }
}
