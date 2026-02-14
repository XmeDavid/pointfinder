package com.prayer.pointfinder.service;

import com.prayer.pointfinder.dto.request.LoginRequest;
import com.prayer.pointfinder.dto.request.RegisterRequest;
import com.prayer.pointfinder.dto.response.AuthResponse;
import com.prayer.pointfinder.dto.response.UserResponse;
import com.prayer.pointfinder.entity.*;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.exception.ResourceNotFoundException;
import com.prayer.pointfinder.repository.OperatorInviteRepository;
import com.prayer.pointfinder.repository.RefreshTokenRepository;
import com.prayer.pointfinder.repository.UserRepository;
import com.prayer.pointfinder.security.JwtTokenProvider;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;

@Service
@RequiredArgsConstructor
public class AuthService {

    private final UserRepository userRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final OperatorInviteRepository inviteRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtTokenProvider tokenProvider;

    @Transactional
    public AuthResponse login(LoginRequest request) {
        User user = userRepository.findByEmail(request.getEmail())
                .orElseThrow(() -> new BadCredentialsException("Invalid credentials"));

        if (!passwordEncoder.matches(request.getPassword(), user.getPasswordHash())) {
            throw new BadCredentialsException("Invalid credentials");
        }

        return generateAuthResponse(user);
    }

    @Transactional
    public AuthResponse register(String inviteToken, RegisterRequest request) {
        OperatorInvite invite = inviteRepository.findByToken(inviteToken)
                .orElseThrow(() -> new ResourceNotFoundException("Invalid invite token"));

        if (invite.getStatus() != InviteStatus.pending) {
            throw new BadRequestException("Invite has already been used or expired");
        }

        if (userRepository.existsByEmail(request.getEmail())) {
            throw new BadRequestException("Email already registered");
        }

        User user = User.builder()
                .email(request.getEmail())
                .name(request.getName())
                .passwordHash(passwordEncoder.encode(request.getPassword()))
                .role(UserRole.operator)
                .build();
        user = userRepository.save(user);

        invite.setStatus(InviteStatus.accepted);
        inviteRepository.save(invite);

        // If the invite was game-specific, add user as game operator
        if (invite.getGame() != null) {
            invite.getGame().getOperators().add(user);
        }

        return generateAuthResponse(user);
    }

    @Transactional
    public AuthResponse refreshToken(String refreshTokenStr) {
        RefreshToken storedToken = refreshTokenRepository.findByToken(refreshTokenStr)
                .orElseThrow(() -> new BadRequestException("Invalid refresh token"));

        if (storedToken.isExpired()) {
            refreshTokenRepository.delete(storedToken);
            throw new BadRequestException("Refresh token expired");
        }

        // Delete old refresh token
        refreshTokenRepository.delete(storedToken);

        return generateAuthResponse(storedToken.getUser());
    }

    @Transactional
    public void logout(String refreshTokenStr) {
        refreshTokenRepository.deleteByToken(refreshTokenStr);
    }

    private AuthResponse generateAuthResponse(User user) {
        String accessToken = tokenProvider.generateAccessToken(
                user.getId(), user.getEmail(), user.getRole().name());

        String refreshTokenStr = tokenProvider.generateRefreshTokenString();

        RefreshToken refreshToken = RefreshToken.builder()
                .user(user)
                .token(refreshTokenStr)
                .expiresAt(Instant.now().plusMillis(tokenProvider.getRefreshTokenExpirationMs()))
                .build();
        refreshTokenRepository.save(refreshToken);

        UserResponse userResponse = UserResponse.builder()
                .id(user.getId())
                .email(user.getEmail())
                .name(user.getName())
                .role(user.getRole().name())
                .createdAt(user.getCreatedAt())
                .build();

        return AuthResponse.builder()
                .accessToken(accessToken)
                .refreshToken(refreshTokenStr)
                .user(userResponse)
                .build();
    }
}
