package com.prayer.pointfinder.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.prayer.pointfinder.dto.request.CreateTagRequest;
import com.prayer.pointfinder.dto.request.UpdateTagRequest;
import com.prayer.pointfinder.dto.response.TagResponse;
import com.prayer.pointfinder.exception.ConflictException;
import com.prayer.pointfinder.exception.GlobalExceptionHandler;
import com.prayer.pointfinder.exception.ResourceNotFoundException;
import com.prayer.pointfinder.security.JwtAuthenticationFilter;
import com.prayer.pointfinder.service.GameTagService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.when;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(GameTagController.class)
@AutoConfigureMockMvc(addFilters = false)
@Import(GlobalExceptionHandler.class)
class GameTagControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockitoBean
    private GameTagService gameTagService;

    @MockitoBean
    private JwtAuthenticationFilter jwtAuthenticationFilter;

    private static final UUID GAME_ID = UUID.randomUUID();
    private static final UUID TAG_ID  = UUID.randomUUID();

    private TagResponse sampleResponse() {
        return TagResponse.builder()
                .id(TAG_ID)
                .gameId(GAME_ID)
                .label("trail")
                .color("#3b82f6")
                .createdAt(Instant.parse("2025-01-01T00:00:00Z"))
                .updatedAt(Instant.parse("2025-01-01T00:00:00Z"))
                .build();
    }

    // ── GET /api/games/{gameId}/tags ──────────────────────────────────

    @Test
    void listTagsReturns200WithTagList() throws Exception {
        when(gameTagService.listByGame(GAME_ID)).thenReturn(List.of(sampleResponse()));

        mockMvc.perform(get("/api/games/" + GAME_ID + "/tags"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(TAG_ID.toString()))
                .andExpect(jsonPath("$[0].label").value("trail"))
                .andExpect(jsonPath("$[0].color").value("#3b82f6"));
    }

    @Test
    void listTagsReturns200WithEmptyListWhenNoTags() throws Exception {
        when(gameTagService.listByGame(GAME_ID)).thenReturn(List.of());

        mockMvc.perform(get("/api/games/" + GAME_ID + "/tags"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray())
                .andExpect(jsonPath("$").isEmpty());
    }

    // ── POST /api/games/{gameId}/tags ─────────────────────────────────

    @Test
    void createTagReturns201WithCreatedTag() throws Exception {
        when(gameTagService.createTag(eq(GAME_ID), any(CreateTagRequest.class)))
                .thenReturn(sampleResponse());

        CreateTagRequest request = new CreateTagRequest();
        request.setLabel("trail");
        request.setColor("#3b82f6");

        mockMvc.perform(post("/api/games/" + GAME_ID + "/tags")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(TAG_ID.toString()))
                .andExpect(jsonPath("$.label").value("trail"))
                .andExpect(jsonPath("$.color").value("#3b82f6"));
    }

    @Test
    void createTagRejectsBlankLabel() throws Exception {
        CreateTagRequest request = new CreateTagRequest();
        request.setLabel("   ");

        mockMvc.perform(post("/api/games/" + GAME_ID + "/tags")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.label").exists());
    }

    @Test
    void createTagRejectsInvalidColorFormat() throws Exception {
        CreateTagRequest request = new CreateTagRequest();
        request.setLabel("trail");
        request.setColor("blue"); // not a 7-char hex

        mockMvc.perform(post("/api/games/" + GAME_ID + "/tags")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.color").exists());
    }

    @Test
    void createTagReturns409OnDuplicateLabel() throws Exception {
        when(gameTagService.createTag(eq(GAME_ID), any(CreateTagRequest.class)))
                .thenThrow(new ConflictException("tag.duplicate_label: already exists"));

        CreateTagRequest request = new CreateTagRequest();
        request.setLabel("trail");

        mockMvc.perform(post("/api/games/" + GAME_ID + "/tags")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isConflict());
    }

    // ── PATCH /api/games/{gameId}/tags/{tagId} ────────────────────────

    @Test
    void updateTagReturns200WithUpdatedTag() throws Exception {
        TagResponse updated = TagResponse.builder()
                .id(TAG_ID).gameId(GAME_ID).label("morning").color("#ef4444")
                .createdAt(Instant.parse("2025-01-01T00:00:00Z"))
                .updatedAt(Instant.parse("2025-06-01T00:00:00Z"))
                .build();

        when(gameTagService.updateTag(eq(GAME_ID), eq(TAG_ID), any(UpdateTagRequest.class)))
                .thenReturn(updated);

        UpdateTagRequest request = new UpdateTagRequest();
        request.setLabel("morning");
        request.setColor("#ef4444");

        mockMvc.perform(patch("/api/games/" + GAME_ID + "/tags/" + TAG_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.label").value("morning"))
                .andExpect(jsonPath("$.color").value("#ef4444"));
    }

    @Test
    void updateTagReturns404WhenTagNotFound() throws Exception {
        when(gameTagService.updateTag(eq(GAME_ID), eq(TAG_ID), any(UpdateTagRequest.class)))
                .thenThrow(new ResourceNotFoundException("Tag", TAG_ID));

        UpdateTagRequest request = new UpdateTagRequest();
        request.setLabel("x");

        mockMvc.perform(patch("/api/games/" + GAME_ID + "/tags/" + TAG_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isNotFound());
    }

    // ── DELETE /api/games/{gameId}/tags/{tagId} ───────────────────────

    @Test
    void deleteTagReturns204() throws Exception {
        doNothing().when(gameTagService).deleteTag(GAME_ID, TAG_ID);

        mockMvc.perform(delete("/api/games/" + GAME_ID + "/tags/" + TAG_ID))
                .andExpect(status().isNoContent());
    }

    @Test
    void deleteTagReturns404WhenTagNotFound() throws Exception {
        doThrow(new ResourceNotFoundException("Tag", TAG_ID))
                .when(gameTagService).deleteTag(GAME_ID, TAG_ID);

        mockMvc.perform(delete("/api/games/" + GAME_ID + "/tags/" + TAG_ID))
                .andExpect(status().isNotFound());
    }
}
