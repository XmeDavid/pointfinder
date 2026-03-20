package com.prayer.pointfinder.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.prayer.pointfinder.dto.request.PlayerJoinRequest;
import com.prayer.pointfinder.dto.request.PlayerSubmissionRequest;
import com.prayer.pointfinder.dto.response.*;
import com.prayer.pointfinder.entity.Player;
import com.prayer.pointfinder.entity.Team;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.exception.ConflictException;
import com.prayer.pointfinder.exception.GlobalExceptionHandler;
import com.prayer.pointfinder.exception.ResourceNotFoundException;
import com.prayer.pointfinder.security.JwtAuthenticationFilter;
import com.prayer.pointfinder.security.SecurityUtils;
import com.prayer.pointfinder.service.ChunkedUploadService;
import com.prayer.pointfinder.service.FileStorageService;
import com.prayer.pointfinder.service.PlayerService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
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

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mockStatic;
import static org.mockito.Mockito.verify;
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
                .andExpect(jsonPath("$.player.deviceId").value("device-123"))
                .andExpect(jsonPath("$.team.name").value("Pathfinders"))
                .andExpect(jsonPath("$.team.color").value("#FF0000"))
                .andExpect(jsonPath("$.game.status").value("live"))
                .andExpect(jsonPath("$.game.tileSource").value("osm-classic"));
    }

    @Test
    void joinPassesRequestFieldsToService() throws Exception {
        PlayerJoinRequest request = new PlayerJoinRequest();
        request.setJoinCode("CAMP42");
        request.setDisplayName("Eagle");
        request.setDeviceId("dev-abc");

        UUID playerId = UUID.randomUUID();
        UUID teamId = UUID.randomUUID();
        UUID gameId = UUID.randomUUID();
        when(playerService.joinTeam(any(PlayerJoinRequest.class))).thenReturn(
                PlayerAuthResponse.builder()
                        .token("t")
                        .player(PlayerAuthResponse.PlayerInfo.builder().id(playerId).displayName("Eagle").deviceId("dev-abc").build())
                        .team(PlayerAuthResponse.TeamInfo.builder().id(teamId).name("T").color("#000").build())
                        .game(PlayerAuthResponse.GameInfo.builder().id(gameId).name("G").description("").status("live").tileSource("osm-classic").build())
                        .build());

        mockMvc.perform(post("/api/auth/player/join")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk());

        ArgumentCaptor<PlayerJoinRequest> captor = ArgumentCaptor.forClass(PlayerJoinRequest.class);
        verify(playerService).joinTeam(captor.capture());
        assertThat(captor.getValue().getJoinCode()).isEqualTo("CAMP42");
        assertThat(captor.getValue().getDisplayName()).isEqualTo("Eagle");
        assertThat(captor.getValue().getDeviceId()).isEqualTo("dev-abc");
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
    void joinWhenGameNotLiveReturns400() throws Exception {
        PlayerJoinRequest request = new PlayerJoinRequest();
        request.setJoinCode("TEST01");
        request.setDisplayName("Scout");
        request.setDeviceId("device-123");

        when(playerService.joinTeam(any(PlayerJoinRequest.class)))
                .thenThrow(new BadRequestException("Game is not currently accepting players"));

        mockMvc.perform(post("/api/auth/player/join")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Game is not currently accepting players"));
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

    @Test
    void joinWithDeviceAlreadyInTeamReturns409() throws Exception {
        PlayerJoinRequest request = new PlayerJoinRequest();
        request.setJoinCode("TEST01");
        request.setDisplayName("Scout");
        request.setDeviceId("device-already-joined");

        when(playerService.joinTeam(any(PlayerJoinRequest.class)))
                .thenThrow(new ConflictException("This device has already joined a team"));

        mockMvc.perform(post("/api/auth/player/join")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("This device has already joined a team"));
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
                .andExpect(jsonPath("$.challenge.title").value("Find the tree"))
                .andExpect(jsonPath("$.challenge.answerType").value("text"))
                .andExpect(jsonPath("$.challenge.points").value(50));
    }

    @Test
    void checkInPassesCorrectGameAndBaseIdsToService() throws Exception {
        UUID gameId = UUID.randomUUID();
        UUID baseId = UUID.randomUUID();

        CheckInResponse response = CheckInResponse.builder()
                .checkInId(UUID.randomUUID()).baseId(baseId).baseName("B")
                .checkedInAt(Instant.now())
                .challenge(CheckInResponse.ChallengeInfo.builder()
                        .id(UUID.randomUUID()).title("T").description("d").content("c")
                        .answerType("text").points(10).build())
                .build();

        when(playerService.checkIn(eq(gameId), eq(baseId), any(Player.class))).thenReturn(response);

        mockMvc.perform(post("/api/player/games/" + gameId + "/bases/" + baseId + "/check-in"))
                .andExpect(status().isOk());

        verify(playerService).checkIn(eq(gameId), eq(baseId), any(Player.class));
    }

    @Test
    void checkInOnUnknownBaseReturns404() throws Exception {
        UUID gameId = UUID.randomUUID();
        UUID unknownBaseId = UUID.randomUUID();

        when(playerService.checkIn(eq(gameId), eq(unknownBaseId), any(Player.class)))
                .thenThrow(new ResourceNotFoundException("Base not found: " + unknownBaseId));

        mockMvc.perform(post("/api/player/games/" + gameId + "/bases/" + unknownBaseId + "/check-in"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message").value("Base not found: " + unknownBaseId));
    }

    @Test
    void checkInWhenAlreadyCheckedInReturns409() throws Exception {
        UUID gameId = UUID.randomUUID();
        UUID baseId = UUID.randomUUID();

        when(playerService.checkIn(eq(gameId), eq(baseId), any(Player.class)))
                .thenThrow(new ConflictException("Team has already checked in at this base"));

        mockMvc.perform(post("/api/player/games/" + gameId + "/bases/" + baseId + "/check-in"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("Team has already checked in at this base"));
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
                .andExpect(jsonPath("$.status").value("pending"))
                .andExpect(jsonPath("$.challengeId").value(challengeId.toString()))
                .andExpect(jsonPath("$.baseId").value(baseId.toString()));
    }

    @Test
    void submitAnswerPassesCorrectArgumentsToService() throws Exception {
        UUID gameId = UUID.randomUUID();
        UUID challengeId = UUID.randomUUID();
        UUID baseId = UUID.randomUUID();

        PlayerSubmissionRequest request = new PlayerSubmissionRequest();
        request.setBaseId(baseId);
        request.setChallengeId(challengeId);
        request.setAnswer("my answer");

        when(playerService.submitAnswer(eq(gameId), any(PlayerSubmissionRequest.class), any(Player.class)))
                .thenReturn(SubmissionResponse.builder()
                        .id(UUID.randomUUID()).teamId(UUID.randomUUID())
                        .challengeId(challengeId).baseId(baseId)
                        .answer("my answer").status("pending").submittedAt(Instant.now())
                        .build());

        mockMvc.perform(post("/api/player/games/" + gameId + "/submissions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated());

        ArgumentCaptor<PlayerSubmissionRequest> captor = ArgumentCaptor.forClass(PlayerSubmissionRequest.class);
        verify(playerService).submitAnswer(eq(gameId), captor.capture(), any(Player.class));
        assertThat(captor.getValue().getAnswer()).isEqualTo("my answer");
        assertThat(captor.getValue().getChallengeId()).isEqualTo(challengeId);
        assertThat(captor.getValue().getBaseId()).isEqualTo(baseId);
    }

    @Test
    void submitAnswerForUnknownGameReturns404() throws Exception {
        UUID unknownGameId = UUID.randomUUID();
        UUID challengeId = UUID.randomUUID();
        UUID baseId = UUID.randomUUID();

        PlayerSubmissionRequest request = new PlayerSubmissionRequest();
        request.setBaseId(baseId);
        request.setChallengeId(challengeId);
        request.setAnswer("answer");

        when(playerService.submitAnswer(eq(unknownGameId), any(PlayerSubmissionRequest.class), any(Player.class)))
                .thenThrow(new ResourceNotFoundException("Game not found: " + unknownGameId));

        mockMvc.perform(post("/api/player/games/" + unknownGameId + "/submissions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message").value("Game not found: " + unknownGameId));
    }

    @Test
    void submitDuplicateAnswerReturns409() throws Exception {
        UUID gameId = UUID.randomUUID();
        UUID challengeId = UUID.randomUUID();
        UUID baseId = UUID.randomUUID();

        PlayerSubmissionRequest request = new PlayerSubmissionRequest();
        request.setBaseId(baseId);
        request.setChallengeId(challengeId);
        request.setAnswer("42");

        when(playerService.submitAnswer(eq(gameId), any(PlayerSubmissionRequest.class), any(Player.class)))
                .thenThrow(new ConflictException("A submission with this idempotency key already exists"));

        mockMvc.perform(post("/api/player/games/" + gameId + "/submissions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("A submission with this idempotency key already exists"));
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
                .andExpect(jsonPath("$[0].submissionStatus").value("approved"))
                .andExpect(jsonPath("$[0].nfcLinked").value(true))
                .andExpect(jsonPath("$[0].lat").value(47.3769))
                .andExpect(jsonPath("$[0].lng").value(8.5417));
    }

    @Test
    void getProgressForUnknownGameReturns404() throws Exception {
        UUID unknownGameId = UUID.randomUUID();

        when(playerService.getProgress(eq(unknownGameId), any(Player.class)))
                .thenThrow(new ResourceNotFoundException("Game not found: " + unknownGameId));

        mockMvc.perform(get("/api/player/games/" + unknownGameId + "/progress"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message").value("Game not found: " + unknownGameId));
    }

    @Test
    void getProgressPassesCorrectPlayerToService() throws Exception {
        UUID gameId = UUID.randomUUID();

        when(playerService.getProgress(eq(gameId), eq(testPlayer))).thenReturn(List.of());

        mockMvc.perform(get("/api/player/games/" + gameId + "/progress"))
                .andExpect(status().isOk());

        verify(playerService).getProgress(eq(gameId), eq(testPlayer));
    }
}
