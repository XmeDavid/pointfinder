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

        assertEquals(gameId, response.getGameId());
        assertEquals("Scout Camporee", response.getGameName());
        assertEquals("live", response.getGameStatus());
        assertEquals("osm-classic", response.getTileSource());
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

        assertEquals(1, response.getTeams().size());
        BroadcastTeamResponse teamResponse = response.getTeams().get(0);
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

        assertEquals(1, response.getBases().size());
        BroadcastBaseResponse baseResponse = response.getBases().get(0);
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

        assertEquals(1, response.getBases().size());
        assertEquals("Visible Base", response.getBases().get(0).getName());
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
        assertEquals(1, response.getBases().size());
    }

    @Test
    void getBroadcastDataIncludesLocationsWhenGameIsLive() {
        UUID teamId = UUID.randomUUID();
        TeamLocationResponse location = TeamLocationResponse.builder()
                .teamId(teamId)
                .playerId(UUID.randomUUID())
                .displayName("Scout")
                .lat(10.0)
                .lng(20.0)
                .updatedAt(Instant.now())
                .build();

        when(gameRepository.findByBroadcastCodeAndBroadcastEnabledTrue(BROADCAST_CODE))
                .thenReturn(Optional.of(liveGame));
        when(teamRepository.findByGameId(gameId)).thenReturn(List.of());
        when(baseRepository.findByGameId(gameId)).thenReturn(List.of());
        when(monitoringService.computeLeaderboard(gameId)).thenReturn(List.of());
        when(monitoringService.computeLocations(gameId)).thenReturn(List.of(location));
        when(monitoringService.computeProgress(gameId)).thenReturn(List.of());

        BroadcastDataResponse response = broadcastService.getBroadcastData(BROADCAST_CODE);

        assertEquals(1, response.getLocations().size());
        assertEquals(teamId, response.getLocations().get(0).getTeamId());
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

        assertTrue(response.getLocations().isEmpty());
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

        assertTrue(response.getLocations().isEmpty());
        verify(monitoringService, never()).computeLocations(any());
    }

    @Test
    void getBroadcastDataIncludesLeaderboard() {
        UUID teamId = UUID.randomUUID();
        LeaderboardEntry entry = LeaderboardEntry.builder()
                .teamId(teamId)
                .teamName("Pathfinders")
                .color("#00FF00")
                .points(150)
                .completedChallenges(3)
                .build();

        when(gameRepository.findByBroadcastCodeAndBroadcastEnabledTrue(BROADCAST_CODE))
                .thenReturn(Optional.of(liveGame));
        when(teamRepository.findByGameId(gameId)).thenReturn(List.of());
        when(baseRepository.findByGameId(gameId)).thenReturn(List.of());
        when(monitoringService.computeLeaderboard(gameId)).thenReturn(List.of(entry));
        when(monitoringService.computeLocations(gameId)).thenReturn(List.of());
        when(monitoringService.computeProgress(gameId)).thenReturn(List.of());

        BroadcastDataResponse response = broadcastService.getBroadcastData(BROADCAST_CODE);

        assertEquals(1, response.getLeaderboard().size());
        assertEquals(teamId, response.getLeaderboard().get(0).getTeamId());
        assertEquals(150, response.getLeaderboard().get(0).getPoints());
    }

    @Test
    void getBroadcastDataTruncatesLeaderboardToFirst100Entries() {
        List<LeaderboardEntry> bigLeaderboard = IntStream.range(0, 150)
                .mapToObj(i -> LeaderboardEntry.builder()
                        .teamId(UUID.randomUUID())
                        .teamName("Team " + i)
                        .color("#000000")
                        .points(150 - i)
                        .completedChallenges(1)
                        .build())
                .toList();

        when(gameRepository.findByBroadcastCodeAndBroadcastEnabledTrue(BROADCAST_CODE))
                .thenReturn(Optional.of(liveGame));
        when(teamRepository.findByGameId(gameId)).thenReturn(List.of());
        when(baseRepository.findByGameId(gameId)).thenReturn(List.of());
        when(monitoringService.computeLeaderboard(gameId)).thenReturn(bigLeaderboard);
        when(monitoringService.computeLocations(gameId)).thenReturn(List.of());
        when(monitoringService.computeProgress(gameId)).thenReturn(List.of());

        BroadcastDataResponse response = broadcastService.getBroadcastData(BROADCAST_CODE);

        assertEquals(100, response.getLeaderboard().size());
    }

    @Test
    void getBroadcastDataDoesNotTruncateLeaderboardWhenExactly100Entries() {
        List<LeaderboardEntry> leaderboard100 = IntStream.range(0, 100)
                .mapToObj(i -> LeaderboardEntry.builder()
                        .teamId(UUID.randomUUID())
                        .teamName("Team " + i)
                        .color("#000000")
                        .points(100 - i)
                        .completedChallenges(1)
                        .build())
                .toList();

        when(gameRepository.findByBroadcastCodeAndBroadcastEnabledTrue(BROADCAST_CODE))
                .thenReturn(Optional.of(liveGame));
        when(teamRepository.findByGameId(gameId)).thenReturn(List.of());
        when(baseRepository.findByGameId(gameId)).thenReturn(List.of());
        when(monitoringService.computeLeaderboard(gameId)).thenReturn(leaderboard100);
        when(monitoringService.computeLocations(gameId)).thenReturn(List.of());
        when(monitoringService.computeProgress(gameId)).thenReturn(List.of());

        BroadcastDataResponse response = broadcastService.getBroadcastData(BROADCAST_CODE);

        assertEquals(100, response.getLeaderboard().size());
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

        assertEquals(500, response.getTeams().size());
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

        assertEquals(500, response.getBases().size());
    }

    @Test
    void getBroadcastDataTruncatesLocationsToFirst500WhenGameIsLive() {
        List<TeamLocationResponse> manyLocations = IntStream.range(0, 600)
                .mapToObj(i -> TeamLocationResponse.builder()
                        .teamId(UUID.randomUUID())
                        .playerId(UUID.randomUUID())
                        .displayName("Player " + i)
                        .lat((double) i)
                        .lng((double) i)
                        .updatedAt(Instant.now())
                        .build())
                .toList();

        when(gameRepository.findByBroadcastCodeAndBroadcastEnabledTrue(BROADCAST_CODE))
                .thenReturn(Optional.of(liveGame));
        when(teamRepository.findByGameId(gameId)).thenReturn(List.of());
        when(baseRepository.findByGameId(gameId)).thenReturn(List.of());
        when(monitoringService.computeLeaderboard(gameId)).thenReturn(List.of());
        when(monitoringService.computeLocations(gameId)).thenReturn(manyLocations);
        when(monitoringService.computeProgress(gameId)).thenReturn(List.of());

        BroadcastDataResponse response = broadcastService.getBroadcastData(BROADCAST_CODE);

        assertEquals(500, response.getLocations().size());
    }

    @Test
    void getBroadcastDataIncludesProgress() {
        TeamBaseProgressResponse progressEntry = TeamBaseProgressResponse.builder()
                .baseId(UUID.randomUUID())
                .teamId(UUID.randomUUID())
                .status("completed")
                .checkedInAt(Instant.now())
                .challengeId(UUID.randomUUID())
                .submissionStatus("approved")
                .build();

        when(gameRepository.findByBroadcastCodeAndBroadcastEnabledTrue(BROADCAST_CODE))
                .thenReturn(Optional.of(liveGame));
        when(teamRepository.findByGameId(gameId)).thenReturn(List.of());
        when(baseRepository.findByGameId(gameId)).thenReturn(List.of());
        when(monitoringService.computeLeaderboard(gameId)).thenReturn(List.of());
        when(monitoringService.computeLocations(gameId)).thenReturn(List.of());
        when(monitoringService.computeProgress(gameId)).thenReturn(List.of(progressEntry));

        BroadcastDataResponse response = broadcastService.getBroadcastData(BROADCAST_CODE);

        assertEquals(1, response.getProgress().size());
        assertEquals("completed", response.getProgress().get(0).getStatus());
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
        LeaderboardEntry entry = LeaderboardEntry.builder()
                .teamId(UUID.randomUUID())
                .teamName("Eagles")
                .color("#FFFF00")
                .points(200)
                .completedChallenges(5)
                .build();

        when(gameRepository.findByBroadcastCodeAndBroadcastEnabledTrue(BROADCAST_CODE))
                .thenReturn(Optional.of(liveGame));
        when(monitoringService.computeLeaderboard(gameId)).thenReturn(List.of(entry));

        List<LeaderboardEntry> result = broadcastService.getLeaderboard(BROADCAST_CODE);

        assertEquals(1, result.size());
        assertEquals("Eagles", result.get(0).getTeamName());
        assertEquals(200, result.get(0).getPoints());
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
        TeamLocationResponse location = TeamLocationResponse.builder()
                .teamId(teamId)
                .playerId(UUID.randomUUID())
                .displayName("Scout A")
                .lat(48.0)
                .lng(9.0)
                .updatedAt(Instant.now())
                .build();

        when(gameRepository.findByBroadcastCodeAndBroadcastEnabledTrue(BROADCAST_CODE))
                .thenReturn(Optional.of(liveGame));
        when(monitoringService.computeLocations(gameId)).thenReturn(List.of(location));

        List<TeamLocationResponse> result = broadcastService.getLocations(BROADCAST_CODE);

        assertEquals(1, result.size());
        assertEquals(teamId, result.get(0).getTeamId());
        assertEquals("Scout A", result.get(0).getDisplayName());
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
        TeamBaseProgressResponse progressEntry = TeamBaseProgressResponse.builder()
                .baseId(baseId)
                .teamId(UUID.randomUUID())
                .status("checked_in")
                .checkedInAt(Instant.now())
                .challengeId(UUID.randomUUID())
                .submissionStatus(null)
                .build();

        when(gameRepository.findByBroadcastCodeAndBroadcastEnabledTrue(BROADCAST_CODE))
                .thenReturn(Optional.of(liveGame));
        when(monitoringService.computeProgress(gameId)).thenReturn(List.of(progressEntry));

        List<TeamBaseProgressResponse> result = broadcastService.getProgress(BROADCAST_CODE);

        assertEquals(1, result.size());
        assertEquals(baseId, result.get(0).getBaseId());
        assertEquals("checked_in", result.get(0).getStatus());
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
