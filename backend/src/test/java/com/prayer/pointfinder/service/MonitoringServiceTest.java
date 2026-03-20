package com.prayer.pointfinder.service;

import com.prayer.pointfinder.dto.response.LeaderboardEntry;
import com.prayer.pointfinder.entity.*;
import com.prayer.pointfinder.repository.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class MonitoringServiceTest {

    @Mock
    private GameRepository gameRepository;
    @Mock
    private TeamRepository teamRepository;
    @Mock
    private BaseRepository baseRepository;
    @Mock
    private ChallengeRepository challengeRepository;
    @Mock
    private SubmissionRepository submissionRepository;
    @Mock
    private ActivityEventRepository activityEventRepository;
    @Mock
    private TeamLocationRepository teamLocationRepository;
    @Mock
    private PlayerLocationRepository playerLocationRepository;
    @Mock
    private CheckInRepository checkInRepository;
    @Mock
    private AssignmentRepository assignmentRepository;
    @Mock
    private GameAccessService gameAccessService;

    @InjectMocks
    private MonitoringService monitoringService;

    @Test
    void computeLeaderboardHandlesNullChallenge() {
        UUID gameId = UUID.randomUUID();
        UUID teamId = UUID.randomUUID();

        Team team = Team.builder().id(teamId).name("Team A").color("#FF0000").build();

        // The aggregate query filters out null challenges at DB level,
        // so an empty result set is returned
        when(teamRepository.findByGameId(gameId)).thenReturn(List.of(team));
        when(submissionRepository.findScoredSubmissionsByGameId(gameId)).thenReturn(List.of());

        // Should not throw NPE
        List<LeaderboardEntry> leaderboard = assertDoesNotThrow(
                () -> monitoringService.computeLeaderboard(gameId)
        );

        assertEquals(1, leaderboard.size());
        // No scored submissions, so points = 0
        assertEquals(teamId, leaderboard.get(0).getTeamId());
        assertEquals(0, leaderboard.get(0).getPoints());
    }

    @Test
    void computeLeaderboardUsesSubmissionPointsOverChallengePoints() {
        UUID gameId = UUID.randomUUID();
        UUID teamId = UUID.randomUUID();
        UUID challengeId = UUID.randomUUID();

        Team team = Team.builder().id(teamId).name("Team B").color("#00FF00").build();

        // The aggregate query returns [teamId, challengeId, COALESCE(points, challenge.points), submittedAt]
        Object[] row = new Object[]{teamId, challengeId, 15, Instant.now()};
        List<Object[]> rows = new java.util.ArrayList<>();
        rows.add(row);

        when(teamRepository.findByGameId(gameId)).thenReturn(List.of(team));
        when(submissionRepository.findScoredSubmissionsByGameId(gameId)).thenReturn(rows);

        List<LeaderboardEntry> leaderboard = monitoringService.computeLeaderboard(gameId);

        assertEquals(1, leaderboard.size());
        assertEquals(15, leaderboard.get(0).getPoints());
    }
}
