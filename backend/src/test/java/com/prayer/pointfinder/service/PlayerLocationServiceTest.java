package com.prayer.pointfinder.service;

import com.prayer.pointfinder.entity.Game;
import com.prayer.pointfinder.entity.GameStatus;
import com.prayer.pointfinder.entity.Player;
import com.prayer.pointfinder.entity.Team;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.repository.PlayerLocationRepository;
import com.prayer.pointfinder.repository.PlayerRepository;
import com.prayer.pointfinder.websocket.GameEventBroadcaster;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class PlayerLocationServiceTest {

    @Mock
    private PlayerRepository playerRepository;
    @Mock
    private PlayerLocationRepository playerLocationRepository;
    @Mock
    private GameAccessService gameAccessService;
    @Mock
    private GameEventBroadcaster eventBroadcaster;

    @InjectMocks
    private PlayerLocationService playerLocationService;

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
                () -> playerLocationService.updateLocation(gameId, player, 40.0, -8.0)
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
                () -> playerLocationService.updateLocation(gameId, player, 91.0, 10.0)
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
                () -> playerLocationService.updateLocation(gameId, player, 40.0, -181.0)
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
                () -> playerLocationService.updateLocation(gameId, player, -91.0, 0.0)
        );
        assertEquals("Invalid coordinates", ex.getMessage());
    }

    @Test
    void updateLocationRejectsNaNLatitude() {
        UUID gameId = UUID.randomUUID();
        UUID playerId = UUID.randomUUID();
        Player player = Player.builder().id(playerId).build();

        assertThrows(BadRequestException.class,
                () -> playerLocationService.updateLocation(gameId, player, Double.NaN, 0.0));
    }

    @Test
    void updateLocationRejectsInfinityLongitude() {
        UUID gameId = UUID.randomUUID();
        UUID playerId = UUID.randomUUID();
        Player player = Player.builder().id(playerId).build();

        assertThrows(BadRequestException.class,
                () -> playerLocationService.updateLocation(gameId, player, 0.0, Double.POSITIVE_INFINITY));
    }
}
