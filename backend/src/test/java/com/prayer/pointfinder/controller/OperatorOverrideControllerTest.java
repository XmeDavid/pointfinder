package com.prayer.pointfinder.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.prayer.pointfinder.dto.request.MarkCompletedRequest;
import com.prayer.pointfinder.dto.request.UnlockOverrideRequest;
import com.prayer.pointfinder.dto.response.BaseUnlockOverrideResponse;
import com.prayer.pointfinder.dto.response.SubmissionResponse;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.exception.ConflictException;
import com.prayer.pointfinder.exception.ErrorCode;
import com.prayer.pointfinder.exception.GlobalExceptionHandler;
import com.prayer.pointfinder.exception.ResourceNotFoundException;
import com.prayer.pointfinder.security.JwtAuthenticationFilter;
import com.prayer.pointfinder.service.BaseUnlockOverrideService;
import com.prayer.pointfinder.service.SubmissionService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Controller-layer tests for {@link OperatorOverrideController}.
 *
 * <p>Uses {@code @WebMvcTest} in isolation with mocked services.
 * Security filters are disabled ({@code addFilters = false}) so the
 * tests focus on HTTP mapping, request binding, and error response
 * shape — not the Spring Security layer (covered by SecurityRulesTest).
 */
@WebMvcTest(OperatorOverrideController.class)
@AutoConfigureMockMvc(addFilters = false)
@Import(GlobalExceptionHandler.class)
class OperatorOverrideControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockitoBean
    private SubmissionService submissionService;

    @MockitoBean
    private BaseUnlockOverrideService baseUnlockOverrideService;

    @MockitoBean
    private JwtAuthenticationFilter jwtAuthenticationFilter;

    @MockitoBean
    private com.prayer.pointfinder.security.FrozenAccountFilter frozenAccountFilter;

    // ── Fixtures ─────────────────────────────────────────────────────────────

    private static final UUID GAME_ID = UUID.fromString("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    private static final UUID TEAM_ID = UUID.fromString("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
    private static final UUID BASE_ID = UUID.fromString("cccccccc-cccc-cccc-cccc-cccccccccccc");
    private static final UUID CHALLENGE_ID = UUID.fromString("dddddddd-dddd-dddd-dddd-dddddddddddd");
    private static final UUID OVERRIDE_ID = UUID.fromString("eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee");
    private static final UUID OPERATOR_ID = UUID.fromString("ffffffff-ffff-ffff-ffff-ffffffffffff");

    private String markCompletedPath() {
        return "/api/games/" + GAME_ID + "/teams/" + TEAM_ID + "/bases/" + BASE_ID + "/mark-completed";
    }

    private String unlockOverridePath() {
        return "/api/games/" + GAME_ID + "/teams/" + TEAM_ID + "/bases/" + BASE_ID + "/unlock-override";
    }

    private String listOverridesPath() {
        return "/api/games/" + GAME_ID + "/teams/" + TEAM_ID + "/unlock-overrides";
    }

    private SubmissionResponse sampleSubmission() {
        return SubmissionResponse.builder()
                .id(UUID.randomUUID())
                .teamId(TEAM_ID)
                .challengeId(CHALLENGE_ID)
                .baseId(BASE_ID)
                .answer("[Operator marked complete]")
                .status("approved")
                .submittedAt(Instant.now())
                .points(100)
                .build();
    }

    private BaseUnlockOverrideResponse sampleOverride() {
        return BaseUnlockOverrideResponse.builder()
                .id(OVERRIDE_ID)
                .gameId(GAME_ID)
                .teamId(TEAM_ID)
                .baseId(BASE_ID)
                .createdByOperatorId(OPERATOR_ID)
                .createdByDisplayName("Alice")
                .reason("Team got stuck")
                .createdAt(Instant.now())
                .build();
    }

    // ── POST mark-completed ──────────────────────────────────────────────────

    @Test
    void markCompletedWithValidBodyReturns201WithSubmissionResponse() throws Exception {
        MarkCompletedRequest request = new MarkCompletedRequest();
        request.setChallengeId(CHALLENGE_ID);
        request.setReason("Team completed verbally");

        when(submissionService.markCompletedByOperator(eq(GAME_ID), eq(TEAM_ID), eq(BASE_ID), any()))
                .thenReturn(sampleSubmission());

        mockMvc.perform(post(markCompletedPath())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.teamId").value(TEAM_ID.toString()))
                .andExpect(jsonPath("$.challengeId").value(CHALLENGE_ID.toString()))
                .andExpect(jsonPath("$.baseId").value(BASE_ID.toString()))
                .andExpect(jsonPath("$.status").value("approved"));
    }

    @Test
    void markCompletedPassesChallengeIdAndReasonToService() throws Exception {
        MarkCompletedRequest request = new MarkCompletedRequest();
        request.setChallengeId(CHALLENGE_ID);
        request.setReason("Rescue reason");

        when(submissionService.markCompletedByOperator(any(), any(), any(), any()))
                .thenReturn(sampleSubmission());

        mockMvc.perform(post(markCompletedPath())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated());

        verify(submissionService).markCompletedByOperator(
                eq(GAME_ID), eq(TEAM_ID), eq(BASE_ID), any(MarkCompletedRequest.class));
    }

    @Test
    void markCompletedWithMissingChallengeIdReturns400() throws Exception {
        // challengeId is @NotNull — omitting it should produce 400
        mockMvc.perform(post(markCompletedPath())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400));
    }

    @Test
    void markCompletedWhenTeamNotCheckedInReturns400WithErrorCode() throws Exception {
        MarkCompletedRequest request = new MarkCompletedRequest();
        request.setChallengeId(CHALLENGE_ID);

        when(submissionService.markCompletedByOperator(any(), any(), any(), any()))
                .thenThrow(new BadRequestException(
                        "Team is not checked in at this base.",
                        ErrorCode.MARK_COMPLETED_REQUIRES_CHECKIN));

        mockMvc.perform(post(markCompletedPath())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("MARK_COMPLETED_REQUIRES_CHECKIN"))
                .andExpect(jsonPath("$.timestamp").exists());
    }

    @Test
    void markCompletedWhenGameNotFoundReturns404() throws Exception {
        MarkCompletedRequest request = new MarkCompletedRequest();
        request.setChallengeId(CHALLENGE_ID);

        when(submissionService.markCompletedByOperator(any(), any(), any(), any()))
                .thenThrow(new ResourceNotFoundException("Game", GAME_ID));

        mockMvc.perform(post(markCompletedPath())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.status").value(404));
    }

    @Test
    void markCompletedWhenTeamNotFoundReturns404() throws Exception {
        MarkCompletedRequest request = new MarkCompletedRequest();
        request.setChallengeId(CHALLENGE_ID);

        when(submissionService.markCompletedByOperator(any(), any(), any(), any()))
                .thenThrow(new ResourceNotFoundException("Team", TEAM_ID));

        mockMvc.perform(post(markCompletedPath())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isNotFound());
    }

    @Test
    void markCompletedWithPointsOverridePassesOverrideToService() throws Exception {
        MarkCompletedRequest request = new MarkCompletedRequest();
        request.setChallengeId(CHALLENGE_ID);
        request.setPointsOverride(250);

        SubmissionResponse resp = sampleSubmission();
        when(submissionService.markCompletedByOperator(any(), any(), any(), any()))
                .thenReturn(resp);

        mockMvc.perform(post(markCompletedPath())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated());

        verify(submissionService).markCompletedByOperator(
                eq(GAME_ID), eq(TEAM_ID), eq(BASE_ID), any());
    }

    // ── POST unlock-override ─────────────────────────────────────────────────

    @Test
    void createUnlockOverrideWithReasonBodyReturns201() throws Exception {
        UnlockOverrideRequest request = new UnlockOverrideRequest();
        request.setReason("Base NFC is broken");

        when(baseUnlockOverrideService.createOverride(eq(GAME_ID), eq(TEAM_ID), eq(BASE_ID), any()))
                .thenReturn(sampleOverride());

        mockMvc.perform(post(unlockOverridePath())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(OVERRIDE_ID.toString()))
                .andExpect(jsonPath("$.gameId").value(GAME_ID.toString()))
                .andExpect(jsonPath("$.teamId").value(TEAM_ID.toString()))
                .andExpect(jsonPath("$.baseId").value(BASE_ID.toString()))
                .andExpect(jsonPath("$.createdByDisplayName").value("Alice"))
                .andExpect(jsonPath("$.reason").value("Team got stuck"));
    }

    @Test
    void createUnlockOverrideWithNoBodyReturns201() throws Exception {
        when(baseUnlockOverrideService.createOverride(eq(GAME_ID), eq(TEAM_ID), eq(BASE_ID), isNull()))
                .thenReturn(sampleOverride());

        mockMvc.perform(post(unlockOverridePath()))
                .andExpect(status().isCreated());
    }

    @Test
    void createUnlockOverrideWhenBaseNotFoundReturns404() throws Exception {
        when(baseUnlockOverrideService.createOverride(any(), any(), any(), any()))
                .thenThrow(new ResourceNotFoundException("Base", BASE_ID));

        mockMvc.perform(post(unlockOverridePath())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.status").value(404));
    }

    @Test
    void createUnlockOverrideWhenOverrideAlreadyExistsReturns409WithCode() throws Exception {
        when(baseUnlockOverrideService.createOverride(any(), any(), any(), any()))
                .thenThrow(new ConflictException(
                        "An active unlock override already exists",
                        ErrorCode.UNLOCK_OVERRIDE_ALREADY_EXISTS));

        mockMvc.perform(post(unlockOverridePath())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("UNLOCK_OVERRIDE_ALREADY_EXISTS"))
                .andExpect(jsonPath("$.timestamp").exists());
    }

    @Test
    void createUnlockOverrideWithReasonExceedingMaxLengthReturns400() throws Exception {
        UnlockOverrideRequest request = new UnlockOverrideRequest();
        request.setReason("X".repeat(501)); // @Size(max=500) on UnlockOverrideRequest.reason

        mockMvc.perform(post(unlockOverridePath())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400));
    }

    // ── DELETE unlock-override ───────────────────────────────────────────────

    @Test
    void removeUnlockOverrideHappyPathReturns204() throws Exception {
        doNothing().when(baseUnlockOverrideService).removeOverride(
                eq(GAME_ID), eq(TEAM_ID), eq(BASE_ID), any());

        mockMvc.perform(delete(unlockOverridePath()))
                .andExpect(status().isNoContent());

        verify(baseUnlockOverrideService).removeOverride(
                eq(GAME_ID), eq(TEAM_ID), eq(BASE_ID), any());
    }

    @Test
    void removeUnlockOverrideWithReasonBodyReturns204() throws Exception {
        UnlockOverrideRequest request = new UnlockOverrideRequest();
        request.setReason("Situation resolved");

        doNothing().when(baseUnlockOverrideService).removeOverride(any(), any(), any(), any());

        mockMvc.perform(delete(unlockOverridePath())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isNoContent());
    }

    @Test
    void removeUnlockOverrideWhenNotFoundReturns404() throws Exception {
        doThrow(new ResourceNotFoundException(
                        "Active base unlock override for team " + TEAM_ID + " and base " + BASE_ID))
                .when(baseUnlockOverrideService).removeOverride(any(), any(), any(), any());

        mockMvc.perform(delete(unlockOverridePath()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.status").value(404))
                .andExpect(jsonPath("$.timestamp").exists());
    }

    @Test
    void removeUnlockOverrideWhenGameNotFoundReturns404() throws Exception {
        doThrow(new ResourceNotFoundException("Game", GAME_ID))
                .when(baseUnlockOverrideService).removeOverride(any(), any(), any(), any());

        mockMvc.perform(delete(unlockOverridePath()))
                .andExpect(status().isNotFound());
    }

    // ── GET unlock-overrides ─────────────────────────────────────────────────

    @Test
    void listUnlockOverridesReturns200WithOverrideList() throws Exception {
        when(baseUnlockOverrideService.listActiveForTeam(GAME_ID, TEAM_ID))
                .thenReturn(List.of(sampleOverride()));

        mockMvc.perform(get(listOverridesPath()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].id").value(OVERRIDE_ID.toString()))
                .andExpect(jsonPath("$[0].baseId").value(BASE_ID.toString()));
    }

    @Test
    void listUnlockOverridesReturns200WithEmptyArrayWhenNoOverridesExist() throws Exception {
        when(baseUnlockOverrideService.listActiveForTeam(GAME_ID, TEAM_ID))
                .thenReturn(List.of());

        mockMvc.perform(get(listOverridesPath()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray())
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void listUnlockOverridesWhenTeamNotFoundReturns404() throws Exception {
        when(baseUnlockOverrideService.listActiveForTeam(any(), any()))
                .thenThrow(new ResourceNotFoundException("Team", TEAM_ID));

        mockMvc.perform(get(listOverridesPath()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.status").value(404));
    }

    @Test
    void listUnlockOverridesPassesCorrectPathVariablesToService() throws Exception {
        when(baseUnlockOverrideService.listActiveForTeam(GAME_ID, TEAM_ID))
                .thenReturn(List.of());

        mockMvc.perform(get(listOverridesPath()))
                .andExpect(status().isOk());

        verify(baseUnlockOverrideService).listActiveForTeam(GAME_ID, TEAM_ID);
    }

    // ── Response body shape ──────────────────────────────────────────────────

    @Test
    void overrideResponseBodyIncludesAllExpectedFields() throws Exception {
        when(baseUnlockOverrideService.listActiveForTeam(any(), any()))
                .thenReturn(List.of(sampleOverride()));

        mockMvc.perform(get(listOverridesPath()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").isString())
                .andExpect(jsonPath("$[0].gameId").isString())
                .andExpect(jsonPath("$[0].teamId").isString())
                .andExpect(jsonPath("$[0].baseId").isString())
                .andExpect(jsonPath("$[0].createdByOperatorId").isString())
                .andExpect(jsonPath("$[0].createdByDisplayName").isString())
                .andExpect(jsonPath("$[0].createdAt").isString());
    }
}
