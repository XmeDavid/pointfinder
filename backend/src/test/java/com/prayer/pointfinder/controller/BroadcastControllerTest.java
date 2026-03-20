package com.prayer.pointfinder.controller;

import com.prayer.pointfinder.dto.response.*;
import com.prayer.pointfinder.exception.GlobalExceptionHandler;
import com.prayer.pointfinder.exception.ResourceNotFoundException;
import com.prayer.pointfinder.security.JwtAuthenticationFilter;
import com.prayer.pointfinder.service.BroadcastService;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(BroadcastController.class)
@AutoConfigureMockMvc(addFilters = false)
@Import(GlobalExceptionHandler.class)
class BroadcastControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private BroadcastService broadcastService;

    @MockBean
    private JwtAuthenticationFilter jwtAuthenticationFilter;

    private static final String BROADCAST_CODE = "ABC123";
    private static final UUID GAME_ID = UUID.randomUUID();
    private static final UUID TEAM_ID = UUID.randomUUID();
    private static final UUID BASE_ID = UUID.randomUUID();

    // ── GET /api/broadcast/{code} ─────────────────────────────────────

    @Test
    void getBroadcastDataReturns200() throws Exception {
        BroadcastDataResponse response = BroadcastDataResponse.builder()
                .gameId(GAME_ID)
                .gameName("Scout Rally")
                .gameStatus("live")
                .tileSource("osm-classic")
                .leaderboard(List.of())
                .teams(List.of(BroadcastTeamResponse.builder()
                        .id(TEAM_ID)
                        .name("Eagles")
                        .color("#FF0000")
                        .build()))
                .bases(List.of(BroadcastBaseResponse.builder()
                        .id(BASE_ID)
                        .name("Base Alpha")
                        .lat(47.3769)
                        .lng(8.5417)
                        .build()))
                .locations(List.of())
                .progress(List.of())
                .build();

        when(broadcastService.getBroadcastData(BROADCAST_CODE)).thenReturn(response);

        mockMvc.perform(get("/api/broadcast/" + BROADCAST_CODE))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.gameId").value(GAME_ID.toString()))
                .andExpect(jsonPath("$.gameName").value("Scout Rally"))
                .andExpect(jsonPath("$.gameStatus").value("live"))
                .andExpect(jsonPath("$.tileSource").value("osm-classic"))
                .andExpect(jsonPath("$.teams[0].name").value("Eagles"))
                .andExpect(jsonPath("$.teams[0].color").value("#FF0000"))
                .andExpect(jsonPath("$.bases[0].name").value("Base Alpha"))
                .andExpect(jsonPath("$.bases[0].lat").value(47.3769))
                .andExpect(jsonPath("$.bases[0].lng").value(8.5417));
    }

    @Test
    void getBroadcastDataPassesCodeToService() throws Exception {
        BroadcastDataResponse response = BroadcastDataResponse.builder()
                .gameId(GAME_ID).gameName("G").gameStatus("live")
                .leaderboard(List.of()).teams(List.of()).bases(List.of())
                .locations(List.of()).progress(List.of())
                .build();

        when(broadcastService.getBroadcastData("XYZ999")).thenReturn(response);

        mockMvc.perform(get("/api/broadcast/XYZ999"))
                .andExpect(status().isOk());

        ArgumentCaptor<String> captor = ArgumentCaptor.forClass(String.class);
        verify(broadcastService).getBroadcastData(captor.capture());
        assertThat(captor.getValue()).isEqualTo("XYZ999");
    }

    @Test
    void getBroadcastDataWithInvalidCodeReturns404() throws Exception {
        when(broadcastService.getBroadcastData("INVALID"))
                .thenThrow(new ResourceNotFoundException("Game not found for broadcast code: INVALID"));

        mockMvc.perform(get("/api/broadcast/INVALID"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message").value("Game not found for broadcast code: INVALID"));
    }

    @Test
    void getBroadcastDataCodeIsUppercased() throws Exception {
        // The service handles toUpperCase() internally, so controller passes code as-is
        BroadcastDataResponse response = BroadcastDataResponse.builder()
                .gameId(GAME_ID)
                .gameName("Scout Rally")
                .gameStatus("live")
                .leaderboard(List.of())
                .teams(List.of())
                .bases(List.of())
                .locations(List.of())
                .progress(List.of())
                .build();

        when(broadcastService.getBroadcastData("abc123")).thenReturn(response);

        mockMvc.perform(get("/api/broadcast/abc123"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.gameName").value("Scout Rally"));

        // Controller passes the raw path variable directly to the service
        verify(broadcastService).getBroadcastData("abc123");
    }

    // ── GET /api/broadcast/{code}/leaderboard ─────────────────────────

    @Test
    void getLeaderboardReturns200WithEntries() throws Exception {
        LeaderboardEntry entry = LeaderboardEntry.builder()
                .teamId(TEAM_ID)
                .teamName("Eagles")
                .color("#FF0000")
                .points(500)
                .completedChallenges(3)
                .build();

        when(broadcastService.getLeaderboard(BROADCAST_CODE)).thenReturn(List.of(entry));

        mockMvc.perform(get("/api/broadcast/" + BROADCAST_CODE + "/leaderboard"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].teamName").value("Eagles"))
                .andExpect(jsonPath("$[0].teamId").value(TEAM_ID.toString()))
                .andExpect(jsonPath("$[0].color").value("#FF0000"))
                .andExpect(jsonPath("$[0].points").value(500))
                .andExpect(jsonPath("$[0].completedChallenges").value(3));
    }

    @Test
    void getLeaderboardPassesCodeToService() throws Exception {
        when(broadcastService.getLeaderboard(BROADCAST_CODE)).thenReturn(List.of());

        mockMvc.perform(get("/api/broadcast/" + BROADCAST_CODE + "/leaderboard"))
                .andExpect(status().isOk());

        verify(broadcastService).getLeaderboard(BROADCAST_CODE);
    }

    @Test
    void getLeaderboardWithInvalidCodeReturns404() throws Exception {
        when(broadcastService.getLeaderboard("INVALID"))
                .thenThrow(new ResourceNotFoundException("Game not found for broadcast code: INVALID"));

        mockMvc.perform(get("/api/broadcast/INVALID/leaderboard"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message").value("Game not found for broadcast code: INVALID"));
    }

    @Test
    void getLeaderboardReturnsEntriesInResponseOrder() throws Exception {
        // Verify the controller does not re-sort — it returns whatever the service returns
        LeaderboardEntry first = LeaderboardEntry.builder()
                .teamId(UUID.randomUUID()).teamName("Alpha").color("#111").points(300).completedChallenges(2).build();
        LeaderboardEntry second = LeaderboardEntry.builder()
                .teamId(UUID.randomUUID()).teamName("Beta").color("#222").points(200).completedChallenges(1).build();

        when(broadcastService.getLeaderboard(BROADCAST_CODE)).thenReturn(List.of(first, second));

        mockMvc.perform(get("/api/broadcast/" + BROADCAST_CODE + "/leaderboard"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].teamName").value("Alpha"))
                .andExpect(jsonPath("$[1].teamName").value("Beta"));
    }

    // ── GET /api/broadcast/{code}/locations ────────────────────────────

    @Test
    void getLocationsReturns200WithList() throws Exception {
        UUID playerId = UUID.randomUUID();
        TeamLocationResponse location = TeamLocationResponse.builder()
                .teamId(TEAM_ID)
                .playerId(playerId)
                .displayName("Scout")
                .lat(47.3769)
                .lng(8.5417)
                .updatedAt(Instant.now())
                .build();

        when(broadcastService.getLocations(BROADCAST_CODE)).thenReturn(List.of(location));

        mockMvc.perform(get("/api/broadcast/" + BROADCAST_CODE + "/locations"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].teamId").value(TEAM_ID.toString()))
                .andExpect(jsonPath("$[0].playerId").value(playerId.toString()))
                .andExpect(jsonPath("$[0].displayName").value("Scout"))
                .andExpect(jsonPath("$[0].lat").value(47.3769))
                .andExpect(jsonPath("$[0].lng").value(8.5417));
    }

    @Test
    void getLocationsPassesCodeToService() throws Exception {
        when(broadcastService.getLocations(BROADCAST_CODE)).thenReturn(List.of());

        mockMvc.perform(get("/api/broadcast/" + BROADCAST_CODE + "/locations"))
                .andExpect(status().isOk());

        verify(broadcastService).getLocations(BROADCAST_CODE);
    }

    @Test
    void getLocationsWithInvalidCodeReturns404() throws Exception {
        when(broadcastService.getLocations("INVALID"))
                .thenThrow(new ResourceNotFoundException("Game not found for broadcast code: INVALID"));

        mockMvc.perform(get("/api/broadcast/INVALID/locations"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message").value("Game not found for broadcast code: INVALID"));
    }

    // ── GET /api/broadcast/{code}/progress ─────────────────────────────

    @Test
    void getProgressReturns200WithList() throws Exception {
        TeamBaseProgressResponse progress = TeamBaseProgressResponse.builder()
                .baseId(BASE_ID)
                .teamId(TEAM_ID)
                .status("checked_in")
                .checkedInAt(Instant.now())
                .build();

        when(broadcastService.getProgress(BROADCAST_CODE)).thenReturn(List.of(progress));

        mockMvc.perform(get("/api/broadcast/" + BROADCAST_CODE + "/progress"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].status").value("checked_in"))
                .andExpect(jsonPath("$[0].baseId").value(BASE_ID.toString()))
                .andExpect(jsonPath("$[0].teamId").value(TEAM_ID.toString()));
    }

    @Test
    void getProgressPassesCodeToService() throws Exception {
        when(broadcastService.getProgress(BROADCAST_CODE)).thenReturn(List.of());

        mockMvc.perform(get("/api/broadcast/" + BROADCAST_CODE + "/progress"))
                .andExpect(status().isOk());

        verify(broadcastService).getProgress(BROADCAST_CODE);
    }

    @Test
    void getProgressWithInvalidCodeReturns404() throws Exception {
        when(broadcastService.getProgress("INVALID"))
                .thenThrow(new ResourceNotFoundException("Game not found for broadcast code: INVALID"));

        mockMvc.perform(get("/api/broadcast/INVALID/progress"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message").value("Game not found for broadcast code: INVALID"));
    }

    @Test
    void getProgressReturnsEmptyListWhenNoActivity() throws Exception {
        when(broadcastService.getProgress(BROADCAST_CODE)).thenReturn(List.of());

        mockMvc.perform(get("/api/broadcast/" + BROADCAST_CODE + "/progress"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray())
                .andExpect(jsonPath("$").isEmpty());
    }
}
