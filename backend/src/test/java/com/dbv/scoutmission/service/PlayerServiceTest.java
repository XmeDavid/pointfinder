package com.dbv.scoutmission.service;

import com.dbv.scoutmission.dto.request.PlayerJoinRequest;
import com.dbv.scoutmission.dto.response.PlayerAuthResponse;
import com.dbv.scoutmission.entity.Game;
import com.dbv.scoutmission.entity.GameStatus;
import com.dbv.scoutmission.entity.Player;
import com.dbv.scoutmission.entity.Team;
import com.dbv.scoutmission.repository.ActivityEventRepository;
import com.dbv.scoutmission.repository.AssignmentRepository;
import com.dbv.scoutmission.repository.BaseRepository;
import com.dbv.scoutmission.repository.ChallengeRepository;
import com.dbv.scoutmission.repository.CheckInRepository;
import com.dbv.scoutmission.repository.PlayerLocationRepository;
import com.dbv.scoutmission.repository.PlayerRepository;
import com.dbv.scoutmission.repository.SubmissionRepository;
import com.dbv.scoutmission.repository.TeamLocationRepository;
import com.dbv.scoutmission.repository.TeamRepository;
import com.dbv.scoutmission.security.JwtTokenProvider;
import com.dbv.scoutmission.websocket.GameEventBroadcaster;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
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
}

