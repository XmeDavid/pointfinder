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

    private static final Comparator<Assignment> ASSIGNMENT_RECENCY_COMPARATOR =
            Comparator.comparing(
                            Assignment::getCreatedAt,
                            Comparator.nullsLast(Comparator.reverseOrder())
                    )
                    .thenComparing(a -> a.getId().toString(), Comparator.reverseOrder());

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
    private final GameAccessService gameAccessService;

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

        player = playerRepository.save(player);

        // Generate JWT token using the persisted player ID
        String jwt = tokenProvider.generatePlayerToken(player.getId(), team.getId(), game.getId());
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
        gameAccessService.ensurePlayerBelongsToGame(player, gameId);

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
        gameAccessService.ensurePlayerBelongsToGame(player, gameId);

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

        List<Assignment> sortedAssignments = assignments.stream()
                .sorted(ASSIGNMENT_RECENCY_COMPARATOR)
                .toList();

        Map<UUID, Assignment> teamSpecificByBase = sortedAssignments.stream()
                .filter(a -> a.getTeam() != null && a.getTeam().getId().equals(team.getId()))
                .collect(Collectors.toMap(
                        a -> a.getBase().getId(),
                        a -> a,
                        (first, ignored) -> first
                ));
        Map<UUID, Assignment> globalByBase = sortedAssignments.stream()
                .filter(a -> a.getTeam() == null)
                .collect(Collectors.toMap(
                        a -> a.getBase().getId(),
                        a -> a,
                        (first, ignored) -> first
                ));
        Map<UUID, Assignment> assignmentByBase = new HashMap<>(globalByBase);
        assignmentByBase.putAll(teamSpecificByBase);

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

            // Hide bases marked as hidden that the team hasn't visited yet
            if (Boolean.TRUE.equals(base.getHidden()) && "not_visited".equals(status)) {
                return null;
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
        }).filter(Objects::nonNull).collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public List<BaseResponse> getBases(UUID gameId, Player player) {
        UUID playerId = player.getId();
        player = playerRepository.findById(playerId)
                .orElseThrow(() -> new ResourceNotFoundException("Player", playerId));
        gameAccessService.ensurePlayerBelongsToGame(player, gameId);

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
                        .hidden(base.getHidden())
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
        gameAccessService.ensurePlayerBelongsToGame(player, gameId);

        // Get current progress (already filters hidden+not_visited bases)
        List<BaseProgressResponse> progress = getProgress(gameId, player);

        // Collect visible base IDs from progress to filter other lists
        Set<UUID> visibleBaseIds = progress.stream()
                .map(BaseProgressResponse::getBaseId)
                .collect(Collectors.toSet());

        // Get all bases, then filter to only visible ones
        List<BaseResponse> bases = getBases(gameId, player).stream()
                .filter(b -> visibleBaseIds.contains(b.getId()))
                .collect(Collectors.toList());

        // Get all assignments for this game (both team-specific and global), filtered to visible bases
        List<Assignment> assignmentEntities = assignmentRepository.findByGameId(gameId);
        List<AssignmentResponse> assignments = assignmentEntities.stream()
                .filter(a -> a.getTeam() == null || a.getTeam().getId().equals(team.getId()))
                .filter(a -> visibleBaseIds.contains(a.getBase().getId()))
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
                        .completionContent(c.getCompletionContent())
                        .answerType(c.getAnswerType().name())
                        .autoValidate(c.getAutoValidate())
                        .correctAnswer(null) // Don't expose correct answer to players
                        .points(c.getPoints())
                        .locationBound(c.getLocationBound())
                        .build())
                .collect(Collectors.toList());

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
        gameAccessService.ensurePlayerBelongsToGame(player, gameId);

        Base base = baseRepository.findById(request.getBaseId())
                .orElseThrow(() -> new ResourceNotFoundException("Base", request.getBaseId()));
        if (!base.getGame().getId().equals(gameId)) {
            throw new BadRequestException("Base does not belong to this game");
        }

        // Verify the team has checked in to this base
        if (!checkInRepository.existsByTeamIdAndBaseId(team.getId(), request.getBaseId())) {
            throw new BadRequestException("Team has not checked in to this base");
        }

        Challenge assignedChallenge = resolveAssignedChallenge(base, team);
        if (assignedChallenge == null) {
            throw new BadRequestException("No challenge is assigned for this base");
        }
        if (!assignedChallenge.getId().equals(request.getChallengeId())) {
            throw new BadRequestException("Submitted challenge is not assigned to this team for this base");
        }

        CreateSubmissionRequest submissionRequest = new CreateSubmissionRequest();
        submissionRequest.setTeamId(team.getId());
        submissionRequest.setChallengeId(request.getChallengeId());
        submissionRequest.setBaseId(request.getBaseId());
        submissionRequest.setAnswer(request.getAnswer());
        submissionRequest.setFileUrl(request.getFileUrl());
        submissionRequest.setIdempotencyKey(request.getIdempotencyKey());

        return submissionService.createSubmission(gameId, submissionRequest);
    }

    @Transactional
    public void updatePushToken(Player player, String pushToken, PushPlatform platform) {
        UUID playerId = player.getId();
        player = playerRepository.findById(playerId)
                .orElseThrow(() -> new ResourceNotFoundException("Player", playerId));
        player.setPushToken(pushToken);
        player.setPushPlatform(platform);
        playerRepository.save(player);
    }

    /**
     * Self-service player data deletion.
     * Removes the player record (including token, push token, device ID).
     * Team-level data (submissions, check-ins, team location) is preserved
     * as it belongs to the team, not the individual player.
     */
    @Transactional
    public void deletePlayerData(Player player) {
        UUID playerId = player.getId();
        player = playerRepository.findById(playerId)
                .orElseThrow(() -> new ResourceNotFoundException("Player", playerId));

        // Delete the player record (cascading from FK will be handled by DB)
        playerRepository.delete(player);
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
        Challenge challenge = resolveAssignedChallenge(base, team);

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

    private Challenge resolveAssignedChallenge(Base base, Team team) {
        List<Assignment> assignments = assignmentRepository.findByBaseId(base.getId());
        List<Assignment> sortedAssignments = assignments.stream()
                .sorted(ASSIGNMENT_RECENCY_COMPARATOR)
                .toList();

        Assignment teamSpecificAssignment = sortedAssignments.stream()
                .filter(a -> a.getTeam() != null && a.getTeam().getId().equals(team.getId()))
                .findFirst()
                .orElse(null);
        Assignment globalAssignment = sortedAssignments.stream()
                .filter(a -> a.getTeam() == null)
                .findFirst()
                .orElse(null);
        Assignment assignment = teamSpecificAssignment != null ? teamSpecificAssignment : globalAssignment;
        return assignment != null ? assignment.getChallenge() : base.getFixedChallenge();
    }
}
