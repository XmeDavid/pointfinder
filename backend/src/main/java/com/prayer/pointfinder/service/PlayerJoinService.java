package com.prayer.pointfinder.service;

import com.prayer.pointfinder.dto.request.PlayerJoinRequest;
import com.prayer.pointfinder.dto.response.PlayerAuthResponse;
import com.prayer.pointfinder.entity.Game;
import com.prayer.pointfinder.entity.GameStatus;
import com.prayer.pointfinder.entity.Player;
import com.prayer.pointfinder.entity.Team;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.exception.ErrorCode;
import com.prayer.pointfinder.repository.GameRepository;
import com.prayer.pointfinder.repository.PlayerRepository;
import com.prayer.pointfinder.repository.TeamRepository;
import com.prayer.pointfinder.security.JwtTokenProvider;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

@Service
@RequiredArgsConstructor
public class PlayerJoinService {

    private final TeamRepository teamRepository;
    private final JwtTokenProvider tokenProvider;
    private final QuotaService quotaService;
    private final PlayerRepository playerRepository;
    private final GameRepository gameRepository;
    private final GameAccessService gameAccessService;

    @Transactional(timeout = 10)
    public PlayerAuthResponse joinTeam(PlayerJoinRequest request) {
        Team team = teamRepository.findByJoinCode(request.getJoinCode())
                .orElseThrow(() -> new BadRequestException("Invalid join code"));

        Game game = team.getGame();
        if (game.getStatus() == GameStatus.ended) {
            throw new BadRequestException("Game has ended");
        }

        // Find existing player by device ID in this game, or create a new one.
        // Device->team switching within the same game is rejected: once a device has
        // joined a team, rejoining is only idempotent for the SAME team. A different
        // team code means a different identity and would enable stealth takeover
        // of another team's score/history.
        Player player = playerRepository.findFirstByDeviceIdAndTeamGameIdOrderByCreatedAtDesc(request.getDeviceId(), game.getId())
                .orElse(null);

        if (player == null) {
            // Enforce player limit only for new players (not rejoins)
            quotaService.enforcePlayersPerGameLimit(game);
            player = Player.builder()
                    .team(team)
                    .deviceId(request.getDeviceId())
                    .displayName(request.getDisplayName())
                    .build();
        } else {
            // Existing device in this game -- must match the team they originally
            // joined. Force initialization of the lazy team proxy before comparing.
            UUID existingTeamId = player.getTeam() != null ? player.getTeam().getId() : null;
            if (existingTeamId != null && !existingTeamId.equals(team.getId())) {
                throw new BadRequestException(
                        "This device has already joined a different team in this game",
                        ErrorCode.DEVICE_ALREADY_IN_DIFFERENT_TEAM);
            }
            player.setDisplayName(request.getDisplayName());
        }

        try {
            player = playerRepository.save(player);
        } catch (DataIntegrityViolationException ex) {
            // Concurrent join with same deviceId -- re-fetch the winner
            player = playerRepository.findFirstByDeviceIdAndTeamGameIdOrderByCreatedAtDesc(
                    request.getDeviceId(), game.getId())
                    .orElseThrow(() -> new BadRequestException("Join failed, please try again"));
            UUID existingTeamId = player.getTeam() != null ? player.getTeam().getId() : null;
            if (existingTeamId != null && !existingTeamId.equals(team.getId())) {
                throw new BadRequestException(
                        "This device has already joined a different team in this game",
                        ErrorCode.DEVICE_ALREADY_IN_DIFFERENT_TEAM);
            }
            player.setDisplayName(request.getDisplayName());
            player = playerRepository.save(player);
        }

        // Generate JWT token using the persisted player ID
        String jwt = tokenProvider.generatePlayerToken(player.getId(), team.getId(), game.getId());

        return new PlayerAuthResponse(
                jwt,
                new PlayerAuthResponse.PlayerInfo(
                        player.getId(),
                        player.getDisplayName(),
                        player.getDeviceId()
                ),
                new PlayerAuthResponse.TeamInfo(
                        team.getId(),
                        team.getName(),
                        team.getColor()
                ),
                new PlayerAuthResponse.GameInfo(
                        game.getId(),
                        game.getName(),
                        game.getDescription(),
                        game.getStatus().name(),
                        game.getTileSource()
                )
        );
    }
}
