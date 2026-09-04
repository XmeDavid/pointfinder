package com.prayer.pointfinder.service;

import com.prayer.pointfinder.dto.response.NotificationResponse;
import com.prayer.pointfinder.dto.response.UnseenCountResponse;
import com.prayer.pointfinder.entity.GameNotification;
import com.prayer.pointfinder.entity.Player;
import com.prayer.pointfinder.exception.ResourceNotFoundException;
import com.prayer.pointfinder.repository.GameNotificationRepository;
import com.prayer.pointfinder.repository.PlayerRepository;
import com.prayer.pointfinder.util.NotificationMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class PlayerNotificationQueryService {

    private final GameNotificationRepository gameNotificationRepository;
    private final PlayerRepository playerRepository;

    @Transactional(readOnly = true)
    public List<NotificationResponse> getNotifications(Player authPlayer) {
        Player player = loadPlayer(authPlayer);
        UUID gameId = player.getTeam().getGame().getId();
        UUID teamId = player.getTeam().getId();
        return gameNotificationRepository.findByGameIdForTeam(gameId, teamId, PageRequest.of(0, 500))
                .stream()
                .map(this::toNotificationResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public UnseenCountResponse getUnseenNotificationCount(Player authPlayer) {
        Player player = loadPlayer(authPlayer);
        UUID gameId = player.getTeam().getGame().getId();
        UUID teamId = player.getTeam().getId();
        Instant since = player.getLastNotificationsSeenAt() != null
                ? player.getLastNotificationsSeenAt()
                : Instant.EPOCH;
        long count = gameNotificationRepository.countUnseenForTeam(gameId, teamId, since);
        return new UnseenCountResponse(count);
    }

    @Transactional(timeout = 10)
    public void markNotificationsSeen(Player authPlayer) {
        Player player = loadPlayer(authPlayer);
        player.setLastNotificationsSeenAt(Instant.now());
        playerRepository.save(player);
    }

    private NotificationResponse toNotificationResponse(GameNotification n) {
        return NotificationMapper.toResponse(n);
    }

    private Player loadPlayer(Player authPlayer) {
        UUID playerId = authPlayer.getId();
        return playerRepository.findById(playerId)
                .orElseThrow(() -> new ResourceNotFoundException("Player", playerId));
    }
}
