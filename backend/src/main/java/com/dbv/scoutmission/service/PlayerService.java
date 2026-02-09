package com.dbv.scoutmission.service;

import com.dbv.scoutmission.dto.request.CreateSubmissionRequest;
import com.dbv.scoutmission.dto.request.PlayerJoinRequest;
import com.dbv.scoutmission.dto.request.PlayerSubmissionRequest;
import com.dbv.scoutmission.dto.response.*;
import com.dbv.scoutmission.entity.*;
import com.dbv.scoutmission.exception.BadRequestException;
import com.dbv.scoutmission.exception.ResourceNotFoundException;
import com.dbv.scoutmission.repository.*;
import com.dbv.scoutmission.security.JwtTokenProvider;
import com.dbv.scoutmission.websocket.GameEventBroadcaster;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class PlayerService {

    private final PlayerRepository playerRepository;
    private final TeamRepository teamRepository;
    private final BaseRepository baseRepository;
    private final ChallengeRepository challengeRepository;
    private final AssignmentRepository assignmentRepository;
    private final CheckInRepository checkInRepository;
    private final SubmissionRepository submissionRepository;
    private final ActivityEventRepository activityEventRepository;
    private final GameEventBroadcaster eventBroadcaster;
    private final JwtTokenProvider tokenProvider;
    private final SubmissionService submissionService;
    private final TeamLocationRepository teamLocationRepository;

    @Transactional
    public PlayerAuthResponse joinTeam(PlayerJoinRequest request) {
        Team team = teamRepository.findByJoinCode(request.getJoinCode())
                .orElseThrow(() -> new BadRequestException("Invalid join code"));

        Game game = team.getGame();
        if (game.getStatus() != GameStatus.live) {
            throw new BadRequestException("Game is not active");
        }

        // Find existing player by device ID and team, or create new one
        Player player = playerRepository.findByDeviceIdAndTeamId(request.getDeviceId(), team.getId())
                .orElse(null);

        if (player == null) {
            player = Player.builder()
                    .team(team)
                    .deviceId(request.getDeviceId())
                    .displayName(request.getDisplayName())
                    .build();
        } else {
            player.setDisplayName(request.getDisplayName());
        }

        // Generate JWT token for the player
        String jwt = tokenProvider.generatePlayerToken(
                player.getId() != null ? player.getId() : UUID.randomUUID(),
                team.getId(),
                game.getId()
        );

        player = playerRepository.save(player);

        // Re-generate with actual ID if it was new
        jwt = tokenProvider.generatePlayerToken(player.getId(), team.getId(), game.getId());
        player.setToken(jwt);
        playerRepository.save(player);

        return PlayerAuthResponse.builder()
                .token(jwt)
                .player(PlayerAuthResponse.PlayerInfo.builder()
                        .id(player.getId())
                        .displayName(player.getDisplayName())
                        .deviceId(player.getDeviceId())
                        .build())
                .team(PlayerAuthResponse.TeamInfo.builder()
                        .id(team.getId())
                        .name(team.getName())
                        .color(team.getColor())
                        .build())
                .game(PlayerAuthResponse.GameInfo.builder()
                        .id(game.getId())
                        .name(game.getName())
                        .description(game.getDescription())
                        .status(game.getStatus().name())
                        .build())
                .build();
    }

    @Transactional
    public CheckInResponse checkIn(UUID gameId, UUID baseId, Player player) {
        // Re-fetch player within transaction to get fresh entity with proper session
        UUID playerId = player.getId();
        player = playerRepository.findById(playerId)
                .orElseThrow(() -> new ResourceNotFoundException("Player", playerId));

        Team team = player.getTeam();
        // Force initialization of lazy proxy within this transaction
        team.getId();
        team.getName();

        Base base = baseRepository.findById(baseId)
                .orElseThrow(() -> new ResourceNotFoundException("Base", baseId));

        if (!base.getGame().getId().equals(gameId)) {
            throw new BadRequestException("Base does not belong to this game");
        }

        // Check if already checked in
        Optional<CheckIn> existing = checkInRepository.findByTeamIdAndBaseId(team.getId(), baseId);
        if (existing.isPresent()) {
            // Return the existing check-in with challenge info
            return buildCheckInResponse(existing.get(), base, team);
        }

        // Create new check-in
        CheckIn checkIn = CheckIn.builder()
                .game(base.getGame())
                .team(team)
                .base(base)
                .player(player)
                .checkedInAt(Instant.now())
                .build();
        checkIn = checkInRepository.save(checkIn);

        // Create activity event
        ActivityEvent event = ActivityEvent.builder()
                .game(base.getGame())
                .type(ActivityEventType.check_in)
                .team(team)
                .base(base)
                .message(team.getName() + " checked in at " + base.getName())
                .timestamp(Instant.now())
                .build();
        activityEventRepository.save(event);

        // Initialize lazy relationships before broadcasting (fixes LazyInitializationException)
        event.getGame().getId();
        event.getTeam().getId();
        if (event.getBase() != null) event.getBase().getId();
        if (event.getChallenge() != null) event.getChallenge().getId();

        eventBroadcaster.broadcastActivityEvent(gameId, event);

        return buildCheckInResponse(checkIn, base, team);
    }

    @Transactional(readOnly = true)
    public List<BaseProgressResponse> getProgress(UUID gameId, Player player) {
        // Re-fetch player within transaction to get fresh entity with proper session
        UUID playerId = player.getId();
        player = playerRepository.findById(playerId)
                .orElseThrow(() -> new ResourceNotFoundException("Player", playerId));

        Team team = player.getTeam();
        // Force initialization of lazy proxy within this transaction
        team.getId();

        List<Base> bases = baseRepository.findByGameId(gameId);
        List<CheckIn> checkIns = checkInRepository.findByGameIdAndTeamId(gameId, team.getId());
        List<Submission> submissions = submissionRepository.findByTeamId(team.getId());
        List<Assignment> assignments = assignmentRepository.findByGameId(gameId);

        // Build lookup maps
        Map<UUID, CheckIn> checkInByBase = checkIns.stream()
                .collect(Collectors.toMap(ci -> ci.getBase().getId(), ci -> ci));
        Map<UUID, Submission> submissionByBase = submissions.stream()
                .collect(Collectors.toMap(
                        s -> s.getBase().getId(),
                        s -> s,
                        (a, b) -> a.getSubmittedAt().isAfter(b.getSubmittedAt()) ? a : b
                ));
        Map<UUID, Assignment> assignmentByBase = assignments.stream()
                .filter(a -> a.getTeam() == null || a.getTeam().getId().equals(team.getId()))
                .collect(Collectors.toMap(
                        a -> a.getBase().getId(),
                        a -> a,
                        (a, b) -> a // take first if multiple
                ));

        return bases.stream().map(base -> {
            UUID bId = base.getId();
            CheckIn ci = checkInByBase.get(bId);
            Submission sub = submissionByBase.get(bId);
            Assignment assignment = assignmentByBase.get(bId);

            String status;
            String submissionStatus = null;

            if (sub != null) {
                submissionStatus = sub.getStatus().name();
                if (sub.getStatus() == SubmissionStatus.approved || sub.getStatus() == SubmissionStatus.correct) {
                    status = "completed";
                } else if (sub.getStatus() == SubmissionStatus.rejected) {
                    status = "rejected";
                } else {
                    status = "submitted";
                }
            } else if (ci != null) {
                status = "checked_in";
            } else {
                status = "not_visited";
            }

            return BaseProgressResponse.builder()
                    .baseId(bId)
                    .baseName(base.getName())
                    .lat(base.getLat())
                    .lng(base.getLng())
                    .nfcLinked(base.getNfcLinked())
                    .requirePresenceToSubmit(base.getRequirePresenceToSubmit())
                    .status(status)
                    .checkedInAt(ci != null ? ci.getCheckedInAt() : null)
                    .challengeId(assignment != null ? assignment.getChallenge().getId() : null)
                    .submissionStatus(submissionStatus)
                    .build();
        }).collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public List<BaseResponse> getBases(UUID gameId) {
        return baseRepository.findByGameId(gameId).stream()
                .map(base -> BaseResponse.builder()
                        .id(base.getId())
                        .gameId(gameId)
                        .name(base.getName())
                        .description(base.getDescription())
                        .lat(base.getLat())
                        .lng(base.getLng())
                        .nfcLinked(base.getNfcLinked())
                        .requirePresenceToSubmit(base.getRequirePresenceToSubmit())
                        .fixedChallengeId(base.getFixedChallenge() != null ? base.getFixedChallenge().getId() : null)
                        .build())
                .collect(Collectors.toList());
    }

    /**
     * Returns all game data needed for offline caching in a single call.
     * Includes: bases, assigned challenges, assignments, and current progress.
     */
    @Transactional(readOnly = true)
    public GameDataResponse getGameData(UUID gameId, Player player) {
        // Re-fetch player within transaction
        UUID playerId = player.getId();
        player = playerRepository.findById(playerId)
                .orElseThrow(() -> new ResourceNotFoundException("Player", playerId));

        Team team = player.getTeam();
        team.getId(); // Force initialization

        // Get all bases
        List<BaseResponse> bases = getBases(gameId);

        // Get all assignments for this game (both team-specific and global)
        List<Assignment> assignmentEntities = assignmentRepository.findByGameId(gameId);
        List<AssignmentResponse> assignments = assignmentEntities.stream()
                .filter(a -> a.getTeam() == null || a.getTeam().getId().equals(team.getId()))
                .map(a -> AssignmentResponse.builder()
                        .id(a.getId())
                        .gameId(gameId)
                        .baseId(a.getBase().getId())
                        .challengeId(a.getChallenge().getId())
                        .teamId(a.getTeam() != null ? a.getTeam().getId() : null)
                        .build())
                .collect(Collectors.toList());

        // Collect all challenge IDs from assignments and fixed challenges
        Set<UUID> challengeIds = new HashSet<>();
        for (AssignmentResponse a : assignments) {
            challengeIds.add(a.getChallengeId());
        }
        for (BaseResponse b : bases) {
            if (b.getFixedChallengeId() != null) {
                challengeIds.add(b.getFixedChallengeId());
            }
        }

        // Load all relevant challenges
        List<ChallengeResponse> challenges = challengeRepository.findByGameId(gameId).stream()
                .filter(c -> challengeIds.contains(c.getId()))
                .map(c -> ChallengeResponse.builder()
                        .id(c.getId())
                        .gameId(gameId)
                        .title(c.getTitle())
                        .description(c.getDescription())
                        .content(c.getContent())
                        .answerType(c.getAnswerType().name())
                        .autoValidate(c.getAutoValidate())
                        .correctAnswer(null) // Don't expose correct answer to players
                        .points(c.getPoints())
                        .locationBound(c.getLocationBound())
                        .build())
                .collect(Collectors.toList());

        // Get current progress
        List<BaseProgressResponse> progress = getProgress(gameId, player);

        return GameDataResponse.builder()
                .bases(bases)
                .challenges(challenges)
                .assignments(assignments)
                .progress(progress)
                .build();
    }

    @Transactional
    public SubmissionResponse submitAnswer(UUID gameId, PlayerSubmissionRequest request, Player player) {
        // Re-fetch player within transaction to get fresh entity with proper session
        UUID playerId = player.getId();
        player = playerRepository.findById(playerId)
                .orElseThrow(() -> new ResourceNotFoundException("Player", playerId));

        Team team = player.getTeam();
        // Force initialization of lazy proxy within this transaction
        team.getId();

        // Verify the team has checked in to this base
        if (!checkInRepository.existsByTeamIdAndBaseId(team.getId(), request.getBaseId())) {
            throw new BadRequestException("Team has not checked in to this base");
        }

        CreateSubmissionRequest submissionRequest = new CreateSubmissionRequest();
        submissionRequest.setTeamId(team.getId());
        submissionRequest.setChallengeId(request.getChallengeId());
        submissionRequest.setBaseId(request.getBaseId());
        submissionRequest.setAnswer(request.getAnswer());
        submissionRequest.setIdempotencyKey(request.getIdempotencyKey());

        return submissionService.createSubmission(gameId, submissionRequest);
    }

    @Transactional
    public void updateLocation(UUID gameId, Player player, Double lat, Double lng) {
        UUID playerId = player.getId();
        player = playerRepository.findById(playerId)
                .orElseThrow(() -> new ResourceNotFoundException("Player", playerId));

        Team team = player.getTeam();
        team.getId(); // force initialization

        if (!team.getGame().getId().equals(gameId)) {
            throw new BadRequestException("Player does not belong to this game");
        }

        TeamLocation location = teamLocationRepository.findById(team.getId()).orElse(null);
        if (location == null) {
            location = TeamLocation.builder()
                    .team(team)
                    .lat(lat)
                    .lng(lng)
                    .build();
        } else {
            location.setLat(lat);
            location.setLng(lng);
        }
        teamLocationRepository.save(location);

        eventBroadcaster.broadcastLocationUpdate(gameId, Map.of(
                "teamId", team.getId(),
                "lat", lat,
                "lng", lng,
                "updatedAt", Instant.now().toString()
        ));
    }

    private CheckInResponse buildCheckInResponse(CheckIn checkIn, Base base, Team team) {
        // Find the challenge for this base and team
        List<Assignment> assignments = assignmentRepository.findByBaseId(base.getId());
        Assignment assignment = assignments.stream()
                .filter(a -> a.getTeam() == null || a.getTeam().getId().equals(team.getId()))
                .findFirst()
                .orElse(null);

        // Fall back to fixed challenge if no assignment
        Challenge challenge = assignment != null ? assignment.getChallenge() : base.getFixedChallenge();

        CheckInResponse.ChallengeInfo challengeInfo = null;
        if (challenge != null) {
            challengeInfo = CheckInResponse.ChallengeInfo.builder()
                    .id(challenge.getId())
                    .title(challenge.getTitle())
                    .description(challenge.getDescription())
                    .content(challenge.getContent())
                    .answerType(challenge.getAnswerType().name())
                    .points(challenge.getPoints())
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
}
