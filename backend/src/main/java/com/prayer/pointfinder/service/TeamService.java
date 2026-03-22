package com.prayer.pointfinder.service;

import com.prayer.pointfinder.dto.request.CreateTeamRequest;
import com.prayer.pointfinder.dto.request.UpdateTeamRequest;
import com.prayer.pointfinder.dto.response.CheckInResponse;
import com.prayer.pointfinder.dto.response.PlayerResponse;
import com.prayer.pointfinder.dto.response.TeamResponse;
import com.prayer.pointfinder.entity.*;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.exception.ResourceNotFoundException;
import com.prayer.pointfinder.repository.*;
import com.prayer.pointfinder.util.CodeGenerator;
import com.prayer.pointfinder.util.LazyInitHelper;
import com.prayer.pointfinder.websocket.GameEventBroadcaster;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

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
    private final BaseRepository baseRepository;
    private final CheckInRepository checkInRepository;
    private final AssignmentRepository assignmentRepository;
    private final ActivityEventRepository activityEventRepository;
    private final GameEventBroadcaster eventBroadcaster;
    private final GameAccessService gameAccessService;

    @Transactional(readOnly = true)
    public List<TeamResponse> getTeamsByGame(UUID gameId) {
        gameAccessService.ensureCurrentUserCanAccessGame(gameId);
        return teamRepository.findByGameId(gameId).stream()
                .map(this::toResponse)
                .toList();
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
        eventBroadcaster.broadcastGameConfig(game.getId(), "teams", "created");
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
        eventBroadcaster.broadcastGameConfig(gameId, "teams", "updated");
        return toResponse(team);
    }

    @Transactional(timeout = 10)
    public void deleteTeam(UUID gameId, UUID teamId) {
        gameAccessService.ensureCurrentUserCanAccessGame(gameId);
        Team team = teamRepository.findById(teamId)
                .orElseThrow(() -> new ResourceNotFoundException("Team", teamId));
        gameAccessService.ensureBelongsToGame("Team", team.getGame().getId(), gameId);
        teamRepository.delete(team);
        eventBroadcaster.broadcastGameConfig(gameId, "teams", "deleted");
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
                .toList();
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

    @Transactional(timeout = 10)
    public CheckInResponse operatorCheckIn(UUID gameId, UUID teamId, UUID baseId) {
        Game game = gameAccessService.getAccessibleGame(gameId);
        if (game.getStatus() != GameStatus.live) {
            throw new BadRequestException("Game is not active");
        }

        Team team = teamRepository.findById(teamId)
                .orElseThrow(() -> new ResourceNotFoundException("Team", teamId));
        gameAccessService.ensureBelongsToGame("Team", team.getGame().getId(), gameId);

        Base base = baseRepository.findById(baseId)
                .orElseThrow(() -> new ResourceNotFoundException("Base", baseId));
        gameAccessService.ensureBelongsToGame("Base", base.getGame().getId(), gameId);

        // Idempotent: return existing check-in if present
        Optional<CheckIn> existing = checkInRepository.findByTeamIdAndBaseId(teamId, baseId);
        if (existing.isPresent()) {
            return buildCheckInResponse(existing.get(), base, team);
        }

        CheckIn checkIn = CheckIn.builder()
                .game(game)
                .team(team)
                .base(base)
                .player(null)
                .checkedInAt(Instant.now())
                .build();
        try {
            checkIn = checkInRepository.save(checkIn);
        } catch (DataIntegrityViolationException ex) {
            CheckIn existing2 = checkInRepository.findByTeamIdAndBaseId(teamId, baseId)
                    .orElseThrow(() -> new BadRequestException("Check-in failed"));
            return buildCheckInResponse(existing2, base, team);
        }

        ActivityEvent event = ActivityEvent.builder()
                .game(game)
                .type(ActivityEventType.check_in)
                .team(team)
                .base(base)
                .message(team.getName() + " manually checked in at " + base.getName() + " by operator")
                .timestamp(Instant.now())
                .build();
        activityEventRepository.save(event);

        LazyInitHelper.initializeForBroadcast(event);
        eventBroadcaster.broadcastActivityEvent(gameId, event);

        return buildCheckInResponse(checkIn, base, team);
    }

    private CheckInResponse buildCheckInResponse(CheckIn checkIn, Base base, Team team) {
        List<Assignment> baseAssignments = assignmentRepository.findByBaseId(base.getId());
        List<Assignment> sorted = baseAssignments.stream()
                .sorted(AssignmentResolver.RECENCY_COMPARATOR).toList();
        Challenge challenge = AssignmentResolver.resolve(base, team.getId(), sorted);

        CheckInResponse.ChallengeInfo challengeInfo = null;
        if (challenge != null) {
            challengeInfo = CheckInResponse.ChallengeInfo.builder()
                    .id(challenge.getId())
                    .title(challenge.getTitle())
                    .description(challenge.getDescription())
                    .content(challenge.getContent())
                    .completionContent(challenge.getCompletionContent())
                    .answerType(challenge.getAnswerType().name())
                    .points(challenge.getPoints())
                    .requirePresenceToSubmit(challenge.getRequirePresenceToSubmit())
                    .build();
        }

        return CheckInResponse.builder()
                .checkInId(checkIn.getId())
                .baseId(base.getId())
                .baseName(base.getName())
                .checkedInAt(checkIn.getCheckedInAt())
                .challenge(challengeInfo)
                .build();
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
