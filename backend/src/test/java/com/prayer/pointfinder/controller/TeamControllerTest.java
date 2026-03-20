package com.prayer.pointfinder.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.prayer.pointfinder.dto.request.CreateTeamRequest;
import com.prayer.pointfinder.dto.request.UpdateTeamRequest;
import com.prayer.pointfinder.dto.response.PlayerResponse;
import com.prayer.pointfinder.dto.response.TeamResponse;
import com.prayer.pointfinder.exception.GlobalExceptionHandler;
import com.prayer.pointfinder.exception.ResourceNotFoundException;
import com.prayer.pointfinder.security.JwtAuthenticationFilter;
import com.prayer.pointfinder.service.TeamService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.when;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(TeamController.class)
@AutoConfigureMockMvc(addFilters = false)
@Import(GlobalExceptionHandler.class)
class TeamControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockitoBean
    private TeamService teamService;

    @MockitoBean
    private JwtAuthenticationFilter jwtAuthenticationFilter;

    private static final UUID GAME_ID = UUID.randomUUID();
    private static final UUID TEAM_ID = UUID.randomUUID();
    private static final UUID PLAYER_ID = UUID.randomUUID();

    // ── GET /api/games/{gameId}/teams ─────────────────────────────────

    @Test
    void getTeamsReturns200WithList() throws Exception {
        TeamResponse team = TeamResponse.builder()
                .id(TEAM_ID)
                .gameId(GAME_ID)
                .name("Eagles")
                .joinCode("EAG001")
                .color("#FF0000")
                .build();

        when(teamService.getTeamsByGame(GAME_ID)).thenReturn(List.of(team));

        mockMvc.perform(get("/api/games/" + GAME_ID + "/teams"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(TEAM_ID.toString()))
                .andExpect(jsonPath("$[0].name").value("Eagles"))
                .andExpect(jsonPath("$[0].joinCode").value("EAG001"))
                .andExpect(jsonPath("$[0].color").value("#FF0000"));
    }

    @Test
    void getTeamsReturnsEmptyList() throws Exception {
        when(teamService.getTeamsByGame(GAME_ID)).thenReturn(List.of());

        mockMvc.perform(get("/api/games/" + GAME_ID + "/teams"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray())
                .andExpect(jsonPath("$").isEmpty());
    }

    // ── POST /api/games/{gameId}/teams ────────────────────────────────

    @Test
    void createTeamWithValidBodyReturns201() throws Exception {
        CreateTeamRequest request = new CreateTeamRequest();
        request.setName("Eagles");

        TeamResponse response = TeamResponse.builder()
                .id(TEAM_ID)
                .gameId(GAME_ID)
                .name("Eagles")
                .joinCode("EAG001")
                .color("#FF0000")
                .build();

        when(teamService.createTeam(eq(GAME_ID), any(CreateTeamRequest.class))).thenReturn(response);

        mockMvc.perform(post("/api/games/" + GAME_ID + "/teams")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(TEAM_ID.toString()))
                .andExpect(jsonPath("$.name").value("Eagles"))
                .andExpect(jsonPath("$.joinCode").value("EAG001"));
    }

    @Test
    void createTeamWithMissingNameReturns400() throws Exception {
        CreateTeamRequest request = new CreateTeamRequest();
        // name not set - @NotBlank should reject

        mockMvc.perform(post("/api/games/" + GAME_ID + "/teams")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.name").exists());
    }

    @Test
    void createTeamWithBlankNameReturns400() throws Exception {
        CreateTeamRequest request = new CreateTeamRequest();
        request.setName("   "); // blank string - @NotBlank should reject

        mockMvc.perform(post("/api/games/" + GAME_ID + "/teams")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.name").exists());
    }

    // ── PUT /api/games/{gameId}/teams/{teamId} ────────────────────────

    @Test
    void updateTeamWithValidBodyReturns200() throws Exception {
        UpdateTeamRequest request = new UpdateTeamRequest();
        request.setName("Hawks");
        request.setColor("#00FF00");

        TeamResponse response = TeamResponse.builder()
                .id(TEAM_ID)
                .gameId(GAME_ID)
                .name("Hawks")
                .joinCode("EAG001")
                .color("#00FF00")
                .build();

        when(teamService.updateTeam(eq(GAME_ID), eq(TEAM_ID), any(UpdateTeamRequest.class))).thenReturn(response);

        mockMvc.perform(put("/api/games/" + GAME_ID + "/teams/" + TEAM_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Hawks"))
                .andExpect(jsonPath("$.color").value("#00FF00"));
    }

    @Test
    void updateTeamWithInvalidColorReturns400() throws Exception {
        UpdateTeamRequest request = new UpdateTeamRequest();
        request.setName("Hawks");
        request.setColor("not-a-color"); // @Pattern should reject

        mockMvc.perform(put("/api/games/" + GAME_ID + "/teams/" + TEAM_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.color").exists());
    }

    @Test
    void updateTeamNotFoundReturns404() throws Exception {
        UpdateTeamRequest request = new UpdateTeamRequest();
        request.setName("Hawks");

        when(teamService.updateTeam(eq(GAME_ID), eq(TEAM_ID), any(UpdateTeamRequest.class)))
                .thenThrow(new ResourceNotFoundException("Team", TEAM_ID));

        mockMvc.perform(put("/api/games/" + GAME_ID + "/teams/" + TEAM_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message").exists());
    }

    // ── DELETE /api/games/{gameId}/teams/{teamId} ─────────────────────

    @Test
    void deleteTeamReturns204() throws Exception {
        doNothing().when(teamService).deleteTeam(GAME_ID, TEAM_ID);

        mockMvc.perform(delete("/api/games/" + GAME_ID + "/teams/" + TEAM_ID))
                .andExpect(status().isNoContent());
    }

    @Test
    void deleteTeamNotFoundReturns404() throws Exception {
        doThrow(new ResourceNotFoundException("Team", TEAM_ID))
                .when(teamService).deleteTeam(GAME_ID, TEAM_ID);

        mockMvc.perform(delete("/api/games/" + GAME_ID + "/teams/" + TEAM_ID))
                .andExpect(status().isNotFound());
    }

    // ── GET /api/games/{gameId}/teams/{teamId}/players ────────────────

    @Test
    void getPlayersReturns200WithList() throws Exception {
        PlayerResponse player = PlayerResponse.builder()
                .id(PLAYER_ID)
                .teamId(TEAM_ID)
                .deviceId("device-123")
                .displayName("Scout")
                .build();

        when(teamService.getPlayers(GAME_ID, TEAM_ID)).thenReturn(List.of(player));

        mockMvc.perform(get("/api/games/" + GAME_ID + "/teams/" + TEAM_ID + "/players"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(PLAYER_ID.toString()))
                .andExpect(jsonPath("$[0].displayName").value("Scout"))
                .andExpect(jsonPath("$[0].deviceId").value("device-123"));
    }

    @Test
    void getPlayersNotFoundReturns404() throws Exception {
        when(teamService.getPlayers(GAME_ID, TEAM_ID))
                .thenThrow(new ResourceNotFoundException("Team", TEAM_ID));

        mockMvc.perform(get("/api/games/" + GAME_ID + "/teams/" + TEAM_ID + "/players"))
                .andExpect(status().isNotFound());
    }

    // ── DELETE /api/games/{gameId}/teams/{teamId}/players/{playerId} ──

    @Test
    void removePlayerReturns204() throws Exception {
        doNothing().when(teamService).removePlayer(GAME_ID, TEAM_ID, PLAYER_ID);

        mockMvc.perform(delete("/api/games/" + GAME_ID + "/teams/" + TEAM_ID + "/players/" + PLAYER_ID))
                .andExpect(status().isNoContent());
    }

    @Test
    void removePlayerNotFoundReturns404() throws Exception {
        doThrow(new ResourceNotFoundException("Player", PLAYER_ID))
                .when(teamService).removePlayer(GAME_ID, TEAM_ID, PLAYER_ID);

        mockMvc.perform(delete("/api/games/" + GAME_ID + "/teams/" + TEAM_ID + "/players/" + PLAYER_ID))
                .andExpect(status().isNotFound());
    }
}
