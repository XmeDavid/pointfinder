package com.prayer.pointfinder.service;

import com.prayer.pointfinder.dto.response.BaseResponse;
import com.prayer.pointfinder.entity.*;
import com.prayer.pointfinder.repository.*;
import com.prayer.pointfinder.security.JwtTokenProvider;
import com.prayer.pointfinder.websocket.GameEventBroadcaster;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PlayerServiceGetBasesTest {

    @Mock private PlayerRepository playerRepository;
    @Mock private TeamRepository teamRepository;
    @Mock private BaseRepository baseRepository;
    @Mock private ChallengeRepository challengeRepository;
    @Mock private AssignmentRepository assignmentRepository;
    @Mock private CheckInRepository checkInRepository;
    @Mock private SubmissionRepository submissionRepository;
    @Mock private ActivityEventRepository activityEventRepository;
    @Mock private GameEventBroadcaster eventBroadcaster;
    @Mock private JwtTokenProvider tokenProvider;
    @Mock private SubmissionService submissionService;
    @Mock private TeamLocationRepository teamLocationRepository;
    @Mock private PlayerLocationRepository playerLocationRepository;
    @Mock private GameAccessService gameAccessService;
    @Mock private OperatorPushNotificationService operatorPushNotificationService;
    @Mock private TemplateVariableService templateVariableService;
    @Mock private GameNotificationRepository gameNotificationRepository;

    @InjectMocks
    private PlayerService playerService;

    private UUID gameId;
    private Player player;
    private Team team;
    private Game game;

    @BeforeEach
    void setUp() {
        gameId = UUID.randomUUID();
        game = Game.builder()
                .id(gameId)
                .name("Test Game")
                .description("Test")
                .status(GameStatus.live)
                .build();

        team = Team.builder()
                .id(UUID.randomUUID())
                .game(game)
                .name("Team A")
                .color("#FF0000")
                .build();

        player = Player.builder()
                .id(UUID.randomUUID())
                .team(team)
                .deviceId("device-1")
                .displayName("Player 1")
                .build();
    }

    @Test
    void getBasesShouldFilterOutHiddenBases() {
        when(playerRepository.findById(player.getId())).thenReturn(Optional.of(player));

        // Create 500 hidden bases + 1 visible base
        List<Base> bases = new ArrayList<>();
        for (int i = 0; i < 500; i++) {
            bases.add(Base.builder()
                    .id(UUID.randomUUID())
                    .game(game)
                    .name("Hidden Base " + i)
                    .description("Hidden")
                    .lat(40.0 + i * 0.001)
                    .lng(-8.0 + i * 0.001)
                    .nfcLinked(true)
                    .hidden(true)
                    .build());
        }

        // The 501st base is visible -- this must appear in results
        Base visibleBase = Base.builder()
                .id(UUID.randomUUID())
                .game(game)
                .name("Visible Base")
                .description("Visible")
                .lat(41.0)
                .lng(-7.0)
                .nfcLinked(true)
                .hidden(false)
                .build();
        bases.add(visibleBase);

        when(baseRepository.findByGameId(gameId)).thenReturn(bases);

        List<BaseResponse> result = playerService.getBases(gameId, player);

        // The visible base must appear in results
        assertTrue(result.stream().anyMatch(b -> b.getId().equals(visibleBase.getId())),
                "Visible base should appear in results even when preceded by 500 hidden bases");

        // No hidden bases should appear
        assertTrue(result.stream().noneMatch(b -> Boolean.TRUE.equals(b.getHidden())),
                "No hidden bases should be returned to players");
    }

    @Test
    void getBasesReturnsVisibleBasesUpToLimit() {
        when(playerRepository.findById(player.getId())).thenReturn(Optional.of(player));

        // Create 600 visible bases
        List<Base> bases = new ArrayList<>();
        for (int i = 0; i < 600; i++) {
            bases.add(Base.builder()
                    .id(UUID.randomUUID())
                    .game(game)
                    .name("Base " + i)
                    .description("Desc")
                    .lat(40.0 + i * 0.001)
                    .lng(-8.0 + i * 0.001)
                    .nfcLinked(true)
                    .hidden(false)
                    .build());
        }

        when(baseRepository.findByGameId(gameId)).thenReturn(bases);

        List<BaseResponse> result = playerService.getBases(gameId, player);

        // Should be capped at 500
        assertTrue(result.size() <= 500,
                "Results should be limited to 500 bases, but got " + result.size());
    }
}
