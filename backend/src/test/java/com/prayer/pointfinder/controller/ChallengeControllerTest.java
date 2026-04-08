package com.prayer.pointfinder.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.prayer.pointfinder.dto.request.CreateChallengeRequest;
import com.prayer.pointfinder.dto.request.UpdateChallengeRequest;
import com.prayer.pointfinder.dto.response.ChallengeResponse;
import com.prayer.pointfinder.exception.GlobalExceptionHandler;
import com.prayer.pointfinder.exception.ResourceNotFoundException;
import com.prayer.pointfinder.security.JwtAuthenticationFilter;
import com.prayer.pointfinder.service.ChallengeService;
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

@WebMvcTest(ChallengeController.class)
@AutoConfigureMockMvc(addFilters = false)
@Import(GlobalExceptionHandler.class)
class ChallengeControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockitoBean
    private ChallengeService challengeService;

    @MockitoBean
    private JwtAuthenticationFilter jwtAuthenticationFilter;

    private static final UUID GAME_ID = UUID.randomUUID();
    private static final UUID CHALLENGE_ID = UUID.randomUUID();

    // ── GET /api/games/{gameId}/challenges ────────────────────────────

    @Test
    void getChallengesReturns200WithList() throws Exception {
        ChallengeResponse challenge = ChallengeResponse.builder()
                .id(CHALLENGE_ID)
                .gameId(GAME_ID)
                .title("Find the flag")
                .description("Locate the hidden flag")
                .answerType("text")
                .points(100)
                .locationBound(false)
                .autoValidate(false)
                .requirePresenceToSubmit(false)
                .build();

        when(challengeService.getChallengesByGame(GAME_ID)).thenReturn(List.of(challenge));

        mockMvc.perform(get("/api/games/" + GAME_ID + "/challenges"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(CHALLENGE_ID.toString()))
                .andExpect(jsonPath("$[0].title").value("Find the flag"))
                .andExpect(jsonPath("$[0].points").value(100));
    }

    @Test
    void getChallengesReturnsEmptyList() throws Exception {
        when(challengeService.getChallengesByGame(GAME_ID)).thenReturn(List.of());

        mockMvc.perform(get("/api/games/" + GAME_ID + "/challenges"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray())
                .andExpect(jsonPath("$").isEmpty());
    }

    // ── POST /api/games/{gameId}/challenges ───────────────────────────

    @Test
    void createChallengeWithValidBodyReturns201() throws Exception {
        CreateChallengeRequest request = new CreateChallengeRequest();
        request.setTitle("Find the flag");
        request.setDescription("Locate the hidden flag");
        request.setAnswerType("text");
        request.setPoints(100);

        ChallengeResponse response = ChallengeResponse.builder()
                .id(CHALLENGE_ID)
                .gameId(GAME_ID)
                .title("Find the flag")
                .description("Locate the hidden flag")
                .answerType("text")
                .points(100)
                .locationBound(false)
                .autoValidate(false)
                .requirePresenceToSubmit(false)
                .build();

        when(challengeService.createChallenge(eq(GAME_ID), any(CreateChallengeRequest.class))).thenReturn(response);

        mockMvc.perform(post("/api/games/" + GAME_ID + "/challenges")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(CHALLENGE_ID.toString()))
                .andExpect(jsonPath("$.title").value("Find the flag"))
                .andExpect(jsonPath("$.answerType").value("text"))
                .andExpect(jsonPath("$.points").value(100));
    }

    @Test
    void createChallengeWithMissingTitleReturns400() throws Exception {
        CreateChallengeRequest request = new CreateChallengeRequest();
        // title not set - @NotBlank should reject
        request.setAnswerType("text");
        request.setPoints(100);

        mockMvc.perform(post("/api/games/" + GAME_ID + "/challenges")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.title").exists());
    }

    @Test
    void createChallengeWithMissingAnswerTypeReturns400() throws Exception {
        CreateChallengeRequest request = new CreateChallengeRequest();
        request.setTitle("Find the flag");
        // answerType not set - @NotBlank should reject
        request.setPoints(100);

        mockMvc.perform(post("/api/games/" + GAME_ID + "/challenges")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.answerType").exists());
    }

    @Test
    void createChallengeWithMissingPointsReturns400() throws Exception {
        CreateChallengeRequest request = new CreateChallengeRequest();
        request.setTitle("Find the flag");
        request.setAnswerType("text");
        request.setPoints(null); // @NotNull should reject

        mockMvc.perform(post("/api/games/" + GAME_ID + "/challenges")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.points").exists());
    }

    @Test
    void createChallengeWithNegativePointsReturns400() throws Exception {
        CreateChallengeRequest request = new CreateChallengeRequest();
        request.setTitle("Find the flag");
        request.setAnswerType("text");
        request.setPoints(-1); // @Min(0) should reject

        mockMvc.perform(post("/api/games/" + GAME_ID + "/challenges")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.points").exists());
    }

    @Test
    void createChallengeWithExcessivePointsReturns400() throws Exception {
        CreateChallengeRequest request = new CreateChallengeRequest();
        request.setTitle("Find the flag");
        request.setAnswerType("text");
        request.setPoints(100001); // @Max(100000) should reject

        mockMvc.perform(post("/api/games/" + GAME_ID + "/challenges")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.points").exists());
    }

    // ── PUT /api/games/{gameId}/challenges/{challengeId} ──────────────

    @Test
    void updateChallengeWithValidBodyReturns200() throws Exception {
        UpdateChallengeRequest request = new UpdateChallengeRequest();
        request.setTitle("Updated challenge");
        request.setAnswerType("photo");
        request.setPoints(200);

        ChallengeResponse response = ChallengeResponse.builder()
                .id(CHALLENGE_ID)
                .gameId(GAME_ID)
                .title("Updated challenge")
                .answerType("photo")
                .points(200)
                .locationBound(false)
                .autoValidate(false)
                .requirePresenceToSubmit(false)
                .build();

        when(challengeService.updateChallenge(eq(GAME_ID), eq(CHALLENGE_ID), any(UpdateChallengeRequest.class)))
                .thenReturn(response);

        mockMvc.perform(put("/api/games/" + GAME_ID + "/challenges/" + CHALLENGE_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("Updated challenge"))
                .andExpect(jsonPath("$.answerType").value("photo"))
                .andExpect(jsonPath("$.points").value(200));
    }

    @Test
    void updateChallengeNotFoundReturns404() throws Exception {
        UpdateChallengeRequest request = new UpdateChallengeRequest();
        request.setTitle("Updated challenge");
        request.setAnswerType("text");
        request.setPoints(100);

        when(challengeService.updateChallenge(eq(GAME_ID), eq(CHALLENGE_ID), any(UpdateChallengeRequest.class)))
                .thenThrow(new ResourceNotFoundException("Challenge", CHALLENGE_ID));

        mockMvc.perform(put("/api/games/" + GAME_ID + "/challenges/" + CHALLENGE_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message").exists());
    }

    // ── DELETE /api/games/{gameId}/challenges/{challengeId} ───────────

    @Test
    void deleteChallengeReturns204() throws Exception {
        doNothing().when(challengeService).deleteChallenge(GAME_ID, CHALLENGE_ID);

        mockMvc.perform(delete("/api/games/" + GAME_ID + "/challenges/" + CHALLENGE_ID))
                .andExpect(status().isNoContent());
    }

    @Test
    void deleteChallengeNotFoundReturns404() throws Exception {
        doThrow(new ResourceNotFoundException("Challenge", CHALLENGE_ID))
                .when(challengeService).deleteChallenge(GAME_ID, CHALLENGE_ID);

        mockMvc.perform(delete("/api/games/" + GAME_ID + "/challenges/" + CHALLENGE_ID))
                .andExpect(status().isNotFound());
    }

    // ── P1 Phase 4 W2: operator-only challenge notes ──────────────────

    @Test
    void getChallengesExposesOperatorNotesInOperatorFacingResponse() throws Exception {
        ChallengeResponse challenge = ChallengeResponse.builder()
                .id(CHALLENGE_ID)
                .gameId(GAME_ID)
                .title("Find the flag")
                .description("Locate the hidden flag")
                .answerType("text")
                .points(100)
                .locationBound(false)
                .autoValidate(false)
                .requirePresenceToSubmit(false)
                .operatorNotes("Radio the trail lead before starting")
                .build();

        when(challengeService.getChallengesByGame(GAME_ID)).thenReturn(List.of(challenge));

        mockMvc.perform(get("/api/games/" + GAME_ID + "/challenges"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].operatorNotes").value("Radio the trail lead before starting"));
    }

    @Test
    void createChallengeAcceptsOperatorNotesAndEchoesThemInResponse() throws Exception {
        CreateChallengeRequest request = new CreateChallengeRequest();
        request.setTitle("Find the flag");
        request.setAnswerType("text");
        request.setPoints(100);
        request.setOperatorNotes("Equipment: blue flag, 30m rope");

        ChallengeResponse response = ChallengeResponse.builder()
                .id(CHALLENGE_ID)
                .gameId(GAME_ID)
                .title("Find the flag")
                .answerType("text")
                .points(100)
                .locationBound(false)
                .autoValidate(false)
                .requirePresenceToSubmit(false)
                .operatorNotes("Equipment: blue flag, 30m rope")
                .build();

        when(challengeService.createChallenge(eq(GAME_ID), any(CreateChallengeRequest.class))).thenReturn(response);

        mockMvc.perform(post("/api/games/" + GAME_ID + "/challenges")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.operatorNotes").value("Equipment: blue flag, 30m rope"));
    }

    @Test
    void createChallengeRejectsOperatorNotesExceedingFiveThousandChars() throws Exception {
        CreateChallengeRequest request = new CreateChallengeRequest();
        request.setTitle("Too chatty");
        request.setAnswerType("text");
        request.setPoints(100);
        request.setOperatorNotes("x".repeat(5001)); // @Size(max = 5000) should reject

        mockMvc.perform(post("/api/games/" + GAME_ID + "/challenges")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.operatorNotes").exists());
    }

    // ── P1 Phase 4 W3: operator-only challenge tag IDs ───────────────

    @Test
    void getChallengeExposesTagIds() throws Exception {
        UUID tagId1 = UUID.randomUUID();
        UUID tagId2 = UUID.randomUUID();
        ChallengeResponse challenge = ChallengeResponse.builder()
                .id(CHALLENGE_ID)
                .gameId(GAME_ID)
                .title("Find the flag")
                .description("Locate the hidden flag")
                .answerType("text")
                .points(100)
                .locationBound(false)
                .autoValidate(false)
                .requirePresenceToSubmit(false)
                .tagIds(List.of(tagId1, tagId2))
                .build();

        when(challengeService.getChallengesByGame(GAME_ID)).thenReturn(List.of(challenge));

        mockMvc.perform(get("/api/games/" + GAME_ID + "/challenges"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].tagIds[0]").value(tagId1.toString()))
                .andExpect(jsonPath("$[0].tagIds[1]").value(tagId2.toString()))
                .andExpect(jsonPath("$[0].tags").doesNotExist())
                .andExpect(jsonPath("$[0].color").doesNotExist());
    }

    @Test
    void createChallengeRejectsMoreThan20TagIds() throws Exception {
        CreateChallengeRequest request = new CreateChallengeRequest();
        request.setTitle("Too many tags");
        request.setAnswerType("text");
        request.setPoints(100);
        List<UUID> tooMany = new java.util.ArrayList<>();
        for (int i = 0; i < 21; i++) {
            tooMany.add(UUID.randomUUID());
        }
        request.setTagIds(tooMany);

        mockMvc.perform(post("/api/games/" + GAME_ID + "/challenges")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.tagIds").exists());
    }
}
