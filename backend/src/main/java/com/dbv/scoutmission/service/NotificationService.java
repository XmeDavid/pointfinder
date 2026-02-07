package com.dbv.scoutmission.service;

import com.dbv.scoutmission.dto.request.CreateNotificationRequest;
import com.dbv.scoutmission.dto.response.NotificationResponse;
import com.dbv.scoutmission.entity.Game;
import com.dbv.scoutmission.entity.GameNotification;
import com.dbv.scoutmission.entity.Team;
import com.dbv.scoutmission.entity.User;
import com.dbv.scoutmission.exception.ResourceNotFoundException;
import com.dbv.scoutmission.repository.GameNotificationRepository;
import com.dbv.scoutmission.repository.GameRepository;
import com.dbv.scoutmission.repository.TeamRepository;
import com.dbv.scoutmission.repository.UserRepository;
import com.dbv.scoutmission.security.SecurityUtils;
import com.dbv.scoutmission.websocket.GameEventBroadcaster;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class NotificationService {

    private final GameNotificationRepository notificationRepository;
    private final GameRepository gameRepository;
    private final TeamRepository teamRepository;
    private final UserRepository userRepository;
    private final GameEventBroadcaster eventBroadcaster;

    @Transactional(readOnly = true)
    public List<NotificationResponse> getNotificationsByGame(UUID gameId) {
        return notificationRepository.findByGameIdOrderBySentAtDesc(gameId).stream()
                .map(this::toResponse)
                .collect(Collectors.toList());
    }

    @Transactional
    public NotificationResponse createNotification(UUID gameId, CreateNotificationRequest request) {
        Game game = gameRepository.findById(gameId)
                .orElseThrow(() -> new ResourceNotFoundException("Game", gameId));
        User currentUser = SecurityUtils.getCurrentUser();
        // Re-fetch user within transaction to get fresh entity with proper session
        UUID userId = currentUser.getId();
        currentUser = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", userId));

        Team targetTeam = null;
        if (request.getTargetTeamId() != null) {
            targetTeam = teamRepository.findById(request.getTargetTeamId())
                    .orElseThrow(() -> new ResourceNotFoundException("Team", request.getTargetTeamId()));
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
        eventBroadcaster.broadcastNotification(gameId, toResponse(notification));

        return toResponse(notification);
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
