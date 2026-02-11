package com.dbv.scoutmission.service;

import com.dbv.scoutmission.dto.request.CreateNotificationRequest;
import com.dbv.scoutmission.dto.response.NotificationResponse;
import com.dbv.scoutmission.entity.Game;
import com.dbv.scoutmission.entity.GameNotification;
import com.dbv.scoutmission.entity.Player;
import com.dbv.scoutmission.entity.PushPlatform;
import com.dbv.scoutmission.entity.Team;
import com.dbv.scoutmission.entity.User;
import com.dbv.scoutmission.exception.BadRequestException;
import com.dbv.scoutmission.exception.ResourceNotFoundException;
import com.dbv.scoutmission.repository.GameNotificationRepository;
import com.dbv.scoutmission.repository.GameRepository;
import com.dbv.scoutmission.repository.PlayerRepository;
import com.dbv.scoutmission.repository.TeamRepository;
import com.dbv.scoutmission.repository.UserRepository;
import com.dbv.scoutmission.security.SecurityUtils;
import com.dbv.scoutmission.websocket.GameEventBroadcaster;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class NotificationService {

    private final GameNotificationRepository notificationRepository;
    private final GameRepository gameRepository;
    private final TeamRepository teamRepository;
    private final UserRepository userRepository;
    private final PlayerRepository playerRepository;
    private final GameEventBroadcaster eventBroadcaster;
    private final ApnsPushService apnsPushService;
    private final FcmPushService fcmPushService;
    private final GameAccessService gameAccessService;

    @Transactional(readOnly = true)
    public List<NotificationResponse> getNotificationsByGame(UUID gameId) {
        gameAccessService.ensureCurrentUserCanAccessGame(gameId);
        return notificationRepository.findByGameIdOrderBySentAtDesc(gameId).stream()
                .map(this::toResponse)
                .collect(Collectors.toList());
    }

    @Transactional
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

        // Send push notifications to players on teams with registered push tokens
        List<Player> pushTargets;
        if (targetTeam != null) {
            pushTargets = playerRepository.findByTeamIdAndPushTokenIsNotNull(targetTeam.getId());
        } else {
            pushTargets = playerRepository.findByTeamGameIdAndPushTokenIsNotNull(gameId);
        }

        if (!pushTargets.isEmpty()) {
            List<String> apnsTokens = pushTargets.stream()
                    .filter(p -> p.getPushPlatform() == null || p.getPushPlatform() == PushPlatform.ios)
                    .map(Player::getPushToken)
                    .toList();
            List<String> fcmTokens = pushTargets.stream()
                    .filter(p -> p.getPushPlatform() == PushPlatform.android)
                    .map(Player::getPushToken)
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
        return NotificationResponse.builder()
                .id(n.getId())
                .gameId(n.getGame().getId())
                .message(n.getMessage())
                .targetTeamId(n.getTargetTeam() != null ? n.getTargetTeam().getId() : null)
                .sentAt(n.getSentAt())
                .sentBy(n.getSentBy().getId())
                .build();
    }
}
