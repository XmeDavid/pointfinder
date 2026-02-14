package com.prayer.pointfinder.controller;

import com.prayer.pointfinder.dto.request.CreateInviteRequest;
import com.prayer.pointfinder.dto.response.InviteResponse;
import com.prayer.pointfinder.service.InviteService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/invites")
@RequiredArgsConstructor
public class InviteController {

    private final InviteService inviteService;

    @GetMapping
    public ResponseEntity<List<InviteResponse>> getGlobalInvites() {
        return ResponseEntity.ok(inviteService.getGlobalInvites());
    }

    @GetMapping("/game/{gameId}")
    public ResponseEntity<List<InviteResponse>> getGameInvites(@PathVariable UUID gameId) {
        return ResponseEntity.ok(inviteService.getGameInvites(gameId));
    }

    @GetMapping("/my")
    public ResponseEntity<List<InviteResponse>> getMyInvites() {
        return ResponseEntity.ok(inviteService.getMyInvites());
    }

    @PostMapping
    public ResponseEntity<InviteResponse> createInvite(
            @Valid @RequestBody CreateInviteRequest request,
            HttpServletRequest httpRequest
    ) {
        String requestHost = httpRequest.getHeader("Host");
        return ResponseEntity.status(HttpStatus.CREATED).body(inviteService.createInvite(request, requestHost));
    }

    @PostMapping("/{inviteId}/accept")
    public ResponseEntity<Void> acceptInvite(@PathVariable UUID inviteId) {
        inviteService.acceptInvite(inviteId);
        return ResponseEntity.ok().build();
    }
}
