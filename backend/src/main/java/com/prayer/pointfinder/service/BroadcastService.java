package com.prayer.pointfinder.service;

import com.prayer.pointfinder.dto.response.*;
import com.prayer.pointfinder.entity.Game;
import com.prayer.pointfinder.exception.ResourceNotFoundException;
import com.prayer.pointfinder.repository.BaseRepository;
import com.prayer.pointfinder.repository.GameRepository;
import com.prayer.pointfinder.repository.TeamRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class BroadcastService {

    private final GameRepository gameRepository;
    private final TeamRepository teamRepository;
    private final BaseRepository baseRepository;
    private final MonitoringService monitoringService;

    @Transactional(readOnly = true)
    public BroadcastDataResponse getBroadcastData(String code) {
        Game game = resolveGame(code);
        UUID gameId = game.getId();

        List<BroadcastTeamResponse> teams = teamRepository.findByGameId(gameId).stream()
                .map(t -> BroadcastTeamResponse.builder()
                        .id(t.getId())
                        .name(t.getName())
                        .color(t.getColor())
                        .build())
                .collect(Collectors.toList());

        List<BroadcastBaseResponse> bases = baseRepository.findByGameId(gameId).stream()
                .filter(b -> !Boolean.TRUE.equals(b.getHidden()))
                .map(b -> BroadcastBaseResponse.builder()
                        .id(b.getId())
                        .name(b.getName())
                        .lat(b.getLat())
                        .lng(b.getLng())
                        .build())
                .collect(Collectors.toList());

        List<LeaderboardEntry> leaderboard = monitoringService.computeLeaderboard(gameId);
        if (leaderboard.size() > 100) {
            leaderboard = leaderboard.subList(0, 100);
        }

        return BroadcastDataResponse.builder()
                .gameId(gameId)
                .gameName(game.getName())
                .gameStatus(game.getStatus().name())
                .tileSource(game.getTileSource())
                .leaderboard(leaderboard)
                .teams(teams)
                .bases(bases)
                .locations(monitoringService.computeLocations(gameId))
                .progress(monitoringService.computeProgress(gameId))
                .build();
    }

    @Transactional(readOnly = true)
    public UUID resolveGameId(String code) {
        return resolveGame(code).getId();
    }

    @Transactional(readOnly = true)
    public List<LeaderboardEntry> getLeaderboard(String code) {
        Game game = resolveGame(code);
        return monitoringService.computeLeaderboard(game.getId());
    }

    @Transactional(readOnly = true)
    public List<TeamLocationResponse> getLocations(String code) {
        Game game = resolveGame(code);
        return monitoringService.computeLocations(game.getId());
    }

    @Transactional(readOnly = true)
    public List<TeamBaseProgressResponse> getProgress(String code) {
        Game game = resolveGame(code);
        return monitoringService.computeProgress(game.getId());
    }

    private Game resolveGame(String code) {
        return gameRepository.findByBroadcastCodeAndBroadcastEnabledTrue(code.toUpperCase())
                .orElseThrow(() -> new ResourceNotFoundException("Broadcast not found for code: " + code));
    }
}
