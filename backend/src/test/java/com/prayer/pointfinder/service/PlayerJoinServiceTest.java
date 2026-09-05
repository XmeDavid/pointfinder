package com.prayer.pointfinder.service;

import com.prayer.pointfinder.dto.request.PlayerJoinRequest;
import com.prayer.pointfinder.dto.response.PlayerAuthResponse;
import com.prayer.pointfinder.entity.*;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.repository.*;
import com.prayer.pointfinder.security.JwtTokenProvider;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import java.util.Optional;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class PlayerJoinServiceTest {
    @Mock private TeamRepository teamRepository;
    @Mock private PlayerRepository playerRepository;
    @Mock private GameRepository gameRepository;
    @Mock private GameAccessService gameAccessService;
    @Mock private JwtTokenProvider tokenProvider;
    @Mock private QuotaService quotaService;
    @InjectMocks private PlayerJoinService playerJoinService;

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

        PlayerAuthResponse response = playerJoinService.joinTeam(request);

        assertEquals(playerId, response.player().id());
        assertEquals("New Name", response.player().displayName());
        assertEquals(teamId, response.team().id());
        assertEquals("jwt-token", response.token());
        assertEquals("New Name", existingPlayer.getDisplayName());
        verify(playerRepository).findFirstByDeviceIdAndTeamGameIdOrderByCreatedAtDesc(deviceId, gameId);
        verify(playerRepository).save(existingPlayer);
    }

    @Test
    void joinTeamRejectsDeviceSwitchingToDifferentTeamInSameGame() {
        // Wave B hardening: once a device has joined a team in a game, rejoining
        // with a different team's join code is rejected with
        // DEVICE_ALREADY_IN_DIFFERENT_TEAM. This closes a stealth-takeover vector
        // where a scout could jump onto another team's score/history.
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

        BadRequestException ex = assertThrows(BadRequestException.class,
                () -> playerJoinService.joinTeam(request));
        assertEquals(com.prayer.pointfinder.exception.ErrorCode.DEVICE_ALREADY_IN_DIFFERENT_TEAM, ex.getErrorCode());
        verify(playerRepository, org.mockito.Mockito.never()).save(any(Player.class));
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

        PlayerAuthResponse response = playerJoinService.joinTeam(request);

        assertEquals("jwt-token", response.token());
        assertEquals("setup", response.game().status());
        assertEquals("Setup Player", response.player().displayName());
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

        BadRequestException ex = assertThrows(BadRequestException.class, () -> playerJoinService.joinTeam(request));

        assertEquals("Game has ended", ex.getMessage());
        verify(playerRepository, never()).save(any(Player.class));
    }

}
