package com.prayer.pointfinder.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.prayer.pointfinder.dto.request.CreateStageRequest;
import com.prayer.pointfinder.dto.request.ReorderRequest;
import com.prayer.pointfinder.dto.request.UpdateStageRequest;
import com.prayer.pointfinder.dto.response.StageResponse;
import com.prayer.pointfinder.exception.GlobalExceptionHandler;
import com.prayer.pointfinder.security.JwtAuthenticationFilter;
import com.prayer.pointfinder.service.StageService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.when;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(StageController.class)
@AutoConfigureMockMvc(addFilters = false)
@Import(GlobalExceptionHandler.class)
class StageControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockitoBean
    private StageService stageService;

    @MockitoBean
    private JwtAuthenticationFilter jwtAuthenticationFilter;

    private static final UUID GAME_ID = UUID.randomUUID();
    private static final UUID STAGE_ID = UUID.randomUUID();

    // ── GET /api/games/{gameId}/stages ───────────────────────────────

    @Test
    void getStages_returnsStageList() throws Exception {
        StageResponse stage = StageResponse.builder()
                .id(STAGE_ID)
                .gameId(GAME_ID)
                .name("Stage 1")
                .description("First stage")
                .orderIndex(0)
                .transitionType("manual")
                .isActive(true)
                .baseIds(List.of())
                .createdAt(OffsetDateTime.now())
                .updatedAt(OffsetDateTime.now())
                .build();

        when(stageService.getStages(GAME_ID)).thenReturn(List.of(stage));

        mockMvc.perform(get("/api/games/" + GAME_ID + "/stages"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(STAGE_ID.toString()))
                .andExpect(jsonPath("$[0].name").value("Stage 1"))
                .andExpect(jsonPath("$[0].orderIndex").value(0))
                .andExpect(jsonPath("$[0].transitionType").value("manual"));
    }

    // ── POST /api/games/{gameId}/stages ──────────────────────────────

    @Test
    void createStage_returns201() throws Exception {
        CreateStageRequest request = new CreateStageRequest();
        request.setName("Stage 1");
        request.setTransitionType("manual");

        StageResponse response = StageResponse.builder()
                .id(STAGE_ID)
                .gameId(GAME_ID)
                .name("Stage 1")
                .orderIndex(0)
                .transitionType("manual")
                .isActive(false)
                .baseIds(List.of())
                .createdAt(OffsetDateTime.now())
                .updatedAt(OffsetDateTime.now())
                .build();

        when(stageService.createStage(eq(GAME_ID), any(CreateStageRequest.class))).thenReturn(response);

        mockMvc.perform(post("/api/games/" + GAME_ID + "/stages")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(STAGE_ID.toString()))
                .andExpect(jsonPath("$.name").value("Stage 1"))
                .andExpect(jsonPath("$.transitionType").value("manual"));
    }

    @Test
    void createStage_invalidBody_returns400() throws Exception {
        CreateStageRequest request = new CreateStageRequest();
        // name not set - @NotBlank should reject
        request.setTransitionType("manual");

        mockMvc.perform(post("/api/games/" + GAME_ID + "/stages")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.name").exists());
    }

    @Test
    void createStage_missingTransitionType_returns400() throws Exception {
        CreateStageRequest request = new CreateStageRequest();
        request.setName("Stage 1");
        // transitionType not set - @NotBlank should reject

        mockMvc.perform(post("/api/games/" + GAME_ID + "/stages")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.transitionType").exists());
    }

    // ── PUT /api/games/{gameId}/stages/{stageId} ─────────────────────

    @Test
    void updateStage_returns200() throws Exception {
        UpdateStageRequest request = new UpdateStageRequest();
        request.setName("Updated Stage");
        request.setTransitionType("scheduled");

        StageResponse response = StageResponse.builder()
                .id(STAGE_ID)
                .gameId(GAME_ID)
                .name("Updated Stage")
                .orderIndex(0)
                .transitionType("scheduled")
                .isActive(false)
                .baseIds(List.of())
                .createdAt(OffsetDateTime.now())
                .updatedAt(OffsetDateTime.now())
                .build();

        when(stageService.updateStage(eq(GAME_ID), eq(STAGE_ID), any(UpdateStageRequest.class)))
                .thenReturn(response);

        mockMvc.perform(put("/api/games/" + GAME_ID + "/stages/" + STAGE_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Updated Stage"))
                .andExpect(jsonPath("$.transitionType").value("scheduled"));
    }

    // ── DELETE /api/games/{gameId}/stages/{stageId} ──────────────────

    @Test
    void deleteStage_returns204() throws Exception {
        doNothing().when(stageService).deleteStage(GAME_ID, STAGE_ID);

        mockMvc.perform(delete("/api/games/" + GAME_ID + "/stages/" + STAGE_ID))
                .andExpect(status().isNoContent());
    }

    // ── PATCH /api/games/{gameId}/stages/reorder ─────────────────────

    @Test
    void reorderStages_returns200() throws Exception {
        UUID id1 = UUID.randomUUID();
        UUID id2 = UUID.randomUUID();
        ReorderRequest request = new ReorderRequest();
        request.setIds(List.of(id1, id2));

        doNothing().when(stageService).reorderStages(eq(GAME_ID), any(ReorderRequest.class));

        mockMvc.perform(patch("/api/games/" + GAME_ID + "/stages/reorder")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk());
    }
}
