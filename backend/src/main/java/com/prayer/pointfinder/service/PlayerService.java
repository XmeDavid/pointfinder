package com.prayer.pointfinder.service;

import com.prayer.pointfinder.dto.request.CheckInRequest;
import com.prayer.pointfinder.dto.request.CreateSubmissionRequest;
import com.prayer.pointfinder.dto.request.PlayerJoinRequest;
import com.prayer.pointfinder.dto.request.PlayerSubmissionRequest;
import com.prayer.pointfinder.util.LazyInitHelper;
import com.prayer.pointfinder.dto.response.*;
import com.prayer.pointfinder.entity.*;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.exception.ErrorCode;
import com.prayer.pointfinder.exception.ResourceNotFoundException;
import com.prayer.pointfinder.repository.*;
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
    private final BaseOrderService baseOrderService;
    private final PushTokenService pushTokenService;
    private final GameRepository gameRepository;
    private final BaseRepository baseRepository;
    private final ChallengeRepository challengeRepository;
    private final AssignmentRepository assignmentRepository;
    private final CheckInRepository checkInRepository;
    private final SubmissionRepository submissionRepository;
    private final ActivityEventRepository activityEventRepository;
    private final GameEventBroadcaster eventBroadcaster;
    private final SubmissionService submissionService;
    private final PlayerLocationRepository playerLocationRepository;
    private final GameAccessService gameAccessService;
    private final OperatorPushNotificationService operatorPushNotificationService;
    private final TemplateVariableService templateVariableService;
    private final BaseUnlockOverrideRepository baseUnlockOverrideRepository;
    private final StageRepository stageRepository;
    private final PlayerJoinService playerJoinService;
    private final CheckInVerificationService checkInVerificationService;
    private final PlayerNotificationQueryService playerNotificationQueryService;

    public PlayerAuthResponse joinTeam(PlayerJoinRequest request) {
        return playerJoinService.joinTeam(request);
    }

    @Transactional(timeout = 10)
    public CheckInResponse checkIn(UUID gameId, UUID baseId, Player authPlayer, CheckInRequest request) {
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

        // Idempotency first: a team that already owns this base gets its
        // existing row back no matter what proof the phone re-sent. This runs
        // before verification so a repeat tap from inside a building, or a
        // rescue the operator already granted, never turns into an error.
        Optional<CheckIn> existing = checkInRepository.findByTeamIdAndBaseId(team.getId(), baseId);
        if (existing.isPresent()) {
            return buildCheckInResponse(existing.get(), base, team, gameId);
        }

        // Route order before proof: a team blocked by the route must not learn
        // whether its proof for a later base would have been accepted.
        if (Boolean.TRUE.equals(base.getGame().getEnforceBaseOrder())) {
            baseOrderService.requirePreviousBases(base.getGame(), team.getId(), baseId);
        }

        CheckInVerificationService.VerifiedProof proof =
                checkInVerificationService.verify(base, team, request, Instant.now());

        // Create new check-in.
        // V36 audit foundation: snapshot the player's device id (the player
        // FK already records the live identity; the snapshot survives later
        // player deletion). The display-name snapshot lives on the activity
        // event below because the existing check_ins schema does not need
        // it for the gameplay path — only the activity feed does.
        CheckIn checkIn = CheckIn.builder()
                .game(base.getGame())
                .team(team)
                .base(base)
                .player(player)
                .checkedInAt(proof.checkedInAt())
                .method(proof.method())
                .verification(proof.verification())
                .proofLat(proof.proofLat())
                .proofLng(proof.proofLng())
                .proofAccuracyM(proof.proofAccuracyM())
                .proofDistanceM(proof.proofDistanceM())
                .proofCapturedAt(proof.proofCapturedAt())
                .teamPositionsSnapshot(proof.teamPositionsSnapshotJson())
                .actorDeviceIdSnapshot(player.getDeviceId())
                .actorDisplayNameSnapshot(player.getDisplayName())
                .sourceSurface("player_app")
                .build();
        try {
            checkIn = checkInRepository.save(checkIn);
        } catch (DataIntegrityViolationException ex) {
            // Concurrent check-in won the race — return the existing one
            CheckIn existing2 = checkInRepository.findByTeamIdAndBaseId(team.getId(), baseId)
                    .orElseThrow(() -> new BadRequestException("Check-in failed"));
            return buildCheckInResponse(existing2, base, team, gameId);
        }

        // Create activity event with full player actor capture (V36).
        // Structured twin of the feed message. The operator UI reads these to
        // draw the method icon and the "claimed" badge; the free-text message
        // stays the human sentence and is not parsed by anyone.
        Map<String, Object> eventMetadata = new LinkedHashMap<>();
        eventMetadata.put("method", proof.method().name());
        eventMetadata.put("verification", proof.verification().name());
        if (proof.verification() == CheckInVerification.CLAIMED) {
            eventMetadata.put("teammatesInRing", proof.teammatesInRing());
            eventMetadata.put("teammatesTotal", proof.teammatesTotal());
        }

        ActivityEvent event = ActivityEvent.builder()
                .game(base.getGame())
                .type(ActivityEventType.check_in)
                .team(team)
                .base(base)
                .message(team.getName() + " checked in at " + base.getName())
                .timestamp(Instant.now())
                .actorPlayer(player)
                .actorDisplayNameSnapshot(player.getDisplayName())
                .actorDeviceIdSnapshot(player.getDeviceId())
                .sourceSurface("player_app")
                .metadata(eventMetadata)
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

        Game game = gameRepository.findById(gameId)
                .orElseThrow(() -> new ResourceNotFoundException("Game", gameId));
        UnlockTrigger unlockTrigger = game.getUnlockTrigger();

        List<Base> bases = baseRepository.findByGameId(gameId);
        Map<UUID, Integer> sequenceNumbers = Boolean.TRUE.equals(game.getEnforceBaseOrder())
                ? baseOrderService.sequenceNumbers(game) : Map.of();
        List<CheckIn> checkIns = checkInRepository.findByGameIdAndTeamId(gameId, team.getId());
        List<Submission> submissions = submissionRepository.findByTeamId(team.getId());
        List<Assignment> assignments = assignmentRepository.findByGameIdAndTeamId(gameId, team.getId());

        // P1 Phase 2: active operator unlock overrides make a hidden base
        // visible to this team regardless of the normal unlock trigger.
        // The query is scoped to (gameId, teamId) and filters archived/
        // deleted overrides so a reversed override no longer affects
        // visibility. Keeping it as a Set<UUID> of base ids means the
        // downstream per-base visibility decision is an O(1) check.
        Set<UUID> overriddenBaseIds = baseUnlockOverrideRepository
                .findActiveByGameIdAndTeamId(gameId, team.getId()).stream()
                .map(o -> o.getBase().getId())
                .collect(Collectors.toSet());

        // Stage-aware visibility: build set of active stage IDs so bases
        // assigned to an inactive stage are filtered out. Bases with no
        // stage (stageId == null) are always visible (flat game / unassigned).
        Set<UUID> activeStageIds = stageRepository.findByGameIdOrderByOrderIndexAsc(gameId).stream()
                .filter(s -> Boolean.TRUE.equals(s.getIsActive()))
                .map(Stage::getId)
                .collect(Collectors.toSet());

        // Build unlock maps: targetBaseId -> challengeId that unlocks it
        List<Challenge> unlockChallenges = challengeRepository.findByGameIdAndUnlocksBasesNotEmpty(gameId);
        Map<UUID, UUID> unlockChallengeByTargetBase = new HashMap<>();
        for (Challenge uc : unlockChallenges) {
            for (Base unlockedBase : uc.getUnlocksBases()) {
                unlockChallengeByTargetBase.put(unlockedBase.getId(), uc.getId());
            }
        }

        // For CHECK_IN mode: map unlocking challengeId -> the baseId where that challenge lives
        Map<UUID, UUID> fixedBaseByChallenge = new HashMap<>();
        for (Base b : bases) {
            if (b.getFixedChallenge() != null) {
                fixedBaseByChallenge.put(b.getFixedChallenge().getId(), b.getId());
            }
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

            // Stage gate: if a base belongs to an inactive stage, hide it
            // from the player unless an operator unlock override exists.
            // Bases with no stage (stageId == null) pass through unchanged.
            if (base.getStageId() != null
                    && !activeStageIds.contains(base.getStageId())
                    && !overriddenBaseIds.contains(bId)) {
                return null;
            }

            CheckIn ci = checkInByBase.get(bId);
            Submission sub = submissionByBase.get(bId);
            Challenge assignment = AssignmentResolver.resolve(base, teamId, sortedAssignments);

            BaseStatus status = BaseStatus.compute(sub, ci);
            String submissionStatus = sub != null ? sub.getStatus().name() : null;

            // Hide bases marked as hidden that the team hasn't visited yet,
            // unless the unlock condition for this base is met OR an
            // operator has created an active unlock override for this
            // (team, base) pair via the P1 Phase 2 rescue endpoint.
            if (Boolean.TRUE.equals(base.getHidden()) && status == BaseStatus.not_visited) {
                // Operator override short-circuits the normal unlock
                // trigger: if an active override exists, the base is
                // visible regardless of what the unlock rules say.
                if (overriddenBaseIds.contains(bId)) {
                    // fall through to the normal progress projection below
                } else {
                    UUID unlockingChallengeId = unlockChallengeByTargetBase.get(bId);
                    if (unlockingChallengeId == null) {
                        return null;
                    }

                    boolean unlocked = switch (unlockTrigger) {
                        case CHECK_IN -> {
                            // Check if team checked in at the base where the unlocking challenge lives
                            UUID challengeFixedBase = fixedBaseByChallenge.get(unlockingChallengeId);
                            yield challengeFixedBase != null && checkInByBase.containsKey(challengeFixedBase);
                        }
                        case SUBMISSION -> {
                            Submission unlockSub = submissionByChallenge.get(unlockingChallengeId);
                            yield unlockSub != null;
                        }
                        case COMPLETED -> {
                            Submission unlockSub = submissionByChallenge.get(unlockingChallengeId);
                            yield unlockSub != null
                                    && (unlockSub.getStatus() == SubmissionStatus.approved
                                        || unlockSub.getStatus() == SubmissionStatus.correct);
                        }
                    };

                    if (!unlocked) {
                        return null;
                    }
                }
            }

            // P1 Phase 4 W4: player-facing naming contract — players see
            // challenge titles, not base names. When an assignment exists,
            // project its title into the response; otherwise leave the
            // field null (e.g. a hidden base that is a check-in-only
            // unlock target). The operator-facing base name is NEVER
            // included in this player DTO.
            return new BaseProgressResponse(
                    bId,
                    assignment != null ? assignment.getTitle() : null,
                    base.getLat(),
                    base.getLng(),
                    base.getNfcLinked(),
                    status.name(),
                    ci != null ? ci.getCheckedInAt() : null,
                    assignment != null ? assignment.getId() : null,
                    submissionStatus,
                    sequenceNumbers.get(bId));
        }).filter(Objects::nonNull).toList();
    }

    @Transactional(readOnly = true)
    public List<PlayerBaseResponse> getBases(UUID gameId, Player authPlayer) {
        Player player = loadPlayer(authPlayer);
        gameAccessService.ensurePlayerBelongsToGame(player, gameId);

        // Uses PlayerBaseResponse (not the operator-facing BaseResponse)
        // so operator-only fields — nfcToken, tags, color, name,
        // description — cannot leak to players by construction. This
        // invariant is enforced by PlayerControllerTest via JSON path
        // assertions on the response body. See PlayerBaseResponse
        // javadoc for the full rationale, including the W4 naming
        // contract that removes base name/description from the player
        // DTO.

        // Stage-aware visibility: bases in inactive stages are hidden.
        Set<UUID> activeStageIds = stageRepository.findByGameIdOrderByOrderIndexAsc(gameId).stream()
                .filter(s -> Boolean.TRUE.equals(s.getIsActive()))
                .map(Stage::getId)
                .collect(Collectors.toSet());

        Map<UUID, Integer> sequenceNumbers = Boolean.TRUE.equals(player.getTeam().getGame().getEnforceBaseOrder())
                ? baseOrderService.sequenceNumbers(player.getTeam().getGame()) : Map.of();
        return baseRepository.findByGameId(gameId).stream()
                .filter(b -> !Boolean.TRUE.equals(b.getHidden()))
                .filter(b -> b.getStageId() == null || activeStageIds.contains(b.getStageId()))
                .limit(500)
                .map(base -> new PlayerBaseResponse(
                        base.getId(),
                        gameId,
                        base.getLat(),
                        base.getLng(),
                        base.getNfcLinked(),
                        base.getHidden(),
                        base.getFixedChallenge() != null ? base.getFixedChallenge().getId() : null,
                        sequenceNumbers.get(base.getId()),
                        base.getCheckInMethod() != null ? base.getCheckInMethod().name() : CheckInMethod.NFC.name(),
                        base.resolvedCheckInRadiusM()
                ))
                .toList();
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

        Game game = gameRepository.findById(gameId)
                .orElseThrow(() -> new ResourceNotFoundException("Game", gameId));

        // Get current progress (already filters hidden+not_visited bases)
        List<BaseProgressResponse> progress = getProgress(gameId, player);

        // Collect visible base IDs from progress to filter other lists
        Set<UUID> visibleBaseIds = progress.stream()
                .map(BaseProgressResponse::baseId)
                .collect(Collectors.toSet());

        // Get all bases for the game
        List<PlayerBaseResponse> allGameBases = getBases(gameId, player);

        // Visible bases: those in progress
        List<PlayerBaseResponse> bases = allGameBases.stream()
                .filter(b -> visibleBaseIds.contains(b.id()))
                .toList();

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
                .toList();

        // Collect all challenge IDs from assignments and fixed challenges
        Set<UUID> challengeIds = new HashSet<>();
        for (AssignmentResponse a : assignments) {
            challengeIds.add(a.challengeId());
        }
        for (PlayerBaseResponse b : bases) {
            if (b.fixedChallengeId() != null) {
                challengeIds.add(b.fixedChallengeId());
            }
        }

        // Build fixedBaseId lookup: challengeId -> baseId where the challenge lives
        Map<UUID, UUID> fixedBaseByChallenge = new HashMap<>();
        for (PlayerBaseResponse b : allGameBases) {
            if (b.fixedChallengeId() != null) {
                fixedBaseByChallenge.put(b.fixedChallengeId(), b.id());
            }
        }

        // Collect hidden base IDs that are unlock targets of visible challenges,
        // so clients can reveal them locally on check-in without a server round-trip.
        Set<UUID> hiddenUnlockTargetIds = new HashSet<>();
        List<Challenge> allChallenges = challengeRepository.findByGameId(gameId);
        Map<UUID, Challenge> challengeById = allChallenges.stream()
                .collect(Collectors.toMap(Challenge::getId, c -> c));
        for (UUID cId : challengeIds) {
            Challenge c = challengeById.get(cId);
            if (c != null && !c.getUnlocksBases().isEmpty()) {
                for (Base targetBase : c.getUnlocksBases()) {
                    if (!visibleBaseIds.contains(targetBase.getId())) {
                        hiddenUnlockTargetIds.add(targetBase.getId());
                    }
                }
            }
        }

        // Add hidden unlock-target bases to the bases list so clients have their metadata
        if (!hiddenUnlockTargetIds.isEmpty()) {
            List<PlayerBaseResponse> hiddenBases = allGameBases.stream()
                    .filter(b -> hiddenUnlockTargetIds.contains(b.id()))
                    .toList();
            List<PlayerBaseResponse> combinedBases = new ArrayList<>(bases);
            combinedBases.addAll(hiddenBases);
            bases = combinedBases;
        }

        // Hidden LOCATION bases the team has not found yet ship as bare
        // geometry — id, coordinates, method, radius — and nothing else. The
        // arrival detector has to work offline and cannot ask the server
        // "am I near something?", so the ring has to be on the phone; but the
        // name, challenge and content stay behind until the base is earned.
        Set<UUID> alreadySent = bases.stream().map(PlayerBaseResponse::id).collect(Collectors.toSet());
        Set<UUID> visitedBaseIds = checkInRepository.findByGameIdAndTeamId(gameId, player.getTeam().getId()).stream()
                .map(ci -> ci.getBase().getId())
                .collect(Collectors.toSet());
        List<PlayerBaseResponse> geofenceOnly = baseRepository.findByGameId(gameId).stream()
                .filter(b -> Boolean.TRUE.equals(b.getHidden()))
                .filter(b -> b.getCheckInMethod() == CheckInMethod.LOCATION)
                .filter(b -> !alreadySent.contains(b.getId()))
                .filter(b -> !visitedBaseIds.contains(b.getId()))
                .map(b -> new PlayerBaseResponse(
                        b.getId(),
                        gameId,
                        b.getLat(),
                        b.getLng(),
                        false,
                        true,
                        null,
                        null,
                        CheckInMethod.LOCATION.name(),
                        b.resolvedCheckInRadiusM()))
                .toList();
        if (!geofenceOnly.isEmpty()) {
            List<PlayerBaseResponse> withGeofences = new ArrayList<>(bases);
            withGeofences.addAll(geofenceOnly);
            bases = withGeofences;
        }

        // Load all relevant challenges, resolving {{variables}} for this team.
        //
        // Uses PlayerChallengeResponse (not the operator-facing
        // ChallengeResponse) so operator-only fields — correctAnswer and
        // operatorNotes — cannot leak to players by construction. This
        // invariant is enforced by PlayerControllerTest via JSON path
        // assertions on the response body.
        UUID teamId = team.getId();
        List<PlayerChallengeResponse> challenges = allChallenges.stream()
                .filter(c -> challengeIds.contains(c.getId()))
                .map(c -> {
                        // Wave F: `points` is omitted from PlayerChallengeResponse.
                        return new PlayerChallengeResponse(
                                c.getId(),
                                gameId,
                                c.getTitle(),
                                c.getDescription(),
                                templateVariableService.resolveTemplate(
                                        c.getContent(), gameId, c.getId(), teamId),
                                templateVariableService.resolveTemplate(
                                        c.getCompletionContent(), gameId, c.getId(), teamId),
                                c.getAnswerType().name(),
                                c.getAutoValidate(),
                                c.getLocationBound(),
                                c.getRequirePresenceToSubmit(),
                                c.getUnlocksBases().isEmpty() ? null :
                                        c.getUnlocksBases().stream().map(Base::getId).toList(),
                                fixedBaseByChallenge.get(c.getId())
                        );
                })
                .toList();

        return new GameDataResponse(
                team.getGame().getStatus().name(),
                game.getUnlockTrigger().name(),
                bases,
                challenges,
                assignments,
                progress,
                Boolean.TRUE.equals(game.getEnforceBaseOrder()),
                Boolean.TRUE.equals(game.getEnforceBaseOrder())
                        ? baseOrderService.nextRequiredBaseNumber(game, team.getId()) : null);
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

        // Durable upload linkage: any completed upload session for this (player, game)
        // whose file_url ended up inside this submission gets its FK populated so that
        // operator visibility, needs-attention detection, and future audit trails can
        // distinguish "media arrived but no submission" from "media arrived and was
        // consumed". Idempotent on retry: sessions that already have the right
        // submission_id (including from a previous idempotent submitAnswer) are
        // skipped without error. This runs inside the same @Transactional boundary as
        // createSubmission, so either both succeed or both roll back.
        submissionService.linkUploadSessionsToSubmission(response, gameId, player.getId());

        // Resolve {{variables}} in completionContent for this team
        String resolvedContent = templateVariableService.resolveTemplate(
                response.completionContent(), gameId, request.getChallengeId(), team.getId());
        return new SubmissionResponse(
                response.id(), response.teamId(), response.challengeId(), response.baseId(),
                response.answer(), response.fileUrl(), response.fileUrls(), response.status(),
                response.submittedAt(), response.reviewedBy(), response.feedback(), response.points(),
                resolvedContent);
    }

    @Transactional(timeout = 10)
    public void updatePushToken(Player authPlayer, String pushToken, PushPlatform platform) {
        pushTokenService.registerPlayer(authPlayer.getId(), pushToken, platform);
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

    /** Backwards-compatible overload for callers with no fix metadata. */
    @Transactional(timeout = 10)
    public void updateLocation(UUID gameId, Player authPlayer, Double lat, Double lng) {
        updateLocation(gameId, authPlayer, lat, lng, null, null);
    }

    @Transactional(timeout = 10)
    public void updateLocation(UUID gameId, Player authPlayer, Double lat, Double lng,
                               Double accuracy, Instant capturedAt) {
        if (lat == null || lng == null || !Double.isFinite(lat) || !Double.isFinite(lng)
                || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
            throw new BadRequestException("Invalid coordinates");
        }

        // A garbage accuracy reading is not a reason to drop a good position:
        // keep the coordinates, forget the metadata.
        Double storedAccuracy = accuracy != null && Double.isFinite(accuracy) && accuracy >= 0
                ? accuracy : null;

        Player player = loadPlayer(authPlayer);

        Team team = player.getTeam();
        team.getId(); // force initialization

        gameAccessService.ensurePlayerBelongsToGame(player, gameId);
        ensureGameIsLiveForPlayerActions(team);

        PlayerLocation location = playerLocationRepository.findById(player.getId()).orElse(null);
        if (location == null) {
            location = PlayerLocation.builder()
                    .player(player)
                    .lat(lat)
                    .lng(lng)
                    .accuracyM(storedAccuracy)
                    .capturedAt(capturedAt)
                    .build();
        } else {
            location.setLat(lat);
            location.setLng(lng);
            location.setAccuracyM(storedAccuracy);
            location.setCapturedAt(capturedAt);
        }
        playerLocationRepository.save(location);

        Map<String, Object> locationData = new HashMap<>();
        locationData.put("teamId", team.getId());
        locationData.put("playerId", player.getId());
        locationData.put("displayName", player.getDisplayName());
        locationData.put("lat", lat);
        locationData.put("lng", lng);
        locationData.put("accuracyM", storedAccuracy);
        locationData.put("capturedAt", capturedAt != null ? capturedAt.toString() : null);
        locationData.put("updatedAt", Instant.now().toString());
        eventBroadcaster.broadcastLocationUpdate(gameId, locationData);
    }

    public void markNotificationsSeen(Player authPlayer) {
        playerNotificationQueryService.markNotificationsSeen(authPlayer);
    }

    public List<NotificationResponse> getNotifications(Player authPlayer) {
        return playerNotificationQueryService.getNotifications(authPlayer);
    }

    public UnseenCountResponse getUnseenNotificationCount(Player authPlayer) {
        return playerNotificationQueryService.getUnseenNotificationCount(authPlayer);
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
            // Wave F: `points` is omitted from CheckInResponse.ChallengeInfo.
            challengeInfo = new CheckInResponse.ChallengeInfo(
                    challenge.getId(),
                    challenge.getTitle(),
                    challenge.getDescription(),
                    templateVariableService.resolveTemplate(
                            challenge.getContent(), gameId, challenge.getId(), team.getId()),
                    templateVariableService.resolveTemplate(
                            challenge.getCompletionContent(), gameId, challenge.getId(), team.getId()),
                    challenge.getAnswerType().name(),
                    challenge.getRequirePresenceToSubmit());
        }

        // P1 Phase 4 W4: player-facing naming contract — CheckInResponse
        // no longer carries baseName. The player already knows which
        // base they scanned, and the relevant post-check-in label is
        // the challenge title which lives on ChallengeInfo below.
        return new CheckInResponse(
                checkIn.getId(),
                base.getId(),
                checkIn.getCheckedInAt(),
                challengeInfo,
                checkIn.getMethod() != null ? checkIn.getMethod().name() : CheckInMethod.NFC.name(),
                checkIn.getVerification() != null
                        ? checkIn.getVerification().name() : CheckInVerification.VERIFIED.name());
    }

    private void ensureGameIsLiveForPlayerActions(Team team) {
        if (team.getGame().getStatus() != GameStatus.live) {
            throw new BadRequestException("Game is not active yet");
        }
    }
}
