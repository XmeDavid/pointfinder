package com.prayer.pointfinder.service;

import com.prayer.pointfinder.dto.response.*;
import com.prayer.pointfinder.entity.*;
import com.prayer.pointfinder.exception.ResourceNotFoundException;
import com.prayer.pointfinder.repository.BaseRepository;
import com.prayer.pointfinder.repository.GameRepository;
import com.prayer.pointfinder.repository.TeamRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.util.*;
import java.util.stream.IntStream;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class BroadcastServiceTest {

    @Mock
    private GameRepository gameRepository;
    @Mock
    private TeamRepository teamRepository;
    @Mock
    private BaseRepository baseRepository;
    @Mock
    private MonitoringService monitoringService;

    @InjectMocks
    private BroadcastService broadcastService;

    private UUID gameId;
    private Game liveGame;
    private Game setupGame;
    private static final String BROADCAST_CODE = "ABC123";

    @BeforeEach
    void setUp() {
        gameId = UUID.randomUUID();

        liveGame = Game.builder()
                .id(gameId)
                .name("Scout Camporee")
                .description("Annual event")
                .status(GameStatus.live)
                .tileSource("osm-classic")
                .broadcastEnabled(true)
                .broadcastCode(BROADCAST_CODE)
                .build();

        setupGame = Game.builder()
                .id(gameId)
                .name("Setup Game")
                .description("Not yet live")
                .status(GameStatus.setup)
                .tileSource("osm-classic")
                .broadcastEnabled(true)
                .broadcastCode(BROADCAST_CODE)
                .build();
    }

    // ── getBroadcastData ──────────────────────────────────────────────

    @Test
    void getBroadcastDataReturnsGameMetadata() {
        when(gameRepository.findByBroadcastCodeAndBroadcastEnabledTrue(BROADCAST_CODE))
                .thenReturn(Optional.of(liveGame));
        when(teamRepository.findByGameId(gameId)).thenReturn(List.of());
        when(baseRepository.findByGameId(gameId)).thenReturn(List.of());
        when(monitoringService.computeLeaderboard(gameId)).thenReturn(List.of());
        when(monitoringService.computeLocations(gameId)).thenReturn(List.of());
        when(monitoringService.computeProgress(gameId)).thenReturn(List.of());

        BroadcastDataResponse response = broadcastService.getBroadcastData(BROADCAST_CODE);

        assertEquals(gameId, response.gameId());
        assertEquals("Scout Camporee", response.gameName());
        assertEquals("live", response.gameStatus());
        assertEquals("osm-classic", response.tileSource());
    }

    @Test
    void getBroadcastDataNormalizesCodeToUpperCase() {
        when(gameRepository.findByBroadcastCodeAndBroadcastEnabledTrue("ABC123"))
                .thenReturn(Optional.of(liveGame));
        when(teamRepository.findByGameId(gameId)).thenReturn(List.of());
        when(baseRepository.findByGameId(gameId)).thenReturn(List.of());
        when(monitoringService.computeLeaderboard(gameId)).thenReturn(List.of());
        when(monitoringService.computeLocations(gameId)).thenReturn(List.of());
        when(monitoringService.computeProgress(gameId)).thenReturn(List.of());

        broadcastService.getBroadcastData("abc123");

        verify(gameRepository).findByBroadcastCodeAndBroadcastEnabledTrue("ABC123");
    }

    @Test
    void getBroadcastDataMapsTeamsWithIdNameAndColor() {
        UUID teamId = UUID.randomUUID();
        Team team = Team.builder()
                .id(teamId)
                .game(liveGame)
                .name("Pathfinders")
                .joinCode("XY99")
                .color("#FF5733")
                .build();

        when(gameRepository.findByBroadcastCodeAndBroadcastEnabledTrue(BROADCAST_CODE))
                .thenReturn(Optional.of(liveGame));
        when(teamRepository.findByGameId(gameId)).thenReturn(List.of(team));
        when(baseRepository.findByGameId(gameId)).thenReturn(List.of());
        when(monitoringService.computeLeaderboard(gameId)).thenReturn(List.of());
        when(monitoringService.computeLocations(gameId)).thenReturn(List.of());
        when(monitoringService.computeProgress(gameId)).thenReturn(List.of());

        BroadcastDataResponse response = broadcastService.getBroadcastData(BROADCAST_CODE);

        assertEquals(1, response.teams().size());
        BroadcastTeamResponse teamResponse = response.teams().get(0);
        assertEquals(teamId, teamResponse.getId());
        assertEquals("Pathfinders", teamResponse.getName());
        assertEquals("#FF5733", teamResponse.getColor());
    }

    @Test
    void getBroadcastDataMapsVisibleBasesWithCoordinates() {
        UUID baseId = UUID.randomUUID();
        Base base = Base.builder()
                .id(baseId)
                .game(liveGame)
                .name("Forest Base")
                .description("Deep in the woods")
                .lat(47.5)
                .lng(8.3)
                .hidden(false)
                .nfcLinked(true)
                .build();

        when(gameRepository.findByBroadcastCodeAndBroadcastEnabledTrue(BROADCAST_CODE))
                .thenReturn(Optional.of(liveGame));
        when(teamRepository.findByGameId(gameId)).thenReturn(List.of());
        when(baseRepository.findByGameId(gameId)).thenReturn(List.of(base));
        when(monitoringService.computeLeaderboard(gameId)).thenReturn(List.of());
        when(monitoringService.computeLocations(gameId)).thenReturn(List.of());
        when(monitoringService.computeProgress(gameId)).thenReturn(List.of());

        BroadcastDataResponse response = broadcastService.getBroadcastData(BROADCAST_CODE);

        assertEquals(1, response.bases().size());
        BroadcastBaseResponse baseResponse = response.bases().get(0);
        assertEquals(baseId, baseResponse.getId());
        assertEquals("Forest Base", baseResponse.getName());
        assertEquals(47.5, baseResponse.getLat());
        assertEquals(8.3, baseResponse.getLng());
    }

    @Test
    void getBroadcastDataExcludesHiddenBases() {
        Base hiddenBase = Base.builder()
                .id(UUID.randomUUID())
                .game(liveGame)
                .name("Secret Base")
                .description("Hidden")
                .lat(1.0).lng(2.0)
                .hidden(true)
                .nfcLinked(false)
                .build();
        Base visibleBase = Base.builder()
                .id(UUID.randomUUID())
                .game(liveGame)
                .name("Visible Base")
                .description("Public")
                .lat(3.0).lng(4.0)
                .hidden(false)
                .nfcLinked(true)
                .build();

        when(gameRepository.findByBroadcastCodeAndBroadcastEnabledTrue(BROADCAST_CODE))
                .thenReturn(Optional.of(liveGame));
        when(teamRepository.findByGameId(gameId)).thenReturn(List.of());
        when(baseRepository.findByGameId(gameId)).thenReturn(List.of(hiddenBase, visibleBase));
        when(monitoringService.computeLeaderboard(gameId)).thenReturn(List.of());
        when(monitoringService.computeLocations(gameId)).thenReturn(List.of());
        when(monitoringService.computeProgress(gameId)).thenReturn(List.of());

        BroadcastDataResponse response = broadcastService.getBroadcastData(BROADCAST_CODE);

        assertEquals(1, response.bases().size());
        assertEquals("Visible Base", response.bases().get(0).getName());
    }

    @Test
    void getBroadcastDataTreatsNullHiddenFlagAsNotHidden() {
        Base baseWithNullHidden = Base.builder()
                .id(UUID.randomUUID())
                .game(liveGame)
                .name("Ambiguous Base")
                .description("Null hidden flag")
                .lat(5.0).lng(6.0)
                .nfcLinked(false)
                .build();
        // Override the @Builder.Default value via setter to simulate a null hidden flag
        baseWithNullHidden.setHidden(null);

        when(gameRepository.findByBroadcastCodeAndBroadcastEnabledTrue(BROADCAST_CODE))
                .thenReturn(Optional.of(liveGame));
        when(teamRepository.findByGameId(gameId)).thenReturn(List.of());
        when(baseRepository.findByGameId(gameId)).thenReturn(List.of(baseWithNullHidden));
        when(monitoringService.computeLeaderboard(gameId)).thenReturn(List.of());
        when(monitoringService.computeLocations(gameId)).thenReturn(List.of());
        when(monitoringService.computeProgress(gameId)).thenReturn(List.of());

        BroadcastDataResponse response = broadcastService.getBroadcastData(BROADCAST_CODE);

        // null hidden is treated as false by !Boolean.TRUE.equals(null), so base should be included
        assertEquals(1, response.bases().size());
    }

    @Test
    void getBroadcastDataIncludesLocationsWhenGameIsLive() {
        UUID teamId = UUID.randomUUID();
        TeamLocationResponse location = new TeamLocationResponse(
                teamId,
                UUID.randomUUID(),
                "Scout",
                10.0,
                20.0,
                Instant.now()
        );

        when(gameRepository.findByBroadcastCodeAndBroadcastEnabledTrue(BROADCAST_CODE))
                .thenReturn(Optional.of(liveGame));
        when(teamRepository.findByGameId(gameId)).thenReturn(List.of());
        when(baseRepository.findByGameId(gameId)).thenReturn(List.of());
        when(monitoringService.computeLeaderboard(gameId)).thenReturn(List.of());
        when(monitoringService.computeLocations(gameId)).thenReturn(List.of(location));
        when(monitoringService.computeProgress(gameId)).thenReturn(List.of());

        BroadcastDataResponse response = broadcastService.getBroadcastData(BROADCAST_CODE);

        assertEquals(1, response.locations().size());
        assertEquals(teamId, response.locations().get(0).teamId());
        verify(monitoringService).computeLocations(gameId);
    }

    @Test
    void getBroadcastDataReturnsEmptyLocationsWhenGameIsNotLive() {
        when(gameRepository.findByBroadcastCodeAndBroadcastEnabledTrue(BROADCAST_CODE))
                .thenReturn(Optional.of(setupGame));
        when(teamRepository.findByGameId(gameId)).thenReturn(List.of());
        when(baseRepository.findByGameId(gameId)).thenReturn(List.of());
        when(monitoringService.computeLeaderboard(gameId)).thenReturn(List.of());
        when(monitoringService.computeProgress(gameId)).thenReturn(List.of());

        BroadcastDataResponse response = broadcastService.getBroadcastData(BROADCAST_CODE);

        assertTrue(response.locations().isEmpty());
        verify(monitoringService, never()).computeLocations(any());
    }

    @Test
    void getBroadcastDataReturnsEmptyLocationsWhenGameIsEnded() {
        Game endedGame = Game.builder()
                .id(gameId)
                .name("Ended Game")
                .description("Done")
                .status(GameStatus.ended)
                .tileSource("osm-classic")
                .broadcastEnabled(true)
                .broadcastCode(BROADCAST_CODE)
                .build();

        when(gameRepository.findByBroadcastCodeAndBroadcastEnabledTrue(BROADCAST_CODE))
                .thenReturn(Optional.of(endedGame));
        when(teamRepository.findByGameId(gameId)).thenReturn(List.of());
        when(baseRepository.findByGameId(gameId)).thenReturn(List.of());
        when(monitoringService.computeLeaderboard(gameId)).thenReturn(List.of());
        when(monitoringService.computeProgress(gameId)).thenReturn(List.of());

        BroadcastDataResponse response = broadcastService.getBroadcastData(BROADCAST_CODE);

        assertTrue(response.locations().isEmpty());
        verify(monitoringService, never()).computeLocations(any());
    }

    @Test
    void getBroadcastDataIncludesLeaderboard() {
        UUID teamId = UUID.randomUUID();
        LeaderboardEntry entry = new LeaderboardEntry(
                teamId,
                "Pathfinders",
                "#00FF00",
                150,
                3);

        when(gameRepository.findByBroadcastCodeAndBroadcastEnabledTrue(BROADCAST_CODE))
                .thenReturn(Optional.of(liveGame));
        when(teamRepository.findByGameId(gameId)).thenReturn(List.of());
        when(baseRepository.findByGameId(gameId)).thenReturn(List.of());
        when(monitoringService.computeLeaderboard(gameId)).thenReturn(List.of(entry));
        when(monitoringService.computeLocations(gameId)).thenReturn(List.of());
        when(monitoringService.computeProgress(gameId)).thenReturn(List.of());

        BroadcastDataResponse response = broadcastService.getBroadcastData(BROADCAST_CODE);

        assertEquals(1, response.leaderboard().size());
        assertEquals(teamId, response.leaderboard().get(0).teamId());
        assertEquals(150, response.leaderboard().get(0).points());
    }

    @Test
    void getBroadcastDataTruncatesLeaderboardToFirst100Entries() {
        List<LeaderboardEntry> bigLeaderboard = IntStream.range(0, 150)
                .mapToObj(i -> new LeaderboardEntry(
                        UUID.randomUUID(),
                        "Team " + i,
                        "#000000",
                        150 - i,
                        1))
                .toList();

        when(gameRepository.findByBroadcastCodeAndBroadcastEnabledTrue(BROADCAST_CODE))
                .thenReturn(Optional.of(liveGame));
        when(teamRepository.findByGameId(gameId)).thenReturn(List.of());
        when(baseRepository.findByGameId(gameId)).thenReturn(List.of());
        when(monitoringService.computeLeaderboard(gameId)).thenReturn(bigLeaderboard);
        when(monitoringService.computeLocations(gameId)).thenReturn(List.of());
        when(monitoringService.computeProgress(gameId)).thenReturn(List.of());

        BroadcastDataResponse response = broadcastService.getBroadcastData(BROADCAST_CODE);

        assertEquals(100, response.leaderboard().size());
    }

    @Test
    void getBroadcastDataDoesNotTruncateLeaderboardWhenExactly100Entries() {
        List<LeaderboardEntry> leaderboard100 = IntStream.range(0, 100)
                .mapToObj(i -> new LeaderboardEntry(
                        UUID.randomUUID(),
                        "Team " + i,
                        "#000000",
                        100 - i,
                        1))
                .toList();

        when(gameRepository.findByBroadcastCodeAndBroadcastEnabledTrue(BROADCAST_CODE))
                .thenReturn(Optional.of(liveGame));
        when(teamRepository.findByGameId(gameId)).thenReturn(List.of());
        when(baseRepository.findByGameId(gameId)).thenReturn(List.of());
        when(monitoringService.computeLeaderboard(gameId)).thenReturn(leaderboard100);
        when(monitoringService.computeLocations(gameId)).thenReturn(List.of());
        when(monitoringService.computeProgress(gameId)).thenReturn(List.of());

        BroadcastDataResponse response = broadcastService.getBroadcastData(BROADCAST_CODE);

        assertEquals(100, response.leaderboard().size());
    }

    @Test
    void getBroadcastDataTruncatesTeamsToFirst500() {
        List<Team> manyTeams = IntStream.range(0, 600)
                .mapToObj(i -> Team.builder()
                        .id(UUID.randomUUID())
                        .game(liveGame)
                        .name("Team " + i)
                        .joinCode("T" + i)
                        .color("#AABBCC")
                        .build())
                .toList();

        when(gameRepository.findByBroadcastCodeAndBroadcastEnabledTrue(BROADCAST_CODE))
                .thenReturn(Optional.of(liveGame));
        when(teamRepository.findByGameId(gameId)).thenReturn(manyTeams);
        when(baseRepository.findByGameId(gameId)).thenReturn(List.of());
        when(monitoringService.computeLeaderboard(gameId)).thenReturn(List.of());
        when(monitoringService.computeLocations(gameId)).thenReturn(List.of());
        when(monitoringService.computeProgress(gameId)).thenReturn(List.of());

        BroadcastDataResponse response = broadcastService.getBroadcastData(BROADCAST_CODE);

        assertEquals(500, response.teams().size());
    }

    @Test
    void getBroadcastDataTruncatesBasesToFirst500() {
        List<Base> manyBases = IntStream.range(0, 600)
                .mapToObj(i -> Base.builder()
                        .id(UUID.randomUUID())
                        .game(liveGame)
                        .name("Base " + i)
                        .description("")
                        .lat((double) i)
                        .lng((double) i)
                        .hidden(false)
                        .nfcLinked(true)
                        .build())
                .toList();

        when(gameRepository.findByBroadcastCodeAndBroadcastEnabledTrue(BROADCAST_CODE))
                .thenReturn(Optional.of(liveGame));
        when(teamRepository.findByGameId(gameId)).thenReturn(List.of());
        when(baseRepository.findByGameId(gameId)).thenReturn(manyBases);
        when(monitoringService.computeLeaderboard(gameId)).thenReturn(List.of());
        when(monitoringService.computeLocations(gameId)).thenReturn(List.of());
        when(monitoringService.computeProgress(gameId)).thenReturn(List.of());

        BroadcastDataResponse response = broadcastService.getBroadcastData(BROADCAST_CODE);

        assertEquals(500, response.bases().size());
    }

    @Test
    void getBroadcastDataTruncatesLocationsToFirst500WhenGameIsLive() {
        List<TeamLocationResponse> manyLocations = IntStream.range(0, 600)
                .mapToObj(i -> new TeamLocationResponse(
                        UUID.randomUUID(),
                        UUID.randomUUID(),
                        "Player " + i,
                        (double) i,
                        (double) i,
                        Instant.now()
                ))
                .toList();

        when(gameRepository.findByBroadcastCodeAndBroadcastEnabledTrue(BROADCAST_CODE))
                .thenReturn(Optional.of(liveGame));
        when(teamRepository.findByGameId(gameId)).thenReturn(List.of());
        when(baseRepository.findByGameId(gameId)).thenReturn(List.of());
        when(monitoringService.computeLeaderboard(gameId)).thenReturn(List.of());
        when(monitoringService.computeLocations(gameId)).thenReturn(manyLocations);
        when(monitoringService.computeProgress(gameId)).thenReturn(List.of());

        BroadcastDataResponse response = broadcastService.getBroadcastData(BROADCAST_CODE);

        assertEquals(500, response.locations().size());
    }

    @Test
    void getBroadcastDataIncludesProgress() {
        TeamBaseProgressResponse progressEntry = new TeamBaseProgressResponse(
                UUID.randomUUID(),
                UUID.randomUUID(),
                "completed",
                Instant.now(),
                UUID.randomUUID(),
                "approved"
        );

        when(gameRepository.findByBroadcastCodeAndBroadcastEnabledTrue(BROADCAST_CODE))
                .thenReturn(Optional.of(liveGame));
        when(teamRepository.findByGameId(gameId)).thenReturn(List.of());
        when(baseRepository.findByGameId(gameId)).thenReturn(List.of());
        when(monitoringService.computeLeaderboard(gameId)).thenReturn(List.of());
        when(monitoringService.computeLocations(gameId)).thenReturn(List.of());
        when(monitoringService.computeProgress(gameId)).thenReturn(List.of(progressEntry));

        BroadcastDataResponse response = broadcastService.getBroadcastData(BROADCAST_CODE);

        assertEquals(1, response.progress().size());
        assertEquals("completed", response.progress().get(0).status());
    }

    @Test
    void getBroadcastDataThrowsResourceNotFoundWhenCodeDoesNotExist() {
        when(gameRepository.findByBroadcastCodeAndBroadcastEnabledTrue("NOCODE"))
                .thenReturn(Optional.empty());

        ResourceNotFoundException ex = assertThrows(ResourceNotFoundException.class,
                () -> broadcastService.getBroadcastData("nocode"));

        assertTrue(ex.getMessage().contains("nocode"));
    }

    @Test
    void getBroadcastDataThrowsResourceNotFoundWhenBroadcastIsDisabled() {
        // Repository contract: findByBroadcastCodeAndBroadcastEnabledTrue returns empty
        // when broadcastEnabled is false, even if the code exists
        when(gameRepository.findByBroadcastCodeAndBroadcastEnabledTrue(BROADCAST_CODE))
                .thenReturn(Optional.empty());

        assertThrows(ResourceNotFoundException.class,
                () -> broadcastService.getBroadcastData(BROADCAST_CODE));
    }

    // ── resolveGameId ─────────────────────────────────────────────────

    @Test
    void resolveGameIdReturnsIdForValidCode() {
        when(gameRepository.findByBroadcastCodeAndBroadcastEnabledTrue(BROADCAST_CODE))
                .thenReturn(Optional.of(liveGame));

        UUID result = broadcastService.resolveGameId(BROADCAST_CODE);

        assertEquals(gameId, result);
    }

    @Test
    void resolveGameIdNormalizesCodeToUpperCase() {
        when(gameRepository.findByBroadcastCodeAndBroadcastEnabledTrue("ABC123"))
                .thenReturn(Optional.of(liveGame));

        UUID result = broadcastService.resolveGameId("abc123");

        assertEquals(gameId, result);
        verify(gameRepository).findByBroadcastCodeAndBroadcastEnabledTrue("ABC123");
    }

    @Test
    void resolveGameIdThrowsResourceNotFoundWhenCodeNotFound() {
        when(gameRepository.findByBroadcastCodeAndBroadcastEnabledTrue("XXXXXX"))
                .thenReturn(Optional.empty());

        assertThrows(ResourceNotFoundException.class,
                () -> broadcastService.resolveGameId("xxxxxx"));
    }

    // ── getLeaderboard ────────────────────────────────────────────────

    @Test
    void getLeaderboardReturnsComputedEntriesForValidCode() {
        LeaderboardEntry entry = new LeaderboardEntry(
                UUID.randomUUID(),
                "Eagles",
                "#FFFF00",
                200,
                5);

        when(gameRepository.findByBroadcastCodeAndBroadcastEnabledTrue(BROADCAST_CODE))
                .thenReturn(Optional.of(liveGame));
        when(monitoringService.computeLeaderboard(gameId)).thenReturn(List.of(entry));

        List<LeaderboardEntry> result = broadcastService.getLeaderboard(BROADCAST_CODE);

        assertEquals(1, result.size());
        assertEquals("Eagles", result.get(0).teamName());
        assertEquals(200, result.get(0).points());
    }

    @Test
    void getLeaderboardReturnsEmptyListWhenNoTeamsHaveScored() {
        when(gameRepository.findByBroadcastCodeAndBroadcastEnabledTrue(BROADCAST_CODE))
                .thenReturn(Optional.of(liveGame));
        when(monitoringService.computeLeaderboard(gameId)).thenReturn(List.of());

        List<LeaderboardEntry> result = broadcastService.getLeaderboard(BROADCAST_CODE);

        assertTrue(result.isEmpty());
    }

    @Test
    void getLeaderboardNormalizesCodeToUpperCase() {
        when(gameRepository.findByBroadcastCodeAndBroadcastEnabledTrue("ABC123"))
                .thenReturn(Optional.of(liveGame));
        when(monitoringService.computeLeaderboard(gameId)).thenReturn(List.of());

        broadcastService.getLeaderboard("abc123");

        verify(gameRepository).findByBroadcastCodeAndBroadcastEnabledTrue("ABC123");
    }

    @Test
    void getLeaderboardThrowsResourceNotFoundForUnknownCode() {
        when(gameRepository.findByBroadcastCodeAndBroadcastEnabledTrue("GHOST1"))
                .thenReturn(Optional.empty());

        assertThrows(ResourceNotFoundException.class,
                () -> broadcastService.getLeaderboard("ghost1"));
    }

    // ── getLocations ──────────────────────────────────────────────────

    @Test
    void getLocationsReturnsComputedLocationsForValidCode() {
        UUID teamId = UUID.randomUUID();
        TeamLocationResponse location = new TeamLocationResponse(
                teamId,
                UUID.randomUUID(),
                "Scout A",
                48.0,
                9.0,
                Instant.now()
        );

        when(gameRepository.findByBroadcastCodeAndBroadcastEnabledTrue(BROADCAST_CODE))
                .thenReturn(Optional.of(liveGame));
        when(monitoringService.computeLocations(gameId)).thenReturn(List.of(location));

        List<TeamLocationResponse> result = broadcastService.getLocations(BROADCAST_CODE);

        assertEquals(1, result.size());
        assertEquals(teamId, result.get(0).teamId());
        assertEquals("Scout A", result.get(0).displayName());
    }

    @Test
    void getLocationsReturnsEmptyListWhenNoLocationsRecorded() {
        when(gameRepository.findByBroadcastCodeAndBroadcastEnabledTrue(BROADCAST_CODE))
                .thenReturn(Optional.of(liveGame));
        when(monitoringService.computeLocations(gameId)).thenReturn(List.of());

        List<TeamLocationResponse> result = broadcastService.getLocations(BROADCAST_CODE);

        assertTrue(result.isEmpty());
    }

    @Test
    void getLocationsNormalizesCodeToUpperCase() {
        when(gameRepository.findByBroadcastCodeAndBroadcastEnabledTrue("ABC123"))
                .thenReturn(Optional.of(liveGame));
        when(monitoringService.computeLocations(gameId)).thenReturn(List.of());

        broadcastService.getLocations("abc123");

        verify(gameRepository).findByBroadcastCodeAndBroadcastEnabledTrue("ABC123");
    }

    @Test
    void getLocationsThrowsResourceNotFoundForUnknownCode() {
        when(gameRepository.findByBroadcastCodeAndBroadcastEnabledTrue("NOPE99"))
                .thenReturn(Optional.empty());

        assertThrows(ResourceNotFoundException.class,
                () -> broadcastService.getLocations("nope99"));
    }

    // ── getProgress ───────────────────────────────────────────────────

    @Test
    void getProgressReturnsComputedProgressForValidCode() {
        UUID baseId = UUID.randomUUID();
        TeamBaseProgressResponse progressEntry = new TeamBaseProgressResponse(
                baseId,
                UUID.randomUUID(),
                "checked_in",
                Instant.now(),
                UUID.randomUUID(),
                null
        );

        when(gameRepository.findByBroadcastCodeAndBroadcastEnabledTrue(BROADCAST_CODE))
                .thenReturn(Optional.of(liveGame));
        when(monitoringService.computeProgress(gameId)).thenReturn(List.of(progressEntry));

        List<TeamBaseProgressResponse> result = broadcastService.getProgress(BROADCAST_CODE);

        assertEquals(1, result.size());
        assertEquals(baseId, result.get(0).baseId());
        assertEquals("checked_in", result.get(0).status());
    }

    @Test
    void getProgressReturnsEmptyListWhenNoProgressRecorded() {
        when(gameRepository.findByBroadcastCodeAndBroadcastEnabledTrue(BROADCAST_CODE))
                .thenReturn(Optional.of(liveGame));
        when(monitoringService.computeProgress(gameId)).thenReturn(List.of());

        List<TeamBaseProgressResponse> result = broadcastService.getProgress(BROADCAST_CODE);

        assertTrue(result.isEmpty());
    }

    @Test
    void getProgressNormalizesCodeToUpperCase() {
        when(gameRepository.findByBroadcastCodeAndBroadcastEnabledTrue("ABC123"))
                .thenReturn(Optional.of(liveGame));
        when(monitoringService.computeProgress(gameId)).thenReturn(List.of());

        broadcastService.getProgress("abc123");

        verify(gameRepository).findByBroadcastCodeAndBroadcastEnabledTrue("ABC123");
    }

    @Test
    void getProgressThrowsResourceNotFoundForUnknownCode() {
        when(gameRepository.findByBroadcastCodeAndBroadcastEnabledTrue("BADCOD"))
                .thenReturn(Optional.empty());

        assertThrows(ResourceNotFoundException.class,
                () -> broadcastService.getProgress("badcod"));
    }
}
