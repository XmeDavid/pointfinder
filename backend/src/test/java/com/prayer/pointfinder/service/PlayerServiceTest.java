package com.prayer.pointfinder.service;

import com.prayer.pointfinder.dto.request.PlayerJoinRequest;
import com.prayer.pointfinder.dto.response.BaseProgressResponse;
import com.prayer.pointfinder.dto.response.PlayerAuthResponse;
import com.prayer.pointfinder.entity.Base;
import com.prayer.pointfinder.entity.Challenge;
import com.prayer.pointfinder.entity.CheckIn;
import com.prayer.pointfinder.entity.Game;
import com.prayer.pointfinder.entity.Assignment;
import com.prayer.pointfinder.entity.GameStatus;
import com.prayer.pointfinder.entity.Player;
import com.prayer.pointfinder.entity.UnlockTrigger;
import com.prayer.pointfinder.entity.Submission;
import com.prayer.pointfinder.entity.SubmissionStatus;
import com.prayer.pointfinder.entity.Team;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.dto.request.PlayerSubmissionRequest;
import com.prayer.pointfinder.dto.request.CreateSubmissionRequest;
import com.prayer.pointfinder.dto.response.SubmissionResponse;
import com.prayer.pointfinder.entity.AnswerType;
import com.prayer.pointfinder.entity.UploadSession;
import com.prayer.pointfinder.entity.UploadSessionStatus;
import com.prayer.pointfinder.repository.ActivityEventRepository;
import com.prayer.pointfinder.repository.AssignmentRepository;
import com.prayer.pointfinder.repository.BaseRepository;
import com.prayer.pointfinder.repository.BaseUnlockOverrideRepository;
import com.prayer.pointfinder.repository.GameRepository;
import com.prayer.pointfinder.repository.ChallengeRepository;
import com.prayer.pointfinder.repository.CheckInRepository;
import com.prayer.pointfinder.repository.PlayerLocationRepository;
import com.prayer.pointfinder.repository.PlayerRepository;
import com.prayer.pointfinder.repository.SubmissionRepository;
import com.prayer.pointfinder.repository.TeamLocationRepository;
import com.prayer.pointfinder.repository.TeamRepository;
import com.prayer.pointfinder.repository.UploadSessionRepository;
import com.prayer.pointfinder.repository.GameNotificationRepository;
import com.prayer.pointfinder.repository.StageRepository;
import com.prayer.pointfinder.security.JwtTokenProvider;
import com.prayer.pointfinder.service.QuotaService;
import com.prayer.pointfinder.websocket.GameEventBroadcaster;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class PlayerServiceTest {

    @Mock
    private PlayerRepository playerRepository;
    @Mock
    private TeamRepository teamRepository;
    @Mock
    private BaseRepository baseRepository;
    @Mock
    private ChallengeRepository challengeRepository;
    @Mock
    private AssignmentRepository assignmentRepository;
    @Mock
    private CheckInRepository checkInRepository;
    @Mock
    private SubmissionRepository submissionRepository;
    @Mock
    private ActivityEventRepository activityEventRepository;
    @Mock
    private GameEventBroadcaster eventBroadcaster;
    @Mock
    private JwtTokenProvider tokenProvider;
    @Mock
    private SubmissionService submissionService;
    @Mock
    private TeamLocationRepository teamLocationRepository;
    @Mock
    private PlayerLocationRepository playerLocationRepository;
    @Mock
    private GameRepository gameRepository;
    @Mock
    private GameAccessService gameAccessService;
    @Mock
    private OperatorPushNotificationService operatorPushNotificationService;
    @Mock
    private TemplateVariableService templateVariableService;
    @Mock
    private GameNotificationRepository gameNotificationRepository;
    @Mock
    private UploadSessionRepository uploadSessionRepository;
    @Mock
    private BaseUnlockOverrideRepository baseUnlockOverrideRepository;
    @Mock
    private StageRepository stageRepository;
    @Mock
    private QuotaService quotaService;

    @InjectMocks
    private PlayerService playerService;

    @Test
    void updateLocationBlocksWhenGameIsNotLive() {
        UUID gameId = UUID.randomUUID();
        UUID teamId = UUID.randomUUID();
        UUID playerId = UUID.randomUUID();

        Game game = Game.builder()
                .id(gameId)
                .name("Setup Game")
                .description("Desc")
                .status(GameStatus.setup)
                .build();
        Team team = Team.builder()
                .id(teamId)
                .game(game)
                .name("Wolves")
                .joinCode("SETUP02")
                .color("#FF9900")
                .build();
        Player player = Player.builder()
                .id(playerId)
                .team(team)
                .deviceId("device-location")
                .displayName("Player")
                .build();

        when(playerRepository.findById(playerId)).thenReturn(Optional.of(player));

        BadRequestException ex = assertThrows(
                BadRequestException.class,
                () -> playerService.updateLocation(gameId, player, 40.0, -8.0)
        );

        assertEquals("Game is not active yet", ex.getMessage());
        verify(playerLocationRepository, never()).save(any());
    }

    @Test
    void updateLocationRejectsInvalidLatitude() {
        UUID gameId = UUID.randomUUID();
        Player player = Player.builder()
                .id(UUID.randomUUID())
                .deviceId("device-loc")
                .displayName("Player")
                .build();

        BadRequestException ex = assertThrows(
                BadRequestException.class,
                () -> playerService.updateLocation(gameId, player, 91.0, 10.0)
        );
        assertEquals("Invalid coordinates", ex.getMessage());
        verify(playerLocationRepository, never()).save(any());
    }

    @Test
    void updateLocationRejectsInvalidLongitude() {
        UUID gameId = UUID.randomUUID();
        Player player = Player.builder()
                .id(UUID.randomUUID())
                .deviceId("device-loc")
                .displayName("Player")
                .build();

        BadRequestException ex = assertThrows(
                BadRequestException.class,
                () -> playerService.updateLocation(gameId, player, 40.0, -181.0)
        );
        assertEquals("Invalid coordinates", ex.getMessage());
        verify(playerLocationRepository, never()).save(any());
    }

    @Test
    void updateLocationRejectsNegativeInvalidLatitude() {
        UUID gameId = UUID.randomUUID();
        Player player = Player.builder()
                .id(UUID.randomUUID())
                .deviceId("device-loc")
                .displayName("Player")
                .build();

        BadRequestException ex = assertThrows(
                BadRequestException.class,
                () -> playerService.updateLocation(gameId, player, -91.0, 0.0)
        );
        assertEquals("Invalid coordinates", ex.getMessage());
    }

    @Test
    void getProgressShowsHiddenBaseWhenUnlockChallengeIsCompleted() {
        UUID gameId = UUID.randomUUID();
        UUID teamId = UUID.randomUUID();
        UUID playerId = UUID.randomUUID();
        UUID challengeId = UUID.randomUUID();
        UUID sourceBaseId = UUID.randomUUID();
        UUID hiddenBaseId = UUID.randomUUID();

        Game game = Game.builder()
                .id(gameId)
                .name("Live Game")
                .description("Desc")
                .status(GameStatus.live)
                .unlockTrigger(UnlockTrigger.COMPLETED)
                .build();
        Team team = Team.builder()
                .id(teamId)
                .game(game)
                .name("Wolves")
                .joinCode("LIVE22")
                .color("#00AA00")
                .build();
        Player player = Player.builder()
                .id(playerId)
                .team(team)
                .deviceId("device-progress")
                .displayName("Scout")
                .build();
        Base sourceBase = Base.builder()
                .id(sourceBaseId)
                .game(game)
                .name("Source Base")
                .description("Desc")
                .lat(1.0)
                .lng(2.0)
                .hidden(false)
                .nfcLinked(false)
                .build();
        Base hiddenBase = Base.builder()
                .id(hiddenBaseId)
                .game(game)
                .name("Hidden Base")
                .description("Desc")
                .lat(3.0)
                .lng(4.0)
                .hidden(true)
                .nfcLinked(false)
                .build();
        Challenge unlockChallenge = Challenge.builder()
                .id(challengeId)
                .game(game)
                .title("Unlock challenge")
                .locationBound(true)
                .unlocksBases(new java.util.HashSet<>(java.util.Set.of(hiddenBase)))
                .build();
        Submission unlockSubmission = Submission.builder()
                .id(UUID.randomUUID())
                .team(team)
                .challenge(unlockChallenge)
                .base(sourceBase)
                .answer("ok")
                .status(SubmissionStatus.correct)
                .submittedAt(Instant.now())
                .build();

        when(playerRepository.findById(playerId)).thenReturn(Optional.of(player));
        when(gameRepository.findById(gameId)).thenReturn(Optional.of(game));
        when(baseRepository.findByGameId(gameId)).thenReturn(List.of(sourceBase, hiddenBase));
        when(checkInRepository.findByGameIdAndTeamId(gameId, teamId)).thenReturn(List.of());
        when(submissionRepository.findByTeamId(teamId)).thenReturn(List.of(unlockSubmission));
        when(assignmentRepository.findByGameIdAndTeamId(gameId, teamId)).thenReturn(List.of());
        when(challengeRepository.findByGameIdAndUnlocksBasesNotEmpty(gameId)).thenReturn(List.of(unlockChallenge));
        // P1 Phase 2: getProgress now also consults the unlock override
        // repository. The default Mockito return is null, which would NPE
        // on the subsequent .stream() call; return an empty list instead.
        when(baseUnlockOverrideRepository.findActiveByGameIdAndTeamId(gameId, teamId))
                .thenReturn(List.of());

        List<BaseProgressResponse> progress = playerService.getProgress(gameId, player);

        BaseProgressResponse hiddenProgress = progress.stream()
                .filter(p -> p.baseId().equals(hiddenBaseId))
                .findFirst()
                .orElseThrow();

        assertEquals("not_visited", hiddenProgress.status());
        assertTrue(progress.stream().anyMatch(p -> p.baseId().equals(sourceBaseId)));
    }

    @Test
    void checkInNotifiesOperatorsAfterSuccessfulCheckIn() {
        UUID gameId = UUID.randomUUID();
        UUID teamId = UUID.randomUUID();
        UUID playerId = UUID.randomUUID();
        UUID baseId = UUID.randomUUID();
        UUID checkInId = UUID.randomUUID();

        Game game = Game.builder()
                .id(gameId)
                .name("Live Game")
                .description("Desc")
                .status(GameStatus.live)
                .build();
        Team team = Team.builder()
                .id(teamId)
                .game(game)
                .name("Wolves")
                .joinCode("LIVE12")
                .color("#00AA00")
                .build();
        Player player = Player.builder()
                .id(playerId)
                .team(team)
                .deviceId("device-checkin")
                .displayName("Scout")
                .build();
        Base base = Base.builder()
                .id(baseId)
                .game(game)
                .name("Base 1")
                .description("Desc")
                .lat(1.0)
                .lng(2.0)
                .nfcLinked(true)
                .nfcToken("abc12345")
                .build();
        CheckIn checkIn = CheckIn.builder()
                .id(checkInId)
                .game(game)
                .team(team)
                .base(base)
                .player(player)
                .checkedInAt(java.time.Instant.now())
                .build();

        when(playerRepository.findById(playerId)).thenReturn(Optional.of(player));
        when(baseRepository.findById(baseId)).thenReturn(Optional.of(base));
        when(checkInRepository.findByTeamIdAndBaseId(teamId, baseId)).thenReturn(Optional.empty());
        when(checkInRepository.save(any(CheckIn.class))).thenReturn(checkIn);
        when(assignmentRepository.findByBaseId(baseId)).thenReturn(java.util.List.of());

        com.prayer.pointfinder.dto.request.CheckInRequest request = new com.prayer.pointfinder.dto.request.CheckInRequest();
        request.setNfcToken("abc12345");
        playerService.checkIn(gameId, baseId, player, request);

        verify(operatorPushNotificationService).notifyOperatorsForCheckIn(eq(game), eq(team), eq(base));
    }

    @Test
    void updateLocationRejectsNaNLatitude() {
        UUID gameId = UUID.randomUUID();
        UUID playerId = UUID.randomUUID();
        Player player = Player.builder().id(playerId).build();

        assertThrows(BadRequestException.class,
                () -> playerService.updateLocation(gameId, player, Double.NaN, 0.0));
    }

    @Test
    void updateLocationRejectsInfinityLongitude() {
        UUID gameId = UUID.randomUUID();
        UUID playerId = UUID.randomUUID();
        Player player = Player.builder().id(playerId).build();

        assertThrows(BadRequestException.class,
                () -> playerService.updateLocation(gameId, player, 0.0, Double.POSITIVE_INFINITY));
    }

    @Test
    void submitAnswerPreservesPlayerScopeAndIdempotencyWhenLinkingMedia() {
        UUID gameId = UUID.randomUUID();
        UUID playerId = UUID.randomUUID();
        UUID teamId = UUID.randomUUID();
        UUID baseId = UUID.randomUUID();
        UUID challengeId = UUID.randomUUID();
        UUID requestId = UUID.randomUUID();
        Game game = Game.builder().id(gameId).status(GameStatus.live).build();
        Team team = Team.builder().id(teamId).game(game).build();
        Player player = Player.builder().id(playerId).team(team).build();
        Challenge challenge = Challenge.builder().id(challengeId).build();
        Base base = Base.builder().id(baseId).game(game).fixedChallenge(challenge).build();
        String fileUrl = "/api/games/" + gameId + "/files/photo.jpg";
        SubmissionResponse created = new SubmissionResponse(UUID.randomUUID(), teamId, challengeId,
                baseId, "note", fileUrl, List.of(fileUrl), "pending", Instant.now(), null, null, null, null);
        when(playerRepository.findById(playerId)).thenReturn(Optional.of(player));
        when(baseRepository.findById(baseId)).thenReturn(Optional.of(base));
        when(checkInRepository.existsByTeamIdAndBaseId(teamId, baseId)).thenReturn(true);
        when(assignmentRepository.findByBaseId(baseId)).thenReturn(List.of());
        when(submissionService.createSubmission(eq(gameId), any(CreateSubmissionRequest.class))).thenReturn(created);
        PlayerSubmissionRequest request = new PlayerSubmissionRequest();
        request.setBaseId(baseId);
        request.setChallengeId(challengeId);
        request.setAnswer("note");
        request.setFileUrls(List.of(fileUrl));
        request.setIdempotencyKey(requestId);

        assertEquals(created.id(), playerService.submitAnswer(gameId, request, player).id());

        verify(gameAccessService).ensurePlayerBelongsToGame(player, gameId);
        ArgumentCaptor<CreateSubmissionRequest> submitted = ArgumentCaptor.forClass(CreateSubmissionRequest.class);
        org.mockito.InOrder order = org.mockito.Mockito.inOrder(submissionService);
        order.verify(submissionService).createSubmission(eq(gameId), submitted.capture());
        order.verify(submissionService).linkUploadSessionsToSubmission(created, gameId, playerId);
        assertEquals(teamId, submitted.getValue().getTeamId());
        assertEquals(requestId, submitted.getValue().getIdempotencyKey());
        assertEquals(List.of(fileUrl), submitted.getValue().getFileUrls());
    }

    @Test
    void enforcedRouteRejectsLaterScanButAllowsTeamSpecificChallengeAfterPriorCheckIn() {
        Game game = Game.builder().id(UUID.randomUUID()).status(GameStatus.live).enforceBaseOrder(true).build();
        Team team = Team.builder().id(UUID.randomUUID()).name("A").game(game).build();
        Player player = Player.builder().id(UUID.randomUUID()).team(team).build();
        Base first = Base.builder().id(UUID.randomUUID()).game(game).orderIndex(0).hidden(true).build();
        Base second = Base.builder().id(UUID.randomUUID()).game(game).orderIndex(1).nfcToken("scan-token").build();
        Challenge challenge = Challenge.builder().id(UUID.randomUUID()).title("Team A challenge")
                .answerType(com.prayer.pointfinder.entity.AnswerType.text).build();
        Assignment assignment = Assignment.builder().id(UUID.randomUUID()).team(team).game(game)
                .base(second).challenge(challenge).build();
        when(playerRepository.findById(player.getId())).thenReturn(Optional.of(player));
        when(baseRepository.findById(second.getId())).thenReturn(Optional.of(second));
        when(baseRepository.findByGameIdOrderByOrderIndexAscCreatedAtAsc(game.getId())).thenReturn(List.of(first, second));
        when(assignmentRepository.findByBaseId(second.getId())).thenReturn(List.of(assignment));
        org.springframework.test.util.ReflectionTestUtils.setField(playerService, "baseOrderService",
                new BaseOrderService(baseRepository, checkInRepository));
        var request = new com.prayer.pointfinder.dto.request.CheckInRequest();
        request.setNfcToken("scan-token");
        BadRequestException error = assertThrows(BadRequestException.class,
                () -> playerService.checkIn(game.getId(), second.getId(), player, request));
        assertEquals(com.prayer.pointfinder.exception.ErrorCode.PREVIOUS_BASE_REQUIRED, error.getErrorCode());
        verify(checkInRepository, never()).save(any());
        when(checkInRepository.findByGameIdAndTeamId(game.getId(), team.getId()))
                .thenReturn(List.of(CheckIn.builder().base(first).build()));
        when(checkInRepository.save(any(CheckIn.class))).thenAnswer(inv -> {
            CheckIn ci = inv.getArgument(0); ci.setId(UUID.randomUUID()); return ci;
        });
        var response = playerService.checkIn(game.getId(), second.getId(), player, request);
        assertEquals(challenge.getId(), response.challenge().id());
        verify(submissionRepository, never()).findByTeamId(any());

        // An existing team check-in remains idempotent even if an earlier visit is absent (operator rescue).
        when(checkInRepository.findByTeamIdAndBaseId(team.getId(), second.getId()))
                .thenReturn(Optional.of(CheckIn.builder().id(response.checkInId()).base(second).checkedInAt(Instant.now()).build()));
        when(checkInRepository.findByGameIdAndTeamId(game.getId(), team.getId())).thenReturn(List.of());
        assertEquals(response.checkInId(), playerService.checkIn(game.getId(), second.getId(), player, request).checkInId());
        request.setNfcToken("wrong");
        assertThrows(BadRequestException.class, () -> playerService.checkIn(game.getId(), second.getId(), player, request));
    }

}
