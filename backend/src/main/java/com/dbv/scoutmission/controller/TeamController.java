package com.dbv.scoutmission.controller;

import com.dbv.scoutmission.dto.request.CreateTeamRequest;
import com.dbv.scoutmission.dto.request.UpdateTeamRequest;
import com.dbv.scoutmission.dto.response.PlayerResponse;
import com.dbv.scoutmission.dto.response.TeamResponse;
import com.dbv.scoutmission.service.TeamService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/games/{gameId}/teams")
@RequiredArgsConstructor
public class TeamController {

    private final TeamService teamService;

    @GetMapping
    public ResponseEntity<List<TeamResponse>> getTeams(@PathVariable UUID gameId) {
        return ResponseEntity.ok(teamService.getTeamsByGame(gameId));
    }

    @PostMapping
    public ResponseEntity<TeamResponse> createTeam(@PathVariable UUID gameId,
                                                    @Valid @RequestBody CreateTeamRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(teamService.createTeam(gameId, request));
    }

    @PutMapping("/{teamId}")
    public ResponseEntity<TeamResponse> updateTeam(@PathVariable UUID gameId,
                                                    @PathVariable UUID teamId,
                                                    @Valid @RequestBody UpdateTeamRequest request) {
        return ResponseEntity.ok(teamService.updateTeam(gameId, teamId, request));
    }

    @DeleteMapping("/{teamId}")
    public ResponseEntity<Void> deleteTeam(@PathVariable UUID gameId, @PathVariable UUID teamId) {
        teamService.deleteTeam(gameId, teamId);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/{teamId}/players")
    public ResponseEntity<List<PlayerResponse>> getPlayers(@PathVariable UUID gameId,
                                                            @PathVariable UUID teamId) {
        return ResponseEntity.ok(teamService.getPlayers(gameId, teamId));
    }
}
