package com.prayer.pointfinder.service;

import com.prayer.pointfinder.dto.request.PlayerJoinRequest;
import com.prayer.pointfinder.dto.response.PlayerAuthResponse;
import com.prayer.pointfinder.entity.Base;
import com.prayer.pointfinder.entity.CheckIn;
import com.prayer.pointfinder.entity.Game;
import com.prayer.pointfinder.entity.GameStatus;
import com.prayer.pointfinder.entity.Player;
import com.prayer.pointfinder.entity.Team;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.repository.ActivityEventRepository;
import com.prayer.pointfinder.repository.AssignmentRepository;
import com.prayer.pointfinder.repository.BaseRepository;
import com.prayer.pointfinder.repository.ChallengeRepository;
import com.prayer.pointfinder.repository.CheckInRepository;
import com.prayer.pointfinder.repository.PlayerLocationRepository;
import com.prayer.pointfinder.repository.PlayerRepository;
import com.prayer.pointfinder.repository.SubmissionRepository;
import com.prayer.pointfinder.repository.TeamLocationRepository;
import com.prayer.pointfinder.repository.TeamRepository;
import com.prayer.pointfinder.security.JwtTokenProvider;
import com.prayer.pointfinder.websocket.GameEventBroadcaster;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
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
    private GameAccessService gameAccessService;
    @Mock
    private OperatorPushNotificationService operatorPushNotificationService;

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
        verify(playerRepository, times(2)).save(existingPlayer);
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
        verify(playerRepository, times(2)).save(existingPlayer);
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
                .requirePresenceToSubmit(false)
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

        playerService.checkIn(gameId, baseId, player);

        verify(operatorPushNotificationService).notifyOperatorsForCheckIn(eq(game), eq(team), eq(base));
    }
}

