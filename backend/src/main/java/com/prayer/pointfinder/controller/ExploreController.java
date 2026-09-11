package com.prayer.pointfinder.controller;

import com.prayer.pointfinder.dto.request.ExploreJoinRequest;
import com.prayer.pointfinder.dto.response.ExploreGameResponse;
import com.prayer.pointfinder.dto.response.ExplorePageResponse;
import com.prayer.pointfinder.dto.response.PlayerAuthResponse;
import com.prayer.pointfinder.exception.RateLimitExceededException;
import com.prayer.pointfinder.security.SecurityUtils;
import com.prayer.pointfinder.service.ExploreService;
import com.prayer.pointfinder.service.PlayerJoinRateLimiter;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * PF-08: Explore for signed-in accounts (any account role; never a player
 * token, never a guest). Bearer: the account session.
 */
@RestController
@RequestMapping("/api/explore")
@RequiredArgsConstructor
@Slf4j
public class ExploreController {

    private final ExploreService exploreService;
    private final PlayerJoinRateLimiter playerJoinRateLimiter;

    @GetMapping("/games")
    public ResponseEntity<ExplorePageResponse> list(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) String category,
            @RequestParam(required = false, defaultValue = "false") boolean featured,
            @RequestParam(required = false) Double lat,
            @RequestParam(required = false) Double lng,
            @RequestParam(required = false) Double radiusKm,
            @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer size) {
        return ResponseEntity.ok(exploreService.list(SecurityUtils.getCurrentUser(),
                new ExploreService.Query(q, category, featured, lat, lng, radiusKm, page, size)));
    }

    @GetMapping("/games/{gameId}")
    public ResponseEntity<ExploreGameResponse> get(@PathVariable UUID gameId) {
        return ResponseEntity.ok(exploreService.get(SecurityUtils.getCurrentUser(), gameId));
    }

    /** Same rate limit and result shape as {@code POST /api/account/join}. */
    @PostMapping("/games/{gameId}/join")
    public ResponseEntity<PlayerAuthResponse> join(@PathVariable UUID gameId, @Valid @RequestBody ExploreJoinRequest request, HttpServletRequest httpRequest) {
        limit(httpRequest, request.getDeviceId(), "exploreJoin");
        return ResponseEntity.ok(exploreService.join(SecurityUtils.getCurrentUser(), gameId, request.getDisplayName(), request.getDeviceId()));
    }

    private void limit(HttpServletRequest httpRequest, String key, String operation) {
        String ip = resolveClientIp(httpRequest);
        if (!playerJoinRateLimiter.tryAcquire(ip, key)) {
            log.warn("[EXPLORE] operation={} result=rateLimited ip={} key={}", operation, ip, key);
            throw new RateLimitExceededException("Too many attempts. Please try again shortly.");
        }
    }

    private static String resolveClientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            int comma = forwarded.indexOf(',');
            return comma > 0 ? forwarded.substring(0, comma).trim() : forwarded.trim();
        }
        return request.getRemoteAddr();
    }
}
