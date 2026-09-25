package com.prayer.pointfinder.service;

import com.prayer.pointfinder.dto.response.AdminUserDetailResponse;
import com.prayer.pointfinder.entity.User;
import com.prayer.pointfinder.entity.UserRole;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.exception.ResourceNotFoundException;
import com.prayer.pointfinder.repository.GamePublicationRepository;
import com.prayer.pointfinder.repository.GameRepository;
import com.prayer.pointfinder.repository.RefreshTokenRepository;
import com.prayer.pointfinder.repository.UserRepository;
import com.prayer.pointfinder.security.SecurityUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.UUID;

/**
 * Owner decision 2026-09-24: platform admins can block an abusive account.
 * Blocking signs it out everywhere (token version bump plus every refresh
 * token), refuses new sign-ins with {@code ACCOUNT_BLOCKED}, and removes and
 * holds the Explore listings it created or listed. Its games, teams and
 * players are untouched. Unblocking restores sign-in only; held listings
 * stay held until an admin releases each one.
 *
 * <p>Platform admins cannot be blocked, so the panel cannot lock itself out.
 * Who blocked, when and why is kept on the account; every change is logged.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class AccountModerationService {

    private final UserRepository userRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final GamePublicationRepository publicationRepository;
    private final GameRepository gameRepository;
    private final GamePublicationService publicationService;
    private final GameAccessService gameAccessService;
    private final AdminService adminService;

    @Transactional
    public AdminUserDetailResponse block(UUID userId, String reason) {
        gameAccessService.ensureCurrentUserIsAdmin();
        User admin = SecurityUtils.getCurrentUser();
        User user = userRepository.findById(userId).orElseThrow(() -> new ResourceNotFoundException("User", userId));
        if (user.getRole() == UserRole.admin) {
            throw new BadRequestException("Platform administrators cannot be blocked");
        }
        if (!user.isBlocked()) {
            user.setBlockedAt(Instant.now());
            user.setBlockedBy(admin);
            // Every access token minted before now is rejected by the JWT filter.
            int version = user.getTokenVersion() != null ? user.getTokenVersion() : 0;
            user.setTokenVersion(version + 1);
        }
        user.setBlockedReason(reason.trim());
        userRepository.save(user);
        refreshTokenRepository.deleteByUserId(userId);

        int removed = 0;
        for (UUID gameId : publicationRepository.findListedGameIdsByCreatorOrPublisher(userId)) {
            // Same lock order as every publication change: game row, then publication.
            gameRepository.findByIdForUpdate(gameId);
            var publication = publicationRepository.findById(gameId);
            if (publication.isPresent() && publication.get().isListed()) {
                publicationService.holdAndDelist(publication.get(), admin);
                removed++;
            }
        }
        log.info("[MODERATION] operation=block userId={} adminId={} listingsRemoved={}", userId, admin.getId(), removed);
        return adminService.getUserDetail(userId);
    }

    @Transactional
    public AdminUserDetailResponse unblock(UUID userId) {
        gameAccessService.ensureCurrentUserIsAdmin();
        User admin = SecurityUtils.getCurrentUser();
        User user = userRepository.findById(userId).orElseThrow(() -> new ResourceNotFoundException("User", userId));
        if (user.isBlocked()) {
            user.setBlockedAt(null);
            user.setBlockedBy(null);
            user.setBlockedReason(null);
            userRepository.save(user);
            log.info("[MODERATION] operation=unblock userId={} adminId={}", userId, admin.getId());
        }
        return adminService.getUserDetail(userId);
    }
}
