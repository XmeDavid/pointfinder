package com.prayer.pointfinder.service;

import com.prayer.pointfinder.dto.response.*;
import com.prayer.pointfinder.entity.*;
import com.prayer.pointfinder.exception.ResourceNotFoundException;
import com.prayer.pointfinder.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import org.springframework.data.domain.PageRequest;

import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class MonitoringService {

    private final GameRepository gameRepository;
    private final TeamRepository teamRepository;
    private final BaseRepository baseRepository;
    private final ChallengeRepository challengeRepository;
    private final SubmissionRepository submissionRepository;
    private final ActivityEventRepository activityEventRepository;
    private final TeamLocationRepository teamLocationRepository;
    private final PlayerLocationRepository playerLocationRepository;
    private final CheckInRepository checkInRepository;
    private final AssignmentRepository assignmentRepository;
    private final GameAccessService gameAccessService;

    @Transactional(readOnly = true)
    public DashboardResponse getDashboard(UUID gameId) {
        gameAccessService.ensureCurrentUserCanAccessGame(gameId);
        Game game = gameRepository.findById(gameId)
                .orElseThrow(() -> new ResourceNotFoundException("Game", gameId));

        long totalTeams = teamRepository.countByGameId(gameId);
        long totalBases = baseRepository.countByGameId(gameId);
        long totalChallenges = challengeRepository.countByGameId(gameId);
        long pendingSubmissions = submissionRepository.countByGameIdAndStatus(gameId, SubmissionStatus.pending);
        long totalSubmissions = submissionRepository.countByGameId(gameId);
        long completedSubmissions = submissionRepository.countByGameIdAndStatusIn(gameId,
                List.of(SubmissionStatus.approved, SubmissionStatus.correct));

        return new DashboardResponse(
                totalTeams,
                totalBases,
                totalChallenges,
                pendingSubmissions,
                completedSubmissions,
                totalSubmissions,
                game.getStartDate(),
                game.getEndDate()
        );
    }

    @Transactional(readOnly = true)
    public List<LeaderboardEntry> getLeaderboard(UUID gameId) {
        gameAccessService.ensureCurrentUserCanAccessGame(gameId);
        return computeLeaderboard(gameId);
    }

    List<LeaderboardEntry> computeLeaderboard(UUID gameId) {
        List<Team> teams = teamRepository.findByGameId(gameId);
        List<Object[]> scoredRows = submissionRepository.findScoredSubmissionsByGameId(gameId);

        // Deduplicate: keep only the latest submission per team+challenge pair
        // Each row: [teamId, challengeId, points (long/int), submittedAt]
        record ScoredSub(UUID teamId, UUID challengeId, long points, java.time.Instant submittedAt) {}
        Map<UUID, Map<UUID, ScoredSub>> byTeamChallenge = new HashMap<>();

        for (Object[] row : scoredRows) {
            UUID teamId = (UUID) row[0];
            UUID challengeId = (UUID) row[1];
            long pts = row[2] != null ? ((Number) row[2]).longValue() : 0L;
            java.time.Instant submittedAt = (java.time.Instant) row[3];
            ScoredSub sub = new ScoredSub(teamId, challengeId, pts, submittedAt);

            byTeamChallenge
                    .computeIfAbsent(teamId, k -> new HashMap<>())
                    .merge(challengeId, sub, (existing, incoming) ->
                            incoming.submittedAt().isAfter(existing.submittedAt()) ? incoming : existing);
        }

        return teams.stream().map(team -> {
            Map<UUID, ScoredSub> challengeMap = byTeamChallenge.getOrDefault(team.getId(), Map.of());
            long points = challengeMap.values().stream().mapToLong(ScoredSub::points).sum();
            int completed = challengeMap.size();

            return new LeaderboardEntry(
                    team.getId(),
                    team.getName(),
                    team.getColor(),
                    points,
                    completed);
        })
        .sorted(Comparator.comparingLong(LeaderboardEntry::points).reversed())
        .toList();
    }

    private static final int ACTIVITY_FEED_LIMIT = 500;

    @Transactional(readOnly = true)
    public List<ActivityEventResponse> getActivity(UUID gameId) {
        gameAccessService.ensureCurrentUserCanAccessGame(gameId);
        return activityEventRepository
                .findRecentByGameId(gameId, PageRequest.of(0, ACTIVITY_FEED_LIMIT))
                .stream()
                .map(e -> new ActivityEventResponse(
                        e.getId(),
                        e.getGame().getId(),
                        e.getType().name(),
                        e.getTeam().getId(),
                        e.getBase() != null ? e.getBase().getId() : null,
                        e.getChallenge() != null ? e.getChallenge().getId() : null,
                        e.getMessage(),
                        e.getTimestamp()
                ))
                .toList();
    }

    @Transactional(readOnly = true)
    public List<TeamBaseProgressResponse> getProgress(UUID gameId) {
        gameAccessService.ensureCurrentUserCanAccessGame(gameId);
        return computeProgress(gameId);
    }

    List<TeamBaseProgressResponse> computeProgress(UUID gameId) {
        List<Team> teams = teamRepository.findByGameId(gameId);
        List<Base> bases = baseRepository.findByGameId(gameId);
        List<CheckIn> checkIns = checkInRepository.findByGameIdWithRelations(gameId);
        List<Submission> submissions = submissionRepository.findByGameIdWithRelations(gameId);
        List<Assignment> assignments = assignmentRepository.findByGameIdWithRelations(gameId);
        List<Assignment> sortedAssignments = assignments.stream()
                .sorted(AssignmentResolver.RECENCY_COMPARATOR)
                .toList();

        Map<UUID, Map<UUID, CheckIn>> checkInsByTeamBase = checkIns.stream()
                .collect(Collectors.groupingBy(
                        ci -> ci.getTeam().getId(),
                        Collectors.toMap(ci -> ci.getBase().getId(), ci -> ci)
                ));

        Map<UUID, Map<UUID, Submission>> submissionsByTeamBase = submissions.stream()
                .collect(Collectors.groupingBy(
                        s -> s.getTeam().getId(),
                        Collectors.toMap(
                                s -> s.getBase().getId(),
                                s -> s,
                                (a, b) -> a.getSubmittedAt().isAfter(b.getSubmittedAt()) ? a : b
                        )
                ));

        List<TeamBaseProgressResponse> result = new ArrayList<>();

        for (Team team : teams) {
            UUID teamId = team.getId();
            Map<UUID, CheckIn> teamCheckIns = checkInsByTeamBase.getOrDefault(teamId, Map.of());
            Map<UUID, Submission> teamSubs = submissionsByTeamBase.getOrDefault(teamId, Map.of());

            for (Base base : bases) {
                UUID baseId = base.getId();
                CheckIn ci = teamCheckIns.get(baseId);
                Submission sub = teamSubs.get(baseId);

                Challenge challenge = AssignmentResolver.resolve(base, teamId, sortedAssignments);

                BaseStatus status = BaseStatus.compute(sub, ci);
                String submissionStatus = sub != null ? sub.getStatus().name() : null;

                result.add(new TeamBaseProgressResponse(
                        baseId,
                        teamId,
                        status.name(),
                        ci != null ? ci.getCheckedInAt() : null,
                        challenge != null ? challenge.getId() : null,
                        submissionStatus
                ));
            }
        }

        return result;
    }

    @Transactional(readOnly = true)
    public List<TeamLocationResponse> getLocations(UUID gameId) {
        gameAccessService.ensureCurrentUserCanAccessGame(gameId);
        return computeLocations(gameId);
    }

    @Transactional(readOnly = true)
    public GameResultsExportResponse getResultsExport(UUID gameId) {
        gameAccessService.ensureCurrentUserCanAccessGame(gameId);
        Game game = gameRepository.findById(gameId)
                .orElseThrow(() -> new ResourceNotFoundException("Game", gameId));

        List<Challenge> challenges = challengeRepository.findByGameId(gameId);
        List<Team> teams = teamRepository.findByGameId(gameId);
        List<Object[]> scoredRows = submissionRepository.findScoredSubmissionsByGameId(gameId);

        record ScoredSub(UUID teamId, UUID challengeId, long points, java.time.Instant submittedAt) {}
        Map<UUID, Map<UUID, ScoredSub>> byTeamChallenge = new HashMap<>();

        for (Object[] row : scoredRows) {
            UUID teamId = (UUID) row[0];
            UUID challengeId = (UUID) row[1];
            long pts = row[2] != null ? ((Number) row[2]).longValue() : 0L;
            java.time.Instant submittedAt = (java.time.Instant) row[3];
            ScoredSub sub = new ScoredSub(teamId, challengeId, pts, submittedAt);

            byTeamChallenge
                    .computeIfAbsent(teamId, k -> new HashMap<>())
                    .merge(challengeId, sub, (existing, incoming) ->
                            incoming.submittedAt().isAfter(existing.submittedAt()) ? incoming : existing);
        }

        List<GameResultsExportResponse.ChallengeInfo> challengeInfos = challenges.stream()
                .map(c -> new GameResultsExportResponse.ChallengeInfo(c.getId(), c.getTitle(), c.getPoints()))
                .toList();

        List<GameResultsExportResponse.TeamResult> teamResults = teams.stream()
                .map(team -> {
                    Map<UUID, ScoredSub> challengeMap = byTeamChallenge.getOrDefault(team.getId(), Map.of());
                    Map<UUID, Long> challengePoints = new HashMap<>();
                    for (var entry : challengeMap.entrySet()) {
                        challengePoints.put(entry.getKey(), entry.getValue().points());
                    }
                    long totalPoints = challengeMap.values().stream().mapToLong(ScoredSub::points).sum();

                    return new GameResultsExportResponse.TeamResult(team.getId(), team.getName(), team.getColor(), totalPoints, challengePoints);
                })
                .sorted(Comparator.comparingLong(GameResultsExportResponse.TeamResult::totalPoints).reversed())
                .toList();

        return new GameResultsExportResponse(game.getName(), challengeInfos, teamResults);
    }

    List<TeamLocationResponse> computeLocations(UUID gameId) {
        return playerLocationRepository.findByGameId(gameId).stream()
                .map(pl -> new TeamLocationResponse(
                        pl.getPlayer().getTeam().getId(),
                        pl.getPlayerId(),
                        pl.getPlayer().getDisplayName(),
                        pl.getLat(),
                        pl.getLng(),
                        pl.getUpdatedAt()
                ))
                .toList();
    }
}
