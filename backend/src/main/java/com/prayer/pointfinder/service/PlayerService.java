package com.prayer.pointfinder.service;

import com.prayer.pointfinder.dto.request.CreateSubmissionRequest;
import com.prayer.pointfinder.dto.request.PlayerJoinRequest;
import com.prayer.pointfinder.dto.request.PlayerSubmissionRequest;
import com.prayer.pointfinder.util.LazyInitHelper;
import com.prayer.pointfinder.dto.response.*;
import com.prayer.pointfinder.entity.*;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.exception.ResourceNotFoundException;
import com.prayer.pointfinder.repository.*;
import com.prayer.pointfinder.security.JwtTokenProvider;
import com.prayer.pointfinder.websocket.GameEventBroadcaster;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
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
    private final PlayerLocationRepository playerLocationRepository;
    private final GameAccessService gameAccessService;
    private final OperatorPushNotificationService operatorPushNotificationService;
    private final TemplateVariableService templateVariableService;
    private final GameNotificationRepository gameNotificationRepository;

    @Transactional(timeout = 10)
    public PlayerAuthResponse joinTeam(PlayerJoinRequest request) {
        Team team = teamRepository.findByJoinCode(request.getJoinCode())
                .orElseThrow(() -> new BadRequestException("Invalid join code"));

        Game game = team.getGame();
        if (game.getStatus() == GameStatus.ended) {
            throw new BadRequestException("Game has ended");
        }

        // Find existing player by device ID in this game, or create a new one.
        // If the device rejoins with another team code in the same game, we switch teams.
        Player player = playerRepository.findFirstByDeviceIdAndTeamGameIdOrderByCreatedAtDesc(request.getDeviceId(), game.getId())
                .orElse(null);

        if (player == null) {
            player = Player.builder()
                    .team(team)
                    .deviceId(request.getDeviceId())
                    .displayName(request.getDisplayName())
                    .build();
        } else {
            player.setTeam(team);
            player.setDisplayName(request.getDisplayName());
        }

        try {
            player = playerRepository.save(player);
        } catch (DataIntegrityViolationException ex) {
            // Concurrent join with same deviceId -- re-fetch the winner
            player = playerRepository.findFirstByDeviceIdAndTeamGameIdOrderByCreatedAtDesc(
                    request.getDeviceId(), game.getId())
                    .orElseThrow(() -> new BadRequestException("Join failed, please try again"));
            player.setTeam(team);
            player.setDisplayName(request.getDisplayName());
            player = playerRepository.save(player);
        }

        // Generate JWT token using the persisted player ID
        String jwt = tokenProvider.generatePlayerToken(player.getId(), team.getId(), game.getId());

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
                        .tileSource(game.getTileSource())
                        .build())
                .build();
    }

    @Transactional(timeout = 10)
    public CheckInResponse checkIn(UUID gameId, UUID baseId, Player authPlayer) {
        Player player = loadPlayer(authPlayer);

        Team team = player.getTeam();
        // Force initialization of lazy proxy within this transaction
        team.getId();
        team.getName();
        gameAccessService.ensurePlayerBelongsToGame(player, gameId);
        ensureGameIsLiveForPlayerActions(team);

        Base base = baseRepository.findById(baseId)
                .orElseThrow(() -> new ResourceNotFoundException("Base", baseId));

        if (!base.getGame().getId().equals(gameId)) {
            throw new BadRequestException("Base does not belong to this game");
        }

        // Check if already checked in
        Optional<CheckIn> existing = checkInRepository.findByTeamIdAndBaseId(team.getId(), baseId);
        if (existing.isPresent()) {
            // Return the existing check-in with challenge info
            return buildCheckInResponse(existing.get(), base, team, gameId);
        }

        // Create new check-in
        CheckIn checkIn = CheckIn.builder()
                .game(base.getGame())
                .team(team)
                .base(base)
                .player(player)
                .checkedInAt(Instant.now())
                .build();
        try {
            checkIn = checkInRepository.save(checkIn);
        } catch (DataIntegrityViolationException ex) {
            // Concurrent check-in won the race — return the existing one
            CheckIn existing2 = checkInRepository.findByTeamIdAndBaseId(team.getId(), baseId)
                    .orElseThrow(() -> new BadRequestException("Check-in failed"));
            return buildCheckInResponse(existing2, base, team, gameId);
        }

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

        LazyInitHelper.initializeForBroadcast(event);
        eventBroadcaster.broadcastActivityEvent(gameId, event);
        operatorPushNotificationService.notifyOperatorsForCheckIn(base.getGame(), team, base);

        return buildCheckInResponse(checkIn, base, team, gameId);
    }

    @Transactional(readOnly = true)
    public List<BaseProgressResponse> getProgress(UUID gameId, Player authPlayer) {
        Player player = loadPlayer(authPlayer);

        Team team = player.getTeam();
        // Force initialization of lazy proxy within this transaction
        team.getId();
        gameAccessService.ensurePlayerBelongsToGame(player, gameId);

        List<Base> bases = baseRepository.findByGameId(gameId);
        List<CheckIn> checkIns = checkInRepository.findByGameIdAndTeamId(gameId, team.getId());
        List<Submission> submissions = submissionRepository.findByTeamId(team.getId());
        List<Assignment> assignments = assignmentRepository.findByGameId(gameId);

        // Build unlock maps: targetBaseId -> challengeId that unlocks it
        List<Challenge> unlockChallenges = challengeRepository.findByGameIdAndUnlocksBaseIsNotNull(gameId);
        Map<UUID, UUID> unlockChallengeByTargetBase = new HashMap<>();
        for (Challenge uc : unlockChallenges) {
            unlockChallengeByTargetBase.put(uc.getUnlocksBase().getId(), uc.getId());
        }

        // Build lookup maps
        Map<UUID, CheckIn> checkInByBase = checkIns.stream()
                .collect(Collectors.toMap(ci -> ci.getBase().getId(), ci -> ci));
        Map<UUID, Submission> submissionByBase = submissions.stream()
                .collect(Collectors.toMap(
                        s -> s.getBase().getId(),
                        s -> s,
                        (a, b) -> a.getSubmittedAt().isAfter(b.getSubmittedAt()) ? a : b
                ));
        Map<UUID, Submission> submissionByChallenge = submissions.stream()
                .collect(Collectors.toMap(
                        s -> s.getChallenge().getId(),
                        s -> s,
                        (a, b) -> a.getSubmittedAt().isAfter(b.getSubmittedAt()) ? a : b
                ));

        List<Assignment> sortedAssignments = assignments.stream()
                .sorted(AssignmentResolver.RECENCY_COMPARATOR)
                .toList();

        final UUID teamId = team.getId();
        return bases.stream().map(base -> {
            UUID bId = base.getId();
            CheckIn ci = checkInByBase.get(bId);
            Submission sub = submissionByBase.get(bId);
            Challenge assignment = AssignmentResolver.resolve(base, teamId, sortedAssignments);

            BaseStatus status = BaseStatus.compute(sub, ci);
            String submissionStatus = sub != null ? sub.getStatus().name() : null;

            // Hide bases marked as hidden that the team hasn't visited yet,
            // unless the team has completed the challenge that unlocks this base
            if (Boolean.TRUE.equals(base.getHidden()) && status == BaseStatus.not_visited) {
                UUID unlockingChallengeId = unlockChallengeByTargetBase.get(bId);
                if (unlockingChallengeId != null) {
                    Submission unlockSub = submissionByChallenge.get(unlockingChallengeId);
                    boolean unlocked = unlockSub != null
                            && (unlockSub.getStatus() == SubmissionStatus.approved
                                || unlockSub.getStatus() == SubmissionStatus.correct);
                    if (!unlocked) {
                        return null;
                    }
                } else {
                    return null;
                }
            }

            return BaseProgressResponse.builder()
                    .baseId(bId)
                    .baseName(base.getName())
                    .lat(base.getLat())
                    .lng(base.getLng())
                    .nfcLinked(base.getNfcLinked())
                    .status(status.name())
                    .checkedInAt(ci != null ? ci.getCheckedInAt() : null)
                    .challengeId(assignment != null ? assignment.getId() : null)
                    .submissionStatus(submissionStatus)
                    .build();
        }).filter(Objects::nonNull).collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public List<BaseResponse> getBases(UUID gameId, Player authPlayer) {
        Player player = loadPlayer(authPlayer);
        gameAccessService.ensurePlayerBelongsToGame(player, gameId);

        return baseRepository.findByGameId(gameId).stream()
                .filter(b -> !Boolean.TRUE.equals(b.getHidden()))
                .limit(500)
                .map(base -> BaseResponse.builder()
                        .id(base.getId())
                        .gameId(gameId)
                        .name(base.getName())
                        .description(base.getDescription())
                        .lat(base.getLat())
                        .lng(base.getLng())
                        .nfcLinked(base.getNfcLinked())
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
    public GameDataResponse getGameData(UUID gameId, Player authPlayer) {
        Player player = loadPlayer(authPlayer);

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

        // Load all relevant challenges, resolving {{variables}} for this team
        UUID teamId = team.getId();
        List<ChallengeResponse> challenges = challengeRepository.findByGameId(gameId).stream()
                .filter(c -> challengeIds.contains(c.getId()))
                .map(c -> ChallengeResponse.builder()
                        .id(c.getId())
                        .gameId(gameId)
                        .title(c.getTitle())
                        .description(c.getDescription())
                        .content(templateVariableService.resolveTemplate(
                                c.getContent(), gameId, c.getId(), teamId))
                        .completionContent(templateVariableService.resolveTemplate(
                                c.getCompletionContent(), gameId, c.getId(), teamId))
                        .answerType(c.getAnswerType().name())
                        .autoValidate(c.getAutoValidate())
                        .correctAnswer(null) // Don't expose correct answer to players
                        .points(c.getPoints())
                        .locationBound(c.getLocationBound())
                        .requirePresenceToSubmit(c.getRequirePresenceToSubmit())
                        .build())
                .collect(Collectors.toList());

        return GameDataResponse.builder()
                .gameStatus(team.getGame().getStatus().name())
                .bases(bases)
                .challenges(challenges)
                .assignments(assignments)
                .progress(progress)
                .build();
    }

    @Transactional(timeout = 10)
    public SubmissionResponse submitAnswer(UUID gameId, PlayerSubmissionRequest request, Player authPlayer) {
        Player player = loadPlayer(authPlayer);

        Team team = player.getTeam();
        // Force initialization of lazy proxy within this transaction
        team.getId();
        gameAccessService.ensurePlayerBelongsToGame(player, gameId);
        ensureGameIsLiveForPlayerActions(team);

        Base base = baseRepository.findById(request.getBaseId())
                .orElseThrow(() -> new ResourceNotFoundException("Base", request.getBaseId()));
        if (!base.getGame().getId().equals(gameId)) {
            throw new BadRequestException("Base does not belong to this game");
        }

        // Verify the team has checked in to this base
        if (!checkInRepository.existsByTeamIdAndBaseId(team.getId(), request.getBaseId())) {
            throw new BadRequestException("Team has not checked in to this base");
        }

        List<Assignment> baseAssignments = assignmentRepository.findByBaseId(base.getId());
        List<Assignment> sortedBaseAssignments = baseAssignments.stream()
                .sorted(AssignmentResolver.RECENCY_COMPARATOR).toList();
        Challenge assignedChallenge = AssignmentResolver.resolve(base, team.getId(), sortedBaseAssignments);
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
        submissionRequest.setFileUrls(request.getFileUrls());
        submissionRequest.setIdempotencyKey(request.getIdempotencyKey());

        SubmissionResponse response = submissionService.createSubmission(gameId, submissionRequest);
        // Resolve {{variables}} in completionContent for this team
        response.setCompletionContent(templateVariableService.resolveTemplate(
                response.getCompletionContent(), gameId, request.getChallengeId(), team.getId()));
        return response;
    }

    @Transactional(timeout = 10)
    public void updatePushToken(Player authPlayer, String pushToken, PushPlatform platform) {
        Player player = loadPlayer(authPlayer);
        player.setPushToken(pushToken);
        player.setPushPlatform(platform);
        playerRepository.save(player);
    }

    /**
     * Self-service player data deletion.
     * Removes the player record (including push token, device ID).
     * Team-level data (submissions, check-ins, team location) is preserved
     * as it belongs to the team, not the individual player.
     */
    @Transactional(timeout = 10)
    public void deletePlayerData(Player authPlayer) {
        Player player = loadPlayer(authPlayer);

        // Delete the player record (cascading from FK will be handled by DB)
        playerRepository.delete(player);
    }

    @Transactional(timeout = 10)
    public void updateLocation(UUID gameId, Player authPlayer, Double lat, Double lng) {
        if (lat == null || lng == null || !Double.isFinite(lat) || !Double.isFinite(lng)
                || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
            throw new BadRequestException("Invalid coordinates");
        }

        Player player = loadPlayer(authPlayer);

        Team team = player.getTeam();
        team.getId(); // force initialization

        gameAccessService.ensurePlayerBelongsToGame(player, gameId);
        ensureGameIsLiveForPlayerActions(team);

        PlayerLocation location = playerLocationRepository.findById(playerId).orElse(null);
        if (location == null) {
            location = PlayerLocation.builder()
                    .player(player)
                    .lat(lat)
                    .lng(lng)
                    .build();
        } else {
            location.setLat(lat);
            location.setLng(lng);
        }
        playerLocationRepository.save(location);

        Map<String, Object> locationData = new HashMap<>();
        locationData.put("teamId", team.getId());
        locationData.put("playerId", playerId);
        locationData.put("displayName", player.getDisplayName());
        locationData.put("lat", lat);
        locationData.put("lng", lng);
        locationData.put("updatedAt", Instant.now().toString());
        eventBroadcaster.broadcastLocationUpdate(gameId, locationData);
    }

    @Transactional(timeout = 10)
    public void markNotificationsSeen(Player authPlayer) {
        Player player = loadPlayer(authPlayer);
        player.setLastNotificationsSeenAt(Instant.now());
        playerRepository.save(player);
    }

    @Transactional(readOnly = true)
    public List<NotificationResponse> getNotifications(Player authPlayer) {
        Player player = loadPlayer(authPlayer);
        UUID gameId = player.getTeam().getGame().getId();
        UUID teamId = player.getTeam().getId();
        return gameNotificationRepository.findByGameIdForTeam(gameId, teamId)
                .stream()
                .map(this::toNotificationResponse)
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public UnseenCountResponse getUnseenNotificationCount(Player authPlayer) {
        Player player = loadPlayer(authPlayer);
        UUID gameId = player.getTeam().getGame().getId();
        UUID teamId = player.getTeam().getId();
        Instant since = player.getLastNotificationsSeenAt() != null
                ? player.getLastNotificationsSeenAt()
                : Instant.EPOCH;
        long count = gameNotificationRepository.countUnseenForTeam(gameId, teamId, since);
        return new UnseenCountResponse(count);
    }

    private NotificationResponse toNotificationResponse(GameNotification n) {
        return NotificationResponse.builder()
                .id(n.getId())
                .gameId(n.getGame().getId())
                .message(n.getMessage())
                .targetTeamId(n.getTargetTeam() != null ? n.getTargetTeam().getId() : null)
                .sentAt(n.getSentAt())
                .sentBy(n.getSentBy() != null ? n.getSentBy().getId() : null)
                .build();
    }

    /**
     * Re-fetches the player entity within the current transaction to get a fresh
     * entity with a proper Hibernate session, avoiding LazyInitializationException.
     */
    private Player loadPlayer(Player authPlayer) {
        UUID playerId = authPlayer.getId();
        return playerRepository.findById(playerId)
                .orElseThrow(() -> new ResourceNotFoundException("Player", playerId));
    }

    private CheckInResponse buildCheckInResponse(CheckIn checkIn, Base base, Team team, UUID gameId) {
        List<Assignment> baseAssignments2 = assignmentRepository.findByBaseId(base.getId());
        List<Assignment> sortedBaseAssignments2 = baseAssignments2.stream()
                .sorted(AssignmentResolver.RECENCY_COMPARATOR).toList();
        Challenge challenge = AssignmentResolver.resolve(base, team.getId(), sortedBaseAssignments2);

        CheckInResponse.ChallengeInfo challengeInfo = null;
        if (challenge != null) {
            challengeInfo = CheckInResponse.ChallengeInfo.builder()
                    .id(challenge.getId())
                    .title(challenge.getTitle())
                    .description(challenge.getDescription())
                    .content(templateVariableService.resolveTemplate(
                            challenge.getContent(), gameId, challenge.getId(), team.getId()))
                    .completionContent(templateVariableService.resolveTemplate(
                            challenge.getCompletionContent(), gameId, challenge.getId(), team.getId()))
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

    private void ensureGameIsLiveForPlayerActions(Team team) {
        if (team.getGame().getStatus() != GameStatus.live) {
            throw new BadRequestException("Game is not active yet");
        }
    }
}
