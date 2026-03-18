package com.prayer.pointfinder.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.prayer.pointfinder.dto.request.PlayerJoinRequest;
import com.prayer.pointfinder.dto.request.PlayerSubmissionRequest;
import com.prayer.pointfinder.dto.response.*;
import com.prayer.pointfinder.entity.Player;
import com.prayer.pointfinder.entity.Team;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.exception.GlobalExceptionHandler;
import com.prayer.pointfinder.security.JwtAuthenticationFilter;
import com.prayer.pointfinder.security.SecurityUtils;
import com.prayer.pointfinder.service.ChunkedUploadService;
import com.prayer.pointfinder.service.FileStorageService;
import com.prayer.pointfinder.service.PlayerService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.MockedStatic;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mockStatic;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(PlayerController.class)
@AutoConfigureMockMvc(addFilters = false)
@Import(GlobalExceptionHandler.class)
class PlayerControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockBean
    private PlayerService playerService;

    @MockBean
    private ChunkedUploadService chunkedUploadService;

    @MockBean
    private FileStorageService fileStorageService;

    @MockBean
    private JwtAuthenticationFilter jwtAuthenticationFilter;

    private MockedStatic<SecurityUtils> securityUtilsMock;
    private Player testPlayer;

    @BeforeEach
    void setUp() {
        testPlayer = Player.builder()
                .id(UUID.randomUUID())
                .displayName("Scout")
                .deviceId("device-123")
                .build();
        securityUtilsMock = mockStatic(SecurityUtils.class);
        securityUtilsMock.when(SecurityUtils::getCurrentPlayer).thenReturn(testPlayer);
    }

    @AfterEach
    void tearDown() {
        securityUtilsMock.close();
    }

    // ── Player Join tests (public endpoint under /api/auth/) ────────

    @Test
    void joinWithValidCodeReturnsPlayerAuth() throws Exception {
        PlayerJoinRequest request = new PlayerJoinRequest();
        request.setJoinCode("TEST01");
        request.setDisplayName("Scout");
        request.setDeviceId("device-123");

        UUID playerId = UUID.randomUUID();
        UUID teamId = UUID.randomUUID();
        UUID gameId = UUID.randomUUID();

        PlayerAuthResponse response = PlayerAuthResponse.builder()
                .token("player-jwt-token")
                .player(PlayerAuthResponse.PlayerInfo.builder()
                        .id(playerId)
                        .displayName("Scout")
                        .deviceId("device-123")
                        .build())
                .team(PlayerAuthResponse.TeamInfo.builder()
                        .id(teamId)
                        .name("Pathfinders")
                        .color("#FF0000")
                        .build())
                .game(PlayerAuthResponse.GameInfo.builder()
                        .id(gameId)
                        .name("Test Game")
                        .description("desc")
                        .status("live")
                        .tileSource("osm-classic")
                        .build())
                .build();

        when(playerService.joinTeam(any(PlayerJoinRequest.class))).thenReturn(response);

        mockMvc.perform(post("/api/auth/player/join")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token").value("player-jwt-token"))
                .andExpect(jsonPath("$.player.displayName").value("Scout"))
                .andExpect(jsonPath("$.team.name").value("Pathfinders"))
                .andExpect(jsonPath("$.game.status").value("live"));
    }

    @Test
    void joinWithInvalidCodeReturns400() throws Exception {
        PlayerJoinRequest request = new PlayerJoinRequest();
        request.setJoinCode("INVALID");
        request.setDisplayName("Scout");
        request.setDeviceId("device-123");

        when(playerService.joinTeam(any(PlayerJoinRequest.class)))
                .thenThrow(new BadRequestException("Invalid join code"));

        mockMvc.perform(post("/api/auth/player/join")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Invalid join code"));
    }

    @Test
    void joinWithMissingDisplayNameReturns400() throws Exception {
        PlayerJoinRequest request = new PlayerJoinRequest();
        request.setJoinCode("TEST01");
        // displayName not set
        request.setDeviceId("device-123");

        mockMvc.perform(post("/api/auth/player/join")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.displayName").exists());
    }

    @Test
    void joinWithMissingJoinCodeReturns400() throws Exception {
        PlayerJoinRequest request = new PlayerJoinRequest();
        // joinCode not set
        request.setDisplayName("Scout");
        request.setDeviceId("device-123");

        mockMvc.perform(post("/api/auth/player/join")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.joinCode").exists());
    }

    // ── Check-in endpoint ────────

    @Test
    void checkInReturnsCheckInResponse() throws Exception {
        UUID gameId = UUID.randomUUID();
        UUID baseId = UUID.randomUUID();
        UUID checkInId = UUID.randomUUID();

        CheckInResponse response = CheckInResponse.builder()
                .checkInId(checkInId)
                .baseId(baseId)
                .baseName("Forest Clearing")
                .checkedInAt(Instant.parse("2025-03-01T09:15:00Z"))
                .challenge(CheckInResponse.ChallengeInfo.builder()
                        .id(UUID.randomUUID())
                        .title("Find the tree")
                        .description("desc")
                        .content("content")
                        .answerType("text")
                        .points(50)
                        .build())
                .build();

        when(playerService.checkIn(eq(gameId), eq(baseId), any(Player.class))).thenReturn(response);

        mockMvc.perform(post("/api/player/games/" + gameId + "/bases/" + baseId + "/check-in"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.checkInId").value(checkInId.toString()))
                .andExpect(jsonPath("$.baseName").value("Forest Clearing"))
                .andExpect(jsonPath("$.challenge.title").value("Find the tree"));
    }

    // ── Submission endpoint ────────

    @Test
    void submitAnswerReturns201() throws Exception {
        UUID gameId = UUID.randomUUID();
        UUID submissionId = UUID.randomUUID();
        UUID challengeId = UUID.randomUUID();
        UUID baseId = UUID.randomUUID();

        PlayerSubmissionRequest request = new PlayerSubmissionRequest();
        request.setBaseId(baseId);
        request.setChallengeId(challengeId);
        request.setAnswer("42");

        SubmissionResponse response = SubmissionResponse.builder()
                .id(submissionId)
                .teamId(UUID.randomUUID())
                .challengeId(challengeId)
                .baseId(baseId)
                .answer("42")
                .status("pending")
                .submittedAt(Instant.now())
                .build();

        when(playerService.submitAnswer(eq(gameId), any(PlayerSubmissionRequest.class), any(Player.class)))
                .thenReturn(response);

        mockMvc.perform(post("/api/player/games/" + gameId + "/submissions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(submissionId.toString()))
                .andExpect(jsonPath("$.answer").value("42"))
                .andExpect(jsonPath("$.status").value("pending"));
    }

    // ── Progress endpoint ────────

    @Test
    void getProgressReturnsBaseProgressList() throws Exception {
        UUID gameId = UUID.randomUUID();
        UUID baseId = UUID.randomUUID();

        BaseProgressResponse progress = BaseProgressResponse.builder()
                .baseId(baseId)
                .baseName("Forest Clearing")
                .lat(47.3769)
                .lng(8.5417)
                .nfcLinked(true)
                .status("completed")
                .checkedInAt(Instant.parse("2025-03-01T09:15:00Z"))
                .challengeId(UUID.randomUUID())
                .submissionStatus("approved")
                .build();

        when(playerService.getProgress(eq(gameId), any(Player.class)))
                .thenReturn(List.of(progress));

        mockMvc.perform(get("/api/player/games/" + gameId + "/progress"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].baseId").value(baseId.toString()))
                .andExpect(jsonPath("$[0].baseName").value("Forest Clearing"))
                .andExpect(jsonPath("$[0].status").value("completed"))
                .andExpect(jsonPath("$[0].submissionStatus").value("approved"));
    }
}
