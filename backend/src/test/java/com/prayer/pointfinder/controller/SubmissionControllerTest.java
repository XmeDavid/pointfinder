package com.prayer.pointfinder.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.prayer.pointfinder.dto.request.CreateSubmissionRequest;
import com.prayer.pointfinder.dto.request.ReviewStatus;
import com.prayer.pointfinder.dto.request.ReviewSubmissionRequest;
import com.prayer.pointfinder.dto.response.SubmissionResponse;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.exception.ConflictException;
import com.prayer.pointfinder.exception.GlobalExceptionHandler;
import com.prayer.pointfinder.exception.ResourceNotFoundException;
import com.prayer.pointfinder.security.JwtAuthenticationFilter;
import com.prayer.pointfinder.service.SubmissionService;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
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
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(SubmissionController.class)
@AutoConfigureMockMvc(addFilters = false)
@Import(GlobalExceptionHandler.class)
class SubmissionControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockBean
    private SubmissionService submissionService;

    @MockBean
    private JwtAuthenticationFilter jwtAuthenticationFilter;

    // ── List submissions ────────────────────────────────────────────

    @Test
    void getSubmissionsReturnsList() throws Exception {
        UUID gameId = UUID.randomUUID();
        UUID submissionId = UUID.randomUUID();
        UUID teamId = UUID.randomUUID();
        UUID challengeId = UUID.randomUUID();
        UUID baseId = UUID.randomUUID();

        SubmissionResponse sub = SubmissionResponse.builder()
                .id(submissionId)
                .teamId(teamId)
                .challengeId(challengeId)
                .baseId(baseId)
                .answer("42")
                .status("pending")
                .submittedAt(Instant.now())
                .build();

        when(submissionService.getSubmissionsByGame(gameId)).thenReturn(List.of(sub));

        mockMvc.perform(get("/api/games/" + gameId + "/submissions"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(submissionId.toString()))
                .andExpect(jsonPath("$[0].teamId").value(teamId.toString()))
                .andExpect(jsonPath("$[0].challengeId").value(challengeId.toString()))
                .andExpect(jsonPath("$[0].baseId").value(baseId.toString()))
                .andExpect(jsonPath("$[0].answer").value("42"))
                .andExpect(jsonPath("$[0].status").value("pending"));
    }

    @Test
    void getSubmissionsForUnknownGameReturns404() throws Exception {
        UUID unknownId = UUID.randomUUID();
        when(submissionService.getSubmissionsByGame(unknownId))
                .thenThrow(new ResourceNotFoundException("Game not found: " + unknownId));

        mockMvc.perform(get("/api/games/" + unknownId + "/submissions"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message").value("Game not found: " + unknownId));
    }

    @Test
    void getSubmissionsFiltersByTeamId() throws Exception {
        UUID gameId = UUID.randomUUID();
        UUID teamId = UUID.randomUUID();
        UUID submissionId = UUID.randomUUID();

        SubmissionResponse sub = SubmissionResponse.builder()
                .id(submissionId)
                .teamId(teamId)
                .challengeId(UUID.randomUUID())
                .baseId(UUID.randomUUID())
                .answer("answer")
                .status("pending")
                .submittedAt(Instant.now())
                .build();

        when(submissionService.getSubmissionsByTeam(gameId, teamId)).thenReturn(List.of(sub));

        mockMvc.perform(get("/api/games/" + gameId + "/submissions")
                        .param("teamId", teamId.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].teamId").value(teamId.toString()));

        // Verify it routes to the team-filtered method, not the game-wide method
        verify(submissionService).getSubmissionsByTeam(gameId, teamId);
    }

    @Test
    void getSubmissionsByTeamForUnknownTeamReturns404() throws Exception {
        UUID gameId = UUID.randomUUID();
        UUID unknownTeamId = UUID.randomUUID();

        when(submissionService.getSubmissionsByTeam(gameId, unknownTeamId))
                .thenThrow(new ResourceNotFoundException("Team not found: " + unknownTeamId));

        mockMvc.perform(get("/api/games/" + gameId + "/submissions")
                        .param("teamId", unknownTeamId.toString()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message").value("Team not found: " + unknownTeamId));
    }

    // ── Create submission ───────────────────────────────────────────

    @Test
    void createSubmissionWithMissingFieldsReturns400() throws Exception {
        UUID gameId = UUID.randomUUID();

        // Missing teamId, challengeId, baseId (all @NotNull)
        mockMvc.perform(post("/api/games/" + gameId + "/submissions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors").exists());
    }

    @Test
    void createSubmissionWithMissingTeamIdReturns400() throws Exception {
        UUID gameId = UUID.randomUUID();
        // teamId is @NotNull — omit it
        String body = "{\"challengeId\":\"" + UUID.randomUUID() + "\",\"baseId\":\"" + UUID.randomUUID() + "\"}";

        mockMvc.perform(post("/api/games/" + gameId + "/submissions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.teamId").exists());
    }

    @Test
    void createSubmissionWithValidBodyReturns201() throws Exception {
        UUID gameId = UUID.randomUUID();
        UUID teamId = UUID.randomUUID();
        UUID challengeId = UUID.randomUUID();
        UUID baseId = UUID.randomUUID();
        UUID submissionId = UUID.randomUUID();

        CreateSubmissionRequest request = new CreateSubmissionRequest();
        request.setTeamId(teamId);
        request.setChallengeId(challengeId);
        request.setBaseId(baseId);
        request.setAnswer("correct answer");

        SubmissionResponse response = SubmissionResponse.builder()
                .id(submissionId).teamId(teamId).challengeId(challengeId).baseId(baseId)
                .answer("correct answer").status("pending").submittedAt(Instant.now())
                .build();

        when(submissionService.createSubmission(eq(gameId), any(CreateSubmissionRequest.class)))
                .thenReturn(response);

        mockMvc.perform(post("/api/games/" + gameId + "/submissions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(submissionId.toString()))
                .andExpect(jsonPath("$.status").value("pending"))
                .andExpect(jsonPath("$.answer").value("correct answer"));
    }

    @Test
    void createSubmissionWithDuplicateIdempotencyKeyReturns409() throws Exception {
        UUID gameId = UUID.randomUUID();
        UUID idempotencyKey = UUID.randomUUID();

        CreateSubmissionRequest request = new CreateSubmissionRequest();
        request.setTeamId(UUID.randomUUID());
        request.setChallengeId(UUID.randomUUID());
        request.setBaseId(UUID.randomUUID());
        request.setIdempotencyKey(idempotencyKey);

        when(submissionService.createSubmission(eq(gameId), any(CreateSubmissionRequest.class)))
                .thenThrow(new ConflictException("A submission with this idempotency key already exists"));

        mockMvc.perform(post("/api/games/" + gameId + "/submissions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("A submission with this idempotency key already exists"));
    }

    // ── Review submission ───────────────────────────────────────────

    @Test
    void reviewSubmissionApproveReturnsUpdated() throws Exception {
        UUID gameId = UUID.randomUUID();
        UUID submissionId = UUID.randomUUID();
        UUID teamId = UUID.randomUUID();
        UUID challengeId = UUID.randomUUID();
        UUID baseId = UUID.randomUUID();
        UUID reviewerId = UUID.randomUUID();

        ReviewSubmissionRequest request = new ReviewSubmissionRequest();
        request.setStatus(ReviewStatus.approved);
        request.setPoints(50);

        SubmissionResponse response = SubmissionResponse.builder()
                .id(submissionId)
                .teamId(teamId)
                .challengeId(challengeId)
                .baseId(baseId)
                .answer("42")
                .status("approved")
                .submittedAt(Instant.now())
                .reviewedBy(reviewerId)
                .points(50)
                .build();

        when(submissionService.reviewSubmission(eq(gameId), eq(submissionId), any(ReviewSubmissionRequest.class)))
                .thenReturn(response);

        mockMvc.perform(patch("/api/games/" + gameId + "/submissions/" + submissionId + "/review")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("approved"))
                .andExpect(jsonPath("$.points").value(50))
                .andExpect(jsonPath("$.reviewedBy").value(reviewerId.toString()));
    }

    @Test
    void reviewSubmissionPassesCorrectIdsAndStatusToService() throws Exception {
        UUID gameId = UUID.randomUUID();
        UUID submissionId = UUID.randomUUID();

        ReviewSubmissionRequest request = new ReviewSubmissionRequest();
        request.setStatus(ReviewStatus.approved);
        request.setPoints(75);

        when(submissionService.reviewSubmission(eq(gameId), eq(submissionId), any(ReviewSubmissionRequest.class)))
                .thenReturn(SubmissionResponse.builder()
                        .id(submissionId).teamId(UUID.randomUUID()).challengeId(UUID.randomUUID())
                        .baseId(UUID.randomUUID()).answer("a").status("approved")
                        .submittedAt(Instant.now()).points(75).build());

        mockMvc.perform(patch("/api/games/" + gameId + "/submissions/" + submissionId + "/review")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk());

        ArgumentCaptor<ReviewSubmissionRequest> captor = ArgumentCaptor.forClass(ReviewSubmissionRequest.class);
        verify(submissionService).reviewSubmission(eq(gameId), eq(submissionId), captor.capture());
        assertThat(captor.getValue().getStatus()).isEqualTo(ReviewStatus.approved);
        assertThat(captor.getValue().getPoints()).isEqualTo(75);
    }

    @Test
    void reviewSubmissionRejectIncludesFeedback() throws Exception {
        UUID gameId = UUID.randomUUID();
        UUID submissionId = UUID.randomUUID();

        ReviewSubmissionRequest request = new ReviewSubmissionRequest();
        request.setStatus(ReviewStatus.rejected);
        request.setFeedback("Wrong answer, try again");

        SubmissionResponse response = SubmissionResponse.builder()
                .id(submissionId)
                .teamId(UUID.randomUUID())
                .challengeId(UUID.randomUUID())
                .baseId(UUID.randomUUID())
                .answer("wrong")
                .status("rejected")
                .submittedAt(Instant.now())
                .feedback("Wrong answer, try again")
                .build();

        when(submissionService.reviewSubmission(eq(gameId), eq(submissionId), any(ReviewSubmissionRequest.class)))
                .thenReturn(response);

        mockMvc.perform(patch("/api/games/" + gameId + "/submissions/" + submissionId + "/review")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("rejected"))
                .andExpect(jsonPath("$.feedback").value("Wrong answer, try again"));
    }

    @Test
    void reviewSubmissionWithMissingStatusReturns400() throws Exception {
        UUID gameId = UUID.randomUUID();
        UUID submissionId = UUID.randomUUID();

        // status is @NotNull — omit it
        mockMvc.perform(patch("/api/games/" + gameId + "/submissions/" + submissionId + "/review")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.status").exists());
    }

    @Test
    void reviewSubmissionWithNegativePointsReturns400() throws Exception {
        UUID gameId = UUID.randomUUID();
        UUID submissionId = UUID.randomUUID();

        ReviewSubmissionRequest request = new ReviewSubmissionRequest();
        request.setStatus(ReviewStatus.approved);
        request.setPoints(-1); // violates @Min(0)

        mockMvc.perform(patch("/api/games/" + gameId + "/submissions/" + submissionId + "/review")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.points").exists());
    }

    @Test
    void reviewSubmissionWithPointsExceedingMaxReturns400() throws Exception {
        UUID gameId = UUID.randomUUID();
        UUID submissionId = UUID.randomUUID();

        ReviewSubmissionRequest request = new ReviewSubmissionRequest();
        request.setStatus(ReviewStatus.approved);
        request.setPoints(100001); // violates @Max(100000)

        mockMvc.perform(patch("/api/games/" + gameId + "/submissions/" + submissionId + "/review")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.points").exists());
    }

    @Test
    void reviewSubmissionWithPointsAtMaxBoundaryReturns200() throws Exception {
        UUID gameId = UUID.randomUUID();
        UUID submissionId = UUID.randomUUID();

        ReviewSubmissionRequest request = new ReviewSubmissionRequest();
        request.setStatus(ReviewStatus.approved);
        request.setPoints(100000); // exactly @Max(100000) — valid

        when(submissionService.reviewSubmission(eq(gameId), eq(submissionId), any(ReviewSubmissionRequest.class)))
                .thenReturn(SubmissionResponse.builder()
                        .id(submissionId).teamId(UUID.randomUUID()).challengeId(UUID.randomUUID())
                        .baseId(UUID.randomUUID()).answer("a").status("approved")
                        .submittedAt(Instant.now()).points(100000).build());

        mockMvc.perform(patch("/api/games/" + gameId + "/submissions/" + submissionId + "/review")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.points").value(100000));
    }

    @Test
    void reviewSubmissionForUnknownSubmissionReturns404() throws Exception {
        UUID gameId = UUID.randomUUID();
        UUID unknownId = UUID.randomUUID();

        ReviewSubmissionRequest request = new ReviewSubmissionRequest();
        request.setStatus(ReviewStatus.approved);
        request.setPoints(10);

        when(submissionService.reviewSubmission(eq(gameId), eq(unknownId), any(ReviewSubmissionRequest.class)))
                .thenThrow(new ResourceNotFoundException("Submission not found: " + unknownId));

        mockMvc.perform(patch("/api/games/" + gameId + "/submissions/" + unknownId + "/review")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message").value("Submission not found: " + unknownId));
    }

    @Test
    void reviewAlreadyReviewedSubmissionReturns400() throws Exception {
        UUID gameId = UUID.randomUUID();
        UUID submissionId = UUID.randomUUID();

        ReviewSubmissionRequest request = new ReviewSubmissionRequest();
        request.setStatus(ReviewStatus.approved);
        request.setPoints(10);

        when(submissionService.reviewSubmission(eq(gameId), eq(submissionId), any(ReviewSubmissionRequest.class)))
                .thenThrow(new BadRequestException("Submission has already been reviewed"));

        mockMvc.perform(patch("/api/games/" + gameId + "/submissions/" + submissionId + "/review")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Submission has already been reviewed"));
    }
}
