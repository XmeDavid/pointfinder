package com.prayer.pointfinder.service;

import com.prayer.pointfinder.dto.response.UserResponse;
import com.prayer.pointfinder.entity.Game;
import com.prayer.pointfinder.entity.GameStatus;
import com.prayer.pointfinder.entity.PushPlatform;
import com.prayer.pointfinder.entity.User;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.exception.ResourceNotFoundException;
import com.prayer.pointfinder.repository.GameRepository;
import com.prayer.pointfinder.repository.RefreshTokenRepository;
import com.prayer.pointfinder.repository.UserRepository;
import com.prayer.pointfinder.security.SecurityUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class UserService {

    private final UserRepository userRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final GameRepository gameRepository;

    @Transactional(readOnly = true)
    public List<UserResponse> getAllUsers() {
        return userRepository.findAll().stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public UserResponse getCurrentUser() {
        User user = SecurityUtils.getCurrentUser();
        return toResponse(user);
    }

    @Transactional(timeout = 10)
    public void updateCurrentUserPushToken(String pushToken, PushPlatform platform) {
        User currentUser = SecurityUtils.getCurrentUser();
        UUID userId = currentUser.getId();
        User managedUser = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", userId));

        managedUser.setPushToken(pushToken);
        managedUser.setPushPlatform(platform);
        userRepository.save(managedUser);
    }

    @Transactional(timeout = 10)
    public void deleteAccount(UUID userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", userId));

        // Block deletion if the user owns any non-ended games
        if (gameRepository.existsByCreatedByIdAndStatusNot(userId, GameStatus.ended)) {
            throw new BadRequestException(
                    "Cannot delete account while you own active games. " +
                    "Please delete or end all your games first.");
        }

        // Delete all refresh tokens for this user
        refreshTokenRepository.deleteByUserId(userId);

        // Remove user from all operator memberships (game_operators join table)
        for (Game game : user.getOperatedGames()) {
            game.getOperators().remove(user);
        }

        // Delete the user record
        userRepository.delete(user);
    }

    private UserResponse toResponse(User user) {
        return UserResponse.builder()
                .id(user.getId())
                .email(user.getEmail())
                .name(user.getName())
                .role(user.getRole().name())
                .createdAt(user.getCreatedAt())
                .build();
    }
}
