package com.prayer.pointfinder.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.prayer.pointfinder.dto.export.GameExportDto;
import com.prayer.pointfinder.dto.export.GameMetadataDto;
import com.prayer.pointfinder.dto.request.CreateGameRequest;
import com.prayer.pointfinder.dto.request.GameImportRequest;
import com.prayer.pointfinder.dto.request.UpdateGameStatusRequest;
import com.prayer.pointfinder.dto.response.GameResponse;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.exception.ConflictException;
import com.prayer.pointfinder.exception.GlobalExceptionHandler;
import com.prayer.pointfinder.exception.ResourceNotFoundException;
import com.prayer.pointfinder.security.JwtAuthenticationFilter;
import com.prayer.pointfinder.service.GameService;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

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

    // ── Create game ─────────────────────────────────────────────────

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
                .andExpect(jsonPath("$.status").value("setup"))
                .andExpect(jsonPath("$.uniformAssignment").value(false))
                .andExpect(jsonPath("$.broadcastEnabled").value(false));
    }

    @Test
    void createGamePassesRequestFieldsToService() throws Exception {
        CreateGameRequest request = new CreateGameRequest();
        request.setName("Scout Rally");
        request.setUniformAssignment(true);

        UUID gameId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        when(gameService.createGame(any(CreateGameRequest.class))).thenReturn(GameResponse.builder()
                .id(gameId).name("Scout Rally").description("").status("setup")
                .createdBy(userId).operatorIds(List.of(userId))
                .uniformAssignment(true).broadcastEnabled(false).tileSource("osm-classic")
                .build());

        mockMvc.perform(post("/api/games")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated());

        ArgumentCaptor<CreateGameRequest> captor = ArgumentCaptor.forClass(CreateGameRequest.class);
        verify(gameService).createGame(captor.capture());
        assertThat(captor.getValue().getName()).isEqualTo("Scout Rally");
        assertThat(captor.getValue().getUniformAssignment()).isTrue();
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

    @Test
    void createGameWithBlankNameReturns400() throws Exception {
        CreateGameRequest request = new CreateGameRequest();
        request.setName("   "); // whitespace-only is @NotBlank violation

        mockMvc.perform(post("/api/games")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.name").exists());
    }

    @Test
    void createGameWithNameAtMaxLengthReturns201() throws Exception {
        // 255 chars = boundary value exactly at @Size(max=255)
        String maxName = "A".repeat(255);
        CreateGameRequest request = new CreateGameRequest();
        request.setName(maxName);

        UUID gameId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        when(gameService.createGame(any(CreateGameRequest.class))).thenReturn(GameResponse.builder()
                .id(gameId).name(maxName).description("").status("setup")
                .createdBy(userId).operatorIds(List.of(userId))
                .uniformAssignment(false).broadcastEnabled(false).tileSource("osm-classic")
                .build());

        mockMvc.perform(post("/api/games")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.name").value(maxName));
    }

    @Test
    void createGameWithNameExceedingMaxLengthReturns400() throws Exception {
        // 256 chars exceeds @Size(max=255)
        CreateGameRequest request = new CreateGameRequest();
        request.setName("A".repeat(256));

        mockMvc.perform(post("/api/games")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.name").exists());
    }

    // ── Get game ────────────────────────────────────────────────────

    @Test
    void getGameReturns200WithFullFields() throws Exception {
        UUID gameId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        GameResponse response = GameResponse.builder()
                .id(gameId).name("My Game").description("A description")
                .status("setup").createdBy(userId).operatorIds(List.of(userId))
                .uniformAssignment(false).broadcastEnabled(true).tileSource("osm-classic")
                .build();

        when(gameService.getGame(gameId)).thenReturn(response);

        mockMvc.perform(get("/api/games/" + gameId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(gameId.toString()))
                .andExpect(jsonPath("$.name").value("My Game"))
                .andExpect(jsonPath("$.description").value("A description"))
                .andExpect(jsonPath("$.broadcastEnabled").value(true));
    }

    @Test
    void getGameWithUnknownIdReturns404() throws Exception {
        UUID unknownId = UUID.randomUUID();
        when(gameService.getGame(unknownId))
                .thenThrow(new ResourceNotFoundException("Game not found: " + unknownId));

        mockMvc.perform(get("/api/games/" + unknownId))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message").value("Game not found: " + unknownId));
    }

    // ── Update status ───────────────────────────────────────────────

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
    void updateStatusPassesStatusAndResetFlagToService() throws Exception {
        UUID gameId = UUID.randomUUID();
        UpdateGameStatusRequest request = new UpdateGameStatusRequest();
        request.setStatus("setup");
        request.setResetProgress(true);

        UUID userId = UUID.randomUUID();
        when(gameService.updateStatus(eq(gameId), eq("setup"), eq(true)))
                .thenReturn(GameResponse.builder()
                        .id(gameId).name("G").description("").status("setup")
                        .createdBy(userId).operatorIds(List.of(userId))
                        .uniformAssignment(false).broadcastEnabled(false).tileSource("osm-classic")
                        .build());

        mockMvc.perform(patch("/api/games/" + gameId + "/status")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("setup"));

        verify(gameService).updateStatus(gameId, "setup", true);
    }

    @Test
    void updateStatusWithMissingStatusFieldReturns400() throws Exception {
        UUID gameId = UUID.randomUUID();
        // status field is omitted — @NotBlank should reject
        mockMvc.perform(patch("/api/games/" + gameId + "/status")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void updateStatusOnUnknownGameReturns404() throws Exception {
        UUID unknownId = UUID.randomUUID();
        UpdateGameStatusRequest request = new UpdateGameStatusRequest();
        request.setStatus("live");

        when(gameService.updateStatus(eq(unknownId), eq("live"), eq(false)))
                .thenThrow(new ResourceNotFoundException("Game not found: " + unknownId));

        mockMvc.perform(patch("/api/games/" + unknownId + "/status")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message").value("Game not found: " + unknownId));
    }

    // ── Delete game ─────────────────────────────────────────────────

    @Test
    void deleteGameReturns204() throws Exception {
        UUID gameId = UUID.randomUUID();
        doNothing().when(gameService).deleteGame(gameId);

        mockMvc.perform(delete("/api/games/" + gameId))
                .andExpect(status().isNoContent());

        verify(gameService).deleteGame(gameId);
    }

    @Test
    void deleteGamePassesCorrectIdToService() throws Exception {
        UUID gameId = UUID.randomUUID();
        doNothing().when(gameService).deleteGame(gameId);

        mockMvc.perform(delete("/api/games/" + gameId))
                .andExpect(status().isNoContent());

        ArgumentCaptor<UUID> captor = ArgumentCaptor.forClass(UUID.class);
        verify(gameService).deleteGame(captor.capture());
        assertThat(captor.getValue()).isEqualTo(gameId);
    }

    @Test
    void deleteUnknownGameReturns404() throws Exception {
        UUID unknownId = UUID.randomUUID();
        doThrow(new ResourceNotFoundException("Game not found: " + unknownId))
                .when(gameService).deleteGame(unknownId);

        mockMvc.perform(delete("/api/games/" + unknownId))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message").value("Game not found: " + unknownId));
    }

    // ── Export game ─────────────────────────────────────────────────

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
                .andExpect(jsonPath("$.exportVersion").value("1.0"))
                .andExpect(jsonPath("$.game.name").value("Export Game"));
    }

    @Test
    void exportUnknownGameReturns404() throws Exception {
        UUID unknownId = UUID.randomUUID();
        when(gameService.exportGame(unknownId))
                .thenThrow(new ResourceNotFoundException("Game not found: " + unknownId));

        mockMvc.perform(get("/api/games/" + unknownId + "/export"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message").value("Game not found: " + unknownId));
    }

    // ── Import game ─────────────────────────────────────────────────

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
                .andExpect(jsonPath("$.name").value("Imported Game"))
                .andExpect(jsonPath("$.status").value("setup"));
    }

    @Test
    void importGameWithConflictingNameReturns409() throws Exception {
        GameImportRequest request = new GameImportRequest();
        request.setGameData(GameExportDto.builder()
                .exportVersion("1.0")
                .game(GameMetadataDto.builder().name("Dupe").description("").uniformAssignment(false).build())
                .bases(List.of()).challenges(List.of()).assignments(List.of())
                .build());

        when(gameService.importGame(any(GameImportRequest.class)))
                .thenThrow(new ConflictException("A game with this name already exists"));

        mockMvc.perform(post("/api/games/import")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("A game with this name already exists"));
    }

    // ── Operator management ─────────────────────────────────────────

    @Test
    void addOperatorToUnknownGameReturns404() throws Exception {
        UUID gameId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();

        doThrow(new ResourceNotFoundException("Game not found: " + gameId))
                .when(gameService).addOperator(gameId, userId);

        mockMvc.perform(post("/api/games/" + gameId + "/operators/" + userId))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message").value("Game not found: " + gameId));
    }

    @Test
    void addOperatorAlreadyInGameReturns409() throws Exception {
        UUID gameId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();

        doThrow(new ConflictException("User is already an operator of this game"))
                .when(gameService).addOperator(gameId, userId);

        mockMvc.perform(post("/api/games/" + gameId + "/operators/" + userId))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("User is already an operator of this game"));
    }
}
