package com.prayer.pointfinder.service;

import com.prayer.pointfinder.dto.response.*;
import com.prayer.pointfinder.entity.*;
import com.prayer.pointfinder.exception.ResourceNotFoundException;
import com.prayer.pointfinder.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

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
        long completedSubmissions = totalSubmissions - pendingSubmissions;

        return DashboardResponse.builder()
                .totalTeams(totalTeams)
                .totalBases(totalBases)
                .totalChallenges(totalChallenges)
                .pendingSubmissions(pendingSubmissions)
                .completedSubmissions(completedSubmissions)
                .totalSubmissions(totalSubmissions)
                .startDate(game.getStartDate())
                .endDate(game.getEndDate())
                .build();
    }

    @Transactional(readOnly = true)
    public List<LeaderboardEntry> getLeaderboard(UUID gameId) {
        gameAccessService.ensureCurrentUserCanAccessGame(gameId);
        return computeLeaderboard(gameId);
    }

    List<LeaderboardEntry> computeLeaderboard(UUID gameId) {
        List<Team> teams = teamRepository.findByGameId(gameId);
        List<Submission> submissions = submissionRepository.findByGameId(gameId);

        Map<UUID, List<Submission>> byTeam = submissions.stream()
                .collect(Collectors.groupingBy(s -> s.getTeam().getId()));

        return teams.stream().map(team -> {
            List<Submission> teamSubs = byTeam.getOrDefault(team.getId(), List.of());

            Map<UUID, Submission> scoredByChallenge = teamSubs.stream()
                    .filter(s -> s.getStatus() == SubmissionStatus.correct
                            || s.getStatus() == SubmissionStatus.approved)
                    .collect(Collectors.toMap(
                            s -> s.getChallenge().getId(),
                            s -> s,
                            (first, second) -> first.getSubmittedAt().isAfter(second.getSubmittedAt()) ? first : second
                    ));

            int points = scoredByChallenge.values().stream()
                    .mapToInt(s -> s.getPoints() != null ? s.getPoints() : s.getChallenge().getPoints())
                    .sum();

            int completed = scoredByChallenge.size();

            return LeaderboardEntry.builder()
                    .teamId(team.getId())
                    .teamName(team.getName())
                    .color(team.getColor())
                    .points(points)
                    .completedChallenges(completed)
                    .build();
        })
        .sorted(Comparator.comparingInt(LeaderboardEntry::getPoints).reversed())
        .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public List<ActivityEventResponse> getActivity(UUID gameId) {
        gameAccessService.ensureCurrentUserCanAccessGame(gameId);
        return activityEventRepository.findByGameIdOrderByTimestampDesc(gameId).stream()
                .map(e -> ActivityEventResponse.builder()
                        .id(e.getId())
                        .gameId(e.getGame().getId())
                        .type(e.getType().name())
                        .teamId(e.getTeam().getId())
                        .baseId(e.getBase() != null ? e.getBase().getId() : null)
                        .challengeId(e.getChallenge() != null ? e.getChallenge().getId() : null)
                        .message(e.getMessage())
                        .timestamp(e.getTimestamp())
                        .build())
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public List<TeamBaseProgressResponse> getProgress(UUID gameId) {
        gameAccessService.ensureCurrentUserCanAccessGame(gameId);
        return computeProgress(gameId);
    }

    List<TeamBaseProgressResponse> computeProgress(UUID gameId) {
        List<Team> teams = teamRepository.findByGameId(gameId);
        List<Base> bases = baseRepository.findByGameId(gameId);
        List<CheckIn> checkIns = checkInRepository.findByGameId(gameId);
        List<Submission> submissions = submissionRepository.findByGameId(gameId);
        List<Assignment> assignments = assignmentRepository.findByGameId(gameId);
        List<Assignment> sortedAssignments = assignments.stream()
                .sorted(
                        Comparator.comparing(
                                        Assignment::getCreatedAt,
                                        Comparator.nullsLast(Comparator.reverseOrder())
                                )
                                .thenComparing(a -> a.getId().toString(), Comparator.reverseOrder())
                )
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

        Map<UUID, Map<UUID, Assignment>> teamAssignments = new HashMap<>();
        Map<UUID, Assignment> globalAssignments = new HashMap<>();
        for (Assignment a : sortedAssignments) {
            if (a.getTeam() != null) {
                teamAssignments
                        .computeIfAbsent(a.getTeam().getId(), k -> new HashMap<>())
                        .putIfAbsent(a.getBase().getId(), a);
            } else {
                globalAssignments.putIfAbsent(a.getBase().getId(), a);
            }
        }

        List<TeamBaseProgressResponse> result = new ArrayList<>();

        for (Team team : teams) {
            UUID teamId = team.getId();
            Map<UUID, CheckIn> teamCheckIns = checkInsByTeamBase.getOrDefault(teamId, Map.of());
            Map<UUID, Submission> teamSubs = submissionsByTeamBase.getOrDefault(teamId, Map.of());
            Map<UUID, Assignment> teamSpecific = teamAssignments.getOrDefault(teamId, Map.of());

            for (Base base : bases) {
                UUID baseId = base.getId();
                CheckIn ci = teamCheckIns.get(baseId);
                Submission sub = teamSubs.get(baseId);

                Assignment assignment = teamSpecific.get(baseId);
                if (assignment == null) {
                    assignment = globalAssignments.get(baseId);
                }

                BaseStatus status = BaseStatus.compute(sub, ci);
                String submissionStatus = sub != null ? sub.getStatus().name() : null;

                result.add(TeamBaseProgressResponse.builder()
                        .baseId(baseId)
                        .teamId(teamId)
                        .status(status.name())
                        .checkedInAt(ci != null ? ci.getCheckedInAt() : null)
                        .challengeId(assignment != null ? assignment.getChallenge().getId() : null)
                        .submissionStatus(submissionStatus)
                        .build());
            }
        }

        return result;
    }

    @Transactional(readOnly = true)
    public List<TeamLocationResponse> getLocations(UUID gameId) {
        gameAccessService.ensureCurrentUserCanAccessGame(gameId);
        return computeLocations(gameId);
    }

    List<TeamLocationResponse> computeLocations(UUID gameId) {
        return playerLocationRepository.findByGameId(gameId).stream()
                .map(pl -> TeamLocationResponse.builder()
                        .teamId(pl.getPlayer().getTeam().getId())
                        .playerId(pl.getPlayerId())
                        .displayName(pl.getPlayer().getDisplayName())
                        .lat(pl.getLat())
                        .lng(pl.getLng())
                        .updatedAt(pl.getUpdatedAt())
                        .build())
                .collect(Collectors.toList());
    }
}
