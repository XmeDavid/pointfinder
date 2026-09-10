package com.prayer.pointfinder.controller;

import com.prayer.pointfinder.dto.request.PlayerAccountLinkRequest;
import com.prayer.pointfinder.dto.response.PlayerAccountResponse;
import com.prayer.pointfinder.security.SecurityUtils;
import com.prayer.pointfinder.service.PlayerAccountService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
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
public class PlayerAccountController {

    private final PlayerAccountService playerAccountService;

    @GetMapping
    public ResponseEntity<PlayerAccountResponse> account() {
        return ResponseEntity.ok(playerAccountService.account(SecurityUtils.getCurrentPlayer()));
    }

    @PostMapping("/link")
    public ResponseEntity<PlayerAccountResponse> link(
            @Valid @RequestBody PlayerAccountLinkRequest request,
            @RequestHeader(value = "X-Forwarded-Host", required = false) String forwardedHost) {
        // Only the proxy-set host is trusted for the verification link; see AuthController.
        return ResponseEntity.ok(playerAccountService.link(SecurityUtils.getCurrentPlayer(), request, forwardedHost));
    }
}
