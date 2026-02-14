package com.prayer.pointfinder.controller;

import com.prayer.pointfinder.dto.request.CreateSubmissionRequest;
import com.prayer.pointfinder.dto.request.ReviewSubmissionRequest;
import com.prayer.pointfinder.dto.response.SubmissionResponse;
import com.prayer.pointfinder.service.SubmissionService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/games/{gameId}/submissions")
@RequiredArgsConstructor
public class SubmissionController {

    private final SubmissionService submissionService;

    @GetMapping
    public ResponseEntity<List<SubmissionResponse>> getSubmissions(@PathVariable UUID gameId) {
        return ResponseEntity.ok(submissionService.getSubmissionsByGame(gameId));
    }

    @PostMapping
    public ResponseEntity<SubmissionResponse> createSubmission(@PathVariable UUID gameId,
                                                                @Valid @RequestBody CreateSubmissionRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(submissionService.createSubmission(gameId, request));
    }

    @PatchMapping("/{submissionId}/review")
    public ResponseEntity<SubmissionResponse> reviewSubmission(@PathVariable UUID gameId,
                                                                @PathVariable UUID submissionId,
                                                                @Valid @RequestBody ReviewSubmissionRequest request) {
        return ResponseEntity.ok(submissionService.reviewSubmission(gameId, submissionId, request));
    }
}
