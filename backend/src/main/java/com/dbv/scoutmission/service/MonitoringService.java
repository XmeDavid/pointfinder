package com.dbv.scoutmission.service;

import com.dbv.scoutmission.dto.response.*;
import com.dbv.scoutmission.entity.*;
import com.dbv.scoutmission.exception.ResourceNotFoundException;
import com.dbv.scoutmission.repository.*;
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

    @Transactional(readOnly = true)
    public DashboardResponse getDashboard(UUID gameId) {
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
        List<Team> teams = teamRepository.findByGameId(gameId);
        List<Submission> submissions = submissionRepository.findByGameId(gameId);

        // Group submissions by team
        Map<UUID, List<Submission>> byTeam = submissions.stream()
                .collect(Collectors.groupingBy(s -> s.getTeam().getId()));

        return teams.stream().map(team -> {
            List<Submission> teamSubs = byTeam.getOrDefault(team.getId(), List.of());

            int points = teamSubs.stream()
                    .filter(s -> s.getStatus() == SubmissionStatus.correct
                            || s.getStatus() == SubmissionStatus.approved)
                    .mapToInt(s -> s.getChallenge().getPoints())
                    .sum();

            int completed = (int) teamSubs.stream()
                    .filter(s -> s.getStatus() == SubmissionStatus.correct
                            || s.getStatus() == SubmissionStatus.approved)
                    .map(s -> s.getChallenge().getId())
                    .distinct()
                    .count();

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
    public List<TeamLocationResponse> getLocations(UUID gameId) {
        return teamLocationRepository.findByGameId(gameId).stream()
                .map(tl -> TeamLocationResponse.builder()
                        .teamId(tl.getTeamId())
                        .lat(tl.getLat())
                        .lng(tl.getLng())
                        .updatedAt(tl.getUpdatedAt())
                        .build())
                .collect(Collectors.toList());
    }
}
