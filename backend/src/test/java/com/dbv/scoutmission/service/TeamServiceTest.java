package com.dbv.scoutmission.service;

import com.dbv.scoutmission.entity.Game;
import com.dbv.scoutmission.entity.GameStatus;
import com.dbv.scoutmission.entity.Player;
import com.dbv.scoutmission.entity.Team;
import com.dbv.scoutmission.exception.BadRequestException;
import com.dbv.scoutmission.repository.PlayerRepository;
import com.dbv.scoutmission.repository.TeamRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class TeamServiceTest {

    @Mock
    private TeamRepository teamRepository;
    @Mock
    private PlayerRepository playerRepository;
    @Mock
    private GameAccessService gameAccessService;

    @InjectMocks
    private TeamService teamService;

    @Test
    void removePlayerDeletesWhenPlayerBelongsToTeamAndGame() {
        UUID gameId = UUID.randomUUID();
        UUID teamId = UUID.randomUUID();
        UUID playerId = UUID.randomUUID();

        Game game = Game.builder()
                .id(gameId)
                .name("Game")
                .description("Desc")
                .status(GameStatus.live)
                .build();
        Team team = Team.builder()
                .id(teamId)
                .game(game)
                .name("Team")
                .joinCode("JOIN123")
                .color("#123456")
                .build();
        Player player = Player.builder()
                .id(playerId)
                .team(team)
                .deviceId("device-1")
                .displayName("Player One")
                .build();

        when(teamRepository.findById(teamId)).thenReturn(Optional.of(team));
        when(playerRepository.findById(playerId)).thenReturn(Optional.of(player));

        teamService.removePlayer(gameId, teamId, playerId);

        verify(gameAccessService).ensureCurrentUserCanAccessGame(gameId);
        verify(playerRepository).delete(player);
    }

    @Test
    void removePlayerRejectsWhenPlayerBelongsToDifferentTeam() {
        UUID gameId = UUID.randomUUID();
        UUID teamId = UUID.randomUUID();
        UUID otherTeamId = UUID.randomUUID();
        UUID playerId = UUID.randomUUID();

        Game game = Game.builder()
                .id(gameId)
                .name("Game")
                .description("Desc")
                .status(GameStatus.live)
                .build();
        Team requestedTeam = Team.builder()
                .id(teamId)
                .game(game)
                .name("Requested")
                .joinCode("REQ123")
                .color("#AA0000")
                .build();
        Team otherTeam = Team.builder()
                .id(otherTeamId)
                .game(game)
                .name("Other")
                .joinCode("OTH123")
                .color("#00AA00")
                .build();
        Player player = Player.builder()
                .id(playerId)
                .team(otherTeam)
                .deviceId("device-2")
                .displayName("Player Two")
                .build();

        when(teamRepository.findById(teamId)).thenReturn(Optional.of(requestedTeam));
        when(playerRepository.findById(playerId)).thenReturn(Optional.of(player));

        BadRequestException ex = assertThrows(
                BadRequestException.class,
                () -> teamService.removePlayer(gameId, teamId, playerId)
        );

        assertEquals("Player does not belong to this team", ex.getMessage());
        verify(playerRepository, never()).delete(player);
    }
}

