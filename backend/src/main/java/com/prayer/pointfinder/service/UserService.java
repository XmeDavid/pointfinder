package com.prayer.pointfinder.service;

import com.prayer.pointfinder.dto.response.UserResponse;
import com.prayer.pointfinder.entity.PushPlatform;
import com.prayer.pointfinder.entity.User;
import com.prayer.pointfinder.exception.ResourceNotFoundException;
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

    @Transactional(readOnly = true)
    public List<UserResponse> getAllUsers() {
        return userRepository.findAll().stream()
                .map(this::toResponse)
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public UserResponse getCurrentUser() {
        User user = SecurityUtils.getCurrentUser();
        return toResponse(user);
    }

    @Transactional
    public void updateCurrentUserPushToken(String pushToken, PushPlatform platform) {
        User currentUser = SecurityUtils.getCurrentUser();
        UUID userId = currentUser.getId();
        User managedUser = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", userId));

        managedUser.setPushToken(pushToken);
        managedUser.setPushPlatform(platform);
        userRepository.save(managedUser);
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
