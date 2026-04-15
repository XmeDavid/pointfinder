package com.prayer.pointfinder.controller;

import com.prayer.pointfinder.dto.request.UpdateProfileRequest;
import com.prayer.pointfinder.dto.request.UpdatePushTokenRequest;
import com.prayer.pointfinder.dto.response.UpdateProfileResponse;
import com.prayer.pointfinder.dto.response.UserResponse;
import com.prayer.pointfinder.entity.User;
import com.prayer.pointfinder.security.SecurityUtils;
import com.prayer.pointfinder.service.UserService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.RequestBody;

import java.util.List;

@RestController
@RequestMapping("/api/users")
@RequiredArgsConstructor
public class UserController {

    private final UserService userService;

    @GetMapping
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<List<UserResponse>> getAllUsers() {
        return ResponseEntity.ok(userService.getAllUsers());
    }

    @GetMapping("/me")
    public ResponseEntity<UserResponse> getCurrentUser() {
        return ResponseEntity.ok(userService.getCurrentUser());
    }

    @PutMapping("/me")
    public ResponseEntity<UpdateProfileResponse> updateProfile(
            @Valid @RequestBody UpdateProfileRequest request,
            @RequestHeader(value = "X-Forwarded-Host", required = false) String forwardedHost,
            HttpServletRequest httpRequest) {
        String requestHost = forwardedHost != null ? forwardedHost : httpRequest.getHeader("Host");
        return ResponseEntity.ok(userService.updateProfile(request, requestHost));
    }

    @PutMapping("/me/push-token")
    public ResponseEntity<Void> updateCurrentUserPushToken(@Valid @RequestBody UpdatePushTokenRequest request) {
        userService.updateCurrentUserPushToken(request.getPushToken(), request.resolvePlatform());
        return ResponseEntity.ok().build();
    }

    /**
     * Self-service operator account deletion.
     * Blocked if the user owns active (non-ended) games.
     */
    @DeleteMapping("/me")
    public ResponseEntity<Void> deleteAccount() {
        User currentUser = SecurityUtils.getCurrentUser();
        userService.deleteAccount(currentUser.getId());
        return ResponseEntity.noContent().build();
    }
}
