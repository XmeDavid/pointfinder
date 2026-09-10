package com.prayer.pointfinder.service;

import com.prayer.pointfinder.dto.request.CreateNotificationRequest;
import com.prayer.pointfinder.dto.response.NotificationResponse;
import com.prayer.pointfinder.entity.Game;
import com.prayer.pointfinder.entity.GameNotification;
import com.prayer.pointfinder.entity.Player;
import com.prayer.pointfinder.entity.PlayerPushToken;
import com.prayer.pointfinder.entity.PushPlatform;
import com.prayer.pointfinder.entity.Team;
import com.prayer.pointfinder.entity.User;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.exception.ResourceNotFoundException;
import com.prayer.pointfinder.repository.GameNotificationRepository;
import com.prayer.pointfinder.repository.GameRepository;
import com.prayer.pointfinder.repository.PlayerPushTokenRepository;
import com.prayer.pointfinder.repository.PlayerRepository;
import com.prayer.pointfinder.repository.TeamRepository;
import com.prayer.pointfinder.repository.UserRepository;
import com.prayer.pointfinder.security.SecurityUtils;
import com.prayer.pointfinder.util.NotificationMapper;
import com.prayer.pointfinder.websocket.GameEventBroadcaster;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import org.springframework.data.domain.PageRequest;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class NotificationService {

    private final GameNotificationRepository notificationRepository;
    private final GameRepository gameRepository;
    private final TeamRepository teamRepository;
    private final UserRepository userRepository;
    private final PlayerRepository playerRepository;
    private final PlayerPushTokenRepository playerPushTokenRepository;
    private final GameEventBroadcaster eventBroadcaster;
    private final ApnsPushService apnsPushService;
    private final FcmPushService fcmPushService;
    private final GameAccessService gameAccessService;

    @Transactional(readOnly = true)
    public List<NotificationResponse> getNotificationsByGame(UUID gameId) {
        gameAccessService.ensureCurrentUserCanAccessGame(gameId);
        return notificationRepository.findByGameIdOrderBySentAtDesc(gameId, PageRequest.of(0, 500)).stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional(timeout = 10)
    public NotificationResponse createNotification(UUID gameId, CreateNotificationRequest request) {
        Game game = gameAccessService.getAccessibleGame(gameId);
        User currentUser = SecurityUtils.getCurrentUser();
        // Re-fetch user within transaction to get fresh entity with proper session
        UUID userId = currentUser.getId();
        currentUser = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", userId));

        Team targetTeam = null;
        if (request.getTargetTeamId() != null) {
            targetTeam = teamRepository.findById(request.getTargetTeamId())
                    .orElseThrow(() -> new ResourceNotFoundException("Team", request.getTargetTeamId()));
            if (!targetTeam.getGame().getId().equals(gameId)) {
                throw new BadRequestException("Target team does not belong to this game");
            }
        }

        GameNotification notification = GameNotification.builder()
                .game(game)
                .message(request.getMessage())
                .targetTeam(targetTeam)
                .sentAt(Instant.now())
                .sentBy(currentUser)
                .build();

        notification = notificationRepository.save(notification);

        // Broadcast via WebSocket
        NotificationResponse response = toResponse(notification);
        eventBroadcaster.broadcastNotification(gameId, response);

        // Send push notifications to every phone registered for the targeted players
        List<PlayerPushToken> pushTargets = targetTeam != null
                ? playerPushTokenRepository.findByPlayerTeamId(targetTeam.getId())
                : playerPushTokenRepository.findByGameId(gameId);

        if (!pushTargets.isEmpty()) {
            List<String> apnsTokens = pushTargets.stream()
                    .filter(t -> t.getPlatform() == PushPlatform.ios)
                    .map(PlayerPushToken::getToken)
                    .distinct()
                    .toList();
            List<String> fcmTokens = pushTargets.stream()
                    .filter(t -> t.getPlatform() == PushPlatform.android)
                    .map(PlayerPushToken::getToken)
                    .distinct()
                    .toList();

            if (!apnsTokens.isEmpty()) {
                apnsPushService.sendPush(
                        apnsTokens,
                        game.getName(),
                        request.getMessage(),
                        Map.of("gameId", gameId.toString())
                );
            }

            if (!fcmTokens.isEmpty()) {
                fcmPushService.sendPush(
                        fcmTokens,
                        game.getName(),
                        request.getMessage(),
                        Map.of("gameId", gameId.toString())
                );
            }
        }

        return response;
    }

    private NotificationResponse toResponse(GameNotification n) {
        return NotificationMapper.toResponse(n);
    }
}
