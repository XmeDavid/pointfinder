package com.prayer.pointfinder.service;

import com.prayer.pointfinder.entity.GameStatus;
import com.prayer.pointfinder.entity.Player;
import com.prayer.pointfinder.entity.PlayerLocation;
import com.prayer.pointfinder.entity.Team;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.exception.ResourceNotFoundException;
import com.prayer.pointfinder.repository.PlayerLocationRepository;
import com.prayer.pointfinder.repository.PlayerRepository;
import com.prayer.pointfinder.websocket.GameEventBroadcaster;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class PlayerLocationService {

    private final PlayerRepository playerRepository;
    private final PlayerLocationRepository playerLocationRepository;
    private final GameAccessService gameAccessService;
    private final GameEventBroadcaster eventBroadcaster;

    /** Backwards-compatible overload for callers with no fix metadata. */
    @Transactional(timeout = 10)
    public void updateLocation(UUID gameId, Player authPlayer, Double lat, Double lng) {
        updateLocation(gameId, authPlayer, lat, lng, null, null);
    }

    @Transactional(timeout = 10)
    public void updateLocation(UUID gameId, Player authPlayer, Double lat, Double lng,
                               Double accuracy, Instant capturedAt) {
        if (lat == null || lng == null || !Double.isFinite(lat) || !Double.isFinite(lng)
                || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
            throw new BadRequestException("Invalid coordinates");
        }

        // A garbage accuracy reading is not a reason to drop a good position:
        // keep the coordinates, forget the metadata.
        Double storedAccuracy = accuracy != null && Double.isFinite(accuracy) && accuracy >= 0
                ? accuracy : null;

        Player player = loadPlayer(authPlayer);

        Team team = player.getTeam();
        team.getId(); // force initialization

        gameAccessService.ensurePlayerBelongsToGame(player, gameId);
        ensureGameIsLiveForPlayerActions(team);

        PlayerLocation location = playerLocationRepository.findById(player.getId()).orElse(null);
        if (location == null) {
            location = PlayerLocation.builder()
                    .player(player)
                    .lat(lat)
                    .lng(lng)
                    .accuracyM(storedAccuracy)
                    .capturedAt(capturedAt)
                    .build();
        } else {
            location.setLat(lat);
            location.setLng(lng);
            location.setAccuracyM(storedAccuracy);
            location.setCapturedAt(capturedAt);
        }
        playerLocationRepository.save(location);

        Map<String, Object> locationData = new HashMap<>();
        locationData.put("teamId", team.getId());
        locationData.put("playerId", player.getId());
        locationData.put("displayName", player.getDisplayName());
        locationData.put("lat", lat);
        locationData.put("lng", lng);
        locationData.put("accuracyM", storedAccuracy);
        locationData.put("capturedAt", capturedAt != null ? capturedAt.toString() : null);
        locationData.put("updatedAt", Instant.now().toString());
        eventBroadcaster.broadcastLocationUpdate(gameId, locationData);
    }

    private Player loadPlayer(Player authPlayer) {
        UUID playerId = authPlayer.getId();
        return playerRepository.findById(playerId)
                .orElseThrow(() -> new ResourceNotFoundException("Player", playerId));
    }

    private void ensureGameIsLiveForPlayerActions(Team team) {
        if (team.getGame().getStatus() != GameStatus.live) {
            throw new BadRequestException("Game is not active yet");
        }
    }
}
