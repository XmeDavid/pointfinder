package com.dbv.scoutmission.service;

import com.dbv.scoutmission.dto.request.CreateTeamRequest;
import com.dbv.scoutmission.dto.request.UpdateTeamRequest;
import com.dbv.scoutmission.dto.response.PlayerResponse;
import com.dbv.scoutmission.dto.response.TeamResponse;
import com.dbv.scoutmission.entity.Game;
import com.dbv.scoutmission.entity.Team;
import com.dbv.scoutmission.exception.BadRequestException;
import com.dbv.scoutmission.exception.ResourceNotFoundException;
import com.dbv.scoutmission.repository.PlayerRepository;
import com.dbv.scoutmission.repository.TeamRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class TeamService {

    private static final String[] TEAM_COLORS = {
        "#3b82f6", "#ef4444", "#f59e0b", "#8b5cf6",
        "#10b981", "#ec4899", "#f97316", "#06b6d4"
    };
    private static final int MAX_JOIN_CODE_ATTEMPTS = 20;

    private final TeamRepository teamRepository;
    private final PlayerRepository playerRepository;
    private final GameAccessService gameAccessService;

    @Transactional(readOnly = true)
    public List<TeamResponse> getTeamsByGame(UUID gameId) {
        gameAccessService.ensureCurrentUserCanAccessGame(gameId);
        return teamRepository.findByGameId(gameId).stream()
                .map(this::toResponse)
                .collect(Collectors.toList());
    }

    @Transactional
    public TeamResponse createTeam(UUID gameId, CreateTeamRequest request) {
        Game game = gameAccessService.getAccessibleGame(gameId);

        long teamCount = teamRepository.countByGameId(gameId);
        String color = TEAM_COLORS[(int) (teamCount % TEAM_COLORS.length)];
        String joinCode = generateUniqueJoinCode();

        Team team = Team.builder()
                .game(game)
                .name(request.getName())
                .joinCode(joinCode)
                .color(color)
                .build();

        team = teamRepository.save(team);
        return toResponse(team);
    }

    @Transactional
    public TeamResponse updateTeam(UUID gameId, UUID teamId, UpdateTeamRequest request) {
        gameAccessService.ensureCurrentUserCanAccessGame(gameId);
        Team team = teamRepository.findById(teamId)
                .orElseThrow(() -> new ResourceNotFoundException("Team", teamId));

        if (!team.getGame().getId().equals(gameId)) {
            throw new BadRequestException("Team does not belong to this game");
        }

        team.setName(request.getName());
        team = teamRepository.save(team);
        return toResponse(team);
    }

    @Transactional
    public void deleteTeam(UUID gameId, UUID teamId) {
        gameAccessService.ensureCurrentUserCanAccessGame(gameId);
        Team team = teamRepository.findById(teamId)
                .orElseThrow(() -> new ResourceNotFoundException("Team", teamId));
        if (!team.getGame().getId().equals(gameId)) {
            throw new BadRequestException("Team does not belong to this game");
        }
        teamRepository.delete(team);
    }

    @Transactional(readOnly = true)
    public List<PlayerResponse> getPlayers(UUID gameId, UUID teamId) {
        gameAccessService.ensureCurrentUserCanAccessGame(gameId);
        Team team = teamRepository.findById(teamId)
                .orElseThrow(() -> new ResourceNotFoundException("Team", teamId));
        if (!team.getGame().getId().equals(gameId)) {
            throw new BadRequestException("Team does not belong to this game");
        }

        return playerRepository.findByTeamId(teamId).stream()
                .map(p -> PlayerResponse.builder()
                        .id(p.getId())
                        .teamId(p.getTeam().getId())
                        .deviceId(p.getDeviceId())
                        .displayName(p.getDisplayName())
                        .build())
                .collect(Collectors.toList());
    }

    private String generateUniqueJoinCode() {
        for (int attempt = 0; attempt < MAX_JOIN_CODE_ATTEMPTS; attempt++) {
            String code = generateJoinCode();
            if (teamRepository.findByJoinCode(code).isEmpty()) {
                return code;
            }
        }
        throw new IllegalStateException("Unable to generate unique team join code");
    }

    private String generateJoinCode() {
        String chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
        StringBuilder sb = new StringBuilder(7);
        for (int i = 0; i < 7; i++) {
            sb.append(chars.charAt(ThreadLocalRandom.current().nextInt(chars.length())));
        }
        return sb.toString();
    }

    private TeamResponse toResponse(Team team) {
        return TeamResponse.builder()
                .id(team.getId())
                .gameId(team.getGame().getId())
                .name(team.getName())
                .joinCode(team.getJoinCode())
                .color(team.getColor())
                .build();
    }
}
