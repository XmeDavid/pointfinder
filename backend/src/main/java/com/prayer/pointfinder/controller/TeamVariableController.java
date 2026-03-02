package com.prayer.pointfinder.controller;

import com.prayer.pointfinder.dto.request.TeamVariablesBulkRequest;
import com.prayer.pointfinder.dto.response.TeamVariablesResponse;
import com.prayer.pointfinder.dto.response.VariableCompletenessResponse;
import com.prayer.pointfinder.service.TeamVariableService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequiredArgsConstructor
public class TeamVariableController {

    private final TeamVariableService teamVariableService;

    // ── Game-level variables ──

    @GetMapping("/api/games/{gameId}/team-variables")
    public ResponseEntity<TeamVariablesResponse> getGameVariables(@PathVariable UUID gameId) {
        return ResponseEntity.ok(teamVariableService.getGameVariables(gameId));
    }

    @PutMapping("/api/games/{gameId}/team-variables")
    public ResponseEntity<TeamVariablesResponse> saveGameVariables(
            @PathVariable UUID gameId,
            @Valid @RequestBody TeamVariablesBulkRequest request) {
        return ResponseEntity.ok(teamVariableService.saveGameVariables(gameId, request));
    }

    // ── Challenge-level variables ──

    @GetMapping("/api/games/{gameId}/challenges/{challengeId}/team-variables")
    public ResponseEntity<TeamVariablesResponse> getChallengeVariables(
            @PathVariable UUID gameId, @PathVariable UUID challengeId) {
        return ResponseEntity.ok(teamVariableService.getChallengeVariables(gameId, challengeId));
    }

    @PutMapping("/api/games/{gameId}/challenges/{challengeId}/team-variables")
    public ResponseEntity<TeamVariablesResponse> saveChallengeVariables(
            @PathVariable UUID gameId, @PathVariable UUID challengeId,
            @Valid @RequestBody TeamVariablesBulkRequest request) {
        return ResponseEntity.ok(teamVariableService.saveChallengeVariables(gameId, challengeId, request));
    }

    // ── Completeness check ──

    @GetMapping("/api/games/{gameId}/team-variables/completeness")
    public ResponseEntity<VariableCompletenessResponse> checkCompleteness(@PathVariable UUID gameId) {
        return ResponseEntity.ok(teamVariableService.checkCompleteness(gameId));
    }
}
