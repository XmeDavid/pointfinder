package com.prayer.pointfinder.service;

import com.prayer.pointfinder.dto.request.PlayerJoinRequest;
import com.prayer.pointfinder.dto.response.BaseProgressResponse;
import com.prayer.pointfinder.dto.response.PlayerAuthResponse;
import com.prayer.pointfinder.entity.Base;
import com.prayer.pointfinder.entity.Challenge;
import com.prayer.pointfinder.entity.CheckIn;
import com.prayer.pointfinder.entity.Game;
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
import com.prayer.pointfinder.security.JwtTokenProvider;
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

    @InjectMocks
    private PlayerService playerService;

    @Test
    void joinTeamReusesExistingPlayerByDeviceInGameAndOverwritesDisplayName() {
        UUID gameId = UUID.randomUUID();
        UUID teamId = UUID.randomUUID();
        UUID playerId = UUID.randomUUID();
        String deviceId = "device-123";
        String joinCode = "JOIN123";

        Game game = Game.builder()
                .id(gameId)
                .name("Camporee")
                .description("Desc")
                .status(GameStatus.live)
                .build();
        Team team = Team.builder()
                .id(teamId)
                .game(game)
                .name("Wolves")
                .joinCode(joinCode)
                .color("#123456")
                .build();
        Player existingPlayer = Player.builder()
                .id(playerId)
                .team(team)
                .deviceId(deviceId)
                .displayName("Old Name")
                .build();

        PlayerJoinRequest request = new PlayerJoinRequest();
        request.setJoinCode(joinCode);
        request.setDisplayName("New Name");
        request.setDeviceId(deviceId);

        when(teamRepository.findByJoinCode(joinCode)).thenReturn(Optional.of(team));
        when(playerRepository.findFirstByDeviceIdAndTeamGameIdOrderByCreatedAtDesc(deviceId, gameId))
                .thenReturn(Optional.of(existingPlayer));
        when(playerRepository.save(any(Player.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(tokenProvider.generatePlayerToken(playerId, teamId, gameId)).thenReturn("jwt-token");

        PlayerAuthResponse response = playerService.joinTeam(request);

        assertEquals(playerId, response.getPlayer().getId());
        assertEquals("New Name", response.getPlayer().getDisplayName());
        assertEquals(teamId, response.getTeam().getId());
        assertEquals("jwt-token", response.getToken());
        assertEquals("New Name", existingPlayer.getDisplayName());
        verify(playerRepository).findFirstByDeviceIdAndTeamGameIdOrderByCreatedAtDesc(deviceId, gameId);
        verify(playerRepository).save(existingPlayer);
    }

    @Test
    void joinTeamReusesExistingPlayerByDeviceInGameAndSwitchesTeam() {
        UUID gameId = UUID.randomUUID();
        UUID oldTeamId = UUID.randomUUID();
        UUID newTeamId = UUID.randomUUID();
        UUID playerId = UUID.randomUUID();
        String deviceId = "device-abc";

        Game game = Game.builder()
                .id(gameId)
                .name("Camporee")
                .description("Desc")
                .status(GameStatus.live)
                .build();
        Team oldTeam = Team.builder()
                .id(oldTeamId)
                .game(game)
                .name("Old Team")
                .joinCode("OLD111")
                .color("#111111")
                .build();
        Team newTeam = Team.builder()
                .id(newTeamId)
                .game(game)
                .name("New Team")
                .joinCode("NEW222")
                .color("#222222")
                .build();
        Player existingPlayer = Player.builder()
                .id(playerId)
                .team(oldTeam)
                .deviceId(deviceId)
                .displayName("Existing Name")
                .build();

        PlayerJoinRequest request = new PlayerJoinRequest();
        request.setJoinCode(newTeam.getJoinCode());
        request.setDisplayName("Updated Name");
        request.setDeviceId(deviceId);

        when(teamRepository.findByJoinCode(newTeam.getJoinCode())).thenReturn(Optional.of(newTeam));
        when(playerRepository.findFirstByDeviceIdAndTeamGameIdOrderByCreatedAtDesc(deviceId, gameId))
                .thenReturn(Optional.of(existingPlayer));
        when(playerRepository.save(any(Player.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(tokenProvider.generatePlayerToken(playerId, newTeamId, gameId)).thenReturn("jwt-token");

        PlayerAuthResponse response = playerService.joinTeam(request);

        assertEquals(playerId, response.getPlayer().getId());
        assertEquals("Updated Name", response.getPlayer().getDisplayName());
        assertEquals(newTeamId, response.getTeam().getId());
        assertEquals(newTeamId, existingPlayer.getTeam().getId());
        assertEquals("jwt-token", response.getToken());
        verify(playerRepository).findFirstByDeviceIdAndTeamGameIdOrderByCreatedAtDesc(deviceId, gameId);
        verify(playerRepository).save(existingPlayer);
    }

    @Test
    void joinTeamAllowsSetupStatus() {
        UUID gameId = UUID.randomUUID();
        UUID teamId = UUID.randomUUID();
        String joinCode = "SETUP01";
        String deviceId = "device-setup";

        Game game = Game.builder()
                .id(gameId)
                .name("Setup Game")
                .description("Desc")
                .status(GameStatus.setup)
                .build();
        Team team = Team.builder()
                .id(teamId)
                .game(game)
                .name("Falcons")
                .joinCode(joinCode)
                .color("#00AAFF")
                .build();

        PlayerJoinRequest request = new PlayerJoinRequest();
        request.setJoinCode(joinCode);
        request.setDisplayName("Setup Player");
        request.setDeviceId(deviceId);

        when(teamRepository.findByJoinCode(joinCode)).thenReturn(Optional.of(team));
        when(playerRepository.findFirstByDeviceIdAndTeamGameIdOrderByCreatedAtDesc(deviceId, gameId))
                .thenReturn(Optional.empty());
        when(playerRepository.save(any(Player.class))).thenAnswer(invocation -> {
            Player p = invocation.getArgument(0);
            if (p.getId() == null) {
                p.setId(UUID.randomUUID());
            }
            return p;
        });
        when(tokenProvider.generatePlayerToken(any(UUID.class), any(UUID.class), any(UUID.class))).thenReturn("jwt-token");

        PlayerAuthResponse response = playerService.joinTeam(request);

        assertEquals("jwt-token", response.getToken());
        assertEquals("setup", response.getGame().getStatus());
        assertEquals("Setup Player", response.getPlayer().getDisplayName());
    }

    @Test
    void joinTeamRejectsEndedStatus() {
        UUID gameId = UUID.randomUUID();
        UUID teamId = UUID.randomUUID();
        String joinCode = "ENDED01";

        Game game = Game.builder()
                .id(gameId)
                .name("Ended Game")
                .description("Desc")
                .status(GameStatus.ended)
                .build();
        Team team = Team.builder()
                .id(teamId)
                .game(game)
                .name("Sharks")
                .joinCode(joinCode)
                .color("#0033FF")
                .build();

        PlayerJoinRequest request = new PlayerJoinRequest();
        request.setJoinCode(joinCode);
        request.setDisplayName("Late Player");
        request.setDeviceId("late-device");

        when(teamRepository.findByJoinCode(joinCode)).thenReturn(Optional.of(team));

        BadRequestException ex = assertThrows(BadRequestException.class, () -> playerService.joinTeam(request));

        assertEquals("Game has ended", ex.getMessage());
        verify(playerRepository, never()).save(any(Player.class));
    }

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

        List<BaseProgressResponse> progress = playerService.getProgress(gameId, player);

        BaseProgressResponse hiddenProgress = progress.stream()
                .filter(p -> p.getBaseId().equals(hiddenBaseId))
                .findFirst()
                .orElseThrow();

        assertEquals("not_visited", hiddenProgress.getStatus());
        assertTrue(progress.stream().anyMatch(p -> p.getBaseId().equals(sourceBaseId)));
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

        playerService.checkIn(gameId, baseId, player, null);

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

    // ── upload session <-> submission FK linkage ───────────────────────
    //
    // These tests cover PlayerService.submitAnswer's responsibility to tie
    // completed upload sessions back to the submission that consumed them. The
    // linkage is ALERT-FRIENDLY: it never deletes or mutates the submission, it
    // never throws if nothing matches, and it is idempotent across retries that
    // use the same idempotency_key.

    @Test
    void submitAnswerLinksMatchingUploadSessionsToSubmission() {
        LinkageFixture f = new LinkageFixture();
        String fileUrl = "/api/games/" + f.gameId + "/files/video-1.mp4";

        UploadSession matching = newCompletedUploadSession(f.gameId, f.playerId, fileUrl);
        UploadSession unrelated = newCompletedUploadSession(f.gameId, f.playerId,
                "/api/games/" + f.gameId + "/files/other.mp4");

        SubmissionResponse stubResponse = SubmissionResponse.builder()
                .id(f.submissionId)
                .teamId(f.teamId)
                .challengeId(f.challengeId)
                .baseId(f.baseId)
                .fileUrl(fileUrl)
                .fileUrls(List.of(fileUrl))
                .status("pending")
                .submittedAt(Instant.now())
                .build();

        wireSubmitAnswerMocks(f, stubResponse, List.of(matching, unrelated));

        PlayerSubmissionRequest req = new PlayerSubmissionRequest();
        req.setBaseId(f.baseId);
        req.setChallengeId(f.challengeId);
        req.setFileUrl(fileUrl);
        req.setFileUrls(List.of(fileUrl));

        SubmissionResponse response = playerService.submitAnswer(f.gameId, req, f.player);

        assertNotNull(response);
        assertEquals(f.submissionId, response.getId());

        @SuppressWarnings("unchecked")
        ArgumentCaptor<Iterable<UploadSession>> captor = ArgumentCaptor.forClass(Iterable.class);
        verify(uploadSessionRepository).saveAll(captor.capture());
        List<UploadSession> saved = new ArrayList<>();
        captor.getValue().forEach(saved::add);
        assertEquals(1, saved.size(), "only the matching session should be linked");
        assertEquals(matching.getId(), saved.get(0).getId());
        assertNotNull(matching.getSubmission());
        assertEquals(f.submissionId, matching.getSubmission().getId());
        // The unrelated session must remain untouched.
        assertNull(unrelated.getSubmission());
    }

    @Test
    void submitAnswerLinksMultipleUploadSessionsForMultiMediaSubmission() {
        LinkageFixture f = new LinkageFixture();
        String url1 = "/api/games/" + f.gameId + "/files/video-1.mp4";
        String url2 = "/api/games/" + f.gameId + "/files/photo-2.jpg";

        UploadSession session1 = newCompletedUploadSession(f.gameId, f.playerId, url1);
        UploadSession session2 = newCompletedUploadSession(f.gameId, f.playerId, url2);
        UploadSession irrelevant = newCompletedUploadSession(f.gameId, f.playerId,
                "/api/games/" + f.gameId + "/files/stale-video.mp4");

        SubmissionResponse stubResponse = SubmissionResponse.builder()
                .id(f.submissionId)
                .teamId(f.teamId)
                .challengeId(f.challengeId)
                .baseId(f.baseId)
                .fileUrl(url1)
                .fileUrls(List.of(url1, url2))
                .status("pending")
                .submittedAt(Instant.now())
                .build();

        wireSubmitAnswerMocks(f, stubResponse, List.of(session1, session2, irrelevant));

        PlayerSubmissionRequest req = new PlayerSubmissionRequest();
        req.setBaseId(f.baseId);
        req.setChallengeId(f.challengeId);
        req.setFileUrls(List.of(url1, url2));

        playerService.submitAnswer(f.gameId, req, f.player);

        @SuppressWarnings("unchecked")
        ArgumentCaptor<Iterable<UploadSession>> captor = ArgumentCaptor.forClass(Iterable.class);
        verify(uploadSessionRepository).saveAll(captor.capture());
        List<UploadSession> saved = new ArrayList<>();
        captor.getValue().forEach(saved::add);
        assertEquals(2, saved.size(), "both matching sessions should be linked in one batch");
        assertTrue(saved.stream().anyMatch(s -> s.getId().equals(session1.getId())));
        assertTrue(saved.stream().anyMatch(s -> s.getId().equals(session2.getId())));
        assertNotNull(session1.getSubmission());
        assertNotNull(session2.getSubmission());
        assertNull(irrelevant.getSubmission());
    }

    @Test
    void submitAnswerWithNoMatchingUploadSessionsSucceedsWithoutLinking() {
        LinkageFixture f = new LinkageFixture();
        // Legacy path: a text-only submission with no file URLs at all. No upload
        // linkage is possible; the submission must still succeed and the FK
        // population code path must be a complete no-op.
        SubmissionResponse stubResponse = SubmissionResponse.builder()
                .id(f.submissionId)
                .teamId(f.teamId)
                .challengeId(f.challengeId)
                .baseId(f.baseId)
                .status("pending")
                .submittedAt(Instant.now())
                .build();

        wireSubmitAnswerMocks(f, stubResponse, List.of());

        PlayerSubmissionRequest req = new PlayerSubmissionRequest();
        req.setBaseId(f.baseId);
        req.setChallengeId(f.challengeId);
        req.setAnswer("hello");

        SubmissionResponse response = playerService.submitAnswer(f.gameId, req, f.player);

        assertNotNull(response);
        assertEquals(f.submissionId, response.getId());
        // When there is nothing to link, saveAll must not be called at all —
        // the service must not write empty batches.
        verify(uploadSessionRepository, never()).saveAll(any(Iterable.class));
    }

    @Test
    void submitAnswerIsIdempotentForUploadSessionLinkage() {
        LinkageFixture f = new LinkageFixture();
        String fileUrl = "/api/games/" + f.gameId + "/files/video-idem.mp4";

        UploadSession matching = newCompletedUploadSession(f.gameId, f.playerId, fileUrl);

        SubmissionResponse stubResponse = SubmissionResponse.builder()
                .id(f.submissionId)
                .teamId(f.teamId)
                .challengeId(f.challengeId)
                .baseId(f.baseId)
                .fileUrl(fileUrl)
                .fileUrls(List.of(fileUrl))
                .status("pending")
                .submittedAt(Instant.now())
                .build();

        // Simulate the repository view: first call sees it unlinked; subsequent
        // calls see it linked (the mock updates the candidate list dynamically).
        List<UploadSession> candidateList = new ArrayList<>();
        candidateList.add(matching);
        wireSubmitAnswerMocks(f, stubResponse, candidateList);
        // After the first call "persists" the linkage, the next call should
        // find the session already linked and skip it.
        when(uploadSessionRepository.findCompletedUnlinkedByPlayerAndGame(f.playerId, f.gameId))
                .thenAnswer(inv -> {
                    if (matching.getSubmission() != null) {
                        return List.of(); // emulates the WHERE submission IS NULL predicate
                    }
                    return List.of(matching);
                });

        PlayerSubmissionRequest req = new PlayerSubmissionRequest();
        req.setBaseId(f.baseId);
        req.setChallengeId(f.challengeId);
        req.setFileUrl(fileUrl);
        req.setFileUrls(List.of(fileUrl));
        req.setIdempotencyKey(UUID.randomUUID());

        playerService.submitAnswer(f.gameId, req, f.player);
        playerService.submitAnswer(f.gameId, req, f.player);

        // First call links once; the second call must be a complete no-op,
        // never re-saving the session or calling getReferenceById a second
        // time.
        verify(uploadSessionRepository, times(1)).saveAll(any(Iterable.class));
        verify(submissionRepository, times(1)).getReferenceById(f.submissionId);
        assertNotNull(matching.getSubmission());
        assertEquals(f.submissionId, matching.getSubmission().getId());
    }

    // ── test fixture helpers for upload session linkage tests ──────────

    /**
     * Groups the shared IDs and entity graph for a submitAnswer-driven test so
     * each test body can stay focused on the linkage behaviour rather than the
     * 60 lines of mock setup that the full submission path needs.
     */
    private final class LinkageFixture {
        final UUID gameId = UUID.randomUUID();
        final UUID teamId = UUID.randomUUID();
        final UUID playerId = UUID.randomUUID();
        final UUID baseId = UUID.randomUUID();
        final UUID challengeId = UUID.randomUUID();
        final UUID submissionId = UUID.randomUUID();
        final Game game;
        final Team team;
        final Player player;
        final Base base;
        final Challenge challenge;
        final Submission submissionEntity;

        LinkageFixture() {
            game = Game.builder()
                    .id(gameId)
                    .name("Linkage Game")
                    .description("Desc")
                    .status(GameStatus.live)
                    .build();
            team = Team.builder()
                    .id(teamId)
                    .game(game)
                    .name("Wolves")
                    .joinCode("LINK01")
                    .color("#112233")
                    .build();
            player = Player.builder()
                    .id(playerId)
                    .team(team)
                    .deviceId("device-link")
                    .displayName("Scout")
                    .build();
            challenge = Challenge.builder()
                    .id(challengeId)
                    .game(game)
                    .title("Upload video")
                    .answerType(AnswerType.file)
                    .points(10)
                    .build();
            base = Base.builder()
                    .id(baseId)
                    .game(game)
                    .name("Linkage Base")
                    .description("Desc")
                    .lat(1.0)
                    .lng(2.0)
                    .nfcLinked(true)
                    .fixedChallenge(challenge)
                    .build();
            submissionEntity = Submission.builder()
                    .id(submissionId)
                    .team(team)
                    .challenge(challenge)
                    .base(base)
                    .answer("")
                    .status(SubmissionStatus.pending)
                    .submittedAt(Instant.now())
                    .build();
        }
    }

    private UploadSession newCompletedUploadSession(UUID gameId, UUID playerId, String fileUrl) {
        Game game = Game.builder().id(gameId).build();
        Player player = Player.builder().id(playerId).build();
        return UploadSession.builder()
                .id(UUID.randomUUID())
                .game(game)
                .player(player)
                .contentType("video/mp4")
                .totalSizeBytes(8L)
                .chunkSizeBytes(4)
                .totalChunks(2)
                .status(UploadSessionStatus.completed)
                .fileUrl(fileUrl)
                .expiresAt(Instant.now().plusSeconds(3600))
                .completedAt(Instant.now().minusSeconds(30))
                .build();
    }

    private void wireSubmitAnswerMocks(
            LinkageFixture f,
            SubmissionResponse stubResponse,
            List<UploadSession> candidateUnlinkedSessions
    ) {
        when(playerRepository.findById(f.playerId)).thenReturn(Optional.of(f.player));
        when(baseRepository.findById(f.baseId)).thenReturn(Optional.of(f.base));
        when(checkInRepository.existsByTeamIdAndBaseId(f.teamId, f.baseId)).thenReturn(true);
        when(assignmentRepository.findByBaseId(f.baseId)).thenReturn(List.of());
        when(submissionService.createSubmission(eq(f.gameId), any(CreateSubmissionRequest.class)))
                .thenReturn(stubResponse);
        when(uploadSessionRepository.findCompletedUnlinkedByPlayerAndGame(f.playerId, f.gameId))
                .thenReturn(new ArrayList<>(candidateUnlinkedSessions));
        when(submissionRepository.getReferenceById(f.submissionId)).thenReturn(f.submissionEntity);
        when(templateVariableService.resolveTemplate(any(), any(), any(), any())).thenReturn(null);
        when(uploadSessionRepository.saveAll(any(Iterable.class)))
                .thenAnswer(invocation -> {
                    Iterable<UploadSession> arg = invocation.getArgument(0);
                    List<UploadSession> out = new ArrayList<>();
                    arg.forEach(out::add);
                    return out;
                });
    }
}

