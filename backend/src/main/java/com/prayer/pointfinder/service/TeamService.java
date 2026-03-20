package com.prayer.pointfinder.service;

import com.prayer.pointfinder.dto.request.CreateTeamRequest;
import com.prayer.pointfinder.dto.request.UpdateTeamRequest;
import com.prayer.pointfinder.dto.response.PlayerResponse;
import com.prayer.pointfinder.dto.response.TeamResponse;
import com.prayer.pointfinder.entity.Game;
import com.prayer.pointfinder.entity.Player;
import com.prayer.pointfinder.entity.Team;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.exception.ResourceNotFoundException;
import com.prayer.pointfinder.repository.PlayerRepository;
import com.prayer.pointfinder.repository.TeamRepository;
import com.prayer.pointfinder.util.CodeGenerator;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;
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

    @Transactional(timeout = 10)
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

    @Transactional(timeout = 10)
    public TeamResponse updateTeam(UUID gameId, UUID teamId, UpdateTeamRequest request) {
        gameAccessService.ensureCurrentUserCanAccessGame(gameId);
        Team team = teamRepository.findById(teamId)
                .orElseThrow(() -> new ResourceNotFoundException("Team", teamId));
        gameAccessService.ensureBelongsToGame("Team", team.getGame().getId(), gameId);

        team.setName(request.getName());
        if (request.getColor() != null) {
            team.setColor(request.getColor());
        }
        team = teamRepository.save(team);
        return toResponse(team);
    }

    @Transactional(timeout = 10)
    public void deleteTeam(UUID gameId, UUID teamId) {
        gameAccessService.ensureCurrentUserCanAccessGame(gameId);
        Team team = teamRepository.findById(teamId)
                .orElseThrow(() -> new ResourceNotFoundException("Team", teamId));
        gameAccessService.ensureBelongsToGame("Team", team.getGame().getId(), gameId);
        teamRepository.delete(team);
    }

    @Transactional(readOnly = true)
    public List<PlayerResponse> getPlayers(UUID gameId, UUID teamId) {
        gameAccessService.ensureCurrentUserCanAccessGame(gameId);
        Team team = teamRepository.findById(teamId)
                .orElseThrow(() -> new ResourceNotFoundException("Team", teamId));
        gameAccessService.ensureBelongsToGame("Team", team.getGame().getId(), gameId);

        return playerRepository.findByTeamId(teamId).stream()
                .map(p -> PlayerResponse.builder()
                        .id(p.getId())
                        .teamId(p.getTeam().getId())
                        .deviceId(p.getDeviceId())
                        .displayName(p.getDisplayName())
                        .build())
                .collect(Collectors.toList());
    }

    @Transactional(timeout = 10)
    public void removePlayer(UUID gameId, UUID teamId, UUID playerId) {
        gameAccessService.ensureCurrentUserCanAccessGame(gameId);

        Team team = teamRepository.findById(teamId)
                .orElseThrow(() -> new ResourceNotFoundException("Team", teamId));
        gameAccessService.ensureBelongsToGame("Team", team.getGame().getId(), gameId);

        Player player = playerRepository.findById(playerId)
                .orElseThrow(() -> new ResourceNotFoundException("Player", playerId));
        if (!player.getTeam().getId().equals(teamId)) {
            throw new BadRequestException("Player does not belong to this team");
        }
        gameAccessService.ensureBelongsToGame("Player", player.getTeam().getGame().getId(), gameId);

        playerRepository.delete(player);
    }

    private String generateUniqueJoinCode() {
        for (int attempt = 0; attempt < MAX_JOIN_CODE_ATTEMPTS; attempt++) {
            String code = CodeGenerator.generate(7, CodeGenerator.FULL_ALPHANUMERIC);
            if (teamRepository.findByJoinCode(code).isEmpty()) {
                return code;
            }
        }
        throw new IllegalStateException("Unable to generate unique team join code");
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
