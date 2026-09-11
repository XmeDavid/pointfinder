package com.prayer.pointfinder.controller;

import com.prayer.pointfinder.dto.request.AccountJoinRequest;
import com.prayer.pointfinder.dto.request.AccountRecoverRequest;
import com.prayer.pointfinder.dto.response.AccountMeResponse;
import com.prayer.pointfinder.dto.response.MessageResponse;
import com.prayer.pointfinder.dto.response.PlayerAuthResponse;
import com.prayer.pointfinder.exception.RateLimitExceededException;
import com.prayer.pointfinder.security.SecurityUtils;
import com.prayer.pointfinder.service.AccountService;
import com.prayer.pointfinder.service.AuthService;
import com.prayer.pointfinder.service.PlayerAccountService;
import com.prayer.pointfinder.service.PlayerJoinRateLimiter;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * PF-01: what a signed-in phone can do with its account. Authenticated by the
 * user token; every call acts on the caller only. Any account role may play.
 */
@RestController
@RequestMapping("/api/account")
@RequiredArgsConstructor
@Slf4j
public class AccountController {

    private final AccountService accountService;
    private final PlayerAccountService playerAccountService;
    private final AuthService authService;
    private final PlayerJoinRateLimiter playerJoinRateLimiter;
    private final com.prayer.pointfinder.xp.XpService xpService;

    @GetMapping("/me")
    public ResponseEntity<AccountMeResponse> me() {
        return ResponseEntity.ok(accountService.me(SecurityUtils.getCurrentUser()));
    }

    /** Join a game as this account: recovers an existing participation, otherwise joins and links. */
    /** PF-03: level, XP and placements. Private to the account. */
    @GetMapping("/profile")
    public ResponseEntity<com.prayer.pointfinder.dto.response.XpProfileResponse> profile() {
        return ResponseEntity.ok(xpService.profile(SecurityUtils.getCurrentUser().getId()));
    }

    @PostMapping("/join")
    public ResponseEntity<PlayerAuthResponse> join(@Valid @RequestBody AccountJoinRequest request, HttpServletRequest httpRequest) {
        limit(httpRequest, request.getDeviceId(), "accountJoin");
        return ResponseEntity.ok(playerAccountService.joinForAccount(
                SecurityUtils.getCurrentUser(), request.getJoinCode(), request.getDisplayName(), request.getDeviceId()));
    }

    @PostMapping("/participations/{gameId}/recover")
    public ResponseEntity<PlayerAuthResponse> recover(@PathVariable UUID gameId, @Valid @RequestBody AccountRecoverRequest request, HttpServletRequest httpRequest) {
        limit(httpRequest, request.getDeviceId(), "accountRecover");
        return ResponseEntity.ok(playerAccountService.recoverForAccount(SecurityUtils.getCurrentUser(), gameId, request.getDeviceId()));
    }

    @PostMapping("/resend-verification")
    public ResponseEntity<MessageResponse> resendVerification(
            @RequestHeader(value = "X-Forwarded-Host", required = false) String forwardedHost,
            HttpServletRequest httpRequest) {
        limit(httpRequest, SecurityUtils.getCurrentUser().getId().toString(), "resendVerification");
        authService.resendVerification(SecurityUtils.getCurrentUser(), forwardedHost);
        return ResponseEntity.ok(new MessageResponse("If the address is not confirmed yet, a new link has been sent."));
    }

    @DeleteMapping
    public ResponseEntity<Void> delete() {
        accountService.deleteParticipant(SecurityUtils.getCurrentUser());
        return ResponseEntity.noContent().build();
    }

    private void limit(HttpServletRequest httpRequest, String key, String operation) {
        String ip = resolveClientIp(httpRequest);
        if (!playerJoinRateLimiter.tryAcquire(ip, key)) {
            log.warn("[ACCOUNT] operation={} result=rateLimited ip={} key={}", operation, ip, key);
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
