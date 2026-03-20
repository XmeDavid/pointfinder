package com.prayer.pointfinder.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.prayer.pointfinder.dto.request.ReviewStatus;
import com.prayer.pointfinder.dto.request.ReviewSubmissionRequest;
import com.prayer.pointfinder.dto.response.SubmissionResponse;
import com.prayer.pointfinder.exception.GlobalExceptionHandler;
import com.prayer.pointfinder.security.JwtAuthenticationFilter;
import com.prayer.pointfinder.service.SubmissionService;
import org.junit.jupiter.api.Test;
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
                .andExpect(jsonPath("$[0].answer").value("42"))
                .andExpect(jsonPath("$[0].status").value("pending"));
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
    }

    // ── Create submission with missing fields ───────────────────────

    @Test
    void createSubmissionWithMissingFieldsReturns400() throws Exception {
        UUID gameId = UUID.randomUUID();

        // Missing teamId, challengeId, baseId (all @NotNull)
        String body = "{}";

        mockMvc.perform(post("/api/games/" + gameId + "/submissions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isBadRequest());
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
}
