package com.prayer.pointfinder.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.prayer.pointfinder.dto.export.GameExportDto;
import com.prayer.pointfinder.dto.export.GameMetadataDto;
import com.prayer.pointfinder.dto.request.CreateGameRequest;
import com.prayer.pointfinder.dto.request.GameImportRequest;
import com.prayer.pointfinder.dto.request.UpdateGameStatusRequest;
import com.prayer.pointfinder.dto.response.GameResponse;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.exception.GlobalExceptionHandler;
import com.prayer.pointfinder.security.JwtAuthenticationFilter;
import com.prayer.pointfinder.service.GameService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.when;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(GameController.class)
@AutoConfigureMockMvc(addFilters = false)
@Import(GlobalExceptionHandler.class)
class GameControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockBean
    private GameService gameService;

    @MockBean
    private JwtAuthenticationFilter jwtAuthenticationFilter;

    @Test
    void createGameWithValidBodyReturns201() throws Exception {
        CreateGameRequest request = new CreateGameRequest();
        request.setName("Test Game");

        UUID gameId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        GameResponse response = GameResponse.builder()
                .id(gameId)
                .name("Test Game")
                .description("")
                .status("setup")
                .createdBy(userId)
                .operatorIds(List.of(userId))
                .uniformAssignment(false)
                .broadcastEnabled(false)
                .tileSource("osm-classic")
                .build();

        when(gameService.createGame(any(CreateGameRequest.class))).thenReturn(response);

        mockMvc.perform(post("/api/games")

                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(gameId.toString()))
                .andExpect(jsonPath("$.name").value("Test Game"))
                .andExpect(jsonPath("$.status").value("setup"));
    }

    @Test
    void updateStatusWithReadinessFailReturns400() throws Exception {
        UUID gameId = UUID.randomUUID();
        UpdateGameStatusRequest request = new UpdateGameStatusRequest();
        request.setStatus("live");

        when(gameService.updateStatus(eq(gameId), eq("live"), eq(false)))
                .thenThrow(new BadRequestException("Game must have at least one base before going live"));

        mockMvc.perform(patch("/api/games/" + gameId + "/status")

                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Game must have at least one base before going live"));
    }

    @Test
    void exportGameReturnsContentDispositionHeader() throws Exception {
        UUID gameId = UUID.randomUUID();
        GameExportDto export = GameExportDto.builder()
                .exportVersion("1.0")
                .game(GameMetadataDto.builder()
                        .name("Export Game")
                        .description("desc")
                        .uniformAssignment(false)
                        .build())
                .bases(List.of())
                .challenges(List.of())
                .assignments(List.of())
                .build();

        when(gameService.exportGame(gameId)).thenReturn(export);

        mockMvc.perform(get("/api/games/" + gameId + "/export"))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Disposition",
                        "attachment; filename=\"game-" + gameId + ".json\""))
                .andExpect(jsonPath("$.exportVersion").value("1.0"));
    }

    @Test
    void importGameWithValidDataReturns201() throws Exception {
        GameImportRequest request = new GameImportRequest();
        request.setGameData(GameExportDto.builder()
                .exportVersion("1.0")
                .game(GameMetadataDto.builder()
                        .name("Imported Game")
                        .description("desc")
                        .uniformAssignment(false)
                        .build())
                .bases(List.of())
                .challenges(List.of())
                .assignments(List.of())
                .build());

        UUID gameId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        GameResponse response = GameResponse.builder()
                .id(gameId)
                .name("Imported Game")
                .description("desc")
                .status("setup")
                .createdBy(userId)
                .operatorIds(List.of(userId))
                .uniformAssignment(false)
                .broadcastEnabled(false)
                .tileSource("osm-classic")
                .build();

        when(gameService.importGame(any(GameImportRequest.class))).thenReturn(response);

        mockMvc.perform(post("/api/games/import")

                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(gameId.toString()))
                .andExpect(jsonPath("$.name").value("Imported Game"));
    }

    @Test
    void deleteGameReturns204() throws Exception {
        UUID gameId = UUID.randomUUID();
        doNothing().when(gameService).deleteGame(gameId);

        mockMvc.perform(delete("/api/games/" + gameId))
                .andExpect(status().isNoContent());
    }

    @Test
    void createGameWithMissingNameReturns400() throws Exception {
        CreateGameRequest request = new CreateGameRequest();
        // name not set - @NotBlank should reject

        mockMvc.perform(post("/api/games")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.name").exists());
    }
}
