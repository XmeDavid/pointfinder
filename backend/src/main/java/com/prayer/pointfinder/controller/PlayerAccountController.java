package com.prayer.pointfinder.controller;

import com.prayer.pointfinder.dto.request.PlayerAccountLinkRequest;
import com.prayer.pointfinder.dto.response.PlayerAccountResponse;
import com.prayer.pointfinder.entity.Player;
import com.prayer.pointfinder.exception.RateLimitExceededException;
import com.prayer.pointfinder.security.SecurityUtils;
import com.prayer.pointfinder.service.PlayerAccountService;
import com.prayer.pointfinder.service.PlayerJoinRateLimiter;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The account behind the calling participation. Authenticated by the player
 * token; account credentials travel in the body once, so the player session
 * never changes principal.
 */
@RestController
@RequestMapping("/api/player/account")
@RequiredArgsConstructor
@Slf4j
public class PlayerAccountController {

    private final PlayerAccountService playerAccountService;
    private final PlayerJoinRateLimiter playerJoinRateLimiter;

    @GetMapping
    public ResponseEntity<PlayerAccountResponse> account() {
        return ResponseEntity.ok(playerAccountService.account(SecurityUtils.getCurrentPlayer()));
    }

    @PostMapping("/link")
    public ResponseEntity<PlayerAccountResponse> link(
            @Valid @RequestBody PlayerAccountLinkRequest request,
            @RequestHeader(value = "X-Forwarded-Host", required = false) String forwardedHost,
            HttpServletRequest httpRequest) {
        Player player = SecurityUtils.getCurrentPlayer();
        // Same bucket as join: a player token must not be able to spray signups or password guesses.
        String ip = resolveClientIp(httpRequest);
        if (!playerJoinRateLimiter.tryAcquire(ip, player.getId().toString())) {
            log.warn("[ACCOUNT] operation=link result=rateLimited ip={} playerId={}", ip, player.getId());
            throw new RateLimitExceededException("Too many attempts. Please try again shortly.");
        }
        // Only the proxy-set host is trusted for the verification link; see AuthController.
        return ResponseEntity.ok(playerAccountService.link(player, request, forwardedHost));
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
