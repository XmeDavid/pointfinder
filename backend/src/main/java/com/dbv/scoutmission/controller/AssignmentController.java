package com.dbv.scoutmission.controller;

import com.dbv.scoutmission.dto.request.BulkAssignmentRequest;
import com.dbv.scoutmission.dto.request.CreateAssignmentRequest;
import com.dbv.scoutmission.dto.response.AssignmentResponse;
import com.dbv.scoutmission.service.AssignmentService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/games/{gameId}/assignments")
@RequiredArgsConstructor
public class AssignmentController {

    private final AssignmentService assignmentService;

    @GetMapping
    public ResponseEntity<List<AssignmentResponse>> getAssignments(@PathVariable UUID gameId) {
        return ResponseEntity.ok(assignmentService.getAssignmentsByGame(gameId));
    }

    @PostMapping
    public ResponseEntity<AssignmentResponse> createAssignment(@PathVariable UUID gameId,
                                                                @Valid @RequestBody CreateAssignmentRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(assignmentService.createAssignment(gameId, request));
    }

    @PutMapping
    public ResponseEntity<List<AssignmentResponse>> bulkSetAssignments(@PathVariable UUID gameId,
                                                                       @Valid @RequestBody BulkAssignmentRequest request) {
        return ResponseEntity.ok(assignmentService.bulkSetAssignments(gameId, request.getAssignments()));
    }

    @DeleteMapping("/{assignmentId}")
    public ResponseEntity<Void> deleteAssignment(@PathVariable UUID gameId,
                                                  @PathVariable UUID assignmentId) {
        assignmentService.deleteAssignment(gameId, assignmentId);
        return ResponseEntity.noContent().build();
    }
}
