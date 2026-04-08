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
import org.springframework.test.context.bean.override.mockito.MockitoBean;
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

    @MockitoBean
    private PlayerService playerService;

    @MockitoBean
    private ChunkedUploadService chunkedUploadService;

    @MockitoBean
    private FileStorageService fileStorageService;

    @MockitoBean
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

        when(playerService.checkIn(eq(gameId), eq(baseId), any(Player.class), any())).thenReturn(response);

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

        when(playerService.checkIn(eq(gameId), eq(baseId), any(Player.class), any())).thenReturn(response);

        mockMvc.perform(post("/api/player/games/" + gameId + "/bases/" + baseId + "/check-in"))
                .andExpect(status().isOk());

        verify(playerService).checkIn(eq(gameId), eq(baseId), any(Player.class), any());
    }

    @Test
    void checkInOnUnknownBaseReturns404() throws Exception {
        UUID gameId = UUID.randomUUID();
        UUID unknownBaseId = UUID.randomUUID();

        when(playerService.checkIn(eq(gameId), eq(unknownBaseId), any(Player.class), any()))
                .thenThrow(new ResourceNotFoundException("Base not found: " + unknownBaseId));

        mockMvc.perform(post("/api/player/games/" + gameId + "/bases/" + unknownBaseId + "/check-in"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message").value("Base not found: " + unknownBaseId));
    }

    @Test
    void checkInWhenAlreadyCheckedInReturns409() throws Exception {
        UUID gameId = UUID.randomUUID();
        UUID baseId = UUID.randomUUID();

        when(playerService.checkIn(eq(gameId), eq(baseId), any(Player.class), any()))
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

    // ── P1 Phase 4 W2: operator notes privacy contract ────────────────
    //
    // These tests are the non-negotiable part of the operator-only
    // challenge notes feature. If any of them fail, the feature has
    // leaked operator-only data into a player-facing response and the
    // regression MUST be fixed before merging.

    @Test
    void getGameDataReturnsPlayerChallengeResponseWithoutOperatorNotesField() throws Exception {
        UUID gameId = UUID.randomUUID();
        UUID challengeId = UUID.randomUUID();

        // PlayerChallengeResponse is structurally incapable of carrying
        // operatorNotes — the field does not exist on the DTO. This
        // guarantees at the type level that PlayerService cannot leak
        // the operator notes into this endpoint's response. The test
        // below additionally asserts at the JSON layer that the field
        // never appears in the serialized body, so a future regression
        // that reintroduces ChallengeResponse into GameDataResponse
        // would fail loudly.
        PlayerChallengeResponse safeChallenge = PlayerChallengeResponse.builder()
                .id(challengeId)
                .gameId(gameId)
                .title("Find the tree")
                .description("Locate the oldest tree in the grove")
                .content("Full instructions here")
                .completionContent("Well done!")
                .answerType("text")
                .autoValidate(false)
                .points(100)
                .locationBound(false)
                .requirePresenceToSubmit(false)
                .build();

        GameDataResponse response = GameDataResponse.builder()
                .gameStatus("live")
                .unlockTrigger("CHECK_IN")
                .bases(List.of())
                .challenges(List.of(safeChallenge))
                .assignments(List.of())
                .progress(List.of())
                .build();

        when(playerService.getGameData(eq(gameId), any(Player.class))).thenReturn(response);

        mockMvc.perform(get("/api/player/games/" + gameId + "/data"))
                .andExpect(status().isOk())
                // Field-level guardrail: no `operatorNotes` anywhere in the
                // challenges array. A regression that reintroduces the
                // operator-facing ChallengeResponse here would surface as
                // a Jackson-serialized `operatorNotes` key and fail this
                // assertion.
                .andExpect(jsonPath("$.challenges[0].title").value("Find the tree"))
                .andExpect(jsonPath("$.challenges[0].operatorNotes").doesNotExist())
                // Belt-and-braces: correctAnswer must also be absent from
                // the player view.
                .andExpect(jsonPath("$.challenges[0].correctAnswer").doesNotExist());
    }

    @Test
    void getGameDataResponseStringDoesNotContainOperatorNotesKeyAnywhere() throws Exception {
        UUID gameId = UUID.randomUUID();
        UUID challengeId = UUID.randomUUID();

        PlayerChallengeResponse safeChallenge = PlayerChallengeResponse.builder()
                .id(challengeId)
                .gameId(gameId)
                .title("Find the tree")
                .description("desc")
                .content("content")
                .completionContent("done")
                .answerType("text")
                .autoValidate(false)
                .points(50)
                .locationBound(false)
                .requirePresenceToSubmit(false)
                .build();

        GameDataResponse response = GameDataResponse.builder()
                .gameStatus("live")
                .unlockTrigger("CHECK_IN")
                .bases(List.of())
                .challenges(List.of(safeChallenge))
                .assignments(List.of())
                .progress(List.of())
                .build();

        when(playerService.getGameData(eq(gameId), any(Player.class))).thenReturn(response);

        String body = mockMvc.perform(get("/api/player/games/" + gameId + "/data"))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString();

        // Absolute, case-insensitive substring check on the entire body:
        // no variant of "operatorNotes" is allowed anywhere in the
        // player-facing JSON, at any nesting depth. This survives future
        // DTO restructuring that might add new nested fields.
        assertThat(body.toLowerCase()).doesNotContain("operatornotes");
    }

    // ── P1 Phase 4 W3: operator-only base/challenge tags & color ─────
    //
    // These tests are the non-negotiable part of the operator-only
    // base/challenge tags and color feature. If any of them fail, the
    // feature has leaked operator-only setup metadata into a
    // player-facing response and the regression MUST be fixed before
    // merging. Mirrors the W2 operatorNotes pattern.

    @Test
    void getGameDataResponseDoesNotLeakBaseTagsOrColor() throws Exception {
        UUID gameId = UUID.randomUUID();
        UUID baseId = UUID.randomUUID();
        UUID challengeId = UUID.randomUUID();

        // PlayerBaseResponse is structurally incapable of carrying the
        // operator-only `tags` and `color` fields — they do not exist on
        // the DTO. This guarantees at the type level that PlayerService
        // cannot leak setup-organization metadata into this endpoint's
        // response. The test below additionally asserts at the JSON layer
        // that the fields never appear in the serialized body, so a
        // future regression that reintroduces BaseResponse into
        // GameDataResponse would fail loudly.
        PlayerBaseResponse safeBase = PlayerBaseResponse.builder()
                .id(baseId)
                .gameId(gameId)
                .name("Forest Clearing")
                .description("Near the old oak")
                .lat(47.3769)
                .lng(8.5417)
                .nfcLinked(true)
                .hidden(false)
                .fixedChallengeId(challengeId)
                .build();

        PlayerChallengeResponse safeChallenge = PlayerChallengeResponse.builder()
                .id(challengeId)
                .gameId(gameId)
                .title("Find the tree")
                .description("Locate the oldest tree")
                .content("Full instructions")
                .completionContent("Well done!")
                .answerType("text")
                .autoValidate(false)
                .points(100)
                .locationBound(false)
                .requirePresenceToSubmit(false)
                .build();

        GameDataResponse response = GameDataResponse.builder()
                .gameStatus("live")
                .unlockTrigger("CHECK_IN")
                .bases(List.of(safeBase))
                .challenges(List.of(safeChallenge))
                .assignments(List.of())
                .progress(List.of())
                .build();

        when(playerService.getGameData(eq(gameId), any(Player.class))).thenReturn(response);

        mockMvc.perform(get("/api/player/games/" + gameId + "/data"))
                .andExpect(status().isOk())
                // Field-level guardrails: no `tags` or `color` anywhere in
                // the bases or challenges arrays. A regression that
                // reintroduces the operator-facing BaseResponse /
                // ChallengeResponse here would surface as Jackson-serialized
                // keys and fail these assertions.
                .andExpect(jsonPath("$.bases[0].name").value("Forest Clearing"))
                .andExpect(jsonPath("$.bases[0].tags").doesNotExist())
                .andExpect(jsonPath("$.bases[0].color").doesNotExist())
                .andExpect(jsonPath("$.challenges[0].title").value("Find the tree"))
                .andExpect(jsonPath("$.challenges[0].tags").doesNotExist())
                .andExpect(jsonPath("$.challenges[0].color").doesNotExist());
    }

    @Test
    void getGameDataResponseStringDoesNotContainTagsOrColorAtAnyDepth() throws Exception {
        UUID gameId = UUID.randomUUID();
        UUID baseId = UUID.randomUUID();
        UUID challengeId = UUID.randomUUID();

        PlayerBaseResponse safeBase = PlayerBaseResponse.builder()
                .id(baseId)
                .gameId(gameId)
                .name("Trailhead")
                .description("")
                .lat(47.3769)
                .lng(8.5417)
                .nfcLinked(false)
                .hidden(false)
                .fixedChallengeId(null)
                .build();

        PlayerChallengeResponse safeChallenge = PlayerChallengeResponse.builder()
                .id(challengeId)
                .gameId(gameId)
                .title("Find the tree")
                .description("desc")
                .content("content")
                .completionContent("done")
                .answerType("text")
                .autoValidate(false)
                .points(50)
                .locationBound(false)
                .requirePresenceToSubmit(false)
                .build();

        GameDataResponse response = GameDataResponse.builder()
                .gameStatus("live")
                .unlockTrigger("CHECK_IN")
                .bases(List.of(safeBase))
                .challenges(List.of(safeChallenge))
                .assignments(List.of())
                .progress(List.of())
                .build();

        when(playerService.getGameData(eq(gameId), any(Player.class))).thenReturn(response);

        String body = mockMvc.perform(get("/api/player/games/" + gameId + "/data"))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString();

        // Absolute, case-insensitive substring check on the entire body:
        // no variant of "tags" or "color" is allowed anywhere in the
        // player-facing JSON, at any nesting depth. This survives future
        // DTO restructuring that might add new nested fields.
        //
        // Note: this is safe because none of the player-facing DTOs in
        // GameDataResponse (PlayerBaseResponse, PlayerChallengeResponse,
        // AssignmentResponse, BaseProgressResponse) carry any field named
        // `tags` or `color`. A regression that reintroduces either would
        // fail here.
        String lowered = body.toLowerCase();
        assertThat(lowered).doesNotContain("\"tags\"");
        assertThat(lowered).doesNotContain("\"color\"");
    }
}
