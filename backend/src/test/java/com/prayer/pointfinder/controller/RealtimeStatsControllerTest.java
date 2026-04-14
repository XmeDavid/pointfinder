package com.prayer.pointfinder.controller;

import com.prayer.pointfinder.dto.response.RealtimeStatsResponse;
import com.prayer.pointfinder.exception.ForbiddenException;
import com.prayer.pointfinder.exception.GlobalExceptionHandler;
import com.prayer.pointfinder.security.JwtAuthenticationFilter;
import com.prayer.pointfinder.service.GameAccessService;
import com.prayer.pointfinder.service.RealtimeMetricsService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(RealtimeStatsController.class)
@AutoConfigureMockMvc(addFilters = false)
@Import(GlobalExceptionHandler.class)
class RealtimeStatsControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private RealtimeMetricsService realtimeMetricsService;

    @MockitoBean
    private GameAccessService gameAccessService;

    @MockitoBean
    private JwtAuthenticationFilter jwtAuthenticationFilter;

    @MockitoBean
    private com.prayer.pointfinder.security.FrozenAccountFilter frozenAccountFilter;

    @Test
    void getRealtimeStatsReturnsShape() throws Exception {
        UUID gameId = UUID.randomUUID();
        RealtimeStatsResponse response = RealtimeStatsResponse.builder()
                .stompActiveSessions(3)
                .mobileActiveSessions(7)
                .totalActiveSessions(10)
                .stompConnectsLastHour(42)
                .mobileConnectsLastHour(128)
                .stompDisconnectsLastHour(38)
                .mobileDisconnectsLastHour(121)
                .estimatedReconnectsLastHour(95)
                .lastUpdated(Instant.parse("2026-04-08T12:34:56Z"))
                .build();

        when(realtimeMetricsService.getStatsForGame(gameId)).thenReturn(response);

        mockMvc.perform(get("/api/games/{gameId}/realtime-stats", gameId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.stompActiveSessions").value(3))
                .andExpect(jsonPath("$.mobileActiveSessions").value(7))
                .andExpect(jsonPath("$.totalActiveSessions").value(10))
                .andExpect(jsonPath("$.stompConnectsLastHour").value(42))
                .andExpect(jsonPath("$.mobileConnectsLastHour").value(128))
                .andExpect(jsonPath("$.stompDisconnectsLastHour").value(38))
                .andExpect(jsonPath("$.mobileDisconnectsLastHour").value(121))
                .andExpect(jsonPath("$.estimatedReconnectsLastHour").value(95))
                .andExpect(jsonPath("$.lastUpdated").value("2026-04-08T12:34:56Z"));

        verify(gameAccessService).ensureCurrentUserCanAccessGame(gameId);
        verify(realtimeMetricsService).getStatsForGame(gameId);
    }

    @Test
    void getRealtimeStatsForbiddenReturns403() throws Exception {
        UUID gameId = UUID.randomUUID();
        doThrow(new ForbiddenException("You do not have access to this game"))
                .when(gameAccessService).ensureCurrentUserCanAccessGame(gameId);

        mockMvc.perform(get("/api/games/{gameId}/realtime-stats", gameId))
                .andExpect(status().isForbidden());

        verifyNoInteractions(realtimeMetricsService);
    }
}
