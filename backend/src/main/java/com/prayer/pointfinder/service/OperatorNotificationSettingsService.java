package com.prayer.pointfinder.service;

import com.prayer.pointfinder.dto.request.UpdateOperatorNotificationSettingsRequest;
import com.prayer.pointfinder.dto.response.OperatorNotificationSettingsResponse;
import com.prayer.pointfinder.entity.Game;
import com.prayer.pointfinder.entity.OperatorNotificationSettings;
import com.prayer.pointfinder.entity.User;
import com.prayer.pointfinder.exception.ResourceNotFoundException;
import com.prayer.pointfinder.repository.GameRepository;
import com.prayer.pointfinder.repository.OperatorNotificationSettingsRepository;
import com.prayer.pointfinder.repository.UserRepository;
import com.prayer.pointfinder.security.SecurityUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

@Service
@RequiredArgsConstructor
public class OperatorNotificationSettingsService {

    private final OperatorNotificationSettingsRepository settingsRepository;
    private final GameRepository gameRepository;
    private final UserRepository userRepository;
    private final GameAccessService gameAccessService;

    @Transactional(readOnly = true)
    public OperatorNotificationSettingsResponse getCurrentUserSettings(UUID gameId) {
        gameAccessService.ensureCurrentUserCanAccessGame(gameId);
        User currentUser = SecurityUtils.getCurrentUser();

        return settingsRepository.findByGameIdAndUserId(gameId, currentUser.getId())
                .map(this::toResponse)
                .orElseGet(() -> defaultResponse(gameId, currentUser.getId()));
    }

    @Transactional
    public OperatorNotificationSettingsResponse updateCurrentUserSettings(
            UUID gameId,
            UpdateOperatorNotificationSettingsRequest request
    ) {
        gameAccessService.ensureCurrentUserCanAccessGame(gameId);
        User currentUser = SecurityUtils.getCurrentUser();

        OperatorNotificationSettings settings = settingsRepository.findByGameIdAndUserId(gameId, currentUser.getId())
                .orElseGet(() -> {
                    Game game = gameRepository.findById(gameId)
                            .orElseThrow(() -> new ResourceNotFoundException("Game", gameId));
                    User managedUser = userRepository.findById(currentUser.getId())
                            .orElseThrow(() -> new ResourceNotFoundException("User", currentUser.getId()));
                    return OperatorNotificationSettings.builder()
                            .game(game)
                            .user(managedUser)
                            .build();
                });

        settings.setNotifyPendingSubmissions(Boolean.TRUE.equals(request.getNotifyPendingSubmissions()));
        settings.setNotifyAllSubmissions(Boolean.TRUE.equals(request.getNotifyAllSubmissions()));
        settings.setNotifyCheckIns(Boolean.TRUE.equals(request.getNotifyCheckIns()));

        return toResponse(settingsRepository.save(settings));
    }

    public OperatorNotificationSettingsResponse defaultResponse(UUID gameId, UUID userId) {
        return OperatorNotificationSettingsResponse.builder()
                .gameId(gameId)
                .userId(userId)
                .notifyPendingSubmissions(true)
                .notifyAllSubmissions(false)
                .notifyCheckIns(false)
                .build();
    }

    private OperatorNotificationSettingsResponse toResponse(OperatorNotificationSettings settings) {
        return OperatorNotificationSettingsResponse.builder()
                .gameId(settings.getGame().getId())
                .userId(settings.getUser().getId())
                .notifyPendingSubmissions(Boolean.TRUE.equals(settings.getNotifyPendingSubmissions()))
                .notifyAllSubmissions(Boolean.TRUE.equals(settings.getNotifyAllSubmissions()))
                .notifyCheckIns(Boolean.TRUE.equals(settings.getNotifyCheckIns()))
                .build();
    }
}

