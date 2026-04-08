package com.prayer.pointfinder.controller;

import com.prayer.pointfinder.dto.request.CreateTeamRequest;
import com.prayer.pointfinder.dto.request.OperatorCheckInRequest;
import com.prayer.pointfinder.dto.request.UpdateTeamRequest;
import com.prayer.pointfinder.dto.response.CheckInResponse;
import com.prayer.pointfinder.dto.response.PlayerResponse;
import com.prayer.pointfinder.dto.response.TeamResponse;
import com.prayer.pointfinder.service.TeamService;
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

    @DeleteMapping("/{teamId}/players/{playerId}")
    public ResponseEntity<Void> removePlayer(@PathVariable UUID gameId,
                                             @PathVariable UUID teamId,
                                             @PathVariable UUID playerId) {
        teamService.removePlayer(gameId, teamId, playerId);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{teamId}/check-in/{baseId}")
    public ResponseEntity<CheckInResponse> manualCheckIn(
            @PathVariable UUID gameId,
            @PathVariable UUID teamId,
            @PathVariable UUID baseId,
            @Valid @RequestBody(required = false) OperatorCheckInRequest request) {
        // The request body is optional so legacy clients (which POST without
        // a body at all) keep working. When supplied, the optional `reason`
        // field is captured on the audit trail (check_ins.operator_reason and
        // the corresponding ActivityEvent).
        String reason = request != null ? request.getReason() : null;
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(teamService.operatorCheckIn(gameId, teamId, baseId, reason));
    }
}
