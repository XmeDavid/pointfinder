package com.prayer.pointfinder.controller;

import com.prayer.pointfinder.dto.request.BlockAccountRequest;
import com.prayer.pointfinder.service.AccountModerationService;
import com.prayer.pointfinder.service.AdminService;
import com.prayer.pointfinder.service.GameAccessService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/admin")
@RequiredArgsConstructor
@Slf4j
public class AdminController {

    private final AdminService adminService;
    private final GameAccessService gameAccessService;
    private final AccountModerationService accountModerationService;

    @GetMapping("/users")
    public ResponseEntity<?> listUsers(
            @RequestParam(required = false, defaultValue = "") String search,
            @RequestParam(required = false, defaultValue = "0") int page,
            @RequestParam(required = false, defaultValue = "20") int size) {
        gameAccessService.ensureCurrentUserIsAdmin();
        return ResponseEntity.ok(adminService.listUsers(search, page, size));
    }

    @GetMapping("/users/{userId}")
    public ResponseEntity<?> getUserDetail(@PathVariable UUID userId) {
        gameAccessService.ensureCurrentUserIsAdmin();
        return ResponseEntity.ok(adminService.getUserDetail(userId));
    }

    /** Signs the account out everywhere, refuses sign-in and takes its listings down. */
    @PostMapping("/users/{userId}/block")
    public ResponseEntity<?> blockUser(@PathVariable UUID userId, @Valid @RequestBody BlockAccountRequest request) {
        gameAccessService.ensureCurrentUserIsAdmin();
        return ResponseEntity.ok(accountModerationService.block(userId, request.getReason()));
    }

    /** Restores sign-in; held listings stay held. */
    @PostMapping("/users/{userId}/unblock")
    public ResponseEntity<?> unblockUser(@PathVariable UUID userId) {
        gameAccessService.ensureCurrentUserIsAdmin();
        return ResponseEntity.ok(accountModerationService.unblock(userId));
    }

    @GetMapping("/orgs")
    public ResponseEntity<?> listOrgs(
            @RequestParam(required = false, defaultValue = "") String search,
            @RequestParam(required = false, defaultValue = "0") int page,
            @RequestParam(required = false, defaultValue = "20") int size) {
        gameAccessService.ensureCurrentUserIsAdmin();
        return ResponseEntity.ok(adminService.listOrgs(search, page, size));
    }

    @GetMapping("/orgs/{orgId}")
    public ResponseEntity<?> getOrgDetail(@PathVariable UUID orgId) {
        gameAccessService.ensureCurrentUserIsAdmin();
        return ResponseEntity.ok(adminService.getOrgDetail(orgId));
    }

    @GetMapping("/users/{userId}/games")
    public ResponseEntity<?> getUserGames(@PathVariable UUID userId) {
        gameAccessService.ensureCurrentUserIsAdmin();
        return ResponseEntity.ok(adminService.getUserGames(userId));
    }

    @GetMapping("/orgs/{orgId}/games")
    public ResponseEntity<?> getOrgGames(@PathVariable UUID orgId) {
        gameAccessService.ensureCurrentUserIsAdmin();
        return ResponseEntity.ok(adminService.getOrgGames(orgId));
    }
}
